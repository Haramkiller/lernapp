import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CardDraftSchema, type Card } from '@lernapp/shared'
import { db } from '../data/db'
import { loadSettings } from '../data/settings'
import { recordReview } from '../data/sync'
import { buildQueue, newDoneKey, type Settings } from '../session/queue'
import { toRating, type Outcome } from '../srs/grading'
import { newSrsState, review, type SrsState } from '../srs/scheduler'
import { ErrorBoundary } from './ErrorBoundary'
import { Feedback } from './Feedback'
import { Choice } from './questions/Choice'
import { Cloze } from './questions/Cloze'
import { Free } from './questions/Free'
import { Matching } from './questions/Matching'
import { Order } from './questions/Order'
import type { Rng } from './random'
import type { Answer } from './types'

export const UNIT_SIZE = 25

type Props = {
  moduleId?: string
  now?: () => Date
  rng?: Rng
  /** Wird einmal aufgerufen, wenn die Einheit beendet ist (z. B. für den Sync). */
  onFinished?: () => void
  onExit: () => void
  /** Task 9: Inhalt des „Nachfragen“-Dialogs; Lebensdauer (Weiter, Beenden, Verlassen) regelt StudyScreen. */
  renderAsk?: (card: Card, answer: Answer, close: () => void) => ReactNode
  /** Prüft Karten vor dem Lernen; Standard: gemeinsames Schema. Ungültige Karten werden übersprungen. */
  validate?: (card: Card) => boolean
}

const schemaValid = (card: Card): boolean => CardDraftSchema.safeParse({ ...card, topic: 'x' }).success

type Counts = Record<Outcome, number>

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function StudyScreen({
  moduleId,
  now = () => new Date(),
  rng = Math.random,
  onFinished,
  onExit,
  renderAsk,
  validate = schemaValid,
}: Props) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<{ outcome: Outcome; answer: Answer } | null>(null)
  const [counts, setCounts] = useState<Counts>({ right: 0, partial: 0, wrong: 0 })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [skippedInvalid, setSkippedInvalid] = useState(0)
  const [ended, setEnded] = useState(false)
  const [asking, setAsking] = useState(false)
  const settings = useRef<Settings | null>(null)
  const states = useRef<Map<string, SrsState>>(new Map())
  const busy = useRef(false)
  const finished = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setCards(null)
    void (async () => {
      try {
        const [all, rows, s] = await Promise.all([db.cards.toArray(), db.states.toArray(), loadSettings()])
        const t = now()
        const map = new Map(rows.map((r) => [r.cardId, r.state]))
        const newDoneToday = ((await db.meta.get(newDoneKey(t)))?.value as number | undefined) ?? 0
        const inScope = all.filter((c) => !c.deleted && (moduleId === undefined || c.moduleId === moduleId))
        const valid = all.filter((c) => validate(c))
        const ids = buildQueue({ cards: valid, states: map, newDoneToday, now: t, settings: s, moduleId }).slice(0, UNIT_SIZE)
        const byId = new Map(valid.map((c) => [c.id, c]))
        if (cancelled) return
        settings.current = s
        states.current = map
        setSkippedInvalid(inScope.filter((c) => !validate(c)).length)
        setCards(ids.map((id) => byId.get(id)!))
      } catch (e) {
        if (!cancelled) setLoadError(`Die Karten konnten nicht geladen werden: ${message(e)}`)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, reload])

  const done = cards !== null && cards.length > 0 && (ended || index >= cards.length)
  useEffect(() => {
    if (done && !finished.current) {
      finished.current = true
      onFinished?.()
    }
  }, [done, onFinished])

  if (loadError) {
    return (
      <section>
        <p role="alert" className="warn">
          {loadError}
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={() => setReload((r) => r + 1)}>
            Erneut versuchen
          </button>
          <button type="button" onClick={onExit}>
            Zurück
          </button>
        </div>
      </section>
    )
  }
  if (cards === null) return <p className="muted">Lade …</p>
  if (cards.length === 0) {
    return (
      <section>
        <h2 className="pixel">Fertig</h2>
        <p>Nichts zu lernen: Heute ist nichts fällig und das Tageslimit für neue Karten ist erreicht.</p>
        {skippedInvalid > 0 && <p className="muted">{skippedInvalid} fehlerhafte Karte(n) wurden übersprungen.</p>}
        <button type="button" className="primary" onClick={onExit}>
          Zurück
        </button>
      </section>
    )
  }
  if (done) {
    return (
      <section>
        <h2 className="pixel">Geschafft</h2>
        <p className="summary">
          {counts.right} richtig, {counts.partial} teilweise, {counts.wrong} falsch
        </p>
        {skippedInvalid > 0 && <p className="muted">{skippedInvalid} fehlerhafte Karte(n) wurden übersprungen.</p>}
        <p>Mach jetzt eine kurze Pause: trink etwas, beweg dich, dann geht es frisch weiter.</p>
        <button type="button" className="primary" onClick={onExit}>
          Zur Übersicht
        </button>
      </section>
    )
  }

  const card = cards[index]!

  const answer = async (outcome: Outcome, detail: Answer) => {
    if (busy.current) return
    busy.current = true
    setSaveError(null)
    try {
      const t = now()
      const prev = states.current.get(card.id) ?? newSrsState(t)
      const next = review(prev, toRating(outcome), t, { cardId: card.id, retention: settings.current!.retention })
      await recordReview(card.id, next)
      states.current.set(card.id, next.state)
      setCounts((c) => ({ ...c, [outcome]: c[outcome] + 1 }))
      setResult({ outcome, answer: detail })
    } catch (e) {
      setSaveError(`Die Antwort konnte nicht gespeichert werden: ${message(e)}. Bitte versuche es erneut.`)
    } finally {
      busy.current = false
    }
  }

  const next = () => {
    setResult(null)
    setAsking(false)
    setSaveError(null)
    setIndex((i) => i + 1)
  }

  return (
    <section>
      <div className="row between">
        <p className="progress pixel">
          {index + 1} / {cards.length}
        </p>
        <button type="button" onClick={() => setEnded(true)}>
          Beenden
        </button>
      </div>
      {saveError && (
        <p role="alert" className="warn">
          {saveError}
        </p>
      )}
      <ErrorBoundary key={card.id} onSkip={next}>
        {result ? (
          <Feedback card={card} outcome={result.outcome} answer={result.answer} onNext={next} onAsk={renderAsk ? () => setAsking(true) : undefined} />
        ) : (
          <Question card={card} rng={rng} onAnswer={answer} />
        )}
      </ErrorBoundary>
      {asking && result && renderAsk?.(card, result.answer, () => setAsking(false))}
    </section>
  )
}

function Question({ card, rng, onAnswer }: { card: Card; rng: Rng; onAnswer: (o: Outcome, a: Answer) => void }) {
  switch (card.type) {
    case 'choice':
      return <Choice card={card} rng={rng} onAnswer={onAnswer} />
    case 'cloze':
      return <Cloze card={card} onAnswer={onAnswer} />
    case 'matching':
      return <Matching card={card} rng={rng} onAnswer={onAnswer} />
    case 'order':
      return <Order card={card} rng={rng} onAnswer={onAnswer} />
    case 'free':
      return <Free card={card} onAnswer={onAnswer} />
  }
}
