import { describe, it, expect } from 'vitest'
import { CardDraftSchema, GenerationResultSchema } from '../src/card'

const base = {
  topic: 'Zellbiologie',
  explanation: 'Erklärung',
  source: { file: 'skript.pdf', page: 3, quote: 'Zitat' },
  examRelevant: true,
  fromExam: false,
  difficulty: 2,
}

const validChoice = {
  ...base,
  type: 'choice',
  payload: {
    question: 'Was ist die Hauptfunktion der Mitochondrien?',
    options: [
      { text: 'Energie', correct: true, why: 'ATP-Synthese' },
      { text: 'Proteine', correct: false, why: 'Das machen Ribosomen' },
      { text: 'Lipide', correct: false, why: 'Das macht das ER' },
      { text: 'Verdauung', correct: false, why: 'Das machen Lysosomen' },
    ],
  },
}

const withOptions = (options: unknown) => ({ ...validChoice, payload: { ...validChoice.payload, options } })

describe('CardDraftSchema', () => {
  it('akzeptiert gültige Auswahlfrage', () => {
    expect(CardDraftSchema.safeParse(validChoice).success).toBe(true)
  })

  it('lehnt Auswahl mit 2 richtigen Optionen ab', () => {
    const opts = validChoice.payload.options.map((o, i) => (i < 2 ? { ...o, correct: true } : o))
    expect(CardDraftSchema.safeParse(withOptions(opts)).success).toBe(false)
  })

  it('lehnt Auswahl ohne richtige Option ab', () => {
    const opts = validChoice.payload.options.map((o) => ({ ...o, correct: false }))
    expect(CardDraftSchema.safeParse(withOptions(opts)).success).toBe(false)
  })

  it('lehnt Auswahl mit nicht genau 4 Optionen ab', () => {
    expect(CardDraftSchema.safeParse(withOptions(validChoice.payload.options.slice(0, 3))).success).toBe(false)
  })

  it('lehnt Auswahl ohne why bei falscher Option ab', () => {
    const opts = validChoice.payload.options.map((o, i) => (i === 1 ? { text: o.text, correct: o.correct } : o))
    expect(CardDraftSchema.safeParse(withOptions(opts)).success).toBe(false)
  })

  it('lehnt Auswahl mit leerem why ab', () => {
    const opts = validChoice.payload.options.map((o, i) => (i === 1 ? { ...o, why: '' } : o))
    expect(CardDraftSchema.safeParse(withOptions(opts)).success).toBe(false)
  })

  it('akzeptiert gültigen Lückentext', () => {
    const r = CardDraftSchema.safeParse({
      ...base,
      type: 'cloze',
      payload: { text: 'Die {{1}} erzeugt {{2}}.', gaps: [{ answers: ['Zelle'] }, { answers: ['ATP', 'Energie'] }] },
    })
    expect(r.success).toBe(true)
  })

  it('lehnt Lückentext ab, wenn Platzhalteranzahl != gaps.length', () => {
    const r = CardDraftSchema.safeParse({
      ...base,
      type: 'cloze',
      payload: { text: 'Die {{1}} erzeugt {{2}}.', gaps: [{ answers: ['Zelle'] }] },
    })
    expect(r.success).toBe(false)
  })

  it('lehnt Lückentext mit Platzhaltern außerhalb 1..n ab', () => {
    const r = CardDraftSchema.safeParse({
      ...base,
      type: 'cloze',
      payload: { text: 'Die {{1}} erzeugt {{3}}.', gaps: [{ answers: ['a'] }, { answers: ['b'] }] },
    })
    expect(r.success).toBe(false)
  })

  it('akzeptiert Zuordnung mit 3 Paaren, lehnt 2 und 7 ab', () => {
    const pairs = (n: number) => Array.from({ length: n }, (_, i) => ({ left: `l${i}`, right: `r${i}` }))
    const mk = (n: number) => CardDraftSchema.safeParse({ ...base, type: 'matching', payload: { prompt: 'Ordne zu', pairs: pairs(n) } })
    expect(mk(3).success).toBe(true)
    expect(mk(2).success).toBe(false)
    expect(mk(7).success).toBe(false)
  })

  it('akzeptiert Reihenfolge mit 3 Schritten', () => {
    const r = CardDraftSchema.safeParse({ ...base, type: 'order', payload: { prompt: 'Ordne', steps: ['a', 'b', 'c'] } })
    expect(r.success).toBe(true)
  })

  it('lehnt Reihenfolge mit 2 Schritten ab', () => {
    const r = CardDraftSchema.safeParse({ ...base, type: 'order', payload: { prompt: 'Ordne', steps: ['a', 'b'] } })
    expect(r.success).toBe(false)
  })

  it('lehnt Reihenfolge mit 9 Schritten ab', () => {
    const steps = Array.from({ length: 9 }, (_, i) => `s${i}`)
    expect(CardDraftSchema.safeParse({ ...base, type: 'order', payload: { prompt: 'Ordne', steps } }).success).toBe(false)
  })

  it('akzeptiert freie Frage und source null', () => {
    const r = CardDraftSchema.safeParse({
      ...base,
      source: null,
      type: 'free',
      payload: { question: 'Erkläre X', modelAnswer: 'X ist …', keyPoints: ['a', 'b'] },
    })
    expect(r.success).toBe(true)
  })

  it('lehnt Payload ab, die nicht zum Typ passt', () => {
    expect(CardDraftSchema.safeParse({ ...validChoice, type: 'order' }).success).toBe(false)
  })

  it('lehnt ungültige Schwierigkeit ab', () => {
    expect(CardDraftSchema.safeParse({ ...validChoice, difficulty: 4 }).success).toBe(false)
  })
})

describe('GenerationResultSchema', () => {
  it('akzeptiert Karten mit optionalem styleProfile und examTopics', () => {
    const r = GenerationResultSchema.safeParse({ cards: [validChoice], styleProfile: 'kurz', examTopics: ['Zelle'] })
    expect(r.success).toBe(true)
  })

  it('akzeptiert Ergebnis ohne optionale Felder', () => {
    expect(GenerationResultSchema.safeParse({ cards: [validChoice] }).success).toBe(true)
  })

  it('lehnt Ergebnis mit ungültiger Karte ab', () => {
    expect(GenerationResultSchema.safeParse({ cards: [{ ...validChoice, difficulty: 9 }] }).success).toBe(false)
  })
})
