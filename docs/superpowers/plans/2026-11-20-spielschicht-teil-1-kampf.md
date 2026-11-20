# Spielschicht Teil 1: Kampf – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lernen läuft als Kampf gegen einen animierten Fantasy-Boss je Modul: richtige Antworten treffen (Combo, Krit, Glückstreffer), falsche lösen einen rein optischen Boss-Angriff aus, am Ende ist der Boss besiegt oder geflohen.

**Architecture:** Die Kampfregeln sind reine Funktionen (`app/src/game/battle.ts`), die Boss-Zuordnung ebenfalls (`app/src/game/bosses.ts`). `StudyScreen` wird zu `BattleScreen` umbenannt und bekommt oben eine Arena; Lernliste, `recordReview`, `Feedback` und `AskDialog` bleiben unverändert im Einsatz. Animationen sind Einzelbild-PNGs von PixelLab unter `app/public/game/`, abgespielt von einer kleinen `Sprite`-Komponente.

**Tech Stack:** React 18, TypeScript, Vite 7 + vite-plugin-pwa, Dexie, ts-fsrs, Vitest + Testing Library (jsdom), PixelLab-MCP (nur zur Bauzeit).

**Spec:** `docs/superpowers/specs/2026-11-20-spielschicht-stufe-1b-design.md` (Abschnitte 3, 6.5, 7, 9 Teil 1)

## Global Constraints

- 0 € laufende Kosten, keine bezahlte API; PixelLab wird nur beim Bauen benutzt, nie von der App zur Laufzeit.
- Grafiken liegen als Dateien unter `app/public/game/` und werden vom Service Worker vorab gespeichert (offline). Alle Grafiken von Teil 1 zusammen höchstens **4 MB**.
- Bedienoberfläche komplett auf Deutsch.
- **Keine Herzen/Lebenspunkte des Spielers, kein Verlust, kein Rauswurf.** Ein falsche Antwort ist nur optisch ein Boss-Angriff.
- **Kein Tempobonus.** Zeit spielt für Schaden keine Rolle.
- Animationen blockieren nie das Antworten: Rückmeldung und „Weiter“ erscheinen sofort, Animationen laufen nebenher.
- `prefers-reduced-motion: reduce` → keine Bewegung (Standbild, kein Wackeln), alle Werte und Texte bleiben gleich.
- Handy hochkant zuerst; am PC (quer, breit) muss es ebenfalls gut aussehen. Pixel-Art scharf skaliert (`image-rendering: pixelated`).
- Ein Boss je Modul, Fragen gemischt über die Themen des Moduls (bestehende `buildQueue` mit `moduleId`).
- **Stil-Freigabe:** Bevor Grafiken in die App kommen, sieht der Nutzer einen Stil-Entwurf und gibt ihn frei (Task 4 ist ein Haltepunkt).
- Tests: `npm.cmd test` im Ordner `app` (PowerShell; `npm.ps1` ist gesperrt) bzw. `npm test` in Git Bash. Build: `npm run build` in `app`.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Kein Push ohne Zustimmung des Nutzers.

## Review Focus

- „Weiter“ sofort nach der Antwort, während die Treffer-Animation noch läuft → die nächste Frage ist sofort bedienbar, kein alter Effekt bleibt auf dem neuen Zug hängen (Test in Task 6).
- Speichern der Antwort schlägt fehl → kein Schaden, keine Combo-Änderung; erst eine erfolgreich gespeicherte Antwort zählt (Test in Task 6).
- „Beenden“ mitten im Kampf → Ergebnis „Geflohen“ mit den bisherigen Zahlen, `onFinished` genau einmal (Test in Task 6).
- Modul-ID ohne passendes Modul in der Datenbank (gelöscht/noch nicht synchronisiert) oder ganz ohne Modul → Kampf startet mit dem ersten Boss und Modulname „Unbekanntes Gebiet“, kein Absturz (Tests in Task 2 und 6).
- Reduzierte Bewegung → Lebensbalken und Texte ändern sich wie sonst, aber keine Bewegung (Tests in Task 3 und 6).

---

### Task 1: Kampfregeln

**Files:**
- Create: `app/src/game/battle.ts`
- Test: `app/test/battle.test.ts`

