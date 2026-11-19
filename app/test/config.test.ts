import { describe, expect, it } from 'vitest'
import { resolveSupabaseConfig } from '../src/data/config'

const env = { url: 'https://env.supabase.co', key: 'env-key' }
const override = { url: 'https://own.supabase.co', key: 'own-key' }

describe('resolveSupabaseConfig', () => {
  it('Override schlägt Env', () => {
    expect(resolveSupabaseConfig(env, override)).toEqual(override)
  })
  it('halbes Override wird ignoriert', () => {
    expect(resolveSupabaseConfig(env, { url: 'https://own.supabase.co', key: '' })).toEqual(env)
    expect(resolveSupabaseConfig(env, { url: '', key: 'own-key' })).toEqual(env)
  })
  it('ohne Env und Override: null', () => {
    expect(resolveSupabaseConfig({}, null)).toBeNull()
    expect(resolveSupabaseConfig({ url: 'x' }, null)).toBeNull()
  })
  it('nur Override ohne Env funktioniert', () => {
    expect(resolveSupabaseConfig({}, override)).toEqual(override)
  })
})
