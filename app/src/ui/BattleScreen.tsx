import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Card, Module } from '@lernapp/shared'
import { db } from '../data/db'
import { loadSettings } from '../data/settings'
import { recordReview } from '../data/sync'
import { LUCKY_CHANCE, RESTED_LUCKY_CHANCE, applyAnswer, defeated, endBattle, hpPercent, startBattle, type Battle } from '../game/battle'
import { bossFor, type AreaChoices } from '../game/bosses'
import { bossLife, cardLife, isPlayable } from '../game/mastery'
import { ALL_MODULES, loadAreaChoices, loadBossLife, saveBossLife } from '../data/game'
import { buildQueue, newDoneKey, type Settings } from '../session/queue'
import { toRating, type Outcome } from '../srs/grading'
import { newSrsState, review, type SrsState } from '../srs/scheduler'
import { ErrorBoundary } from './ErrorBoundary'
import { Feedback } from './Feedback'
import { Arena } from './game/Arena'
import { Choice } from './questions/Choice'
import { Cloze } from './questions/Cloze'
import { Free } from './questions/Free'
import { Matching } from './questions/Matching'
import { Order } from './questions/Order'
import type { Rng } from './random'
import type { Answer } from './types'

export const UNIT_SIZE = 25
const DAY_MS = 24 * 60 * 60 * 1000

type Props = {
  moduleId?: string
  now?: () => Date
  rng?: Rng
  /** Pause am Lagerfeuer gemacht: mehr Glückstreffer. Standard: false. */
  rested?: boolean
  /** Wird einmal aufgerufen, wenn der Kampf beendet ist (z. B. für den Sync), mit der Zahl gespeicherter Antworten. */
  onFinished?: (answered: number) => void
  onExit: () => void
  /** Inhalt des „Nachfragen“-Dialogs; Lebensdauer (Weiter, Beenden, Verlassen) regelt BattleScreen. */
  renderAsk?: (card: Card, answer: Answer, close: () => void) => ReactNode
  /** Prüft Karten vor dem Lernen; Standard: gemeinsames Schema. Ungültige Karten werden übersprungen. */
  validate?: (card: Card) => boolean
}

type Counts = Record<Outcome, number>
type Recovery = { from: number; to: number }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Ganze Tage seit der letzten Wiederholung; null bei einer neuen Karte. */
function elapsedDays(prev: SrsState | undefined, now: Date): number | null {
  if (!prev?.last_review) return null
  return Math.max(0, Math.floor((now.getTime() - new Date(prev.last_review).getTime()) / DAY_MS))
}