**Interfaces:**
- Consumes: `Outcome` aus `app/src/srs/grading.ts`, `Rng` aus `app/src/ui/random.ts`
- Produces:
  ```ts
  export type Tier = 1 | 2 | 3
  export type Hit = { outcome: Outcome; damage: number; tier: Tier; crit: boolean; lucky: boolean; knockedOut: boolean }
  export type Battle = {
    total: number; answered: number; phase: number; hp: number; maxHp: number
    combo: number; bestCombo: number; finished: boolean; defeated: boolean; last: Hit | null
  }
  export const HP_PER_QUESTION = 10
  export function startBattle(total: number): Battle
  export function applyAnswer(b: Battle, a: { outcome: Outcome; elapsedDays: number | null }, rng: Rng): Battle
  export function endBattle(b: Battle): Battle
  export function hpPercent(b: Battle): number   // 0–100, gerundet
  ```

Regeln (aus Spec 6.5 und Gesamtdesign Abschnitt 9; die Zahlen sind Builder-Entscheidungen):
- Start: `hp = maxHp = total * 10`, `phase = 1`.
- **Richtig:** `combo += 1`; Stufe `tier` = 3 ab Combo 6, 2 ab Combo 3, sonst 1; Schaden = `10 + (tier 2: 3, tier 3: 6)`; **Krit** wenn `elapsedDays !== null && elapsedDays >= 7` → Schaden ×2; danach **Glückstreffer** wenn `rng() < 0.1` → +5. `rng` wird nur bei richtigen Antworten aufgerufen, genau einmal.
- **Teilweise:** Schaden 5, Combo bleibt unverändert, `tier` entspricht der aktuellen Combo.
- **Falsch:** Schaden 0, `combo = 0`, `tier = 1`.
- `bestCombo = max(bestCombo, combo)`; `answered += 1`; `hp = max(0, hp - damage)`.
- Fällt `hp` auf 0 (`knockedOut = true`): sind noch Fragen offen (`answered < total`), steht der Boss wieder auf: `phase += 1`, `hp = maxHp = (total - answered) * 10`. Ist es die letzte Frage, gilt `finished = true, defeated = true`.
- Letzte Frage beantwortet mit `hp > 0` → `finished = true, defeated = false` (geflohen).
- `endBattle` → `finished = true`, `defeated` bleibt, wie es war (also `false`, wenn er noch lebt).
- Nach `finished` ändert `applyAnswer` nichts mehr.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { applyAnswer, endBattle, hpPercent, startBattle } from '../src/game/battle'

const never = () => 0.99 // kein Glückstreffer
const R = { outcome: 'right' as const, elapsedDays: 1 }

describe('battle', () => {
  it('startet mit 10 Leben je Frage', () => {
    expect(startBattle(3)).toMatchObject({ hp: 30, maxHp: 30, phase: 1, combo: 0, finished: false })
  })
  it('richtig trifft mit 10, ab Combo 3 mit 13, ab Combo 6 mit 16', () => {
    let b = startBattle(20)
    const dmg: number[] = []
    for (let i = 0; i < 6; i++) { b = applyAnswer(b, R, never); dmg.push(b.last!.damage) }
    expect(dmg).toEqual([10, 10, 13, 13, 13, 16])
    expect(b.last!.tier).toBe(3)
    expect(b.bestCombo).toBe(6)
  })
  it('Krit bei Karte, die 7 Tage oder länger nicht gesehen wurde; neue Karte nie', () => {
    expect(applyAnswer(startBattle(5), { outcome: 'right', elapsedDays: 7 }, never).last).toMatchObject({ damage: 20, crit: true })
    expect(applyAnswer(startBattle(5), { outcome: 'right', elapsedDays: 6 }, never).last!.crit).toBe(false)
    expect(applyAnswer(startBattle(5), { outcome: 'right', elapsedDays: null }, never).last!.crit).toBe(false)
  })
  it('Glückstreffer +5 bei rng < 0.1', () => {
    expect(applyAnswer(startBattle(5), R, () => 0.05).last).toMatchObject({ damage: 15, lucky: true })
  })
  it('rng wird bei falsch und teilweise nicht benutzt', () => {
    const rng = vi.fn(() => 0)
    let b = applyAnswer(startBattle(5), { outcome: 'wrong', elapsedDays: 9 }, rng)
    b = applyAnswer(b, { outcome: 'partial', elapsedDays: 9 }, rng)
    expect(rng).not.toHaveBeenCalled()
  })
  it('teilweise: 5 Schaden, Combo bleibt; falsch: 0 Schaden, Combo weg', () => {
    let b = applyAnswer(applyAnswer(startBattle(9), R, never), R, never)
    b = applyAnswer(b, { outcome: 'partial', elapsedDays: 1 }, never)
    expect(b.last!.damage).toBe(5); expect(b.combo).toBe(2)
    b = applyAnswer(b, { outcome: 'wrong', elapsedDays: 1 }, never)
    expect(b.last!.damage).toBe(0); expect(b.combo).toBe(0)
  })
  it('besiegt, wenn die letzte Antwort ihn auf 0 bringt', () => {
    const b = applyAnswer(applyAnswer(startBattle(2), R, never), R, never)
    expect(b).toMatchObject({ hp: 0, finished: true, defeated: true })
  })
  it('k.o. vor der letzten Frage: nächste Phase mit 10 Leben je offener Frage', () => {
    let b = applyAnswer(startBattle(3), { outcome: 'right', elapsedDays: 30 }, never) // 20
    b = applyAnswer(b, R, never) // 10 → 0, eine Frage offen
    expect(b.last!.knockedOut).toBe(true)
    expect(b).toMatchObject({ phase: 2, hp: 10, maxHp: 10, finished: false })
    b = applyAnswer(b, { outcome: 'wrong', elapsedDays: 1 }, never)
    expect(b).toMatchObject({ finished: true, defeated: false })
    expect(hpPercent(b)).toBe(100)
  })
  it('Beenden: geflohen, danach keine Änderung mehr', () => {
    const b = endBattle(applyAnswer(startBattle(4), R, never))
    expect(b).toMatchObject({ finished: true, defeated: false })
    expect(hpPercent(b)).toBe(75)
    expect(applyAnswer(b, R, never)).toEqual(b)
  })
})
```
(`vi` aus `vitest` importieren.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- battle` (in `app`)
Expected: FAIL, Modul `../src/game/battle` nicht gefunden.

