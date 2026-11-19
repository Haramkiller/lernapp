import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { runClaude, type SpawnFn } from '../src/claude'

interface Call { cmd: string; args: string[]; stdin: string; killed: boolean; shell: unknown }

function fake(opts: { stdout?: string; stderr?: string; code?: number; error?: NodeJS.ErrnoException; hang?: boolean }) {
  const calls: Call[] = []
  const spawn: SpawnFn = (cmd, args, o) => {
    const child = new EventEmitter() as any
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.stdin = new PassThrough()
    let stdin = ''
    child.stdin.on('data', (d: Buffer) => (stdin += d))
    const rec: Call = { cmd, args, stdin: '', killed: false, shell: (o as any)?.shell }
    calls.push(rec)
    child.kill = () => {
      rec.killed = true
      child.emit('close', null)
      return true
    }
    setImmediate(() => {
      if (opts.error) return child.emit('error', opts.error)
      if (opts.hang) return
      if (opts.stdout) child.stdout.write(opts.stdout)
      if (opts.stderr) child.stderr.write(opts.stderr)
      child.stdout.end()
      child.stderr.end()
      setImmediate(() => {
        rec.stdin = stdin
        child.emit('close', opts.code ?? 0)
      })
    })
    return child
  }
  return { spawn, calls }
}

describe('runClaude', () => {
  it('liefert das result-Feld; Prompt über stdin, keine Shell', async () => {
    const f = fake({ stdout: JSON.stringify({ type: 'result', is_error: false, result: 'Antwort' }) })
    const prompt = 'Hallo "Welt" & $(x)'
    const out = await runClaude(prompt, { addDir: 'C:/x', spawnFn: f.spawn, command: 'claude' })
    expect(out).toBe('Antwort')
    const c = f.calls[0]!
    expect(c.args).toEqual(expect.arrayContaining(['-p', '--output-format', 'json', '--allowedTools', 'Read', '--add-dir', 'C:/x']))
    expect(c.args).not.toContain(prompt)
    expect(c.stdin).toBe(prompt)
    expect(c.shell).toBeFalsy()
  })

  it('nicht installiert → deutsche Meldung', async () => {
    const f = fake({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) })
    await expect(runClaude('p', { addDir: 'd', spawnFn: f.spawn, command: 'claude' })).rejects.toThrow(/nicht installiert/)
  })

  it('nicht angemeldet', async () => {
    const f = fake({ stdout: JSON.stringify({ is_error: true, result: 'Invalid API key · Please run /login' }), code: 1 })
    await expect(runClaude('p', { addDir: 'd', spawnFn: f.spawn, command: 'claude' })).rejects.toThrow(/nicht angemeldet/)
  })

  it('Limit erreicht', async () => {
    const f = fake({ stdout: JSON.stringify({ is_error: true, result: 'Claude AI usage limit reached|1700000000' }), code: 1 })
    await expect(runClaude('p', { addDir: 'd', spawnFn: f.spawn, command: 'claude' })).rejects.toThrow(/Limit/)
  })

  it('Timeout → Kind wird beendet, deutsche Meldung', async () => {
    const f = fake({ hang: true })
    await expect(runClaude('p', { addDir: 'd', timeoutMs: 30, spawnFn: f.spawn, command: 'claude' })).rejects.toThrow(/Zeit/)
    expect(f.calls[0]!.killed).toBe(true)
  })
})
