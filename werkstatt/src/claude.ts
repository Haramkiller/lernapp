import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export type SpawnFn = (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess

export interface RunClaudeOptions {
  addDir: string
  timeoutMs?: number
  /** Nur für Tests: eigene spawn-Funktion. */
  spawnFn?: SpawnFn
  /** Nur für Tests: Programmname statt PATH-Suche. */
  command?: string
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

/** Sucht das Claude-CLI im PATH (Windows: .exe bevorzugt, dann .cmd). */
export function resolveClaude(): { cmd: string; shell: boolean } {
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd', 'claude.bat'] : ['claude']
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const n of names) {
      const full = join(dir, n)
      if (existsSync(full)) return { cmd: full, shell: /\.(cmd|bat)$/i.test(n) }
    }
  }
  return { cmd: 'claude', shell: false }
}

class ClaudeError extends Error {}

function classify(text: string): string | null {
  if (/usage limit|rate limit|limit reached|quota|too many requests|overloaded/i.test(text)) {
    return 'Das Nutzungslimit von Claude ist erreicht. Bitte später erneut versuchen (das Limit setzt sich nach einigen Stunden zurück).'
  }
  if (/log ?in|not logged|authenticat|invalid api key|unauthori[sz]ed|oauth|credentials/i.test(text)) {
    return 'Claude ist nicht angemeldet. Bitte im Terminal „claude“ starten und mit /login anmelden.'
  }
  return null
}

/** Ruft das lokale Claude-CLI (Pro-Abo, nie die bezahlte API) auf und liefert das `result`-Feld. */
export function runClaude(prompt: string, opts: RunClaudeOptions): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const spawn = opts.spawnFn ?? (nodeSpawn as SpawnFn)
  const resolved = opts.command ? { cmd: opts.command, shell: false } : resolveClaude()
  // Der Prompt geht über stdin (kein Argv-Limit, keine Shell-Interpretation).
  const args = ['-p', '--output-format', 'json', '--allowedTools', 'Read', '--add-dir', opts.addDir]
  if (resolved.shell && /[&|<>^%"\r\n]/.test(opts.addDir)) {
    return Promise.reject(new Error('Ungültiger Verzeichnispfad für Claude.'))
  }
  const shellArgs = resolved.shell ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args

  return new Promise<string>((resolve, reject) => {
    let settled = false
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    let child: ChildProcess
    try {
      child = spawn(resolved.cmd, shellArgs, { shell: resolved.shell, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      return reject(spawnFailure(e))
    }
    const timer = setTimeout(() => {
      done(() => reject(new Error(`Claude hat nicht innerhalb von ${Math.round(timeoutMs / 1000)} s geantwortet (Zeitüberschreitung).`)))
      child.kill()
    }, timeoutMs)

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += d))
    child.stderr?.on('data', (d) => (stderr += d))
    child.on('error', (e) => done(() => reject(spawnFailure(e))))
    child.on('close', (code) =>
      done(() => {
        try {
          resolve(interpret(stdout, stderr, code))
        } catch (e) {
          reject(e)
        }
      }),
    )
    child.stdin?.on('error', () => {})
    child.stdin?.end(prompt)
  })
}

function spawnFailure(e: unknown): Error {
  if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
    return new Error('Claude Code ist nicht installiert oder nicht im PATH. Bitte installieren und im Terminal einmal „claude“ starten.')
  }
  return new Error(`Claude konnte nicht gestartet werden: ${(e as Error)?.message ?? e}`)
}

function interpret(stdout: string, stderr: string, code: number | null): string {
  let parsed: { result?: unknown; is_error?: boolean } | undefined
  try {
    parsed = JSON.parse(stdout.trim())
  } catch {
    parsed = undefined
  }
  const text = typeof parsed?.result === 'string' ? parsed.result : ''
  if (parsed && !parsed.is_error && code === 0 && typeof parsed.result === 'string') return parsed.result
  const known = classify(`${text}\n${stderr}\n${parsed ? '' : stdout}`)
  if (known) throw new ClaudeError(known)
  const detail = (text || stderr || stdout).trim().slice(0, 300)
  throw new ClaudeError(`Claude ist mit einem Fehler beendet (Code ${code ?? '?'})${detail ? `: ${detail}` : '.'}`)
}
