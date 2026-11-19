'use strict'
const $ = (id) => document.getElementById(id)
const state = { modules: [], file: null, cards: [], styleProfile: null, examTopics: null, invalid: new Map() }
const TYPE_LABEL = { choice: 'Auswahl', cloze: 'Lückentext', matching: 'Zuordnung', order: 'Reihenfolge', free: 'Freitext' }

/** Element bauen; Text immer per textContent (PDF-/KI-Inhalte sind nicht vertrauenswürdig). */
function el(tag, props = {}, ...children) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v
    else if (k === 'text') n.textContent = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, v)
  }
  for (const c of children) if (c) n.append(c)
  return n
}

async function api(path, opts) {
  let res
  try {
    res = await fetch(path, opts)
  } catch {
    throw new Error('Die Werkstatt ist nicht erreichbar.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(body.error || `Fehler ${res.status}`)
    e.body = body
    e.status = res.status
    throw e
  }
  return body
}
const postJson = (path, data) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })

function show(id, on) { $(id).hidden = !on }

async function init() {
  try {
    const cfg = await api('/api/config')
    if (!cfg.configured) return show('setup', true)
    if (!cfg.loggedIn) return show('login', true)
    await enterWork()
  } catch (e) {
    $('status').textContent = e.message
  }
}

$('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  try {
    await postJson('/api/login', { email: $('email').value, password: $('password').value })
    $('password').value = ''
    show('login', false)
    await enterWork()
  } catch (e) {
    $('status').textContent = e.message
  }
})

async function enterWork() {
  show('work', true)
  $('status').textContent = 'angemeldet'
  await loadModules()
}

async function loadModules(selectId) {
  const { modules } = await api('/api/modules')
  state.modules = modules
  const sel = $('module')
  const keep = selectId ?? sel.value
  sel.replaceChildren(...modules.map((m) => el('option', { value: m.id, text: `${m.name} (${m.topics.length} Themen)` })))
  if (keep) sel.value = keep
  updateGenerate()
}

$('add-module').addEventListener('click', async () => {
  const name = $('new-module').value.trim()
  if (!name) return
  try {
    const { module } = await postJson('/api/modules', { name })
    $('new-module').value = ''
    await loadModules(module.id)
  } catch (e) {
    $('status').textContent = e.message
  }
})

function setFile(f) {
  state.file = f && /\.pdf$/i.test(f.name) ? f : null
  $('file-name').textContent = state.file ? state.file.name : f ? 'Nur PDF-Dateien sind erlaubt.' : ''
  updateGenerate()
}
function updateGenerate() { $('generate').disabled = !(state.file && $('module').value) }
$('file').addEventListener('change', (e) => setFile(e.target.files[0]))
$('module').addEventListener('change', updateGenerate)
const drop = $('drop')
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over') })
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); setFile(e.dataTransfer.files[0]) })

$('generate').addEventListener('click', async () => {
  const kind = document.querySelector('input[name=kind]:checked').value
  const fd = new FormData()
  fd.append('moduleId', $('module').value)
  fd.append('kind', kind)
  fd.append('file', state.file)
  show('preview', false); show('job-error', false)
  $('generate').disabled = true
  show('progress', true)
  $('bar').value = 0; $('bar').max = 1
  $('progress-text').textContent = 'Wird vorbereitet …'
  try {
    const { jobId } = await api('/api/generate', { method: 'POST', body: fd })
    await poll(jobId)
  } catch (e) {
    showJobError(e.message)
  } finally {
    updateGenerate()
  }
})

function showJobError(msg) {
  $('job-error').textContent = msg
  show('job-error', true)
}

async function poll(jobId) {
  for (;;) {
    const job = await api(`/api/jobs/${jobId}`)
    $('bar').max = Math.max(job.progress.total, 1)
    $('bar').value = job.progress.done
    $('progress-text').textContent = `Abschnitt ${job.progress.done} von ${job.progress.total} fertig`
    if (job.status === 'running') { await new Promise((r) => setTimeout(r, 1500)); continue }
    if (job.error) showJobError(job.error)
    if (job.status === 'done') startPreview(job)
    return
  }
}

