# Changelog

## [0.2.0] - 2026-05-06

### Added
- **Electron desktop app shell** — BrowserWindow with embedded HTTP server, preload script with context bridge, and media permission auto-grant
- **Native WASAPI loopback system audio capture** — Custom C++ program (`wasapi_loopback.exe`) that captures system audio directly via Windows Audio Session API, bypassing Chromium's USB audio device bug
- **IPC-based system audio pipeline** — Main process spawns WASAPI loopback capture, buffers PCM into 6-second WAV chunks, sends base64-encoded audio to renderer via IPC
- **LiveAdvisor integration** — Real-time mic + system audio recording with WebSocket connection to DialogScribe for live ASR and sales hints
- **E2E test suite** — Automated verification of backend health, auth, WebSocket, and system audio capture

### Fixed
- System audio capture no longer fails with "Could not start audio source" error on Windows (bypasses Chromium bug with USB audio devices like Logitech G733)
- `source` field for system audio chunks changed from `'system'` to `'tab'` to match backend Pydantic validation

### Technical
- `electron/main.cjs` — Electron main process: HTTP server for built Svelte, WASAPI loopback spawn, IPC handlers, WAV container wrapping
- `electron/preload.cjs` — Context bridge: `startSystemAudio`, `stopSystemAudio`, `onSystemAudioChunk`
- `electron/wasapi_loopback.cpp` — Standalone C++ WASAPI loopback capture (s16le stereo 48kHz output, auto-downmix)
- `src/lib/api.js` — `createSystemAudioRecorder()` rewritten to use IPC for native capture with browser fallback

## [0.1.0] - 2026-05-05

### Added
- Svelte SPA frontend with sidebar navigation
- DialogScribe backend integration (auth, transcription, summary, insights, chat)
- LiveAdvisor component with WebSocket connection to DialogScribe live-hints endpoint
- Microphone recording with stop-start cycling (complete WebM segments)
- Docker Compose dev setup for DialogScribe backend
- README with architecture overview and getting started guide
