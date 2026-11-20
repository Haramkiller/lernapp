// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../src/data/db'
import { TitleScreen } from '../../src/ui/TitleScreen'
import { choiceCard } from './fixtures'

const NOW = new Date('2026-03-10T10:00:00.000Z')

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('TitleScreen', () => {
  it('zeigt Namen, Tages-Quest und startet', async () => {
    await db.cards.bulkPut(['a', 'b', 'c'].map((id) => choiceCard(id)))
    const onStart = vi.fn()
    render(<TitleScreen now={() => NOW} onStart={onStart} />)
    expect(screen.getByRole('heading', { name: 'Lernabenteuer' })).toBeInTheDocument()
    expect(await screen.findByText('Tages-Quest 0/3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: "Los geht's" }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('nichts zu tun: „Heute ist nichts fällig“', async () => {
    render(<TitleScreen now={() => NOW} onStart={vi.fn()} />)
    expect(await screen.findByText('Heute ist nichts fällig')).toBeInTheDocument()
  })
})
