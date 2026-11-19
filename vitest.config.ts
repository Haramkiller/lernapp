import { defineConfig } from 'vitest/config'

// Tolerates packages that do not exist yet (app, werkstatt): globs simply match nothing.
export default defineConfig({
  test: {
    include: ['{shared,app,werkstatt}/test/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
})
