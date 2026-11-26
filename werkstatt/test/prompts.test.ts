import { describe, it, expect } from 'vitest'
import type { Card } from '@lernapp/shared'
import { scriptPrompt, examPrompt, askPrompt, typedPrompt } from '../src/prompts'

const chunk = { path: 'C:/w/tmp/skript-16-30.pdf', firstPage: 16, lastPage: 30 }

describe('Prompts', () => {
  it('scriptPrompt enthält Pfad, Offset, Schema, Regeln, Themen und Stilprofil', () => {
    const p = scriptPrompt(chunk, { moduleName: 'Botanik', existingTopics: ['Moose'], styleProfile: 'Kurze MC-Fragen', fileName: 'skript.pdf' })
    expect(p).toContain('C:/w/tmp/skript-16-30.pdf')
    expect(p).toMatch(/Offset/)
    expect(p).toContain('+ 15')
    expect(p).toMatch(/JSON/)
    expect(p).toContain('"cards"')
    expect(p).toContain('{{1}}')
    expect(p).toContain('Moose')
    expect(p).toContain('Kurze MC-Fragen')
    expect(p).toContain('skript.pdf')
    expect(p).toMatch(/Inhaltsverzeichnis/)
    expect(p).not.toMatch(/styleProfile.*examTopics/s)
  })

  it('examPrompt verlangt styleProfile und examTopics, fromExam true', () => {
    const p = examPrompt(chunk, { moduleName: 'Botanik', existingTopics: [], fileName: 'klausur.pdf' })
    expect(p).toContain('styleProfile')
    expect(p).toContain('examTopics')
    expect(p).toMatch(/fromExam.{0,20}true/)
  })

  it('askPrompt enthält Frage, Antwort und Verlauf', () => {
    const card: Card = {
      id: '1', moduleId: 'm', topicId: 't', type: 'free',
      payload: { question: 'Was ist Xylem?', modelAnswer: 'Wasserleitung', keyPoints: ['k'] },
      explanation: '', source: null, examRelevant: false, fromExam: false, difficulty: 1,
      createdAt: '', updatedAt: '', deleted: false,
    }
    const p = askPrompt(card, 'keine Ahnung', [{ role: 'user', text: 'Hilf mir' }])
    expect(p).toContain('Was ist Xylem?')
    expect(p).toContain('keine Ahnung')
    expect(p).toContain('Hilf mir')
  })
})

describe('typedPrompt', () => {
  it('enthält jede ID, jede Frage und das Feld "typed"', () => {
    const p = typedPrompt([
      { id: 'id-1', question: 'Wo entsteht ATP?', answer: 'Mitochondrien', why: 'Zellatmung.' },
      { id: 'id-2', question: 'Warum ist der Himmel blau?', answer: 'Streuung', why: 'Rayleigh.' },
    ])
    for (const s of ['id-1', 'id-2', 'Wo entsteht ATP?', 'Warum ist der Himmel blau?', '"typed"', '"items"']) expect(p).toContain(s)
  })
})
