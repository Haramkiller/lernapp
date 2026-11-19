import { describe, it, expect } from 'vitest'
import { normalize } from '../src/text'

describe('normalize', () => {
  it('normalize: " Kräuter. " → "kraeuter"', () => expect(normalize(' Kräuter. ')).toBe('kraeuter'))
  it('faltet Mehrfach-Leerzeichen', () => expect(normalize('a   b \t c')).toBe('a b c'))
  it('ersetzt ö, ü, ß', () => expect(normalize('Öl Füße')).toBe('oel fuesse'))
  it('entfernt Satzzeichen am Rand, nicht in der Mitte', () => expect(normalize('"Ist-Zustand?!"')).toBe('ist-zustand'))
  it('leerer String bleibt leer', () => expect(normalize('  ..  ')).toBe(''))
})