export function BattleScreen({
  moduleId,
  now = () => new Date(),
  rng = Math.random,
  rested = false,
  onFinished,
  onExit,
  renderAsk,
  validate = isPlayable,
}: Props) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [areas, setAreas] = useState<AreaChoices>(new Map())
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<{ outcome: Outcome; answer: Answer } | null>(null)
  const [counts, setCounts] = useState<Counts>({ right: 0, partial: 0, wrong: 0 })
  const [battle, setBattle] = useState<Battle | null>(null)
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const [turn, setTurn] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [skippedInvalid, setSkippedInvalid] = useState(0)
  const [ended, setEnded] = useState(false)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const settings = useRef<Settings | null>(null)
  const busy = useRef(false)
  const finished = useRef(false)
  const lifeKey = moduleId ?? ALL_MODULES

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setCards(null)
    void (async () => {
      try {
        const [all, rows, s, mods, chosen, saved] = await Promise.all([
          db.cards.toArray(),
          db.states.toArray(),
          loadSettings(),
          db.modules.toArray(),
          loadAreaChoices(),
          loadBossLife(lifeKey),
        ])
        const t = now()
        const map = new Map(rows.map((r) => [r.cardId, r.state]))
        const newDoneToday = ((await db.meta.get(newDoneKey(t)))?.value as number | undefined) ?? 0
        const inScope = all.filter((c) => !c.deleted && (moduleId === undefined || c.moduleId === moduleId))
        const valid = inScope.filter((c) => validate(c))
        const ids = buildQueue({ cards: valid, states: map, newDoneToday, now: t, settings: s, moduleId }).slice(0, UNIT_SIZE)
        const byId = new Map(valid.map((c) => [c.id, c]))
        if (cancelled) return
        settings.current = s
        setModules(mods)
        setAreas(chosen)
        setSkippedInvalid(inScope.length - valid.length)
        setCards(ids.map((id) => byId.get(id)!))
        // Boss-Leben über alle abfragbaren Karten im Umfang, nicht nur über die heutige Lernliste.
        const life = bossLife(valid, map, t, s.retention)
        const shown = Math.round(life.hp)
        setRecovery(saved !== null && shown - saved >= 1 ? { from: saved, to: shown } : null)
        setBattle(startBattle(ids.length, life))
      } catch (e) {
        if (!cancelled) setLoadError(`Die Karten konnten nicht geladen werden: ${message(e)}`)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, reload])

  // Nach dem Antworten wird die Seite kürzer; ohne Sprung läge die Rückmeldung unter dem oben festen Boss.
  const top = useRef<HTMLElement>(null)
  useEffect(() => {
    if (result) top.current?.scrollIntoView?.({ block: 'start' })
  }, [result])

  const done = cards !== null && cards.length > 0 && (ended || index >= cards.length)
  useEffect(() => {
    if (done && !finished.current) {
      finished.current = true
      // Fürs nächste Mal („hat sich erholt“); ein Fehler darf den Abschluss nicht verhindern.
      if (battle) saveBossLife(lifeKey, battle.hp, now()).catch(() => {})
      onFinished?.(counts.right + counts.partial + counts.wrong)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  if (cards === null || battle === null) return <p className="muted">Lade …</p>
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

  const { boss, name } = bossFor(moduleId, modules, areas)

  if (done) {
    const final = endBattle(battle)
    const lost = final.startHp - final.hp
    return (
      <section className="battle-result">
        <h2 className="pixel">{defeated(final) ? 'Endgültig besiegt!' : lost > 0 ? 'Geschwächt' : 'Hält stand'}</h2>
        <p className="result-boss">{name}</p>
        <p className="result-life pixel">
          {final.startHp} → {final.hp}
        </p>
        {lost > 0 && <p>−{lost} Leben in dieser Runde</p>}
        <p>Noch {hpPercent(final)} %</p>
        {final.secured > 0 && <p>{final.secured === 1 ? '1 Karte sitzt jetzt sicher' : `${final.secured} Karten sitzen jetzt sicher`}</p>}
        <p className="summary">
          {counts.right} richtig, {counts.partial} teilweise, {counts.wrong} falsch
        </p>
        <p>Höchste Combo: {final.bestCombo}</p>
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
    setSaving(true)
    setSaveError(null)
    try {
      const t = now()
      const retention = settings.current!.retention
      let prev: SrsState | undefined
      // Der Ausgangs-State wird beim Speichern frisch aus der Datenbank gelesen (ein Sync kann ihn geändert haben).
      const res = await recordReview(card.id, (p) => {
        prev = p
        return review(p ?? newSrsState(t), toRating(outcome), t, { cardId: card.id, retention })
      })
      // Erst eine gespeicherte Antwort zählt im Kampf.
      const before = cardLife(prev, t, retention)
      const after = cardLife(res.state, t, retention)
      setBattle(applyAnswer(battle, { outcome, elapsedDays: elapsedDays(prev, t), before, after }, rng, rested ? RESTED_LUCKY_CHANCE : LUCKY_CHANCE))
      setTurn((n) => n + 1)
      setCounts((c) => ({ ...c, [outcome]: c[outcome] + 1 }))
      setResult({ outcome, answer: detail })
    } catch (e) {
      setSaveError(`Die Antwort konnte nicht gespeichert werden: ${message(e)}. Bitte versuche es erneut.`)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const next = () => {
    setResult(null)
    setAsking(false)
    setSaveError(null)
    setIndex((i) => i + 1)
  }

  return (
    <section className="battle" ref={top}>
      <Arena boss={boss} name={name} battle={battle} turn={turn} active={result !== null} recovery={recovery} />
      <div className="battle-main">
        <div className="row between">
          <p className="progress pixel">
            {index + 1} / {cards.length}
            {rested && <span className="rested-badge">Ausgeruht · mehr Glückstreffer</span>}
          </p>
          {/* Während des Speichern gesperrt: sonst änderte sich das Ergebnis nach der Anzeige. */}
          <button type="button" onClick={() => setEnded(true)} disabled={saving}>
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
        {/* Eigener Schlüssel: renderAsk darf selbst key={card.id} setzen, ohne mit der ErrorBoundary zu kollidieren
            (doppelte Schlüssel ließen nach dem Schließen eine zweite Rückmeldung stehen). */}
        {asking && result && renderAsk && <Fragment key="ask">{renderAsk(card, result.answer, () => setAsking(false))}</Fragment>}
      </div>
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
