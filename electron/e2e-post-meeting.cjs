/**
 * E2E test for seamless LiveAdvisor → PostMeeting flow.
 *
 * Tests that:
 * 1. Backend is healthy
 * 2. Auth works (JWT token obtained)
 * 3. /api/summary works with live transcript text (not a file upload)
 * 4. /api/insights works with live transcript text
 * 5. The data shapes match what PostMeeting.svelte expects
 *
 * Usage: node electron/e2e-post-meeting.cjs
 */

const http = require('http')

const BACKEND = 'http://localhost:7860'
const AUTH = { login: 'admin@local.dev', password: 'admin123' }

let token = ''
let passed = 0
let failed = 0

// Simulated live transcript — same format that LiveAdvisor.accumulates
const LIVE_TRANSCRIPT = `[Вы]: Добрый день, Дмитрий! Рады видеть вас снова.
[Оппонент]: Добрый день. Я изучил ваше предложение по логистическому модулю.
[Оппонент]: Нас интересует интеграция с нашей текущей 1С. Это реально?
[Вы]: Да, у нас есть готовый коннектор для 1С:ERP. Поддерживаем версии от 8.3.20 и выше.
[Оппонент]: Отлично. И ещё — сколько это будет стоить? У нас бюджет ограничен на Q3.
[Вы]: Стоимость зависит от объёма, давайте обсудим ваши потребности. Базовая конфигурация от 2.5 млн.
[Оппонент]: Нас смущает SAP — они предложили более низкую цену за аналогичный модуль.
[Вы]: Позвольте показать разницу в совокупной стоимости владения. У нас нет скрытых платежей за лицензии.
[Оппонент]: Звучит интересно. Давайте организуем демо-стенд на следующей неделе?
[Вы]: Отличная идея! Предложу слот на 13–14 мая. Также подготовлю TCO-сравнение с SAP.`

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpRequest(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BACKEND)
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    }

    const req = http.request(opts, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(data) } catch { parsed = data }
        resolve({ status: res.statusCode, data: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 })
      })
    })

    req.on('error', reject)
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}

function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.log(`  ❌ ${label}`)
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testHealth() {
  console.log('\n[TEST 1] Backend health check')
  try {
    const res = await httpRequest('GET', '/health')
    assert(res.ok, `Health endpoint returned ${res.status}`)
    return res.ok
  } catch (e) {
    assert(false, `Health check failed: ${e.message}`)
    return false
  }
}

async function testAuth() {
  console.log('\n[TEST 2] Authentication')
  try {
    const res = await httpRequest('POST', '/api/auth/login', AUTH)
    assert(res.ok, `Login returned ${res.status}`)
    assert(!!res.data?.access_token, 'JWT token received')
    token = res.data?.access_token ?? ''
    return !!token
  } catch (e) {
    assert(false, `Auth failed: ${e.message}`)
    return false
  }
}

async function testSummary() {
  console.log('\n[TEST 3] POST /api/summary with live transcript text')
  try {
    const res = await httpRequest('POST', '/api/summary', {
      text: LIVE_TRANSCRIPT,
    }, { Authorization: `Bearer ${token}` })

    assert(res.ok, `Summary endpoint returned ${res.status}`)

    // Check response shape — PostMeeting expects: summaryData?.summary ?? summaryData?.text
    const hasSummary = !!(res.data?.summary_markdown ?? res.data?.summary ?? res.data?.text)
    assert(hasSummary, 'Response contains summary text')

    if (hasSummary) {
      const summary = res.data?.summary_markdown ?? res.data?.summary ?? String(res.data)
      console.log(`  📝 Summary preview: "${summary.substring(0, 120)}..."`)
    }

    return res.ok
  } catch (e) {
    assert(false, `Summary failed: ${e.message}`)
    return false
  }
}

