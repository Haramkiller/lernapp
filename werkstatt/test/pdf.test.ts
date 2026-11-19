import { describe, it, expect, afterAll } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { splitPdf, hasText } from '../src/pdf'

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

describe('hasText', () => {
  it('PDF mit Text → true', async () => {
    expect(await hasText(await makePdf('text.pdf', 2, true))).toBe(true)
  })
  it('leeres/gescanntes PDF → false', async () => {
    expect(await hasText(await makePdf('blank.pdf', 3, false))).toBe(false)
  })
})
