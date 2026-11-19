// Probelauf: PDF teilen -> Claude -> Karten auswerten. Aufruf: npx tsx werkstatt/scripts/try.ts <pdf>
import { basename, dirname } from 'node:path'
import { rmSync } from 'node:fs'
import { assertHasText, splitPdf } from '../src/pdf'
import { scriptPrompt } from '../src/prompts'
import { runClaude } from '../src/claude'
import { parseGeneration } from '../src/parse'

const pdf = process.argv[2]
if (!pdf) {
  console.error('Aufruf: npx tsx werkstatt/scripts/try.ts <pdf>')
  process.exit(1)
}

await assertHasText(pdf)
const chunks = await splitPdf(pdf)
let total = 0
try {
  for (const chunk of chunks) {
    console.log(`Abschnitt Seiten ${chunk.firstPage}-${chunk.lastPage} ...`)
    const prompt = scriptPrompt(chunk, { moduleName: 'Testmodul', existingTopics: [], styleProfile: null, fileName: basename(pdf) })
    const raw = await runClaude(prompt, { addDir: dirname(chunk.path) })
    const { result, rejected } = parseGeneration(raw)
    total += result.cards.length
    console.log(JSON.stringify(result.cards, null, 2))
    console.log(`-> ${result.cards.length} gültige Karten, ${rejected.length} verworfen`, rejected)
    console.log('Seitenzahlen:', result.cards.map((c) => c.source?.page ?? null).join(', '))
  }
} finally {
  for (const c of chunks) rmSync(c.path, { force: true })
}
console.log(`Gesamt: ${total} Karten`)
