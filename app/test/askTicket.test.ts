import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAskTicket, newNonce } from '../src/ask/askTicket'

function fakeClient(result: { error: { message: string; code?: string } | null }) {
  const insert = vi.fn(async (_row: unknown) => result)
  const from = vi.fn((_table: string) => ({ insert }))
  return { client: { from } as unknown as SupabaseClient, from, insert }
}

describe('Einmal-Tickets für die Werkstatt', () => {
  it('Nonce: 43 Zeichen base64url aus 32 Zufallsbytes, jedes Mal anders', () => {
    const a = newNonce()
    const b = newNonce()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })

  it('legt das Ticket in ask_tickets an und liefert nur die Nonce', async () => {
    const { client, from, insert } = fakeClient({ error: null })
    const nonce = await createAskTicket(client)
    expect(from).toHaveBeenCalledWith('ask_tickets')
    expect(insert).toHaveBeenCalledWith({ nonce })
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('fehlende Tabelle: Hinweis auf schema.sql', async () => {
    const { client } = fakeClient({ error: { message: 'relation "ask_tickets" does not exist', code: '42P01' } })
    await expect(createAskTicket(client)).rejects.toThrow(/Ticket.*schema\.sql/)
  })

  it('Netzwerkfehler: Hinweis auf die Verbindung, nicht auf schema.sql', async () => {
    const { client } = fakeClient({ error: { message: 'Failed to fetch' } })
    await expect(createAskTicket(client)).rejects.toThrow(/Internetverbindung/)
    await expect(createAskTicket(client)).rejects.not.toThrow(/schema/)
  })
})
