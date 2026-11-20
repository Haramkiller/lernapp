import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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

export const NOT_FOUND_MESSAGE =
  'Claude Code nicht gefunden (nicht installiert oder nicht im PATH). Bitte installieren und im Terminal einmal „claude“ starten.'

export interface ResolveDeps {
  exists: (path: string) => boolean
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  execPath: string
}

export interface ResolvedClaude {
  cmd: string
  /** Argumente, die vor den eigentlichen CLI-Argumenten stehen (z. B. Pfad zu cli.js bei npm-Installation). */
  prefixArgs: string[]
}

const realDeps = (): ResolveDeps => ({ exists: existsSync, env: process.env, platform: process.platform, execPath: process.execPath })

/** Findet das Claude-CLI ohne Shell: claude.exe (PATH, ~/.local/bin) oder npm-global cli.js mit node. */
export function resolveClaude(deps: ResolveDeps = realDeps()): ResolvedClaude | null {
  const { exists, env, platform } = deps
  // Trennzeichen der Zielplattform, nicht des laufenden Rechners (sonst schlägt der Windows-Fall unter Linux fehl).
  const pathDirs = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean)
  if (platform !== 'win32') {
    for (const d of pathDirs) if (exists(join(d, 'claude'))) return { cmd: join(d, 'claude'), prefixArgs: [] }
    return null
  }
  const exts = (env.PATHEXT ?? '.EXE;.CMD').split(';').filter((e) => e.toLowerCase() === '.exe')
  const dirs = [...pathDirs]
  if (env.USERPROFILE) dirs.push(join(env.USERPROFILE, '.local', 'bin'))
  for (const d of dirs) {
    for (const e of exts.length ? exts : ['.exe']) {
      const full = join(d, 'claude' + e.toLowerCase())
      if (exists(full)) return { cmd: full, prefixArgs: [] }
    }
  }
  const npmDirs = [...pathDirs.filter((d) => exists(join(d, 'claude.cmd'))), ...(env.APPDATA ? [join(env.APPDATA, 'npm')] : [])]
  for (const d of npmDirs) {
    const cli = join(d, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
    if (exists(cli)) return { cmd: deps.execPath, prefixArgs: [cli] }
  }
  return null
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
  const resolved = opts.command ? { cmd: opts.command, prefixArgs: [] as string[] } : resolveClaude()
  if (!resolved) return Promise.reject(new Error(NOT_FOUND_MESSAGE))
  // Prompt über stdin (kein Argv-Limit, keine Shell). PDF-Inhalt ist nicht vertrauenswürdig:
  // nur das Read-Werkzeug, keine MCP-Server des Nutzers, Arbeitsverzeichnis = Abschnittsordner.
  const args = [
    ...resolved.prefixArgs,
    '-p',
    '--output-format', 'json',
    '--tools', 'Read',
    '--allowedTools', 'Read',
    '--strict-mcp-config',
    '--add-dir', opts.addDir,
  ]

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
      child = spawn(resolved.cmd, args, { shell: false, cwd: opts.addDir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
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
    return new Error(NOT_FOUND_MESSAGE)
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