- [ ] **Step 3: Implement `app/src/game/battle.ts` nach den Regeln oben** (reine Funktionen, liefern immer ein neues Objekt).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- battle`
Expected: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/game/battle.ts app/test/battle.test.ts
git commit -m "feat(game): Kampfregeln (Combo, Krit, Glückstreffer, Phasen)"
```

---

### Task 2: Boss-Vorrat und Zuordnung zum Modul

**Files:**
- Create: `app/src/game/bosses.ts`
- Test: `app/test/bosses.test.ts`

**Interfaces:**
- Consumes: `Module` aus `@lernapp/shared`
- Produces:
  ```ts
  export type BossAnim = 'idle' | 'attack' | 'hit'
  export type BossDef = { id: string; title: string; frames: Record<BossAnim, number>; fps: number }
  export type FxName = 'hit' | 'combo2' | 'combo3' | 'crit' | 'claw'
  export const BOSSES: BossDef[]                     // erster Vorrat, 6 Einträge
  export const FX: Record<FxName, { frames: number; fps: number }>
  export const UNKNOWN_AREA = 'Unbekanntes Gebiet'
  export function gameAsset(path: string): string    // import.meta.env.BASE_URL + 'game/' + path
  export function bossFrames(boss: BossDef, anim: BossAnim): string[]   // game/bosses/<id>/<anim>_<i>.png, i ab 0
  export function fxFrames(name: FxName): string[]                       // game/fx/<name>_<i>.png
  export function bossBackdrop(boss: BossDef): string                    // game/bosses/<id>/backdrop.png
  export function assignBosses(modules: Pick<Module, 'id'>[]): Map<string, BossDef>
  export function bossFor(moduleId: string | undefined, modules: Pick<Module, 'id' | 'name'>[]): { boss: BossDef; name: string }
  ```

Entscheidungen:
- Erster Vorrat (IDs und Titel; Aussehen wird in Task 4 mit dem Nutzer abgestimmt): `moosgolem` „Moosgolem“, `sporenhexe` „Sporenhexe“, `kristallwaechter` „Kristallwächter“, `tiefseekraken` „Tiefseekraken“, `bronzetitan` „Bronzetitan“, `aschephoenix` „Aschephönix“. Bildzahlen vorerst `{ idle: 4, attack: 6, hit: 4 }`, `fps: 8`; Task 5 trägt die echten Zahlen ein. `FX` vorerst je `{ frames: 6, fps: 12 }`.
- `assignBosses`: Module nach `id` sortieren; jedes nimmt den Platz `hash(id) % BOSSES.length` (FNV-1a über die ID), ist er belegt, den nächsten freien (zyklisch); sind alle belegt, wieder von vorn. So bekommen bis zu 6 Module verschiedene Bosse, und die Zuordnung hängt nicht von der Reihenfolge in der Datenbank ab. (Teil 2 speichert die Wahl fest und macht sie in den Einstellungen änderbar.)
- `bossFor`: Name = `` `${boss.title} · ${modul.name}` ``. Unbekannte oder fehlende Modul-ID → `BOSSES[0]` und `` `${BOSSES[0].title} · Unbekanntes Gebiet` ``.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { BOSSES, assignBosses, bossFor, bossFrames, fxFrames } from '../src/game/bosses'

