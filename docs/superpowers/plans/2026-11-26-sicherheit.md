# Sicherheit einschätzen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vor dem Aufdecken „Sicher“/„Unsicher“ wählen; „richtig + unsicher“ wird FSRS „Schwer“, die Einschätzung landet in `review_logs` und erscheint als Treffsicherheit nach dem Kampf und je Modul.

**Architecture:** Neue Komponente `ConfidenceBar` ersetzt „Prüfen“ in fünf Fragetypen; `onAnswer` bekommt einen dritten Parameter `confidence`. `toRating(outcome, confidence)` entscheidet die Bewertung; der Log trägt `confidence` und `outcome`. Logs mit Einschätzung liegen zusätzlich in einer lokalen Dexie-Tabelle `logs` und werden aus Supabase (neue Spalte `synced_at`) zurückgeholt, damit die Treffsicherheit geräteübergreifend stimmt.

**Tech Stack:** React 18, Dexie, ts-fsrs, Supabase (PostgREST), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-sicherheit-design.md`

## Global Constraints

- Knöpfe: links „Unsicher“, rechts „Sicher“, gleich groß, gleiche Sperre wie bisher „Prüfen“.
- Freie Antwort („Erkläre“) unverändert, `confidence: null`.
- Bewertung: falsch → Again; teilweise → Hard; richtig + sicher → Good; richtig + unsicher → **Hard**; ohne Einschätzung (null) wie heute.
- `Outcome` (richtig/teilweise/falsch) bleibt wie heute: Combo, Beute, Zähler hängen daran. Schaden/„sitzt sicher“ folgen dem gespeicherten State (A1, kein geschönter Rechenweg).
- `review_logs`: nullbare Spalten `confidence` (`'sure'|'unsure'`), `outcome` (`'right'|'partial'|'wrong'`), dazu `synced_at` (Server-Zeit) zum Zurückholen. Alte Einträge/alte App-Versionen bleiben gültig.
- Ein Log ohne Einschätzung schickt die neuen Felder **nicht** mit (alte Pfade funktionieren auch ohne Schema-Änderung).
- Treffsicherheit: „Teilweise“ zählt nicht als richtig. Modulanzeige über die letzten 30 Tage, erst ab 10 sicheren Antworten.
- Live-Reihenfolge: erst SQL in Supabase, dann App.

## Review Focus

1. **Supabase-Spalten fehlen noch** (SQL nicht gelaufen): Logs-Pull darf den Sync nicht abbrechen (wie `game`), Logs ohne Einschätzung gehen weiter durch. Test in Task 4.
2. **Doppelte Logs** (eigener Log lokal gespeichert und später wieder gepullt): Treffsicherheit zählt jede Antwort einmal (Schlüssel `id`). Test in Task 4.
3. **Eintippen, nicht erkannt:** die vor dem Prüfen gewählte Einschätzung gilt für „Doch richtig“/„Weiter“; „Weiß nicht“ = unsicher, falsch. Test in Task 2.
4. **Enter in Lückentext/Eintippen** schickt nicht ab (kein versehentliches Antworten ohne Einschätzung). Test in Task 2.
5. **Logs zu gelöschten oder unbekannten Karten** (Karte gelöscht, noch nicht gesynct): Modulberechnung ignoriert sie, kein Absturz. Test in Task 5.

---

### Task 1: Bewertung und Log-Format

**Files:**
- Modify: `app/src/srs/grading.ts`, `app/src/srs/scheduler.ts` (`ReviewLog`), `shared/src/rows.ts` (`LogInput`, `LogRow`, `logToRow`)
- Test: `app/test/grading.test.ts` (neu oder vorhanden), `shared/test/rows.test.ts`

**Interfaces:**
- Produces:
  - `export type Confidence = 'sure' | 'unsure'` in `app/src/srs/grading.ts`
  - `toRating(outcome: Outcome, confidence?: Confidence | null): Grade`
  - `ReviewLog` und `LogInput` bekommen optionale Felder `confidence?: 'sure' | 'unsure'`, `outcome?: 'right' | 'partial' | 'wrong'`
  - `LogRow` bekommt optionale `confidence?`, `outcome?`; `logToRow` setzt sie nur, wenn im Input vorhanden.

- [ ] **Step 1: Failing tests**
  - `toRating('right','unsure') === Rating.Hard`; `toRating('right','sure') === Rating.Good`; `toRating('right') === Rating.Good`; `toRating('wrong','sure') === Rating.Again`; `toRating('partial','sure') === Rating.Hard`.
  - `logToRow({ …basis })` hat **keine** Schlüssel `confidence`/`outcome` (`expect('confidence' in row).toBe(false)`); mit `confidence: 'unsure', outcome: 'right'` → `row.confidence === 'unsure'`, `row.outcome === 'right'`.
- [ ] **Step 2: Run** `npx.cmd vitest run app/test/grading.test.ts shared/test/rows.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS; `npx.cmd tsc -p app --noEmit`, `-p shared` ohne Ausgabe.
- [ ] **Step 5: Commit** `feat: Bewertung und Log kennen die Einschätzung`

