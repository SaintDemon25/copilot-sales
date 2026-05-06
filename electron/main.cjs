const { app, BrowserWindow, ipcMain } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// Initialize loopback audio (legacy, kept as fallback)
try {
  const { initMain } = require('electron-audio-loopback/dist/main')
  initMain()
} catch { /* ignore if not available */ }

let mainWindow = null
let server = null

const DIST_DIR = path.join(__dirname, '..', 'dist')
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0]
      let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath)
      if (!filePath.startsWith(DIST_DIR)) { res.writeHead(403); return res.end() }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          if (err.code === 'ENOENT' && !path.extname(filePath)) {
            filePath = path.join(DIST_DIR, 'index.html')
            return fs.readFile(filePath, (e2, d2) => {
              if (e2) { res.writeHead(404); return res.end('Not found') }
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(d2)
            })
          }
          res.writeHead(404); return res.end('Not found')
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
        res.end(data)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
    server.on('error', reject)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'CoPilot Sales',
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      if (permission === 'media') callback(true)
      else callback(false)
    }
  )
}

// ---------------------------------------------------------------------------
// WASAPI Loopback System Audio Capture
// ---------------------------------------------------------------------------
let loopbackProc = null
let loopbackChunkBuf = []
let loopbackChunkSize = 0
const LOOPBACK_CHUNK_DURATION_MS = 6000  // 6 seconds per chunk
const LOOPBACK_SAMPLE_RATE = 48000
const LOOPBACK_CHANNELS = 2
const LOOPBACK_BYTES_PER_SAMPLE = 2  // s16le
const LOOPBACK_BYTES_PER_SEC = LOOPBACK_SAMPLE_RATE * LOOPBACK_CHANNELS * LOOPBACK_BYTES_PER_SAMPLE
const LOOPBACK_CHUNK_BYTES = LOOPBACK_BYTES_PER_SEC * (LOOPBACK_CHUNK_DURATION_MS / 1000)
const WAV_HEADER_SIZE = 44

function makeWavHeader(dataLen, sampleRate, channels, bitsPerSample) {
  const buf = Buffer.alloc(44)
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)  // PCM fmt chunk size
  buf.writeUInt16LE(1, 20)   // PCM format
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(bitsPerSample, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)
  return buf
}

function flushLoopbackChunk() {
  if (loopbackChunkBuf.length === 0) return
  const pcmData = Buffer.concat(loopbackChunkBuf)
  loopbackChunkBuf = []
  loopbackChunkSize = 0

  // Wrap in WAV container
  const wavHeader = makeWavHeader(pcmData.length, LOOPBACK_SAMPLE_RATE, LOOPBACK_CHANNELS, 16)
  const wavBuf = Buffer.concat([wavHeader, pcmData])

  // Base64 encode and send to renderer
  const b64 = wavBuf.toString('base64')
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system-audio-chunk', b64)
  }
}

ipcMain.handle('start-system-audio', async () => {
  if (loopbackProc) return true  // already running

  const exePath = path.join(__dirname, 'wasapi_loopback.exe')
  if (!fs.existsSync(exePath)) {
    console.error('wasapi_loopback.exe not found at', exePath)
    return false
  }

  try {
    loopbackProc = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    loopbackChunkBuf = []
    loopbackChunkSize = 0

    // Read PCM data from stdout
    loopbackProc.stdout.on('data', (chunk) => {
      loopbackChunkBuf.push(chunk)
      loopbackChunkSize += chunk.length

      // When we have enough for a 6-second segment, flush it
      if (loopbackChunkSize >= LOOPBACK_CHUNK_BYTES) {
        flushLoopbackChunk()
      }
    })

    loopbackProc.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      console.log('[wasapi_loopback]', msg)
    })

    loopbackProc.on('close', (code) => {
      console.log('[wasapi_loopback] exited with code', code)
      // Flush remaining data
      flushLoopbackChunk()
      loopbackProc = null
    })

    loopbackProc.on('error', (err) => {
      console.error('[wasapi_loopback] error:', err.message)
      loopbackProc = null
    })

    // Wait a moment to see if it starts successfully
    await new Promise(resolve => setTimeout(resolve, 500))
    return loopbackProc !== null
  } catch (e) {
    console.error('Failed to start wasapi_loopback:', e.message)
    loopbackProc = null
    return false
  }
})

ipcMain.handle('stop-system-audio', async () => {
  if (!loopbackProc) return

  // Send STOP command via stdin
  try {
    loopbackProc.stdin.write('STOP\n')
    loopbackProc.stdin.end()
  } catch { /* ignore */ }

  // Give it a moment to exit gracefully
  await new Promise(resolve => setTimeout(resolve, 300))

  if (loopbackProc) {
    try { loopbackProc.kill() } catch { /* ignore */ }
    loopbackProc = null
  }

  // Flush any remaining audio
  flushLoopbackChunk()
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  const port = await startServer()
  createWindow()
  mainWindow.loadURL(`http://127.0.0.1:${port}`)
})

app.on('window-all-closed', () => {
  // Stop system audio capture
  if (loopbackProc) {
    try { loopbackProc.kill() } catch { /* ignore */ }
    loopbackProc = null
  }
  if (server) server.close()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
