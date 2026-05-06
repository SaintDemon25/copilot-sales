/**
 * DialogScribe API client
 * Docs: https://github.com/Timik232/DialogScribe
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const API_KEY  = import.meta.env.VITE_API_KEY ?? ''

function headers(extra = {}) {
  const h = { 'Accept': 'application/json', ...extra }
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`
  return h
}

/** Generic fetch wrapper — throws on non-2xx */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers(), ...options.headers },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${path} → ${res.status}: ${text}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  return contentType.includes('application/json') ? res.json() : res.text()
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Check if the backend is reachable */
export async function checkHealth() {
  try {
    await apiFetch('/health')
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * GET /api/models
 * Returns list of available LLM model names.
 * @returns {Promise<string[]>}
 */
export async function getModels() {
  const data = await apiFetch('/api/models')
  // Normalise: could be string[] or {models: string[]} depending on version
  if (Array.isArray(data)) return data
  if (data?.models) return data.models
  return []
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

/**
 * POST /api/transcribe
 * Upload an audio/video file for transcription with speaker diarization.
 *
 * @param {File} file        - Audio or video file
 * @param {object} opts
 * @param {string} [opts.language]       - Language hint, e.g. "ru"
 * @param {boolean} [opts.diarize=true]  - Enable speaker diarization
 * @param {(pct: number) => void} [opts.onProgress]
 * @returns {Promise<TranscriptResult>}
 */
export async function transcribeFile(file, opts = {}) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.language)          fd.append('language', opts.language)
  if (opts.diarize !== false) fd.append('diarize', 'true')

  const data = await apiFetch('/api/transcribe', {
    method: 'POST',
    headers: headers(), // no Content-Type — browser sets multipart boundary
    body: fd,
  })
  return normaliseTranscript(data)
}

/**
 * POST /v1/audio/transcriptions  (OpenAI-compatible endpoint)
 * Simpler form, returns {text: string}.
 *
 * @param {File} file
 * @param {string} [language]
 * @returns {Promise<{text: string}>}
 */
export async function transcribeOpenAI(file, language = 'ru') {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('model', 'voxtral')
  fd.append('language', language)

  return apiFetch('/v1/audio/transcriptions', {
    method: 'POST',
    body: fd,
  })
}

/** Normalise transcript response into a consistent shape */
function normaliseTranscript(raw) {
  // Handle both {text, segments, speakers} and flat {transcript}
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
 * Generate a structured meeting summary from transcript text.
 *
 * @param {string} transcript
 * @param {object} [opts]
 * @param {string} [opts.model]   - Override default LLM model
 * @param {string} [opts.prompt]  - Custom summary prompt
 * @returns {Promise<{summary: string, action_items?: string[], decisions?: string[]}>}
 */
export async function getSummary(transcript, opts = {}) {
  return apiFetch('/api/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: transcript,
      ...(opts.model  ? { model:  opts.model  } : {}),
      ...(opts.prompt ? { prompt: opts.prompt } : {}),
    }),
  })
}

/**
 * POST /api/insights
 * Extract key insights, decisions and action items from transcript.
 *
 * @param {string} transcript
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @returns {Promise<{insights: string[], action_items: string[], decisions: string[]}>}
 */
export async function getInsights(transcript, opts = {}) {
  return apiFetch('/api/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: transcript,
      ...(opts.model ? { model: opts.model } : {}),
    }),
  })
}

/**
 * POST /api/mindmap
 * Generate a mind-map structure from transcript.
 *
 * @param {string} transcript
 * @returns {Promise<{mindmap: string}>}
 */
export async function getMindmap(transcript) {
  return apiFetch('/api/mindmap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: transcript }),
  })
}

// ---------------------------------------------------------------------------
// Chat (Live Advisor)
// ---------------------------------------------------------------------------

/**
 * POST /api/chat
 * Send a dialog fragment + context and receive an AI coaching tip.
 * Used by Live Advisor Agent for real-time advice.
 *
 * @param {object} params
 * @param {string} params.message       - Latest transcript fragment / question
 * @param {string} [params.context]     - Full transcript so far
 * @param {string} [params.system]      - System prompt override
 * @param {string} [params.model]       - Model override
 * @param {Array}  [params.history]     - Prior chat turns [{role, content}]
 * @returns {Promise<{response: string, role: string}>}
 */
export async function chat(params) {
  return apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message:  params.message,
      context:  params.context  ?? '',
      system:   params.system   ?? LIVE_ADVISOR_SYSTEM_PROMPT,
      model:    params.model    ?? undefined,
      history:  params.history  ?? [],
    }),
  })
}

// System prompt for Live Advisor — matches the architecture doc
const LIVE_ADVISOR_SYSTEM_PROMPT = `Ты — ассистент менеджера B2B-продаж в реальном времени.
Твоя задача — давать краткие, конкретные советы на основе фрагментов диалога с клиентом.
Отвечай на русском. Максимум 3 предложения. Будь конкретен — ссылайся на слова клиента.
Если фрагмент нейтральный и не требует совета, ответь "—".`

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

/**
 * Download transcript in a specific format.
 * GET /api/export?format=docx&text=...  (or POST, depends on server version)
 *
 * @param {string} transcript
 * @param {'txt'|'json'|'srt'|'vtt'|'docx'} format
 */
export async function exportTranscript(transcript, format = 'docx') {
  const res = await fetch(`${BASE_URL}/api/export`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: transcript, format }),
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
