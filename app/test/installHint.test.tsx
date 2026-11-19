// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import './ui/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../src/data/db'
import { InstallHint } from '../src/ui/InstallHint'
import { isIosNotInstalled } from '../src/ui/iosInstall'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

describe('isIosNotInstalled', () => {
  it('true für iPhone-Safari im Tab', () => expect(isIosNotInstalled(IPHONE, false)).toBe(true))
  it('false für Android', () => expect(isIosNotInstalled(ANDROID, false)).toBe(false))
  it('false für iOS standalone', () => expect(isIosNotInstalled(IPHONE, true)).toBe(false))
  it('erkennt iPadOS mit Desktop-UA über Touchpunkte', () => {
    expect(isIosNotInstalled(IPAD_DESKTOP, false, 5)).toBe(true)
    expect(isIosNotInstalled(IPAD_DESKTOP, false, 0)).toBe(false)
  })
})

describe('InstallHint', () => {
  beforeEach(async () => {
    await db.meta.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('erscheint auf iOS im Tab und merkt sich das Schließen', async () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE, maxTouchPoints: 5 })
    const { unmount } = render(<InstallHint />)
    expect(await screen.findByText(/Zum Home-Bildschirm/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Verstanden' }))
    expect(screen.queryByText(/Zum Home-Bildschirm/)).not.toBeInTheDocument()
    await waitFor(async () => expect((await db.meta.get('installHintDismissed'))?.value).toBe(true))
    unmount()
    render(<InstallHint />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/Zum Home-Bildschirm/)).not.toBeInTheDocument()
  })

  it('erscheint nicht auf Android', async () => {
    vi.stubGlobal('navigator', { userAgent: ANDROID, maxTouchPoints: 5 })
    render(<InstallHint />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/Zum Home-Bildschirm/)).not.toBeInTheDocument()
  })
})
