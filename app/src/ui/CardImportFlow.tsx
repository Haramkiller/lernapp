import { useEffect, useRef, useState } from 'react'
import { normalize, ParseError, type Module } from '@lernapp/shared'
import { chatPrompt, nextPageHint } from '../cards/chatPrompt'
import { newModule, prepareImport, type ImportTarget, type ModuleContent, type Prepared } from '../cards/prepare'

type Props = {
  loadModules: () => Promise<Module[]>
  loadContent: (moduleId: string) => Promise<ModuleContent>
  /** Vor dem Prüfen: synchronisieren; Fehler werden ignoriert. */
  refresh: () => Promise<void>
  /** Wirft bei Fehlern. */
  save: (p: Prepared) => Promise<void>
  onDone: () => void
  now?: () => Date
}

type Step = 'module' | 'prompt' | 'paste' | 'result'
const NEW = 'new'
const EMPTY: ModuleContent = { topics: [], cards: [] }

const Progress = ({ n }: { n: 1 | 2 | 3 | 4 }) => <p className="muted pixel step-progress">Schritt {n} von 4</p>
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Kopiert direkt im Klick (iOS lehnt sonst ab); false = Zwischenablage nicht verfügbar. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Geführter Ablauf: Modul wählen, Auftrag für claude.ai kopieren, Antwort einfügen, prüfen und speichern. */
export function CardImportFlow({ loadModules, loadContent, refresh, save, onDone, now = () => new Date() }: Props) {
  const [modules, setModules] = useState<Module[] | null>(null)
  const [choice, setChoice] = useState<string>(NEW)
  const [newName, setNewName] = useState('')
  const [step, setStep] = useState<Step>('module')
  const [target, setTarget] = useState<ImportTarget | null>(null)
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState<boolean | null>(null)
  const [text, setText] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // In dieser Sitzung gespeicherte Themen und Karten: zählen als vorhanden, auch wenn die Synchronisierung noch fehlt.
  const session = useRef<ModuleContent>({ topics: [], cards: [] })
  // Neue Module dieses Ablaufs nach Namen: Ein zweiter Versuch (oder der Weg zurück zu Schritt 1) nutzt dieselbe ID.
  const pending = useRef(new Map<string, Module>())
  const promptArea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let alive = true
    void loadModules().then((list) => {
      if (!alive) return
      setModules(list)
      if (list.length) setChoice(list[0]!.id)
    })
    return () => {
      alive = false
    }
  }, [loadModules])

  useEffect(() => {
    if (copied === false) promptArea.current?.select()
  }, [copied])

  const go = (s: Step) => {
    setError(null)
    setStep(s)
  }

  const contentOf = async (t: ImportTarget): Promise<ModuleContent> => {
    const local = t.kind === 'existing' ? await loadContent(t.module.id) : EMPTY
    const mine = (x: { moduleId: string }) => x.moduleId === t.module.id
    const known = new Set([...local.topics.map((x) => x.id), ...local.cards.map((x) => x.id)])
    return {
      topics: [...local.topics, ...session.current.topics.filter((x) => mine(x) && !known.has(x.id))],
      cards: [...local.cards, ...session.current.cards.filter((x) => mine(x) && !known.has(x.id))],
    }
  }

  const chooseModule = async () => {
    const list = modules ?? []
    let t: ImportTarget
    if (choice !== NEW && list.length) {
      t = { kind: 'existing', module: list.find((m) => m.id === choice)! }
    } else {
      const key = normalize(newName)
      const same = list.find((m) => normalize(m.name) === key)
      if (same) t = { kind: 'existing', module: same }
      else {
        const made = pending.current.get(key) ?? newModule(newName, now())
        pending.current.set(key, made)
        t = { kind: 'new', module: made }
      }
    }
    setBusy(true)
    try {
      const content = await contentOf(t)
      setTarget(t)
      setPrompt(chatPrompt({ moduleName: t.module.name, existingTopics: content.topics.map((x) => x.name) }))
      setCopied(null)
      go('prompt')
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      await refresh().catch(() => undefined)
      const content = await contentOf(target)
      let p: Prepared
      try {
        p = prepareImport(text, target, content, now())
      } catch (e) {
        if (!(e instanceof ParseError)) throw e
        p = { module: { id: '', name: '', examDate: null, styleProfile: null, updatedAt: '' }, isNewModule: false, topics: [], cards: [], found: 0, rejected: 0, duplicates: 0 }
      }
      if (p.found === 0) {
        setError('Keine Karten gefunden. Hast du die ganze Antwort kopiert?')
        return
      }
      setPrepared(p)
      setSaved(false)
      go('result')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  const store = async () => {
    if (!prepared) return
    setBusy(true)
    setError(null)
    try {
      await save(prepared)
      session.current = {
        topics: [...session.current.topics, ...prepared.topics],
        cards: [...session.current.cards, ...prepared.cards],
      }
      // Ab jetzt gibt es das Modul: weitere Antworten landen im selben, nicht in einem neuen.
      setTarget({ kind: 'existing', module: prepared.module })
      if (prepared.isNewModule) {
        const made = prepared.module
        setModules((list) => [...(list ?? []).filter((m) => m.id !== made.id), made].sort((a, b) => a.name.localeCompare(b.name, 'de')))
      }
      setSaved(true)
    } catch (e) {
      setError(`Speichern fehlgeschlagen: ${message(e)}. Prüfe deine Verbindung und versuche es noch einmal.`)
    } finally {
      setBusy(false)
    }
  }

  const morePages = () => {
    setText('')
    setPrepared(null)
    setSaved(false)
    go('paste')
  }

  const alert = error && (
    <p role="alert" className="warn">
      {error}
    </p>
  )

  if (step === 'prompt') {
    return (
      <section className="card-panel">
        <h1 className="pixel">Auftrag kopieren</h1>
        <Progress n={2} />
        <button type="button" className="primary" onClick={() => void copyText(prompt).then(setCopied)}>
          Auftrag kopieren
        </button>
        {copied === true && <p className="why right">Auftrag kopiert</p>}
        {copied === false && (
          <>
            <p className="warn">Auftrag markieren und kopieren:</p>
            <textarea ref={promptArea} readOnly rows={8} value={prompt} aria-label="Auftrag zum Kopieren" onFocus={(e) => e.currentTarget.select()} />
          </>
        )}
        <ol className="guide">
          <li>
            Öffne{' '}
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">
              claude.ai
            </a>{' '}
            und melde dich kostenlos an.
          </li>
          <li>Starte einen neuen Chat, hänge dein Skript-PDF an, füge den Auftrag ein und sende ihn.</li>
          <li>Kopiere Claudes Antwort mit dem Kopieren-Knopf unter der Antwort.</li>
        </ol>
        <p className="muted">Im kostenlosen Zugang sind Nachrichten begrenzt. Deshalb macht Claude etwa 10–15 Karten auf einmal.</p>
        <div className="row">
          <button type="button" className="primary" onClick={() => go('paste')}>
            Weiter
          </button>
          <button type="button" onClick={() => go('module')}>
            Zurück
          </button>
        </div>
      </section>
    )
  }

  if (step === 'paste') {
    return (
      <section className="card-panel">
        <h1 className="pixel">Antwort einfügen</h1>
        <Progress n={3} />
        <p>Füge hier die ganze Antwort von Claude ein.</p>
        <textarea rows={10} value={text} aria-label="Antwort von Claude" onChange={(e) => setText(e.target.value)} />
        {alert}
        <div className="row">
          <button type="button" className="primary" disabled={busy || !text.trim()} onClick={() => void check()}>
            Prüfen
          </button>
          <button type="button" onClick={() => go('prompt')}>
            Zurück
          </button>
        </div>
      </section>
    )
  }

  if (step === 'result' && prepared) {
    const hint = nextPageHint(prepared.cards)
    return (
      <section className="card-panel">
        <h1 className="pixel">Ergebnis</h1>
        <Progress n={4} />
        <p>{`${prepared.found} Karten erkannt`}</p>
        {prepared.rejected > 0 && <p className="muted">{`${prepared.rejected} fehlerhaft übersprungen`}</p>}
        {prepared.duplicates > 0 && <p className="muted">{`${prepared.duplicates} schon vorhanden, übersprungen`}</p>}
        {alert}
        {saved ? (
          <>
            <p className="why right">{`${prepared.cards.length} Karten gespeichert`}</p>
            <p>Für mehr Karten schreib im selben Chat:</p>
            <p className="pixel">{hint}</p>
            <div className="row">
              <button type="button" onClick={() => void copyText(hint)}>
                Tipp kopieren
              </button>
              <button type="button" className="primary" onClick={morePages}>
                Weitere Seiten
              </button>
              <button type="button" onClick={onDone}>
                Fertig
              </button>
            </div>
          </>
        ) : prepared.cards.length === 0 ? (
          <>
            <p>Keine neuen Karten dabei.</p>
            <div className="row">
              <button type="button" className="primary" onClick={morePages}>
                Weitere Seiten
              </button>
              <button type="button" onClick={onDone}>
                Fertig
              </button>
            </div>
          </>
        ) : (
          <div className="row">
            <button type="button" className="primary" disabled={busy} onClick={() => void store()}>
              Speichern
            </button>
            <button type="button" onClick={() => go('paste')}>
              Zurück
            </button>
          </div>
        )}
      </section>
    )
  }

  const list = modules ?? []
  const isNew = choice === NEW || list.length === 0
  return (
    <section className="card-panel">
      <h1 className="pixel">Modul wählen</h1>
      <Progress n={1} />
      <p>Zu welchem Modul gehört dein Skript?</p>
      {list.length > 0 && (
        <label className="field">
          <span>Modul</span>
          <select aria-label="Modul" value={choice} onChange={(e) => setChoice(e.target.value)}>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value={NEW}>Neues Modul</option>
          </select>
        </label>
      )}
      {isNew && (
        <label className="field">
          <span>Name des neuen Moduls</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
      )}
      <div className="row">
        <button type="button" className="primary" disabled={modules === null || busy || (isNew && !newName.trim())} onClick={() => void chooseModule()}>
          Weiter
        </button>
        <button type="button" onClick={onDone}>
          Zurück
        </button>
      </div>
    </section>
  )
}
