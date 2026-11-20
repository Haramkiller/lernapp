import { describe, it, expect, afterAll } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { splitPdf, hasText, pagesPerChunkFor } from '../src/pdf'

const dir = mkdtempSync(join(tmpdir(), 'werkstatt-pdf-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function makePdf(name: string, pages: number, withText: boolean): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage()
    if (withText) p.drawText(`Seite ${i}: Moose und Flechten sind Pioniere der Besiedlung.`, { x: 20, y: 700, size: 12, font })
  }
  const path = join(dir, name)
  writeFileSync(path, await doc.save())
  return path
}

describe('splitPdf', () => {
  it('40 Seiten → 3 Abschnitte mit firstPage 1,16,31', async () => {
    const path = await makePdf('forty.pdf', 40, false)
    const chunks = await splitPdf(path)
    expect(chunks.map((c) => c.firstPage)).toEqual([1, 16, 31])
    expect(chunks.map((c) => c.lastPage)).toEqual([15, 30, 40])
    const last = await PDFDocument.load(await readFile(chunks[2]!.path))
    expect(last.getPageCount()).toBe(10)
    for (const c of chunks) rmSync(c.path, { force: true })
  })
})

describe('pagesPerChunkFor', () => {
  const MB = 1024 * 1024
  it('kleine Text-PDFs: 15 Seiten je Abschnitt', () => {
    expect(pagesPerChunkFor(0.3 * MB, 40)).toBe(15)
  })
  it('große Scans: so wenige Seiten, dass ein Abschnitt unter 10 MB bleibt', () => {
    // Botanik 2016a: 10 Seiten, ~39 MB → ~3,9 MB je Seite → 2 Seiten je Abschnitt
    expect(pagesPerChunkFor(39 * MB, 10)).toBe(2)
  })
  it('einzelne Riesenseite: trotzdem mindestens 1 Seite', () => {
    expect(pagesPerChunkFor(50 * MB, 1)).toBe(1)
  })
  it('splitPdf nutzt die Größengrenze', async () => {
    const path = await makePdf('six.pdf', 6, false)
    const chunks = await splitPdf(path, { maxChunkBytes: 1 })
    expect(chunks.map((c) => [c.firstPage, c.lastPage])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]])
    for (const c of chunks) rmSync(c.path, { force: true })
  })
})

describe('hasText', () => {
  it('PDF mit Text → true', async () => {
    expect(await hasText(await makePdf('text.pdf', 2, true))).toBe(true)
  })
  it('leeres/gescanntes PDF → false', async () => {
    expect(await hasText(await makePdf('blank.pdf', 3, false))).toBe(false)
  })
})
