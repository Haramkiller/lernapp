const EDGE_PUNCT = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu

/** Vergleichsform für Antworten: trim, klein, Leerraum gefaltet, Umlaute ausgeschrieben, Randzeichen entfernt. */
export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCT, '')
    .trim()
}