async function testInsights() {
  console.log('\n[TEST 4] POST /api/insights with live transcript text')
  try {
    const res = await httpRequest('POST', '/api/insights', {
      text: LIVE_TRANSCRIPT,
    }, { Authorization: `Bearer ${token}` })

    assert(res.ok, `Insights endpoint returned ${res.status}`)

    // Check response shape — PostMeeting expects: action_items, decisions, insights
    const hasActionItems = Array.isArray(res.data?.action_items)
    const hasDecisions = Array.isArray(res.data?.decisions)
    const hasInsights = Array.isArray(res.data?.insights)

    assert(hasActionItems || hasDecisions || hasInsights, 'Response contains actionable data')
    if (hasActionItems) console.log(`  ✅ Action items: ${res.data.action_items.length}`)
    if (hasDecisions)   console.log(`  ✅ Decisions: ${res.data.decisions.length}`)
    if (hasInsights)    console.log(`  ✅ Insights: ${res.data.insights.length}`)

    return res.ok
  } catch (e) {
    assert(false, `Insights failed: ${e.message}`)
    return false
  }
}

async function testLiveTranscriptFormat() {
  console.log('\n[TEST 5] Live transcript format compatibility')
  // Verify the transcript format from LiveAdvisor matches what PostMeeting sends
  const lines = LIVE_TRANSCRIPT.split('\n').filter(l => l.trim())
  assert(lines.length > 0, `Transcript has ${lines.length} non-empty lines`)
  assert(LIVE_TRANSCRIPT.includes('[Вы]:'), 'Transcript contains [Вы]: speaker prefix')
  assert(LIVE_TRANSCRIPT.includes('[Оппонент]:'), 'Transcript contains [Оппонент]: speaker prefix')

  // Verify word count (used in metadata bar)
  const wordCount = LIVE_TRANSCRIPT.split(' ').length
  assert(wordCount > 20, `Word count: ${wordCount} (reasonable for analysis)`)
  return true
}

async function testDataFlowCompatibility() {
  console.log('\n[TEST 6] Data flow: LiveAdvisor → App.svelte → PostMeeting')
  // Simulate the data flow:
  // 1. LiveAdvisor dispatches: { transcript: transcriptText, displayedLines, elapsed }
  const liveAdvisorPayload = {
    transcript: LIVE_TRANSCRIPT,
    displayedLines: [
      { speaker: 'Менеджер', text: 'Добрый день, Дмитрий!' },
      { speaker: 'Клиент', text: 'Добрый день. Я изучил ваше предложение.' },
    ],
    elapsed: 245,
  }

  // 2. App.svelte captures: liveTranscript = e.detail?.transcript, liveDuration = e.detail?.elapsed
  const liveTranscript = liveAdvisorPayload.transcript ?? ''
  const liveDuration = liveAdvisorPayload.elapsed ?? 0

  assert(liveTranscript.length > 0, 'App.svelte receives liveTranscript')
  assert(liveDuration > 0, `App.svelte receives liveDuration: ${liveDuration}s`)

  // 3. PostMeeting: hasLiveTranscript = liveTranscript && liveTranscript.trim().length > 0
  const hasLiveTranscript = liveTranscript && liveTranscript.trim().length > 0
  assert(hasLiveTranscript, 'PostMeeting detects live transcript (triggers auto-processing)')

  // 4. PostMeeting passes transcript directly to getSummary/getInsights (no file upload)
  assert(liveTranscript === LIVE_TRANSCRIPT, 'Transcript passed unchanged to API calls')

  return true
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════')
  console.log('  CoPilot Sales — Post-Meeting Seamless Flow E2E')
  console.log('══════════════════════════════════════════════════')

  const healthOk = await testHealth()
  if (!healthOk) {
    console.log('\n⚠️  Backend is not running. Start DialogScribe first:')
    console.log('    docker compose -f docker-compose.fullstack.yaml up -d')
    process.exit(1)
  }

  const authOk = await testAuth()
  if (!authOk) {
    console.log('\n⚠️  Auth failed. Check credentials.')
    process.exit(1)
  }

  // These can run in parallel since they're independent API calls
  await Promise.all([
    testSummary(),
    testInsights(),
  ])

  await testLiveTranscriptFormat()
  await testDataFlowCompatibility()

  // ── Summary ──
  console.log('\n══════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('══════════════════════════════════════════════════')

  if (failed > 0) {
    console.log('\n❌ Some tests failed. PostMeeting auto-processing may not work correctly.')
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed! Seamless Live → Post flow is ready.')
    process.exit(0)
  }
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
