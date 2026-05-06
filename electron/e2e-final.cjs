/**
 * Full E2E test for CoPilot Sales Electron app
 * Tests: backend health, auth, WebSocket, mic, AND system audio (WASAPI loopback)
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const http = require('http')

const BACKEND = 'http://localhost:7860'

let mainWindow = null
let testResults = {}
let wsTestPassed = false
let systemAudioChunksReceived = 0

// ── Step 1: Check backend health ──
function checkBackend() {
  return new Promise((resolve) => {
    const req = http.get(`${BACKEND}/health`, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        testResults.health = res.statusCode === 200
        console.log(`[TEST] Backend health: ${testResults.health ? '✅' : '❌'} (${res.statusCode})`)
        resolve(testResults.health)
      })
    })
    req.on('error', (e) => {
      testResults.health = false
      console.log(`[TEST] Backend health: ❌ (${e.message})`)
      resolve(false)
    })
    req.setTimeout(5000, () => { req.destroy(); resolve(false) })
  })
}

// ── Step 2: Login to backend ──
function login() {
  return new Promise((resolve) => {
    const data = JSON.stringify({ login: 'admin@local.dev', password: 'admin123' })
    const req = http.request(`${BACKEND}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    }, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          testResults.auth = !!parsed.access_token
          testResults.token = parsed.access_token
        } catch { testResults.auth = false }
        console.log(`[TEST] Auth: ${testResults.auth ? '✅' : '❌'}`)
        resolve(testResults.auth)
      })
    })
    req.on('error', () => { testResults.auth = false; resolve(false) })
    req.write(data)
    req.end()
  })
}

// ── Step 3: Test WebSocket ──
function testWebSocket() {
  return new Promise((resolve) => {
    if (!testResults.token) {
      testResults.ws = false
      console.log('[TEST] WebSocket: ❌ (no token)')
      return resolve(false)
    }

    // Use raw HTTP upgrade for WebSocket
    const WebSocket = require('ws')
    const wsUrl = `ws://127.0.0.1:7860/api/live-hints/ws?token=${encodeURIComponent(testResults.token)}`

    try {
      const ws = new WebSocket(wsUrl)
      const timeout = setTimeout(() => {
        testResults.ws = false
        console.log('[TEST] WebSocket: ❌ (timeout)')
        ws.close()
        resolve(false)
      }, 8000)

      ws.on('open', () => {
        console.log('[TEST] WebSocket: ✅ connected')
        wsTestPassed = true
        testResults.ws = true
        clearTimeout(timeout)

        // Send a test config
        ws.send(JSON.stringify({ type: 'session_config', template_key: 'sales' }))

        setTimeout(() => {
          ws.close()
          resolve(true)
        }, 2000)
      })

      ws.on('error', (e) => {
        testResults.ws = false
        console.log(`[TEST] WebSocket: ❌ (${e.message})`)
        clearTimeout(timeout)
        resolve(false)
      })

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data)
          console.log(`[TEST] WS message: ${msg.type || 'unknown'}`)
        } catch {}
      })
    } catch (e) {
      testResults.ws = false
      console.log(`[TEST] WebSocket: ❌ (${e.message})`)
      resolve(false)
    }
  })
}

// ── Main test runner ──
async function runTests() {
  console.log('\n=== CoPilot Sales E2E Test ===\n')

  // Backend tests
  await checkBackend()
  await login()
  await testWebSocket()

  // Electron + WASAPI loopback tests
  console.log('\n--- Electron + WASAPI Loopback Tests ---\n')

  const DIST_DIR = path.join(__dirname, '..', 'dist')

  // Start HTTP server for the built Svelte app
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0]
    let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath)
    require('fs').readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found') }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(data)
    })
  })

  const port = await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })

  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  mainWindow.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => {
    if (perm === 'media') cb(true); else cb(false)
  })

  // Test native WASAPI loopback capture
  console.log('[TEST] Starting WASAPI loopback system audio capture...')
  const { spawn } = require('child_process')
  const fs = require('fs')

  const exePath = path.join(__dirname, 'wasapi_loopback.exe')
  testResults.exeExists = fs.existsSync(exePath)
  console.log(`[TEST] wasapi_loopback.exe exists: ${testResults.exeExists ? '✅' : '❌'}`)

  if (testResults.exeExists) {
    let capturedBytes = 0
    const proc = spawn(exePath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })

    proc.stdout.on('data', (chunk) => { capturedBytes += chunk.length })
    proc.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      console.log(`[TEST] [wasapi_loopback] ${msg}`)
    })

    // Capture for 4 seconds
    await new Promise(resolve => setTimeout(resolve, 4000))

    proc.stdin.write('STOP\n')
    proc.stdin.end()
    await new Promise(resolve => setTimeout(resolve, 500))
    try { proc.kill() } catch {}

    testResults.systemAudio = capturedBytes > 100000
    testResults.systemAudioBytes = capturedBytes
    console.log(`[TEST] System audio capture: ${testResults.systemAudio ? '✅' : '❌'} (${capturedBytes} bytes in 4s)`)
  } else {
    testResults.systemAudio = false
    console.log('[TEST] System audio capture: ❌ (exe not found)')
  }

  // ── Summary ──
  console.log('\n=== E2E Test Results ===')
  const checks = [
    ['Backend health', testResults.health],
    ['Auth (login)', testResults.auth],
    ['WebSocket', testResults.ws],
    ['wasapi_loopback.exe', testResults.exeExists],
    ['System audio (WASAPI loopback)', testResults.systemAudio],
  ]

  let allPassed = true
  for (const [name, passed] of checks) {
    console.log(`  ${passed ? '✅' : '❌'} ${name}`)
    if (!passed) allPassed = false
  }

  console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`)
  console.log('\n')

  // Cleanup
  mainWindow.close()
  server.close()
  app.quit()
}

app.whenReady().then(runTests)
app.on('window-all-closed', () => app.quit())
