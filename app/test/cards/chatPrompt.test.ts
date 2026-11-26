import { describe, expect, it } from 'vitest'
import { chatPrompt, nextPageHint } from '../../src/cards/chatPrompt'

describe('chatPrompt', () => {
  it('enthält Modul, Themen und Format', () => {
    const p = chatPrompt({ moduleName: 'Botanik', existingTopics: ['Moose'] })
    for (const s of ['Botanik', '"Moose"', 'angehängte', '10–15', 'Weiter ab Seite', '{{1}}', '"cards"', '"fromExam": false']) {
      expect(p).toContain(s)
    }
    expect(p).not.toMatch(/Read-Werkzeug/)
    expect(p).not.toMatch(/Pfad/)
  })

  it('ohne Themen: Hinweis auf neue Themen', () => {
    expect(chatPrompt({ moduleName: 'Botanik', existingTopics: [] })).toMatch(/noch keine Themen/)
  })
})

describe('nextPageHint', () => {
  const at = (page: number | null) => ({ source: page === null ? null : { page } })
  it('höchste Seite plus eins', () => {
    expect(nextPageHint([at(3), at(9), at(null)])).toBe('Weiter ab Seite 10')
  })
  it('ohne Seitenzahlen: allgemeiner Tipp', () => {
    expect(nextPageHint([at(null)])).toBe('Weiter mit den nächsten Seiten')
    expect(nextPageHint([])).toBe('Weiter mit den nächsten Seiten')
  })
})
