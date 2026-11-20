// @vitest-environment jsdom
import './setup'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from '../../src/ui/LoginScreen'
import { SetupScreen } from '../../src/ui/SetupScreen'

describe('LoginScreen', () => {
  it('meldet mit E-Mail und Passwort an', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('E-Mail'), 'a@b.de')
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim123')
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(onSubmit).toHaveBeenCalledWith('signIn', 'a@b.de', 'geheim123')
  })

  it('zeigt Fehler deutsch an', async () => {
    render(<LoginScreen onSubmit={vi.fn().mockRejectedValue(new Error('Invalid login credentials'))} />)
    await userEvent.type(screen.getByLabelText('E-Mail'), 'a@b.de')
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim123')
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Anmeldung fehlgeschlagen')
  })

  it('wechselt zum Registrieren', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /Registrieren/ }))
    await userEvent.type(screen.getByLabelText('E-Mail'), 'a@b.de')
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim123')
    await userEvent.click(screen.getByRole('button', { name: 'Registrieren' }))
    expect(onSubmit).toHaveBeenCalledWith('signUp', 'a@b.de', 'geheim123')
  })
})

describe('SetupScreen', () => {
  it('speichert URL und Schlüssel, lehnt ungültige URL ab', async () => {
    const onSave = vi.fn()
    render(<SetupScreen onSave={onSave} />)
    await userEvent.type(screen.getByLabelText('Supabase-URL'), 'kaputt')
    await userEvent.type(screen.getByLabelText('Öffentlicher Schlüssel'), 'k')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Supabase-URL'))
    await userEvent.type(screen.getByLabelText('Supabase-URL'), 'https://x.supabase.co')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSave).toHaveBeenCalledWith({ url: 'https://x.supabase.co', key: 'k' })
  })

  it('lehnt Dashboard-Adresse und geheimen Schlüssel mit Erklärung ab', async () => {
    const onSave = vi.fn()
    render(<SetupScreen onSave={onSave} />)
    await userEvent.type(screen.getByLabelText('Supabase-URL'), 'https://supabase.com/dashboard/project/abc')
    await userEvent.type(screen.getByLabelText('Öffentlicher Schlüssel'), 'sb_secret_x')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Dashboard/)
    await userEvent.clear(screen.getByLabelText('Supabase-URL'))
    await userEvent.type(screen.getByLabelText('Supabase-URL'), 'https://abc.supabase.co')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/geheime Schlüssel/)
    expect(onSave).not.toHaveBeenCalled()
  }, 15_000)
})
