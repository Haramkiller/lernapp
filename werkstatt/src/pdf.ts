import { PDFDocument } from 'pdf-lib'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

export interface PdfChunk {
  path: string
  firstPage: number
  lastPage: number
}

const TMP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tmp')

/** Teilt ein PDF in Abschnitte zu je `pagesPerChunk` Seiten (Dateien in werkstatt/tmp/). Seitenzahlen sind 1-basiert im Original. */
export async function splitPdf(path: string, pagesPerChunk = 15): Promise<PdfChunk[]> {
  const src = await PDFDocument.load(await readFile(path), { ignoreEncryption: true })
  const total = src.getPageCount()
  await mkdir(TMP_DIR, { recursive: true })
  const base = basename(path, extname(path)).replace(/[^\w.-]+/g, '_')
  const stamp = Date.now().toString(36)
  const chunks: PdfChunk[] = []
  for (let first = 1; first <= total; first += pagesPerChunk) {
    const last = Math.min(first + pagesPerChunk - 1, total)
    const out = await PDFDocument.create()
    const indices = Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i)
    for (const page of await out.copyPages(src, indices)) out.addPage(page)
    const outPath = join(TMP_DIR, `${base}-${stamp}-${first}-${last}.pdf`)
    await writeFile(outPath, await out.save())
    chunks.push({ path: outPath, firstPage: first, lastPage: last })
  }
  return chunks
}

const MIN_CHARS = 20
const PAGES_TO_CHECK = 5

export const SCANNED_MESSAGE =
  'Dieses PDF scheint gescannt zu sein und enthält keinen auslesbaren Text. Bitte ein PDF mit Textebene verwenden (z. B. per OCR erzeugt).'

/** true, wenn auf den ersten Seiten auslesbarer Text steht (mind. ~20 Zeichen ohne Leerraum). */
export async function hasText(path: string): Promise<boolean> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(path))
  const fontDir = join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts')
  const standardFontDataUrl = fontDir + sep
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, standardFontDataUrl }).promise
  try {
    let chars = 0
    const n = Math.min(doc.numPages, PAGES_TO_CHECK)
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if ('str' in item) chars += item.str.replace(/\s+/g, '').length
      }
      if (chars >= MIN_CHARS) return true
    }
    return chars >= MIN_CHARS
  } finally {
    await doc.destroy()
  }
}

/** Wirft die „gescannt“-Fehlermeldung, falls kein Text vorhanden ist. */
export async function assertHasText(path: string): Promise<void> {
  if (!(await hasText(path))) throw new Error(SCANNED_MESSAGE)
}
