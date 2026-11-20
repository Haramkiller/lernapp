// @vitest-environment jsdom
import './setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Sprite } from '../../src/ui/game/Sprite'

const img = () => screen.getByRole('presentation')

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Sprite', () => {
  it('spielt Bilder im Takt und wiederholt', () => {
    render(<Sprite frames={['a.png', 'b.png']} fps={10} />)
    expect(img().getAttribute('src')).toBe('a.png')
    act(() => vi.advanceTimersByTime(100))
    expect(img().getAttribute('src')).toBe('b.png')
    act(() => vi.advanceTimersByTime(100))
    expect(img().getAttribute('src')).toBe('a.png')
  })

  it('einmalig: onDone nach dem letzten Bild, bleibt auf dem letzten Bild', () => {
    const onDone = vi.fn()
    render(<Sprite frames={['a', 'b', 'c']} fps={10} loop={false} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(300))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(img().getAttribute('src')).toBe('c')
    act(() => vi.advanceTimersByTime(300))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('reduzierte Bewegung: Standbild, onDone sofort', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    const onDone = vi.fn()
    render(<Sprite frames={['a', 'b']} fps={10} loop={false} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(500))
    expect(img().getAttribute('src')).toBe('a')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('neue Bildfolge beginnt bei Bild 0', () => {
    const { rerender } = render(<Sprite frames={['a', 'b', 'c']} fps={10} />)
    act(() => vi.advanceTimersByTime(100))
    expect(img().getAttribute('src')).toBe('b')
    rerender(<Sprite frames={['x', 'y']} fps={10} />)
    expect(img().getAttribute('src')).toBe('x')
  })
})