---

### Task 2: Knöpfe „Unsicher“/„Sicher“ in den Fragen

**Files:**
- Create: `app/src/ui/questions/ConfidenceBar.tsx`
- Modify: `app/src/ui/types.ts` (`QuestionProps.onAnswer`), `Choice.tsx`, `Typed.tsx`, `Cloze.tsx`, `Matching.tsx`, `Order.tsx`, `Free.tsx` (nur Signatur: übergibt `null`), `app/src/ui/theme.css`
- Test: `app/test/ui/confidence.test.tsx`; bestehende Frage-Tests (`questions.test.tsx`, `typed.test.tsx`, Hilfsfunktion `pick` in `fixtures.ts`) anpassen

**Interfaces:**
- Consumes: `Confidence` (Task 1)
- Produces:
  - `onAnswer: (outcome: Outcome, answer: Answer, confidence: Confidence | null) => void`
  - `ConfidenceBar({ disabled?: boolean; onPick: (c: Confidence) => void })` — rendert in `.answer-bar` zwei `button.cta` „Unsicher“ (links) und „Sicher“ (rechts, `primary`).
  - `pick(option)` in `fixtures.ts` klickt Option, dann „Sicher“ (bestehende Tests bleiben inhaltlich gleich).

Verhalten:
- Choice/Matching/Order: `ConfidenceBar` statt `AnswerBar`, gleiche `disabled`-Regel.
- Cloze: Formular-`onSubmit` macht nur `preventDefault` (Enter schickt nicht ab); `ConfidenceBar` ruft die Prüfung mit der Einschätzung.
- Typed: vor dem Prüfen `ConfidenceBar` (deaktiviert bei leerem Feld) plus kleiner Knopf „Weiß nicht“ (Klasse `link`/klein, oberhalb der Leiste); Enter schickt nicht ab. Treffer → `onAnswer('right', …, c)`. Kein Treffer → Lösung wie bisher, „Doch richtig“/„Weiter“ übergeben dasselbe `c`. „Weiß nicht“ → `onAnswer('wrong', {kind:'typed', text:'', …}, 'unsure')`.

- [ ] **Step 1: Failing tests** (`confidence.test.tsx`)
  - Choice: Option wählen, „Unsicher“ → `onAnswer` mit `('right', {kind:'choice', index:1}, 'unsure')`; vor der Wahl sind beide Knöpfe deaktiviert.
  - Cloze: Eingabe + Enter → `onAnswer` nicht aufgerufen; „Sicher“ → dritter Parameter `'sure'`.
  - Typed: „Ribosomen“ + „Sicher“ → nicht erkannt, `onAnswer` nicht aufgerufen; „Doch richtig“ → `('right', {…overridden:true}, 'sure')`. „Weiß nicht“ → dritter Parameter `'unsure'`, outcome `'wrong'`. Enter im Feld → kein Aufruf.
  - Order und Matching: „Unsicher“ übergibt `'unsure'`.
  - Free: „Gewusst“ → dritter Parameter `null`.
