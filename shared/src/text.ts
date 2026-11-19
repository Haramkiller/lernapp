// Am Rand werden nur Satzzeichen, Anführungszeichen und Klammern entfernt. Bedeutungstragende Zeichen
// (-, +, %, ‰, °, ...) bleiben erhalten: "Na+", "Cl-", "50%", "90°", "-5".
const EDGE_PUNCT = /^[.,;:!?"'„“”‚‘’«»‹›()\[\]\{\}…¿¡]+|[.,;:!?"'„“”‚‘’«»‹›()\[\]\{\}…¿¡]+$/gu

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
