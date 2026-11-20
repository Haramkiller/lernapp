import { describe, it, expect } from 'vitest'
import { normalize } from '../src/text'

describe('normalize', () => {
  it('normalize: " Kräuter. " → "kraeuter"', () => expect(normalize(' Kräuter. ')).toBe('kraeuter'))
  it('faltet Mehrfach-Leerzeichen', () => expect(normalize('a   b \t c')).toBe('a b c'))
  it('ersetzt ö, ü, ß', () => expect(normalize('Öl Füße')).toBe('oel fuesse'))
  it('entfernt Satzzeichen am Rand, nicht in der Mitte', () => expect(normalize('"Ist-Zustand?!"')).toBe('ist-zustand'))
  it('leerer String bleibt leer', () => expect(normalize('  ..  ')).toBe(''))
  it('behält Symbole am Rand: "Na+" bleibt "na+"', () => expect(normalize('Na+')).toBe('na+'))
  it('behält %, ° und Ladungen', () => {
    expect(normalize('50%')).toBe('50%')
    expect(normalize('90°')).toBe('90°')
    expect(normalize('Ca2+')).toBe('ca2+')
  })
  it('zerlegtes ä (a + Trema) wird zu ae', () => expect(normalize('Kräuter')).toBe('kraeuter'))
  it('behält Minus am Rand: "Cl-", "OH-", "-5"', () => {
    expect(normalize('Cl-')).toBe('cl-')
    expect(normalize('OH-')).toBe('oh-')
    expect(normalize('-5')).toBe('-5')
  })
  it('entfernt Anführungszeichen und Klammern am Rand', () => expect(normalize('„(Zelle)“.')).toBe('zelle'))
})

// Referenz: die frühere Implementierung mit dem quadratisch backtrackenden Regex (nur für kurze Eingaben verwenden).
const OLD_EDGE_PUNCT = /^[.,;:!?"'„“”‚‘’«»‹›()\[\]\{\}…¿¡]+|[.,;:!?"'„“”‚‘’«»‹›()\[\]\{\}…¿¡]+$/gu
function oldNormalize(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .replace(OLD_EDGE_PUNCT, '')
    .trim()
}

describe('normalize: Randsatzzeichen ohne ReDoS', () => {
  const PUNCT = [...'.,;:!?"\'„“”‚‘’«»‹›()[]{}…¿¡']
  const OTHER = ['a', 'Z', 'Ä', 'ß', 'é', ' ', '\t', '\n', ' ', ' ', '-', '+', '%', '‰', '°', '/', '*', '😀', '\ud83d', '\ude00', '1']

  it('liefert dasselbe wie der frühere Regex (Randfälle)', () => {
    const cases = [
      '', ' ', '\t\n', '.', '...', '…', '¿¡', '„“', '()[]{}', '  ..  ', '. . .', PUNCT.join(''),
      '.a', 'a.', '.a.', '...a', 'a...', '..a b..', 'a.b', 'a . b', '. a .', 'a  .', '. a', 'a. .', '. .a',
      '«Zelle»', '‹x›', '‚y‘', '’z’', '¿Qué?', '¡Hola!', 'Na+.', '.-5', '-.', '.-', '%.', '°…', '. .',
      'x\n.\n', '\t.\t', 'a. ', '😀.', '.😀', '\ud83d.', '.\ude00', 'Ä.', '…ß…', 'é.', '.Ö Ü.',
    ]
    for (const c of cases) expect(normalize(c), JSON.stringify(c)).toBe(oldNormalize(c))
    for (const p of PUNCT) {
      for (const c of [p, p + p, `${p}a`, `a${p}`, `${p}a${p}`, `a${p}b`, `${p} ${p}`, `${p}a b${p}${p}`, ` ${p}-${p} `]) {
        expect(normalize(c), JSON.stringify(c)).toBe(oldNormalize(c))
      }
    }
  })

  it('liefert dasselbe wie der frühere Regex (zufällige Eingaben)', () => {
    const alphabet = [...PUNCT, ...OTHER]
    let seed = 0x5eed
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return seed % n
    }
    for (let i = 0; i < 5000; i++) {
      let c = ''
      const len = rand(13)
      for (let j = 0; j < len; j++) c += alphabet[rand(alphabet.length)]
      expect(normalize(c), JSON.stringify(c)).toBe(oldNormalize(c))
    }
  })

  it('läuft linear bei langen Satzzeichenfolgen vor einem Nicht-Satzzeichen', () => {
    const n = 100_000
    for (const p of ['.', '…', '"', '?!']) {
      const inner = 'a' + p.repeat(n) + 'b'
      const t0 = performance.now()
      expect(normalize(inner)).toBe(inner)
      expect(normalize(p.repeat(n) + inner + p.repeat(n))).toBe(inner)
      expect(normalize(p.repeat(n))).toBe('')
      expect(performance.now() - t0).toBeLessThan(500)
    }
  })
})