- [ ] **Step 2: Run** `npx.cmd vitest run app/test/ui/confidence.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**; bestehende Tests, die „Prüfen“ klicken oder Enter nutzen, auf „Sicher“ umstellen (Inhalt der Erwartungen unverändert lassen).
- [ ] **Step 4: Run** `npx.cmd vitest run app/test/ui` — Expected: PASS; tsc app ohne Ausgabe.
- [ ] **Step 5: Commit** `feat(ui): Sicher und Unsicher statt Prüfen`

---

### Task 3: Kampf speichert Einschätzung, Rückmeldung und Ergebnis

**Files:**
- Modify: `app/src/ui/BattleScreen.tsx` (`answer`, `result`, Zähler, Ergebnis), `app/src/ui/Feedback.tsx`
- Test: `app/test/ui/confidenceBattle.test.tsx`, `app/test/ui/feedback.test.tsx`

**Interfaces:**
- Consumes: `toRating(outcome, confidence)`, `Confidence` (Task 1), neue `onAnswer`-Signatur (Task 2)
- Produces:
  - `FeedbackProps.confidence?: Confidence | null`
  - Log-Eintrag in der Outbox enthält `confidence` und `outcome`, wenn `confidence !== null`.

Verhalten:
- `answer(outcome, detail, confidence)`: `review(..., toRating(outcome, confidence), ...)`; Log = `{ ...log, ...(confidence ? { confidence, outcome } : {}) }` (in der `recordReview`-Compute-Funktion). Der Rest (applyAnswer, Beute, Forschung) unverändert.
- Zähler zusätzlich: `sure: { right, total }`, `unsure: { right, total }` (nur `right` zählt als richtig).
- Ergebnis-Bildschirm: „Sicher: X von Y richtig“ und „Unsicher: X von Y richtig“, jeweils nur bei Y > 0.
- Feedback: `confidence==='sure' && outcome==='wrong'` → `<p className="surprise">` „Du warst dir sicher – genau diese Stelle merken.“; `sure && partial` → „Du warst dir sicher, aber es fehlt noch etwas.“; `unsure && right` → `<p className="muted">` „Richtig, aber unsicher – kommt etwas früher wieder.“

- [ ] **Step 1: Failing tests**
  - Kampf mit einer Auswahlkarte: richtig + „Unsicher“ → Outbox-Log hat `rating: 2`, `confidence: 'unsure'`, `outcome: 'right'`; Hinweis „Richtig, aber unsicher“ sichtbar.
  - richtig + „Sicher“ → `rating: 3`, `confidence: 'sure'`.
  - Freie Karte „Gewusst“ → Log ohne Schlüssel `confidence`.
  - Ergebnis nach zwei Karten (sicher richtig, sicher falsch) → Text „Sicher: 1 von 2 richtig“, keine „Unsicher“-Zeile.
  - Feedback-Test: `confidence="sure"`, outcome wrong → „Du warst dir sicher“.
- [ ] **Step 2: Run** `npx.cmd vitest run app/test/ui/confidenceBattle.test.tsx app/test/ui/feedback.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** dieselben + `battle.test.tsx`, `typedBattle.test.tsx`, `findsBattle.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(battle): Einschätzung speichern, Hinweise und Treffsicherheit im Ergebnis`

---

### Task 4: Logs lokal halten und aus Supabase zurückholen

**Files:**
- Modify: `app/src/data/db.ts` (Version 4: `logs: 'id, cardId, reviewedAt'`), `app/src/data/sync.ts` (`recordReview` legt Log mit Einschätzung auch in `db.logs`; Pull übernimmt Logs), `app/src/data/remote.ts` (Logs-Pull), `supabase/schema.sql`
- Test: `app/test/sync.test.ts` (oder vorhandene Sync-Tests), `app/test/remote.test.ts` falls vorhanden

**Interfaces:**
- Consumes: `LogEntry` mit `confidence`/`outcome` (Task 1/3)
- Produces:
  - `db.logs: Table<LogEntry, string>` (nur Einträge mit `confidence`)
  - `SyncTable` um `'logs'` erweitert; `Pulled.logs: LogEntry[]`, `Pulled.logsError?: string`
  - `rowToLog(r: LogRow & { synced_at: string }): LogEntry` in `shared/src/rows.ts`

Verhalten:
- Pull: `fetchAll('review_logs', 'id', since.logs)` mit zusätzlichem Filter `confidence is not null` (fetchAll bekommt einen optionalen Filter-Parameter). Fehler (z. B. Spalte fehlt) → `logs: []`, `logsError`, Sync läuft weiter (wie `game`).
- Übernahme: `db.logs.bulkPut` (Schlüssel `id`, idempotent); Cursor `lastPull:logs` wie die anderen.
- `supabase/schema.sql` ergänzen (idempotent):
  ```sql
  alter table public.review_logs
    add column if not exists confidence text check (confidence in ('sure','unsure')),
    add column if not exists outcome text check (outcome in ('right','partial','wrong')),
    add column if not exists synced_at timestamptz not null default clock_timestamp();
  create index if not exists review_logs_user_synced_idx on public.review_logs (user_id, synced_at, id);
  drop trigger if exists review_logs_synced_insert on public.review_logs;
  create trigger review_logs_synced_insert before insert on public.review_logs for each row execute function public.set_synced_at();
  ```

