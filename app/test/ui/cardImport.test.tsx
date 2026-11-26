// @vitest-environment jsdom
import './setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Module } from '@lernapp/shared'
import { CardImportFlow } from '../../src/ui/CardImportFlow'
import type { ModuleContent, Prepared } from '../../src/cards/prepare'

const choice = (question: string, page: number) => ({
  topic: 'Moose',
  type: 'choice',
  payload: {
    question,
    options: [
      { text: 'a', correct: true, why: 'weil' },
      { text: 'b', correct: false, why: 'nein' },
      { text: 'c', correct: false, why: 'nein' },
      { text: 'd', correct: false, why: 'nein' },
    ],
  },
  explanation: 'kurz',
  source: { file: 'skript.pdf', page, quote: 'z' },
  examRelevant: false,
  fromExam: false,
  difficulty: 2,
})
const ANSWER = JSON.stringify({ cards: [choice('A?', 2), choice('B?', 5), choice('C?', 9)] })
const botanik: Module = { id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: 'x' }

let writeText: ReturnType<typeof vi.fn>
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => vi.restoreAllMocks())

function setup(over: { modules?: Module[]; content?: ModuleContent; save?: (p: Prepared) => Promise<void> } = {}) {
  const props = {
    loadModules: vi.fn(async () => over.modules ?? []),
    loadContent: vi.fn(async (_id: string): Promise<ModuleContent> => over.content ?? { topics: [], cards: [] }),
    refresh: vi.fn(async () => {}),
    save: vi.fn(over.save ?? (async (_p: Prepared) => {})),
    onDone: vi.fn(),
  }
  render(<CardImportFlow {...props} />)
  return props
}

/** Schritt 1 mit neuem Modul → Schritt 2 → Schritt 3. */
async function toPaste(name = 'Botanik') {
  await userEvent.type(await screen.findByLabelText('Name des neuen Moduls'), name)
  await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await screen.findByText('Schritt 2 von 4')
  await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await screen.findByText('Schritt 3 von 4')
}

async function check(text: string) {
  const area = screen.getByLabelText('Antwort von Claude')
  await userEvent.clear(area)
  // Geschweifte Klammern sind in userEvent.type Sonderzeichen: einfügen statt tippen.
  await userEvent.click(area)
  await userEvent.paste(text)
  await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }))
}

