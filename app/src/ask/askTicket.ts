import type { SupabaseClient } from '@supabase/supabase-js'

/** 32 Zufallsbytes als base64url (43 Zeichen, ohne Auffüllung). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Legt ein Einmal-Ticket in Supabase an (Tabelle ask_tickets, nur für das eigene Konto) und liefert
 * die Nonce. Die Werkstatt löst sie genau einmal innerhalb von 60 s ein. So verlässt das
 * Zugriffstoken der App nie den Browser – ein Programm, das sich als Werkstatt ausgibt, bekommt
 * höchstens diese wertlose Zufallszahl.
 */
export async function createAskTicket(client: SupabaseClient): Promise<string> {
  const nonce = newNonce()
  const { error } = await client.from('ask_tickets').insert({ nonce })
  if (error) {
    // Tabelle fehlt (42P01/PGRST205) oder keine Rechte (42501): schema.sql ist wohl nicht aktuell.
    const schema = ['42P01', 'PGRST205', '42501'].includes((error as { code?: string }).code ?? '')
    throw new Error(
      `Ticket für die Werkstatt konnte nicht angelegt werden (${error.message}).` +
        (schema ? ' Ist schema.sql in Supabase aktuell?' : ' Bitte Internetverbindung prüfen.'),
    )
  }
  return nonce
}