- [ ] **Step 1: Failing tests**
  - `recordReview` mit Log `confidence: 'sure'` → `db.logs.get(id)` vorhanden; ohne `confidence` → nicht in `db.logs`.
  - Sync mit Fake-Remote, das `logs: [eigenerLog, fremderLog]` liefert, wobei `eigenerLog` schon lokal liegt → `db.logs.count() === 2`.
  - Fake-Remote mit `logsError` → Sync wirft nicht, Karten/States werden trotzdem übernommen.
- [ ] **Step 2: Run** die Sync-Tests — Expected: FAIL.
- [ ] **Step 3: Implement** (inkl. Schema-Datei; Fake-Remotes in bestehenden Tests um `logs: []` ergänzen).
- [ ] **Step 4: Run** `npx.cmd vitest run app/test` — Expected: PASS; tsc app/shared ohne Ausgabe.
- [ ] **Step 5: Commit** `feat(sync): Einschätzungen lokal halten und zurückholen`

---

### Task 5: Treffsicherheit je Modul auf der Karte

**Files:**
- Create: `app/src/game/calibration.ts`
- Modify: `app/src/game/overview.ts` (`ModuleView.calibration`), `app/src/ui/CampScreen.tsx` (`loadOverview` liest `db.logs`), `app/src/ui/game/MapDialog.tsx`
- Test: `app/test/calibration.test.ts`, `app/test/ui/camp.test.tsx` (oder Map-Test)

**Interfaces:**
- Consumes: `db.logs` (Task 4)
- Produces:
  - `export const CALIBRATION_DAYS = 30`, `export const CALIBRATION_MIN = 10`
  - `calibrationByModule(logs: LogEntry[], cardModule: Map<string, string>, now: Date): Map<string, number>` — Prozent (0–100, gerundet) richtiger Antworten unter `confidence==='sure'` je Modul in den letzten 30 Tagen, nur Module mit ≥ 10 sicheren Antworten.
  - `ModuleView.calibration: number | null`

- [ ] **Step 1: Failing tests**
  - 10 sichere Logs im Modul m1 (8 right, 1 partial, 1 wrong) → `m1: 80`.
  - 9 sichere Logs → kein Eintrag. Unsichere Logs zählen nicht mit.
  - Log älter als 30 Tage → ignoriert. Log zu unbekannter Karte → ignoriert.
  - MapDialog zeigt bei `calibration: 80` den Text „Wenn du sicher bist: 80 % richtig“, bei `null` nichts.
- [ ] **Step 2: Run** `npx.cmd vitest run app/test/calibration.test.ts` und den Map-Test — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS; tsc ohne Ausgabe.
- [ ] **Step 5: Commit** `feat(map): Treffsicherheit je Modul`

---

### Task 6: Sichtprüfung und Abschluss

**Files:** temporär `app/vcheck.html`, `app/src/vcheck.tsx` (unter `http://[::1]:5173`, eigene IndexedDB; danach löschen)

- [ ] **Step 1:** Auf 390×664 prüfen: Auswahl- und Eintipp-Frage mit beiden Knöpfen und „Weiß nicht“, Rückmeldung mit Hinweis, Ergebnis mit Treffsicherheit. Nichts verdeckt, Knöpfe gut treffbar.
- [ ] **Step 2:** Gefundenes beheben (CSS/Markup), vcheck löschen.
- [ ] **Step 3: Run** `npm.cmd test`, `npx.cmd tsc -p app --noEmit`, `-p shared`, `-p werkstatt` — Expected: grün, ohne Ausgabe.
- [ ] **Step 4: Commit** `fix(ui): Feinschliff Sicherheit aus der Sichtprüfung` (nur bei Änderungen).

Hinweis für das Live-Schalten (nicht Teil dieses Plans): erst den SQL-Block aus Task 4 in Supabase ausführen, dann main pushen.
