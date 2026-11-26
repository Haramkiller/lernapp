import { useState } from 'react'
import { REGIONS } from '../../game/bosses'
import { CHEST_IMAGES, RARITY_NAMES, RARITY_ORDER, findImage, type FindItem, type FindStatus, type Rarity } from '../../game/finds'

export type ChestItem = { find: FindStatus; item: FindItem; duplicate: boolean }

export function rarest(rarities: Rarity[]): Rarity {
  return rarities.reduce<Rarity>((best, r) => (RARITY_ORDER.indexOf(r) > RARITY_ORDER.indexOf(best) ? r : best), 'common')
}

const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? ''

/**
 * Truhe am Kampfende: leuchtet in der Farbe des seltensten Funds. Antippen öffnet sie und zeigt die
 * Funde nacheinander (neuester oben); „Überspringen“ zeigt alle auf einmal.
 */
export function Chest({ items, onDone }: { items: ChestItem[]; onDone: () => void }) {
  const [shown, setShown] = useState(0)
  const glow = rarest(items.map((i) => i.item.rarity))
  const all = shown >= items.length

  return (
    <section className="chest flow">
      <h2 className="pixel">Eine Truhe!</h2>
      <div className={`glow rarity-${shown === 0 ? glow : items[shown - 1]!.item.rarity}`}>
        <img className="chest-image" src={shown === 0 ? CHEST_IMAGES.closed : CHEST_IMAGES.open} alt="" draggable={false} />
      </div>
      {shown > 0 && (
        <ul className="chest-finds">
          {items
            .slice(0, shown)
            .reverse()
            .map(({ find, item, duplicate }, i) => (
              <li key={find.id} className={i === 0 ? 'newest' : undefined}>
                <div className={`glow ${i === 0 ? '' : 'soft '}rarity-${item.rarity}`}>
                  <img src={findImage(item.id)} alt="" draggable={false} />
                </div>
                <div className="stack">
                  <strong>{item.name}</strong>
                  <span className={`rarity-name rarity-${item.rarity}`}>{RARITY_NAMES[item.rarity]}</span>
                  <span className="muted">{regionName(item.region)}</span>
                  <span>{duplicate ? 'doppelt → +1 Dünger' : 'Neu! Wird erforscht, wenn du die Karte an einem anderen Tag wieder weißt.'}</span>
                </div>
              </li>
            ))}
        </ul>
      )}
      <div className="row">
        {shown === 0 && (
          <button type="button" className="primary" onClick={() => setShown(1)}>
            Truhe öffnen
          </button>
        )}
        {shown > 0 && !all && (
          <button type="button" className="primary" onClick={() => setShown((n) => n + 1)}>
            Nächster Fund
          </button>
        )}
        {!all && (
          <button type="button" onClick={() => setShown(items.length)}>
            Überspringen
          </button>
        )}
        {all && (
          <button type="button" className="primary" onClick={onDone}>
            Zum Ergebnis
          </button>
        )}
      </div>
    </section>
  )
}
