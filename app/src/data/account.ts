import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { db } from './db'

/** Wem die lokalen Lerndaten gehören: Datenbank (Supabase-URL) + Nutzer-ID. */
export type Owner = { url: string; userId: string }

const OWNER_KEY = 'owner'
/** Anmeldemarke: gesetzt nach erfolgreicher Anmeldung, gelöscht beim Abmelden. Erlaubt Offline-Start. */
const SIGNED_IN_KEY = 'signedIn'
const USER_DATA_PREFIXES = ['lastPull:', 'newDone:']

export const OWNER_CHANGE_WARNING =
  'Auf diesem Gerät liegen noch nicht synchronisierte Lernfortschritte eines anderen Kontos oder einer anderen Datenbank. ' +
  'Wenn du fortfährst, gehen diese Änderungen verloren. Fortfahren?'

const sameOwner = (a: Owner, b: Owner) => a.url === b.url && a.userId === b.userId

async function clearUserData(owner: Owner): Promise<void> {
  await db.transaction('rw', [db.modules, db.topics, db.cards, db.states, db.outbox, db.dead, db.meta], async () => {
    await Promise.all([db.modules.clear(), db.topics.clear(), db.cards.clear(), db.states.clear(), db.outbox.clear(), db.dead.clear()])
    const keys = (await db.meta.toCollection().primaryKeys()) as string[]
    await db.meta.bulkDelete(keys.filter((k) => USER_DATA_PREFIXES.some((p) => k.startsWith(p))))
    await db.meta.put({ key: OWNER_KEY, value: owner })
  })
}

async function checkOwner(owner: Owner, confirm: (message: string) => boolean): Promise<boolean> {
  const stored = (await db.meta.get(OWNER_KEY))?.value as Owner | undefined
  if (stored && sameOwner(stored, owner)) return true
  if (!stored) {
    // Erstes Konto auf diesem Gerät (oder Daten aus einer Version ohne Eigentümer): übernehmen.
    await db.meta.put({ key: OWNER_KEY, value: owner })
    return true
  }
  if ((await db.outbox.count()) > 0 && !confirm(OWNER_CHANGE_WARNING)) return false
  await clearUserData(owner)
  return true
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Stellt sicher, dass die lokalen Daten dem angemeldeten Eigentümer gehören. Anderer Eigentümer
 * → Lerndaten, Outbox, Quarantäne, Pull-Cursor und Tageszähler werden gelöscht; liegen noch
 * nicht synchronisierte Änderungen vor, wird vorher gefragt. `false` = Nutzer hat abgebrochen.
 * Aufrufe laufen nacheinander, damit gleichzeitige Anmeldeereignisse nur einmal fragen.
 */
export function ensureOwner(owner: Owner, confirm: (message: string) => boolean): Promise<boolean> {
  const run = queue.then(() => checkOwner(owner, confirm))
  queue = run.catch(() => undefined)
  return run
}

export async function saveSignedInMarker(owner: Owner): Promise<void> {
  await db.meta.put({ key: SIGNED_IN_KEY, value: owner })
}

export async function clearSignedInMarker(): Promise<void> {
  await db.meta.delete(SIGNED_IN_KEY)
}

/**
 * Ohne Sitzung beim Start: Scheiterte nur das Auffrischen des abgelaufenen Tokens am Netz
 * (auth-js: Sitzung bleibt gespeichert, Fehler ist ein AuthRetryableFetchError) und war man mit
 * dieser Datenbank angemeldet, bleibt man angemeldet und kann offline lernen.
 * Ohne Fehlerobjekt ist gar keine Sitzung gespeichert → nicht angemeldet, auch offline.
 * Online und nicht angemeldet → die Anmeldemarke ist veraltet und wird gelöscht.
 */
export async function staysSignedInOffline(error: unknown, url: string, online: boolean): Promise<boolean> {
  if (!isAuthRetryableFetchError(error)) {
    if (online) await clearSignedInMarker()
    return false
  }
  const marker = (await db.meta.get(SIGNED_IN_KEY))?.value as Owner | undefined
  return marker?.url === url
}
