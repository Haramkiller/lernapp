// @vitest-environment jsdom
import './setup'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Module } from '@lernapp/shared'
import { buildOverview } from '../../src/game/overview'
import { MapDialog } from '../../src/ui/game/MapDialog'
import { choiceCard } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')
const mod: Module = { id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: NOW.toISOString() }
const overview = (calibration?: Map<string, number>) =>
  buildOverview({ cards: [choiceCard('a')], states: new Map(), topics: [], modules: [mod], newDoneToday: 0, now: NOW, settings: { retention: 0.9, newPerDay: 20 }, chosen: new Map(), calibration })

describe('Treffsicherheit auf der Karte', () => {
  it('zeigt den Wert je Modul', () => {
    render(<MapDialog overview={overview(new Map([['m1', 80]]))} onBattle={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Wenn du sicher bist: 80 % richtig')).toBeInTheDocument()
  })
  it('ohne Wert nichts', () => {
    render(<MapDialog overview={overview()} onBattle={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByText(/Wenn du sicher bist/)).not.toBeInTheDocument()
  })
})