function startPreview(job) {
  state.cards = job.cards
  state.styleProfile = job.styleProfile ?? null
  state.examTopics = job.examTopics ?? null
  state.invalid.clear()
  const rej = $('rejected')
  rej.replaceChildren()
  if (job.rejected?.length) {
    rej.append(el('strong', { text: `${job.rejected.length} Karte(n) abgelehnt:` }),
      el('ul', {}, ...job.rejected.map((r) => el('li', { text: `${r.pages}, Karte ${r.index + 1}: ${r.reason}` }))))
  }
  show('rejected', !!job.rejected?.length)
  const meta = $('meta')
  meta.replaceChildren()
  if (state.styleProfile) meta.append(el('p', { class: 'hint', text: `Stilprofil: ${state.styleProfile}` }))
  if (state.examTopics) meta.append(el('p', { class: 'hint', text: `Klausurthemen: ${state.examTopics.join(', ')}` }))
  $('commit-result').textContent = ''
  show('commit-error', false)
  show('preview', true)
  renderCards()
}

function answerLines(c) {
  const p = c.payload
  switch (c.type) {
    case 'choice': return p.options.map((o) => el('div', { class: 'ans' + (o.correct ? ' ok' : ''), text: `${o.correct ? '✓' : '✗'} ${o.text}` }, el('span', { class: 'why', text: ` – ${o.why}` })))
    case 'cloze': return [el('div', { class: 'ans', text: p.gaps.map((g, i) => `{{${i + 1}}} = ${g.answers.join(' / ')}`).join('; ') })]
    case 'matching': return p.pairs.map((x) => el('div', { class: 'ans', text: `${x.left} → ${x.right}` }))
    case 'order': return p.steps.map((s, i) => el('div', { class: 'ans', text: `${i + 1}. ${s}` }))
    case 'free': return [el('div', { class: 'ans ok', text: p.modelAnswer }), el('div', { class: 'why', text: `Stichpunkte: ${p.keyPoints.join('; ')}` })]
    default: return []
  }
}
const questionOf = (c) => c.payload.question ?? c.payload.text ?? c.payload.prompt ?? ''

function renderCards() {
  const box = $('cards')
  box.replaceChildren(...state.cards.map((c, i) => cardView(c, i)))
}

function cardView(c, i) {
  const bad = state.invalid.get(i)
  const node = el('div', { class: 'card' + (bad ? ' bad-card' : '') })
  const head = el('header', {},
    el('span', { class: 'tag', text: TYPE_LABEL[c.type] ?? c.type }),
    el('span', { class: 'hint', text: c.topic }),
    el('span', { class: 'actions' },
      el('button', { class: 'sec', type: 'button', text: 'Bearbeiten', onclick: () => editCard(node, i) }),
      el('button', { class: 'sec', type: 'button', text: 'Löschen', onclick: () => { state.cards.splice(i, 1); state.invalid.clear(); renderCards() } })))
  node.append(head, el('div', { class: 'q', text: questionOf(c) }), ...answerLines(c))
  if (c.explanation) node.append(el('div', { class: 'expl', text: `Erklärung: ${c.explanation}` }))
  if (c.source) node.append(el('div', { class: 'src', text: `Quelle: ${c.source.file}, S. ${c.source.page} – „${c.source.quote}“` }))
  if (bad) node.append(el('div', { class: 'error', text: bad }))
  return node
}

function editCard(node, i) {
  const ta = el('textarea', {})
  ta.value = JSON.stringify(state.cards[i], null, 2)
  const err = el('div', { class: 'error' })
  const save = el('button', { type: 'button', text: 'Speichern', onclick: () => {
    try {
      state.cards[i] = JSON.parse(ta.value)
      state.invalid.delete(i)
      renderCards()
    } catch (e) { err.textContent = `Kein gültiges JSON: ${e.message}` }
  } })
  const cancel = el('button', { class: 'sec', type: 'button', text: 'Abbrechen', onclick: renderCards })
  node.replaceChildren(ta, err, el('div', { class: 'row' }, save, cancel))
}

$('commit').addEventListener('click', async () => {
  show('commit-error', false)
  $('commit').disabled = true
  try {
    const r = await postJson('/api/commit', { moduleId: $('module').value, cards: state.cards, styleProfile: state.styleProfile ?? undefined, examTopics: state.examTopics ?? undefined })
    $('commit-result').textContent = `${r.added} Karte(n) übernommen, ${r.topicsCreated} neue(s) Thema/Themen, ${r.markedExamRelevant} bestehende Karte(n) als klausurrelevant markiert.`
    state.cards = []; state.styleProfile = null; state.examTopics = null
    renderCards()
    await loadModules()
  } catch (e) {
    $('commit-error').textContent = e.message + (e.body?.invalid ? '\n' + e.body.invalid.map((x) => `Karte ${x.index + 1}: ${x.reason}`).join('\n') : '')
    show('commit-error', true)
    state.invalid.clear()
    for (const x of e.body?.invalid ?? []) state.invalid.set(x.index, x.reason)
    renderCards()
  } finally {
    $('commit').disabled = false
  }
})

init()
