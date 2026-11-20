// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../src/data/db'
import { loadAreaChoices, saveAreaChoice } from '../../src/data/game'
import { SettingsScreen } from '../../src/ui/SettingsScreen'

const iso = '2026-03-10T10:00:00.000Z'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.modules.put({ id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: iso })
})

const screenProps = { onBack: vi.fn(), onLogout: vi.fn(), onOverrideChanged: vi.fn() }

describe('Einstellungen: Gebiet je Modul', () => {
  it('Auswahl mit „Automatisch“ und den 6 Regionen; Speichern merkt sich die Wahl', async () => {
    render(<SettingsScreen {...screenProps} />)
    const select = await screen.findByRole('combobox', { name: 'Gebiet für Botanik' })
    const options = [...(select as HTMLSelectElement).options].map((o) => o.text)
    expect(options).toEqual([
      'Automatisch',
      'Wald – Moosgolem',
      'Sumpf – Sporenhexe',
      'Kristallberge – Kristallwächter',
      'Küste – Tiefseekraken',
      'Arena – Bronzetitan',
      'Vulkan – Aschephönix',
    ])
    await userEvent.selectOptions(select, 'Vulkan – Aschephönix')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await vi.waitFor(async () => expect(await loadAreaChoices()).toEqual(new Map([['m1', 'aschephoenix']])))
  })

  it('„Automatisch“ entfernt eine gespeicherte Wahl', async () => {
    await saveAreaChoice('m1', 'sporenhexe', new Date(iso))
    render(<SettingsScreen {...screenProps} />)
    const select = await screen.findByRole('combobox', { name: 'Gebiet für Botanik' })
    await vi.waitFor(() => expect(select).toHaveValue('sporenhexe'))
    await userEvent.selectOptions(select, 'Automatisch')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await vi.waitFor(async () => expect(await loadAreaChoices()).toEqual(new Map()))
  })

  it('unveränderte Wahl wird beim Speichern nicht erneut geschrieben', async () => {
    await saveAreaChoice('m1', 'sporenhexe', new Date(iso))
    await db.outbox.clear()
    render(<SettingsScreen {...screenProps} />)
    const select = await screen.findByRole('combobox', { name: 'Gebiet für Botanik' })
    await vi.waitFor(() => expect(select).toHaveValue('sporenhexe'))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Gespeichert.')
    expect(await db.outbox.count()).toBe(0)
  })
})
