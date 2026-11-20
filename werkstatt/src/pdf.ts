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

export interface SplitOptions {
  /** Höchstens so viele Seiten je Abschnitt (Standard 15). */
  pagesPerChunk?: number
  /** Ungefähre Obergrenze je Abschnitt in Bytes (Standard 10 MB). Gescannte Seiten sind groß; Claude liest PDFs nur bis ca. 32 MB. */
  maxChunkBytes?: number
}

const MAX_PAGES_PER_CHUNK = 15
const MAX_CHUNK_BYTES = 10 * 1024 * 1024

/** Seiten je Abschnitt: höchstens `maxPages`, aber so wenige, dass ein Abschnitt (geschätzt nach Ø-Seitengröße) unter `maxBytes` bleibt. */
export function pagesPerChunkFor(fileBytes: number, totalPages: number, maxPages = MAX_PAGES_PER_CHUNK, maxBytes = MAX_CHUNK_BYTES): number {
  if (totalPages <= 0) return maxPages
  const perPage = fileBytes / totalPages
  return Math.max(1, Math.min(maxPages, Math.floor(maxBytes / Math.max(perPage, 1))))
}

/** Teilt ein PDF in Abschnitte (Dateien in werkstatt/tmp/). Seitenzahlen sind 1-basiert im Original. */
export async function splitPdf(path: string, opts: SplitOptions = {}): Promise<PdfChunk[]> {
  const bytes = await readFile(path)
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = src.getPageCount()
  const pagesPerChunk = pagesPerChunkFor(bytes.length, total, opts.pagesPerChunk, opts.maxChunkBytes)
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

export const SCANNED_NOTICE =
  'Dieses PDF ist gescannt (keine Textebene). Claude liest die Seiten als Bild – bitte die Karten in der Vorschau besonders genau prüfen.'

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