const mods = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `mod-${i}`, name: `Modul ${i}` }))

describe('bosses', () => {
  it('bis zu 6 Module bekommen verschiedene Bosse', () => {
    const m = assignBosses(mods(6))
    expect(new Set([...m.values()].map((b) => b.id)).size).toBe(6)
  })
  it('Zuordnung hängt nicht von der Reihenfolge ab', () => {
    const a = assignBosses(mods(4)); const b = assignBosses(mods(4).reverse())
    for (const id of a.keys()) expect(b.get(id)!.id).toBe(a.get(id)!.id)
  })
  it('mehr Module als Bosse: jedes Modul hat trotzdem einen', () => {
    expect(assignBosses(mods(9)).size).toBe(9)
  })
  it('Name aus Boss-Titel und Modulname', () => {
    const { boss, name } = bossFor('mod-1', mods(3))
    expect(name).toBe(`${boss.title} · Modul 1`)
  })
  it('unbekanntes oder fehlendes Modul: erster Boss, „Unbekanntes Gebiet“', () => {
    expect(bossFor('weg', mods(2))).toEqual({ boss: BOSSES[0], name: `${BOSSES[0]!.title} · Unbekanntes Gebiet` })
    expect(bossFor(undefined, []).boss).toBe(BOSSES[0])
  })
  it('Bildpfade', () => {
    const b = BOSSES[0]!
    expect(bossFrames(b, 'idle')[0]).toBe(`/game/bosses/${b.id}/idle_0.png`)
    expect(bossFrames(b, 'idle')).toHaveLength(b.frames.idle)
    expect(fxFrames('crit')[1]).toBe('/game/fx/crit_1.png')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- bosses`
Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implement `app/src/game/bosses.ts`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- bosses`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/game/bosses.ts app/test/bosses.test.ts
git commit -m "feat(game): Boss-Vorrat und feste Zuordnung je Modul"
```

---

### Task 3: Sprite-Komponente und reduzierte Bewegung

**Files:**
- Create: `app/src/ui/game/motion.ts`, `app/src/ui/game/Sprite.tsx`
- Test: `app/test/ui/sprite.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // motion.ts
  export function useReducedMotion(): boolean   // matchMedia('(prefers-reduced-motion: reduce)'), reagiert auf Änderungen; ohne matchMedia → false
  // Sprite.tsx
  export function Sprite(props: {
    frames: string[]; fps: number; loop?: boolean          // loop Standard true
    onDone?: () => void                                    // nur bei loop=false: nach dem letzten Bild
    className?: string; alt?: string                       // alt Standard '' (dekorativ)
  }): JSX.Element
  ```

Verhalten: rendert ein `<img>` mit dem aktuellen Bild, wechselt alle `1000/fps` ms. Alle Bilder werden beim Einhängen vorgeladen (`new Image().src`). Ändert sich `frames` (andere Animation), beginnt sie bei Bild 0. Bei reduzierter Bewegung: Standbild `frames[0]`, kein Timer; bei `loop=false` wird `onDone` sofort (im Effekt) aufgerufen. Klasse `sprite` am `<img>` (für `image-rendering: pixelated`).

- [ ] **Step 1: Write the failing tests** (jsdom, `vi.useFakeTimers()`; `matchMedia` per `vi.stubGlobal` stubben)

```tsx
it('spielt Bilder im Takt und wiederholt', () => {
  render(<Sprite frames={['a.png', 'b.png']} fps={10} />)
  const img = screen.getByRole('presentation') as HTMLImageElement  // alt='' → role presentation
  expect(img.getAttribute('src')).toBe('a.png')
  act(() => vi.advanceTimersByTime(100)); expect(img.getAttribute('src')).toBe('b.png')
  act(() => vi.advanceTimersByTime(100)); expect(img.getAttribute('src')).toBe('a.png')
})
it('einmalig: onDone nach dem letzten Bild, bleibt auf dem letzten Bild', () => {
  const onDone = vi.fn()
  render(<Sprite frames={['a', 'b', 'c']} fps={10} loop={false} onDone={onDone} />)
  act(() => vi.advanceTimersByTime(300))
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('presentation').getAttribute('src')).toBe('c')
})
it('reduzierte Bewegung: Standbild, onDone sofort', () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
  const onDone = vi.fn()
  render(<Sprite frames={['a', 'b']} fps={10} loop={false} onDone={onDone} />)
  act(() => vi.advanceTimersByTime(500))
  expect(screen.getByRole('presentation').getAttribute('src')).toBe('a')
  expect(onDone).toHaveBeenCalledTimes(1)
})
it('neue Bildfolge beginnt bei Bild 0', () => { /* rerender mit ['x','y'] nach einem Schritt → src 'x' */ })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- sprite`
Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implement `motion.ts` und `Sprite.tsx`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- sprite`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/game app/test/ui/sprite.test.tsx
git commit -m "feat(game): Sprite-Komponente mit reduzierter Bewegung"
```

---

### Task 4: Stil-Entwurf mit PixelLab – Haltepunkt für die Freigabe durch den Nutzer

**Files:**
- Create (Entwurf, außerhalb des Repos): `<scratchpad>/stil-entwurf/` mit den erzeugten PNGs und einer Vorschauseite `stil-entwurf.html`

Kein Produktcode. Ziel: Der Nutzer sieht, wie Bosse und Effekte aussehen werden, bevor der ganze Vorrat entsteht.

- [ ] **Step 1: Kontingent prüfen** – `mcp__pixellab__get_balance`; Stand notieren.
- [ ] **Step 2: Einen Boss erzeugen** – `moosgolem`: Fantasy-Boss (Moos-/Steingolem mit Gesicht, Rüstungsteilen, Persönlichkeit, keine reine Zelle/Pflanze), Blick zum Betrachter (Süd-Ansicht), transparenter Hintergrund, mindestens 96 px Bildgröße, natürliche, gedeckte Pixel-Art-Palette passend zum dunklen App-Thema (`--bg: #14121f`). Dazu die Animationen `idle` (atmet/schwebt), `attack` (stürzt nach vorn auf den Betrachter zu), `hit` (zuckt zurück). Werkzeugwahl dem Builder überlassen (z. B. `create_character` + `animate_character`).
- [ ] **Step 3: Hintergrund** – eine Arena-Kulisse für diesen Boss (Waldlichtung, hochkant-tauglich, Boss steht in der oberen Mitte frei), z. B. `create_image_pro`.
- [ ] **Step 4: Zwei Effekte** – `hit` (einfacher Treffer) und `combo3` (heftigster Combo-Treffer) mit `vfx_workbench`.
- [ ] **Step 5: Vorschauseite bauen und zeigen** – Seite mit Kulisse, animiertem Boss (alle drei Animationen nacheinander) und den Effekten darüber, in Handy-Hochkant-Größe; dem Nutzer per Visual Companion bzw. `SendUserFile` zeigen.
- [ ] **Step 6: HALT – auf die Freigabe warten.** Den Nutzer fragen: passt der Stil (Detailgrad, Farben, Fantasy-Anteil, Größe)? Änderungswünsche umsetzen und erneut zeigen, bis er zustimmt. Freigegebene Stichworte (Prompt-Stil, Palette, Größe) in `app/public/game/STIL.md` festhalten.
- [ ] **Step 7: Commit**

```bash
git add app/public/game/STIL.md
git commit -m "docs(game): freigegebener Grafikstil für Bosse und Effekte"
```

---

### Task 5: Boss-Vorrat, Effekte und Kulissen erzeugen und einbinden

**Files:**
- Create: `app/public/game/bosses/<id>/{idle,attack,hit}_<i>.png`, `app/public/game/bosses/<id>/backdrop.png` für alle 6 Bosse; `app/public/game/fx/{hit,combo2,combo3,crit,claw}_<i>.png`
- Modify: `app/src/game/bosses.ts` (echte `frames`/`fps` je Boss und Effekt)
- Test: `app/test/bosses.test.ts` (Dateien vorhanden)

**Interfaces:**
- Consumes: `BOSSES`, `FX`, `bossFrames`, `fxFrames`, `bossBackdrop` aus Task 2; Stil aus `app/public/game/STIL.md`
- Produces: vollständige Grafiken; jeder Pfad, den `bossFrames`/`fxFrames`/`bossBackdrop` liefert, existiert.

Effekte: `hit` einfacher Treffer, `combo2` stärker, `combo3` heftigster Treffer mit Aufblitzen, `crit` kritischer Treffer (deutlich anders als Combo, z. B. goldener Stern-Einschlag), `claw` Boss-Angriff auf den Betrachter (Kratzer/Schlag quer übers Bild).

- [ ] **Step 1: Write the failing test** – in `bosses.test.ts`:

```ts
import { existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const pub = join(__dirname, '../public')
const file = (url: string) => join(pub, url.replace(/^\//, ''))

it('alle Bilder des Vorrats liegen in public/game', () => {
  for (const b of BOSSES) {
    for (const anim of ['idle', 'attack', 'hit'] as const) for (const f of bossFrames(b, anim)) expect(existsSync(file(f)), f).toBe(true)
    expect(existsSync(file(bossBackdrop(b)))).toBe(true)
  }
  for (const n of Object.keys(FX) as (keyof typeof FX)[]) for (const f of fxFrames(n)) expect(existsSync(file(f)), f).toBe(true)
})
it('alle Grafiken zusammen höchstens 4 MB', () => {
  const size = (d: string): number => readdirSync(d, { withFileTypes: true })
    .reduce((s, e) => s + (e.isDirectory() ? size(join(d, e.name)) : statSync(join(d, e.name)).size), 0)
  expect(size(join(pub, 'game'))).toBeLessThanOrEqual(4 * 1024 * 1024)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bosses`
Expected: FAIL, erste fehlende Datei wird genannt.

- [ ] **Step 3: Restliche 5 Bosse, ihre Kulissen und die 5 Effekte im freigegebenen Stil erzeugen**, als Einzelbilder exportieren, nach dem Schema benennen und ablegen; `moosgolem` aus Task 4 übernehmen. Danach `frames`/`fps` in `bosses.ts` an die tatsächlichen Bildzahlen anpassen. Ist die Größe über 4 MB: Paletten reduzieren (`reduce_colors`) bzw. Bildgröße senken, nicht Bilder weglassen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bosses`
Expected: PASS.

- [ ] **Step 5: Kurz zeigen** – Übersichtsbild aller 6 Bosse an den Nutzer schicken (Information, kein Haltepunkt; Einwände in Task 7 berücksichtigen).

- [ ] **Step 6: Commit**

```bash
git add app/public/game app/src/game/bosses.ts app/test/bosses.test.ts
git commit -m "feat(game): Grafiken für 6 Bosse, Kulissen und Treffer-Effekte"
```

---

### Task 6: Kampfbildschirm (aus StudyScreen)

**Files:**
- Rename: `app/src/ui/StudyScreen.tsx` → `app/src/ui/BattleScreen.tsx` (`git mv`), Komponente `StudyScreen` → `BattleScreen`
- Create: `app/src/ui/game/Arena.tsx`
- Modify: `app/src/ui/theme.css` (Arena, Wackeln, Effekte, Layout)
- Rename + Modify: `app/test/ui/study.test.tsx` → `app/test/ui/battle.test.tsx`; `app/test/ui/fixes.test.tsx` (Import/Name)
- Modify: `app/src/App.tsx` (Import/Name)

**Interfaces:**
- Consumes: Task 1 (`startBattle`, `applyAnswer`, `endBattle`, `hpPercent`, `Battle`, `Hit`), Task 2 (`bossFor`, `bossFrames`, `fxFrames`, `bossBackdrop`), Task 3 (`Sprite`, `useReducedMotion`); bestehend: `recordReview`, `buildQueue`, `Feedback`, `renderAsk`
- Produces:
  ```ts
  export const UNIT_SIZE = 25
  export function BattleScreen(props: /* exakt die bisherigen StudyScreen-Props */): JSX.Element
  export function Arena(props: { boss: BossDef; name: string; battle: Battle; turn: number }): JSX.Element
  ```

Verhalten von `BattleScreen` (alles Bisherige bleibt: Laden, Fehlertexte, „Nichts zu lernen“, Speichern, Rückmeldung, Nachfragen, Beenden, ungültige Karten):
- Lädt zusätzlich `db.modules.toArray()` und bestimmt `bossFor(moduleId, modules)`.
- Nach dem Laden `startBattle(cards.length)`.
- In `answer`: im `recordReview`-Callback den vorherigen State merken; `elapsedDays = prev?.last_review ? floor((now − last_review) / 1 Tag) : null`. **Erst nach erfolgreichem Speichern** `applyAnswer(battle, { outcome, elapsedDays }, rng)` und `turn += 1`. Schlägt das Speichern fehl, bleibt der Kampf unverändert.
- „Beenden“ → `endBattle`. Kampf beendet (`battle.finished`) oder alle Karten durch → Ergebnis (ersetzt „Geschafft“).
- Ergebnis: Überschrift **„Besiegt!“** bzw. **„Geflohen“** mit Satz `Er flieht mit ${hpPercent} % Leben.`; darunter bleibt die bisherige Zeile `x richtig, y teilweise, z falsch`, dazu `Höchste Combo: n`, der bisherige Pausen-Satz und der Knopf „Zur Übersicht“. `onFinished` genau einmal wie bisher.

Verhalten von `Arena` (oberhalb der Frage; `turn` ändert sich bei jeder gewerteten Antwort und dient als `key` für einmalige Effekte):
- Kulisse `bossBackdrop`, darauf der Boss als `Sprite` in `idle` (Schleife). Nach einem Treffer einmal `hit`, nach falscher Antwort einmal `attack`, danach zurück zu `idle`.
- Überschrift mit dem Namen (`h2`), Lebensbalken `<div role="progressbar" aria-label="Leben des Bosses" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hpPercent}>`; ab Phase 2 daneben `Phase n`.
- Richtig/teilweise: Effekt-`Sprite` (`hit`, bei Stufe 2 `combo2`, bei Stufe 3 `combo3`, bei Krit zusätzlich `crit`) über dem Boss und schwebende Zahl `-<Schaden>` (verschwindet per CSS-Animation). Texte: ab Combo 3 `Combo ×n`, bei Krit `Kritisch!`, bei Glückstreffer `Glückstreffer!`, bei k.o. vor Kampfende `Er steht wieder auf! Phase n`.
- Falsch: `claw`-Effekt, Arena bekommt die Klasse `boss-attacks` (Wackeln + roter Innenrand, ca. 600 ms). Kein Text über verlorene Leben – es gibt keine.
- Reduzierte Bewegung: keine Wackel-/Schwebe-Animation (CSS `@media (prefers-reduced-motion: reduce)`), Sprites als Standbild; Texte und Balken unverändert.
- Nichts davon fängt Klicks ab (`pointer-events: none` auf Effekten); Rückmeldung und „Weiter“ stehen sofort bereit.

Layout (`theme.css`): Hochkant: Arena oben, Höhe `min(42vh, 360px)`, Frage darunter scrollbar. Breit/quer (`@media (min-width: 900px) and (orientation: landscape)`): zwei Spalten, Arena links, Frage rechts. Alle Grafiken `image-rendering: pixelated`, Boss mittig, maßstabsgetreu ganzzahlig skaliert wo möglich.

- [ ] **Step 1: Umbenennen ohne Verhaltensänderung** – `git mv` beider Dateien, Komponente und Imports (`App.tsx`, `fixes.test.tsx`, `battle.test.tsx`, `describe('BattleScreen')`) umbenennen.

- [ ] **Step 2: Run all tests** – `npm test` → Expected: PASS (unverändert grün).

- [ ] **Step 3: Write the failing tests** in `battle.test.tsx` (Fixtures wie bisher; `db.modules.put({ id: 'm1', name: 'Botanik', examDate: null, styleProfile: null, updatedAt: NOW.toISOString() })` im jeweiligen Test):

```tsx
const bar = () => screen.getByRole('progressbar', { name: 'Leben des Bosses' })

it('zeigt Boss mit Modulnamen und vollem Leben', async () => {
  // 2 choiceCards in m1, Modul Botanik
  render(<BattleScreen moduleId="m1" now={() => NOW} rng={seededRng(1)} onExit={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: /· Botanik$/ })).toBeInTheDocument()
  expect(bar()).toHaveAttribute('aria-valuenow', '100')
})
it('richtige Antwort senkt das Leben, falsche lässt den Boss angreifen', async () => {
  // 4 Karten, rng () => 0.99 → kein Glückstreffer
  await userEvent.click(await screen.findByRole('button', { name: /Richtig B/ }))
  expect(bar()).toHaveAttribute('aria-valuenow', '75')
  await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await userEvent.click(await screen.findByRole('button', { name: /Falsch A/ }))
  expect(bar()).toHaveAttribute('aria-valuenow', '75')
  expect(container.querySelector('.arena')).toHaveClass('boss-attacks')
})
it('Combo ab 3 richtigen Antworten', async () => { /* 5 Karten, 3× richtig → Text „Combo ×3“ */ })
it('Krit bei lange nicht gesehener Karte', async () => {
  // Karte mit State, last_review 10 Tage vor NOW und fällig → nach richtiger Antwort „Kritisch!“
})
it('alle Fragen richtig: „Besiegt!“ mit Zahlen und Pausenhinweis', async () => { /* 2 Karten */ })
it('Beenden mitten im Kampf: „Geflohen“, onFinished einmal', async () => {
  // 3 Karten, 1× richtig, Beenden → „Geflohen“, „Er flieht mit 67 % Leben.“, „1 richtig, 0 teilweise, 0 falsch“
})
it('Speichern schlägt fehl: kein Schaden', async () => {
  // vi.spyOn(db.states, 'put').mockRejectedValueOnce(new Error('voll')) → Alert sichtbar, bar 100
})
it('Weiter sofort nach Treffer: nächste Frage bedienbar, kein alter Effekt', async () => {
  // richtig → sofort Weiter → nächste Frage hat Antwortknöpfe; `.fx-damage` nicht mehr im Dokument
})
it('Modul fehlt in der Datenbank: Kampf startet mit „Unbekanntes Gebiet“', async () => {
  // Karten in m1, aber db.modules leer → Überschrift endet auf „· Unbekanntes Gebiet“
})
it('reduzierte Bewegung: Leben sinkt trotzdem', async () => {
  // matchMedia-Stub (reduce) → nach richtiger Antwort bar < 100
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- battle`
Expected: die neuen Tests FAIL (kein Fortschrittsbalken/keine Überschrift), die übernommenen bestehen.

- [ ] **Step 5: Implement `Arena.tsx`, Kampfzustand in `BattleScreen.tsx`, CSS**

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS (alle, auch `fixes.test.tsx`, `app.test.tsx`).

- [ ] **Step 7: Commit**

```bash
git add -A app/src app/test
git commit -m "feat(game): Kampfbildschirm mit Boss, Treffern, Combo und Ergebnis"
```

---

### Task 7: Startseite auf Kämpfe umstellen, Build und Prüfung im Browser

**Files:**
- Modify: `app/src/session/stats.ts`, `app/src/ui/HomeScreen.tsx`
- Test: `app/test/ui/home.test.tsx`, `app/test/queue.test.ts` (oder eigene Datei `app/test/stats.test.ts`)

**Interfaces:**
- Consumes: `buildQueue`, `todayCounts`-Eingaben, `bossFor`/`assignBosses` aus Task 2
- Produces:
  ```ts
  // stats.ts – Modul mit der längsten heutigen Lernliste; Gleichstand → alphabetisch nach Name; keins → undefined
  export function nextBattleModule(input: { cards: Card[]; states: Map<string, SrsState>; newDoneToday: number; now: Date; settings: Settings; modules: Module[] }): Module | undefined
  ```

Verhalten der Startseite (Teil 2 ersetzt sie später durch Lagerfeuer und Karte): Der große Knopf heißt `Kämpfen: <Modulname>` und startet den Kampf gegen den Boss dieses Moduls (`onStudy(module.id)`); ist nichts zu tun, steht dort `Kämpfen` und der Knopf ist deaktiviert. In der Modulliste steht unter jedem Modulnamen der Bossname (`bossFor`). Alles andere bleibt.

- [ ] **Step 1: Write the failing tests**

```ts
it('nextBattleModule: längste Lernliste gewinnt, Gleichstand alphabetisch', () => {
  // m1 „Zoologie“ 2 neue Karten, m2 „Botanik“ 2 neue, m3 „Chemie“ 1 → Botanik
})
it('nextBattleModule: nichts zu tun → undefined', () => { /* alle Karten mit State, nicht fällig */ })
```
In `home.test.tsx`:
```tsx
it('großer Knopf startet den Kampf im Modul mit der meisten Arbeit', async () => {
  // onStudy wird mit 'm2' aufgerufen; Knopf heißt „Kämpfen: Botanik“
})
it('zeigt den Boss je Modul', async () => { /* Text „· Botanik“ in der Modulliste */ })
```
Bestehende Home-Tests, die den Knopf „Lernen“ suchen, auf `/^Kämpfen/` umstellen.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- home stats`
Expected: FAIL.

- [ ] **Step 3: Implement `nextBattleModule` und die Änderungen in `HomeScreen.tsx`**

- [ ] **Step 4: Run all tests and build**

Run: `npm test` und `npm run build` (in `app`)
Expected: alle Tests PASS; Build ohne Fehler; in der Build-Ausgabe von vite-plugin-pwa erscheinen die `game/`-PNGs im Precache (Zahl der Einträge deutlich höher als vorher).

- [ ] **Step 5: Commit**

```bash
git add app/src app/test
git commit -m "feat(game): Startseite startet Kämpfe je Modul"
```

- [ ] **Step 6: Nutzer fragen, ob gepusht (= live geschaltet) werden soll.** Erst nach seinem Ja `git push` (die lokale Vorschau kann sich nicht anmelden, weil ihre Sandbox kein Netz hat; geprüft wird deshalb live).

- [ ] **Step 7: Live prüfen** – nach dem Deploy die Live-Seite im eingebauten Browser öffnen (der Nutzer ist dort angemeldet; ggf. Service Worker mit `reg.update()` + Neuladen auf die neue Version bringen). Hochkant (`resize_window` mobile) und breit (desktop): je ein Screenshot vom Kampf im Ruhezustand, nach einem Treffer, nach einer falschen Antwort und vom Ergebnis; Konsole ohne Fehler. Dabei nur so viele Fragen beantworten wie nötig – jede Antwort zählt echt für FSRS. Danach den Nutzer bitten, es auf dem Handy auszuprobieren.
