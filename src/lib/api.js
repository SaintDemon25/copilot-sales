/**
 * DialogScribe API client
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const API_KEY  = import.meta.env.VITE_API_KEY ?? ''
const DS_EMAIL = import.meta.env.VITE_DS_EMAIL ?? 'admin@local.dev'
const DS_PASS  = import.meta.env.VITE_DS_PASSWORD ?? 'admin123'

// ---------------------------------------------------------------------------
// Auth — auto-login with token cache + 401 retry
// ---------------------------------------------------------------------------

let _token = ''
let _loginPromise = null

async function ensureToken() {
  if (_token) return
  if (_loginPromise) { await _loginPromise; return }

  _loginPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ login: DS_EMAIL, password: DS_PASS }),
      })
      if (res.ok) {
        const data = await res.json()
        _token = data.access_token
      }
    } catch {
      // network error — leave _token empty, calls will fail with real error
    } finally {
      _loginPromise = null
    }
  })()

  return _loginPromise
}

function authHeader() {
  if (_token)   return { Authorization: `Bearer ${_token}` }
  if (API_KEY)  return { Authorization: `Bearer ${API_KEY}` }
  return {}
}

async function apiFetch(path, options = {}) {
  await ensureToken()

  const makeHeaders = () => ({
    Accept: 'application/json',
    ...authHeader(),
    ...options.headers,
  })

  const doFetch = (hdrs) =>
    fetch(`${BASE_URL}${path}`, { ...options, headers: hdrs })

  let res = await doFetch(makeHeaders())

  // Token expired — re-login and retry once
  if (res.status === 401) {
    _token = ''
    await ensureToken()
    res = await doFetch(makeHeaders())
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${path} → ${res.status}: ${text}`)
  }

  const ct = res.headers.get('content-type') ?? ''
  return ct.includes('application/json') ? res.json() : res.text()
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function checkHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`)
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export async function getModels() {
  const data = await apiFetch('/api/models')
  if (Array.isArray(data))   return data
  if (data?.models)          return data.models.map(m => m.id ?? m)
  return []
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

/**
 * POST /api/transcribe
 * @param {File} file
 * @param {{ language?: string, diarize?: boolean }} opts
 */
export async function transcribeFile(file, opts = {}) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.language) fd.append('language', opts.language)
  // diarization_mode values: none | simple (hybrid) | advanced (pyannote)
  fd.append('diarization_mode', opts.diarize !== false ? 'simple' : 'none')

  // No Content-Type — browser sets multipart boundary automatically
  const data = await apiFetch('/api/transcribe', {
    method:  'POST',
    headers: { Accept: 'application/json', ...authHeader() },
    body:    fd,
  })
  return normaliseTranscript(data)
}

/**
 * POST /v1/audio/transcriptions  (OpenAI-compatible, no JWT required)
 */
export async function transcribeOpenAI(file, language = 'ru') {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('model', 'voxtral')
  fd.append('language', language)

  return apiFetch('/v1/audio/transcriptions', { method: 'POST', body: fd })
}

function normaliseTranscript(raw) {
  return {
    text:     raw.text ?? raw.transcript ?? '',
    segments: raw.segments ?? [],
    speakers: raw.speakers ?? [],
    duration: raw.duration ?? null,
    language: raw.language ?? null,
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * POST /api/summary
 * Returns { summary, summary_markdown, summary_html }
 */
export async function getSummary(transcript, opts = {}) {
  const data = await apiFetch('/api/summary', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      text: transcript,
      ...(opts.model        ? { model:        opts.model        } : {}),
      ...(opts.template_key ? { template_key: opts.template_key } : {}),
    }),
  })
  // Backend returns { summary_markdown, summary_html } — normalise to { summary }
  return {
    ...data,
    summary: data?.summary_markdown ?? data?.summary ?? String(data),
  }
}

/**
 * POST /api/insights
 */
export async function getInsights(transcript, opts = {}) {
  return apiFetch('/api/insights', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      text: transcript,
      ...(opts.model ? { model: opts.model } : {}),
    }),
  })
}

/**
 * POST /api/mindmap
 */
export async function getMindmap(transcript) {
  return apiFetch('/api/mindmap', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text: transcript }),
  })
}

// ---------------------------------------------------------------------------
// Chat (Live Advisor)
// ---------------------------------------------------------------------------

/**
 * POST /api/chat
 * DialogScribe expects: { text, messages: [{role, content}] }
 * Returns: { answer }
 *
 * @param {{ message: string, context?: string, system?: string, model?: string, history?: Array }} params
 * @returns {Promise<{ response: string }>}
 */
export async function chat(params) {
  const messages = []
  messages.push({ role: 'system', content: params.system ?? LIVE_ADVISOR_SYSTEM_PROMPT })
  if (params.history?.length) messages.push(...params.history)
  messages.push({ role: 'user', content: params.message })

  const data = await apiFetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      text:     params.context ?? '',
      messages,
      ...(params.model ? { model: params.model } : {}),
    }),
  })

  // Backend returns { answer } — normalise to { response }
  return {
    response: data?.answer ?? data?.response ?? data?.content ?? String(data),
  }
}

const LIVE_ADVISOR_SYSTEM_PROMPT = `Ты — ассистент менеджера B2B-продаж в реальном времени.
Твоя задача — давать краткие, конкретные советы на основе фрагментов диалога с клиентом.
Отвечай на русском. Максимум 3 предложения. Будь конкретен — ссылайся на слова клиента.
Если фрагмент нейтральный и не требует совета, ответь "—".`

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportTranscript(transcript, format = 'docx') {
  const res = await fetch(`${BASE_URL}/api/export`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
    body:    JSON.stringify({ text: transcript, format }),
  })
  if (!res.ok) throw new Error(`Export failed: ${res.status}`)
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `transcript.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
