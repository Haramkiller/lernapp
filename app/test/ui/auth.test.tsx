// @vitest-environment jsdom
import './setup'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WelcomeFlow } from '../../src/ui/WelcomeFlow'
import { SetupScreen } from '../../src/ui/SetupScreen'

describe('WelcomeFlow', () => {
  const fill = async (email: string, password: string) => {
    const field = screen.getByLabelText('E-Mail')
    await userEvent.clear(field)
    await userEvent.type(field, email)
    await userEvent.type(screen.getByLabelText('Passwort'), password)
  }

  it('zeigt zuerst die Willkommensseite', () => {
    render(<WelcomeFlow onSubmit={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Willkommen bei Lernabenteuer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ich bin neu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ich habe schon ein Konto' })).toBeInTheDocument()
    expect(screen.queryByLabelText('E-Mail')).not.toBeInTheDocument()
  })

  it('Bestandsnutzer: Ich habe schon ein Konto → Anmelden, Zurück führt zurück', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<WelcomeFlow onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ich habe schon ein Konto' }))
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    await fill('a@b.de', 'geheim1')
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(onSubmit).toHaveBeenCalledWith('signIn', 'a@b.de', 'geheim1')
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('heading', { name: 'Willkommen bei Lernabenteuer' })).toBeInTheDocument()
  })

  it('Neu: drei Schritte bis zur Anmeldung', async () => {
    const onSubmit = vi.fn(async (mode: string) => (mode === 'signUp' ? ('confirm' as const) : undefined))
    render(<WelcomeFlow onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ich bin neu' }))
    expect(screen.getByText('Schritt 1 von 3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Konto anlegen' })).toBeInTheDocument()
    expect(screen.getByText(/meldest du dich später an, auch am PC/)).toBeInTheDocument()
    await fill('a@b.de', 'geheim1')
    await userEvent.click(screen.getByRole('button', { name: 'Konto anlegen' }))
    expect(onSubmit).toHaveBeenCalledWith('signUp', 'a@b.de', 'geheim1')
    expect(await screen.findByText('Schritt 2 von 3')).toBeInTheDocument()
    expect(screen.getByText(/Mail an a@b\.de geschickt/)).toBeInTheDocument()
    expect(screen.getByText(/Spam-Ordner/)).toBeInTheDocument()
    expect(screen.getByText(/Verbindung abgelehnt/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ich habe bestätigt – weiter' }))
    expect(screen.getByText('Schritt 3 von 3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-Mail')).toHaveValue('a@b.de')
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim1')
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(onSubmit).toHaveBeenLastCalledWith('signIn', 'a@b.de', 'geheim1')
  })

  it('jeder Schritt hat Zurück', async () => {
    render(<WelcomeFlow onSubmit={vi.fn().mockResolvedValue('confirm')} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ich bin neu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(screen.getByRole('heading', { name: 'Willkommen bei Lernabenteuer' })).toBeInTheDocument()
  })

  it('Registrierung mit sofortiger Sitzung: kein Bestätigungsschritt', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<WelcomeFlow onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ich bin neu' }))
    await fill('a@b.de', 'geheim1')
    await userEvent.click(screen.getByRole('button', { name: 'Konto anlegen' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.queryByText('Schritt 2 von 3')).not.toBeInTheDocument()
  })

  it('Anmelden vor Bestätigung: verständlicher Hinweis', async () => {
    render(<WelcomeFlow onSubmit={vi.fn().mockRejectedValue(new Error('Email not confirmed'))} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ich habe schon ein Konto' }))
    await fill('a@b.de', 'geheim1')
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('noch nicht bestätigt')
  })

  it('zeigt Fehler deutsch an', async () => {
    render(<WelcomeFlow onSubmit={vi.fn().mockRejectedValue(new Error('Invalid login credentials'))} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ich habe schon ein Konto' }))
    await fill('a@b.de', 'geheim123')
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Anmeldung fehlgeschlagen')
  })

  it('eigene Datenbank: Hinweis und Link auf der Willkommensseite', async () => {
    const own = vi.fn()
    render(<WelcomeFlow onSubmit={vi.fn()} database="https://x.supabase.co" onUseOwnDatabase={own} />)
    expect(screen.getByText('Eigene Datenbank: https://x.supabase.co')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Eigene Datenbank verwenden' }))
    expect(own).toHaveBeenCalled()
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
