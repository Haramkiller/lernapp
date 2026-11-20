// Am Rand werden nur Satzzeichen, Anführungszeichen und Klammern entfernt. Bedeutungstragende Zeichen
// (-, +, %, ‰, °, ...) bleiben erhalten: "Na+", "Cl-", "50%", "90°", "-5".
// Geprüft wird Zeichen für Zeichen von beiden Rändern aus (linear). Das frühere /^[…]+|[…]+$/gu backtrackte
// in der unverankerten zweiten Alternative quadratisch, z. B. bei "a" + "." * n + "b" (ReDoS).
const EDGE_PUNCT_CHAR = /[.,;:!?"'„“”‚‘’«»‹›()\[\]\{\}…¿¡]/u

/** Entfernt Satzzeichen an beiden Rändern; gleiches Ergebnis wie zuvor .replace(/^[…]+|[…]+$/gu, ''). */
function stripEdgePunct(s: string): string {
  let start = 0
  let end = s.length
  while (start < end && EDGE_PUNCT_CHAR.test(s.charAt(start))) start++
  while (end > start && EDGE_PUNCT_CHAR.test(s.charAt(end - 1))) end--
  return s.slice(start, end)
}

/** Vergleichsform für Antworten: NFC, trim, klein, Leerraum gefaltet, Umlaute ausgeschrieben, Randsatzzeichen entfernt. */
export function normalize(s: string): string {
  const folded = s
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
  return stripEdgePunct(folded).trim()
}
