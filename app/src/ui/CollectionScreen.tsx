import { useEffect, useState } from 'react'
import type { Card, Module } from '@lernapp/shared'
import { questionText } from '../cards/prepare'
import { db } from '../data/db'
import { checkResearch, loadDesign, loadFinds } from '../data/finds'
import { REGIONS } from '../game/bosses'
import { FIND_ITEMS, collection, fertilizer, findImage, researchHint, type Owned } from '../game/finds'
import type { SrsState } from '../srs/scheduler'

type Props = { now?: () => Date; onBack: () => void }
type Data = { owned: Map<string, Owned>; fertilizer: number; cards: Map<string, Card>; states: Map<string, SrsState>; modules: Map<string, Module> }

/** Sammelbuch: je Region eine Reihe mit 6 Feldern, Lücken als „?“, unerforschte Funde oben mit Hinweis. */
export function CollectionScreen({ now = () => new Date(), onBack }: Props) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        await checkResearch(now()).catch(() => 0)
        const [finds, design, cards, states, modules] = await Promise.all([loadFinds(), loadDesign(), db.cards.toArray(), db.states.toArray(), db.modules.toArray()])
        if (!alive) return
        setData({
          owned: collection(finds),
          fertilizer: fertilizer(finds, design.soil.values()),
          cards: new Map(cards.map((c) => [c.id, c])),
          states: new Map(states.map((s) => [s.cardId, s.state])),
          modules: new Map(modules.map((m) => [m.id, m])),
        })
      } catch (e) {
        if (alive) setError(`Das Sammelbuch konnte nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const back = (
    <button type="button" onClick={onBack}>
      Zurück
    </button>
  )
  if (error)
    return (
      <section className="collection flow">
        <p role="alert" className="warn">
          {error}
        </p>
        {back}
      </section>
    )
  if (!data) return <p className="muted">Lade …</p>

  const t = now()
  const pending = [...data.owned.values()].filter((o) => !o.researched)
  const hint = (o: Owned) => {
    const f = o.finds[0]!
    const card = data.cards.get(f.cardId)
    const live = card && !card.deleted
    const state = data.states.get(f.cardId)
    return researchHint({
      question: live ? questionText(card) : null,
      moduleName: data.modules.get(f.moduleId)?.name ?? 'diesem Modul',
      due: live && state ? new Date(state.due) : null,
      foundDay: f.foundDay,
      now: t,
    })
  }

  return (
    <section className="collection flow">
      <div className="row between">
        <h1 className="pixel">Sammelbuch</h1>
        {back}
      </div>
      <p className="pixel fertilizer">Dünger: {data.fertilizer}</p>
      {pending.length > 0 && (
        <section aria-labelledby="pending-title" className="card-panel">
          <h2 id="pending-title">Wird erforscht</h2>
          <ul className="pending-list">
            {pending.map((o) => (
              <li key={o.item.id}>
                <div className={`glow soft rarity-${o.item.rarity}`}>
                  <img src={findImage(o.item.id)} alt="" draggable={false} />
                </div>
                <div className="stack">
                  <strong>{o.item.name}</strong>
                  <span className="muted hint">{hint(o)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {REGIONS.map((r) => {
        const items = FIND_ITEMS.filter((i) => i.region === r.id)
        const found = items.filter((i) => data.owned.has(i.id)).length
        return (
          <section key={r.id} className="find-region">
            <h2>{`${r.name} ${found}/${items.length}`}</h2>
            <div className="find-grid">
              {items.map((i) => {
                const o = data.owned.get(i.id)
                if (!o)
                  return (
                    <div key={i.id} className="find-cell missing" aria-label="Unbekanntes Stück">
                      ?
                    </div>
                  )
                return (
                  <div key={i.id} className={`find-cell${o.researched ? '' : ' unerforscht'}`}>
                    <div className={`glow soft rarity-${i.rarity}`}>
                      <img src={findImage(i.id)} alt="" draggable={false} />
                    </div>
                    <span>{i.name}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </section>
  )
}
