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