describe('CardImportFlow', () => {
  it('führt in vier Schritten von Modul bis Speichern', async () => {
    const props = setup()
    expect(await screen.findByRole('heading', { name: 'Modul wählen' })).toBeInTheDocument()
    expect(screen.getByText('Schritt 1 von 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Name des neuen Moduls'), 'Botanik')
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))

    expect(await screen.findByRole('heading', { name: 'Auftrag kopieren' })).toBeInTheDocument()
    expect(screen.getByText(/Skript-PDF/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /claude\.ai/ })).toHaveAttribute('href', 'https://claude.ai')
    await userEvent.click(screen.getByRole('button', { name: 'Auftrag kopieren' }))
    expect(writeText.mock.calls[0]![0]).toContain('Botanik')
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))

    expect(await screen.findByRole('heading', { name: 'Antwort einfügen' })).toBeInTheDocument()
    await check(ANSWER)
    expect(await screen.findByRole('heading', { name: 'Ergebnis' })).toBeInTheDocument()
    expect(screen.getByText('Schritt 4 von 4')).toBeInTheDocument()
    expect(screen.getByText('3 Karten erkannt')).toBeInTheDocument()
    expect(props.refresh).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText('3 Karten gespeichert')).toBeInTheDocument()
    expect(props.save).toHaveBeenCalledTimes(1)
    expect(props.save.mock.calls[0]![0]).toMatchObject({ isNewModule: true, module: { name: 'Botanik' } })
    expect(screen.getByText(/Weiter ab Seite 10/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    expect(props.onDone).toHaveBeenCalled()
  })

  it('Kopieren scheitert: Auftrag im Textfeld', async () => {
    writeText.mockRejectedValue(new Error('nope'))
    setup()
    await userEvent.type(await screen.findByLabelText('Name des neuen Moduls'), 'Botanik')
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Auftrag kopieren' }))
    const area = (await screen.findByLabelText('Auftrag zum Kopieren')) as HTMLTextAreaElement
    expect(area).toHaveAttribute('readonly')
    expect(area.value).toContain('Botanik')
  })

  it('Name wie bestehendes Modul wählt das bestehende', async () => {
    const props = setup({ modules: [botanik] })
    await userEvent.selectOptions(await screen.findByLabelText('Modul'), 'Neues Modul')
    await toPaste('botanik ')
    await check(ANSWER)
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }))
    await screen.findByText('3 Karten gespeichert')
    expect(props.loadContent).toHaveBeenCalledWith('m1')
    expect(props.save.mock.calls[0]![0]).toMatchObject({ isNewModule: false, module: { id: 'm1' } })
  })

  it('bestehendes Modul aus der Liste', async () => {
    const props = setup({ modules: [botanik] })
    expect(await screen.findByLabelText('Modul')).toHaveValue('m1')
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    await check(ANSWER)
    await screen.findByText('3 Karten erkannt')
    expect(props.loadContent).toHaveBeenCalledWith('m1')
  })

  it('alles schon vorhanden: kein Speichern', async () => {
    const props = setup({ modules: [botanik] })
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter' }))
    await check(ANSWER)
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }))
    await screen.findByText('3 Karten gespeichert')
    // Die gleiche Antwort noch einmal, diesmal kennt das Gerät die Karten bereits.
    props.loadContent.mockResolvedValue({ topics: [], cards: props.save.mock.calls[0]![0].cards })
    await userEvent.click(screen.getByRole('button', { name: 'Weitere Seiten' }))
    await check(ANSWER)
    expect(await screen.findByText('3 schon vorhanden, übersprungen')).toBeInTheDocument()
    expect(screen.getByText('Keine neuen Karten dabei.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument()
  })

  it('Speichern scheitert, zweiter Versuch mit denselben Karten', async () => {
    let first = true
    const props = setup({
      save: async () => {
        if (first) {
          first = false
          throw new Error('Failed to fetch')
        }
      },
    })
    await toPaste()
    await check(ANSWER)
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen')
    expect(screen.getByText('3 Karten erkannt')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await screen.findByText('3 Karten gespeichert')
    const ids = (i: number) => props.save.mock.calls[i]![0].cards.map((c) => c.id)
    expect(ids(1)).toEqual(ids(0))
  })

  it('Weitere Seiten: Karten dieser Sitzung zählen als vorhanden', async () => {
    setup()
    await toPaste()
    await check(ANSWER)
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }))
    await screen.findByText('3 Karten gespeichert')
    await userEvent.click(screen.getByRole('button', { name: 'Weitere Seiten' }))
    expect(await screen.findByText('Schritt 3 von 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Antwort von Claude')).toHaveValue('')
    await check(ANSWER)
    expect(await screen.findByText('3 schon vorhanden, übersprungen')).toBeInTheDocument()
  })

  it('keine Karten: Hinweis, bleibt in Schritt 3', async () => {
    setup()
    await toPaste()
    await check('hallo')
    expect(await screen.findByRole('alert')).toHaveTextContent('Keine Karten gefunden')
    expect(screen.getByText('Schritt 3 von 4')).toBeInTheDocument()
  })

  it('Zurück in jedem Schritt, im ersten zurück ins Spiel', async () => {
    const props = setup()
    await toPaste()
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByText('Schritt 2 von 4')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByText('Schritt 1 von 4')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(props.onDone).toHaveBeenCalled()
  })

  it('Zurück im Ergebnis führt zu Schritt 3 mit dem Text', async () => {
    setup()
    await toPaste()
    await check(ANSWER)
    await screen.findByText('Schritt 4 von 4')
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByText('Schritt 3 von 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Antwort von Claude')).toHaveValue(ANSWER)
  })
})
