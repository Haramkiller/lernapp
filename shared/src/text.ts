// Nur Satzzeichen (\p{P}) am Rand entfernen; Symbole (+, °, ...) und % bleiben, sie tragen Bedeutung (Na+, 50%).
const EDGE_PUNCT = /^[^\P{P}%‰]+|[^\P{P}%‰]+$/gu

/** Vergleichsform für Antworten: NFC, trim, klein, Leerraum gefaltet, Umlaute ausgeschrieben, Randsatzzeichen entfernt. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
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
