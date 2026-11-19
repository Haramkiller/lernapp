import { useEffect, useRef, useState } from 'react'
import type { Card } from '@lernapp/shared'
import { db } from '../data/db'
import { loadSettings } from '../data/settings'
import { recordReview } from '../data/sync'
import { buildQueue, newDoneKey, type Settings } from '../session/queue'
import { toRating, type Outcome } from '../srs/grading'
import { newSrsState, review, type SrsState } from '../srs/scheduler'
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
  /** Task 9: „Nachfragen“ zur aktuellen Karte. */
  onAsk?: (card: Card) => void
}

type Counts = Record<Outcome, number>

export function StudyScreen({ moduleId, now = () => new Date(), rng = Math.random, onFinished, onExit, onAsk }: Props) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<{ outcome: Outcome; answer: Answer } | null>(null)
  const [counts, setCounts] = useState<Counts>({ right: 0, partial: 0, wrong: 0 })
  const settings = useRef<Settings | null>(null)
  const states = useRef<Map<string, SrsState>>(new Map())
  const busy = useRef(false)
  const finished = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [all, rows, s] = await Promise.all([db.cards.toArray(), db.states.toArray(), loadSettings()])
      const t = now()
      const map = new Map(rows.map((r) => [r.cardId, r.state]))
      const newDoneToday = ((await db.meta.get(newDoneKey(t)))?.value as number | undefined) ?? 0
      const ids = buildQueue({ cards: all, states: map, newDoneToday, now: t, settings: s, moduleId }).slice(0, UNIT_SIZE)
      const byId = new Map(all.map((c) => [c.id, c]))
      if (cancelled) return
      settings.current = s
      states.current = map
      setCards(ids.map((id) => byId.get(id)!))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId])

  const done = cards !== null && cards.length > 0 && index >= cards.length
  useEffect(() => {
    if (done && !finished.current) {
      finished.current = true
      onFinished?.()
    }
  }, [done, onFinished])

  if (cards === null) return <p className="muted">Lade …</p>
  if (cards.length === 0) {
    return (
      <section>
        <h2 className="pixel">Fertig</h2>
        <p>Nichts zu lernen: Heute ist nichts fällig und das Tageslimit für neue Karten ist erreicht.</p>
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
    try {
      const t = now()
      const prev = states.current.get(card.id) ?? newSrsState(t)
      const next = review(prev, toRating(outcome), t, { cardId: card.id, retention: settings.current!.retention })
      await recordReview(card.id, next)
      states.current.set(card.id, next.state)
      setCounts((c) => ({ ...c, [outcome]: c[outcome] + 1 }))
      setResult({ outcome, answer: detail })
    } finally {
      busy.current = false
    }
  }

  const next = () => {
    setResult(null)
    setIndex((i) => i + 1)
  }

  return (
    <section>
      <p className="progress pixel">
        {index + 1} / {cards.length}
      </p>
      {result ? (
        <Feedback card={card} outcome={result.outcome} answer={result.answer} onNext={next} onAsk={onAsk ? () => onAsk(card) : undefined} />
      ) : (
        <Question key={card.id} card={card} rng={rng} onAnswer={answer} />
      )}
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
