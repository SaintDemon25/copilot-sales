<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { connectLiveHints, createMicRecorder, createSystemAudioRecorder } from '../lib/api.js'

  const dispatch = createEventDispatcher()
  export let meeting

  // ---- Transcript state ----
  let displayedLines = []
  let transcriptText = ''   // plain text accumulation for context
  let elapsed = 0

  // ---- Advisor state ----
  let advisorCards = []
  let wsConnected = false
  let wsConnecting = false
  let wsError = ''
  let isRecording = false
  let mic
  let systemAudio
  let hasSystemAudio = false

  // ---- Live connection ----
  let liveConnection = null
  let stopped = false

  // ---- Timers ----
  let elapsedTimer

  // ---- Trigger keywords for local fast layer ----
  const TRIGGERS = ['цена', 'стоит', 'бюджет', 'возражени', 'конкурент', 'sap', '1с', 'интеграц', 'дорого', 'дешевле']

  function detectTrigger(text) {
    const lower = text.toLowerCase()
    if (lower.includes('цена') || lower.includes('стоит') || lower.includes('бюджет') || lower.includes('дорого') || lower.includes('дешевле')) return 'price'
    if (lower.includes('возражени')) return 'objection'
    if (lower.includes('конкурент') || lower.includes('sap') || lower.includes('1с') || lower.includes('альтернатив')) return 'competitor'
    if (lower.includes('интеграц') || lower.includes('апи') || lower.includes('api')) return 'question'
    return null
  }

  const typeColors = { question: '#3b82f6', price: '#f59e0b', competitor: '#ef4444', objection: '#a855f7', argumentative: '#a855f7', navigational: '#3b82f6', tactical: '#10b981', strategic: '#6366f1', warning: '#ef4444', analytical: '#f59e0b' }
  const typeLabels = { question: 'Вопрос', price: 'Цена', competitor: 'Конкурент', objection: 'Возражение', argumentative: 'Аргумент', navigational: 'Навигация', tactical: 'Тактика', strategic: 'Стратегия', warning: 'Предупреждение', analytical: 'Аналитика' }

  async function startLiveSession() {
    wsConnecting = true
    wsError = ''
    stopped = false

    try {
      liveConnection = await connectLiveHints({
        onTranscript(msg) {
          const speaker = msg.speaker === 'user' ? 'Менеджер' : 'Клиент'
          const prefix = msg.speaker === 'user' ? '[Вы]:' : '[Оппонент]:'
          const text = msg.text?.trim()
          if (!text) return

          displayedLines = [...displayedLines, { speaker, text }]
          transcriptText += `${prefix} ${text}\n`

          // Local fast layer trigger detection
          const trigger = detectTrigger(text)
          if (trigger) {
            // Add a local trigger indicator card
            advisorCards = [{
              type: trigger,
              title: typeLabels[trigger],
              advice: `Обнаружен триггер: "${text}". Совет от агента загружается...`,
              source: 'Fast Layer · Локально',
              fresh: true,
              loading: true,
            }, ...advisorCards].slice(0, 8)
          }
        },
        onHint(msg) {
          // Replace loading cards or add new hint
          advisorCards = [{
            type: msg.hint_type || 'argumentative',
            title: typeLabels[msg.hint_type] || msg.hint_type || 'Совет',
            advice: msg.text,
            source: `Live Advisor · ${msg.priority || 'medium'}`,
            fresh: true,
            hintId: msg.hint_id,
          }, ...advisorCards.filter(c => !c.loading)].slice(0, 8)
        },
        onStatus(msg) {
          if (msg.status === 'ready') {
            wsConnected = true
            wsConnecting = false
          } else if (msg.status === 'processing') {
            // Server is busy processing previous chunk
          } else if (msg.status === 'silent_chunk') {
            // No speech detected in chunk
          } else if (msg.status === 'disconnected') {
            wsConnected = false
          }
        },
        onError(msg) {
          wsError = msg.message || 'WebSocket error'
          wsConnecting = false
        },
      })

      // Send session config
      const clientCtx = meeting
        ? `Клиент: ${meeting.client}. Контакт: ${meeting.contact}. Тема: ${meeting.topic}.`
        : ''
      liveConnection.sendConfig('sales', clientCtx)

      wsConnected = true
      wsConnecting = false

      // Start mic recording — segments are sent automatically via callback
      mic = createMicRecorder({
        onSegment(base64Audio) {
          if (liveConnection && !stopped) {
            liveConnection.sendAudio(base64Audio, 'mic')
          }
        },
        segmentIntervalMs: 6000,
      })
      await mic.start()
      isRecording = true

    } catch (e) {
      wsError = e.message || 'Connection failed'
      wsConnecting = false
      wsConnected = false
    }
  }

  async function enableSystemAudio() {
    if (systemAudio || !liveConnection) return
    systemAudio = createSystemAudioRecorder({
      onSegment(base64Audio) {
        if (liveConnection && !stopped) {
          liveConnection.sendAudio(base64Audio, 'tab')
        }
      },
      segmentIntervalMs: 6000,
    })
    hasSystemAudio = await systemAudio.start()
  }

  function stopLiveSession() {
    isRecording = false
    stopped = true
    hasSystemAudio = false
    if (liveConnection) { liveConnection.close(); liveConnection = null }
    if (mic) { mic.stop(); mic = null }
    if (systemAudio) { systemAudio.stop(); systemAudio = null }
    wsConnected = false
    dispatch('endMeeting')
  }

  onMount(() => {
    elapsedTimer = setInterval(() => elapsed++, 1000)
    // Auto-start only if a meeting is selected
    if (meeting) {
      startLiveSession()
    }
  })

  onDestroy(() => {
    clearInterval(elapsedTimer)
    stopped = true
    if (liveConnection) liveConnection.close()
    if (mic) mic.stop()
    if (systemAudio) systemAudio.stop()
  })

  function fmtElapsed(s) {
    const m   = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  // Remove "fresh" flag after animation
  $: {
    // noop — reactivity trigger for advisorCards
    void advisorCards
  }
</script>

<div class="live-layout">
  <!-- Left: transcript -->
  <div class="transcript-panel">
    <div class="panel-head">
      <div class="live-indicator">
        {#if wsConnected}
          <span class="live-dot"></span> В ЭФИРЕ
        {:else if wsConnecting}
          <span class="live-dot connecting"></span> ПОДКЛЮЧЕНИЕ...
        {:else}
          <span class="live-dot offline"></span> ОФЛАЙН
        {/if}
      </div>
      <div class="elapsed">{fmtElapsed(elapsed)}</div>
      {#if wsConnected || isRecording}
        <button class="end-btn" on:click={stopLiveSession}>
          ⏹ Завершить
        </button>
      {:else}
        <button class="start-btn" on:click={startLiveSession} disabled={wsConnecting || !meeting}>
          {wsConnecting ? 'Подключение...' : '▶ Начать'}
        </button>
      {/if}
    </div>

    <div class="meeting-meta-bar">
      <strong>{meeting?.client ?? '—'}</strong>
      <span>·</span>
      <span>{meeting?.contact ?? ''}</span>
    </div>

    {#if wsError}
      <div class="ws-error">
        ⚠️ {wsError}
        <button class="retry-btn" on:click={startLiveSession}>Повторить</button>
      </div>
    {/if}

    <div class="transcript-scroll">
      {#each displayedLines as line}
        <div class="line" class:manager={line.speaker === 'Менеджер'}>
          <span class="speaker">{line.speaker}</span>
          <span class="text">{line.text}</span>
        </div>
      {/each}

      {#if displayedLines.length === 0}
        <div class="waiting">
          {#if !meeting}
            <span class="listening-label">Выберите встречу на экране «Подготовка», затем нажмите «Начать»</span>
          {:else if wsConnecting}
            <span class="wave"></span><span class="wave"></span><span class="wave"></span>
            <span class="listening-label">Подключение к DialogScribe...</span>
          {:else if wsConnected}
            <span class="wave"></span><span class="wave"></span><span class="wave"></span>
            <span class="listening-label">Слушаю микрофон...</span>
          {:else}
            <span class="listening-label">Нажмите «Начать» для подключения</span>
          {/if}
        </div>
      {:else if wsConnected}
        <div class="listening">
          <span class="wave"></span><span class="wave"></span><span class="wave"></span>
          <span class="listening-label">Слушаю…</span>
        </div>
      {/if}
    </div>

    <div class="audio-bar">
      <div class="audio-label">
        {#if isRecording}
          🎤 Микрофон{#if hasSystemAudio} + 🔊 Звук системы{/if}
        {:else}
          🎤 Микрофон
        {/if}
      </div>
      {#if isRecording && !hasSystemAudio}
        <button class="sys-audio-btn" on:click={enableSystemAudio}>
          🔊 Включить звук собеседника
        </button>
      {/if}
      {#if isRecording}
        <div class="audio-vis">
          {#each Array(18) as _, i}
            <div class="bar" style="animation-delay:{i * 0.07}s"></div>
          {/each}
        </div>
      {/if}
      <div class="audio-label">
        {#if hasSystemAudio}
          🎤 [Вы] · 🔊 [Клиент]
        {:else}
          🎤 [Вы] · нажмите кнопку для [Клиент]
        {/if}
      </div>
    </div>
  </div>

  <!-- Right: Live Advisor tips -->
  <div class="advisor-panel">
    <div class="advisor-header">
      <div class="advisor-title">⚡ Live Advisor Agent</div>
      <div class="advisor-sub">
        {#if wsConnecting}
          <span class="fetching">⟳ Подключение к WebSocket...</span>
        {:else if wsConnected}
          Советы через DialogScribe Live Hints
        {:else}
          Не подключено
        {/if}
      </div>
    </div>

    <div class="memory-chip">
      <span>🧠 Shared Memory:</span>
      <span class="memory-val">Профиль {meeting?.client ?? '—'} загружен</span>
    </div>

    {#if advisorCards.length === 0}
      <div class="waiting-tips">
        <div class="waiting-icon">👂</div>
        <p>Анализирую диалог…</p>
        <p class="hint">Советы появятся при обнаружении триггеров:<br/>цена · возражение · конкурент · вопрос</p>
      </div>
    {:else}
      <div class="tips-list">
        {#each advisorCards as card}
          <div
            class="tip-card"
            class:tip-loading={card.loading}
            style="border-color:{typeColors[card.type] || '#3b82f6'}33; background:{typeColors[card.type] || '#3b82f6'}0a"
          >
            <div class="tip-header">
              <span class="tip-badge" style="background:{typeColors[card.type] || '#3b82f6'}22; color:{typeColors[card.type] || '#3b82f6'}">
                {typeLabels[card.type] || card.type}
              </span>
              <span class="tip-title">{card.title}</span>
            </div>
            <p class="tip-advice">{card.advice}</p>
            <div class="tip-source">📎 {card.source}</div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="cascade-info">
      <div class="cascade-row">
        <span class="cascade-label">Быстрый слой</span>
        <span class="cascade-status" class:active={wsConnected}>
          Keyword classifier · {wsConnected ? 'активен' : 'ожидает'}
        </span>
      </div>
      <div class="cascade-row">
        <span class="cascade-label">Медленный слой</span>
        <span class="cascade-status" class:active={advisorCards.length > 0}>
          WS /api/live-hints · {advisorCards.length > 0 ? 'активен' : 'ожидает триггер'}
        </span>
      </div>
      <div class="cascade-row">
        <span class="cascade-label">Backend</span>
        <span class="cascade-status" class:active={wsConnected}>
          DialogScribe {wsConnected ? '🟢' : wsConnecting ? '🟡' : '🔴'}
        </span>
      </div>
    </div>
  </div>
</div>

<style>
  .live-layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 24px;
    height: 100%;
  }

  /* Transcript */
  .transcript-panel {
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid #1e2535;
    flex-shrink: 0;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #ef4444;
    letter-spacing: 0.5px;
  }

  .live-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #ef4444;
    animation: pulse 1.2s ease-in-out infinite;
  }
  .live-dot.connecting { background: #f59e0b }
  .live-dot.offline { background: #4b5a7a; animation: none }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1) }
    50%       { opacity: 0.5; transform: scale(0.8) }
  }

  .elapsed {
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #c8d0e7;
    flex: 1;
  }

  .end-btn {
    padding: 6px 14px;
    background: rgba(239,68,68,0.15);
    border: 1px solid rgba(239,68,68,0.3);
    color: #f87171;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .end-btn:hover { background: rgba(239,68,68,0.25) }

  .start-btn {
    padding: 6px 14px;
    background: rgba(16,185,129,0.15);
    border: 1px solid rgba(16,185,129,0.3);
    color: #34d399;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .start-btn:hover { background: rgba(16,185,129,0.25) }
  .start-btn:disabled { opacity: 0.5; cursor: not-allowed }

  .meeting-meta-bar {
    padding: 8px 20px;
    font-size: 12px;
    color: #4b5a7a;
    border-bottom: 1px solid #1e2535;
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .meeting-meta-bar strong { color: #6b7db3 }

  .ws-error {
    padding: 10px 20px;
    background: rgba(239,68,68,0.08);
    border-bottom: 1px solid rgba(239,68,68,0.2);
    font-size: 12px;
    color: #f87171;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .retry-btn {
    padding: 3px 10px;
    background: rgba(239,68,68,0.15);
    border: 1px solid rgba(239,68,68,0.3);
    color: #f87171;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .transcript-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .line {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 14px;
    background: #1e2535;
    border-radius: 10px;
    border-left: 3px solid #2d3a56;
    animation: fadeUp 0.3s ease;
  }
  .line.manager {
    border-left-color: #3b82f6;
    background: rgba(59,130,246,0.07);
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px) }
    to   { opacity: 1; transform: translateY(0) }
  }

  .speaker {
    font-size: 11px;
    font-weight: 600;
    color: #4b5a7a;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .line.manager .speaker { color: #3b82f6 }
  .text { font-size: 14px; color: #c8d0e7; line-height: 1.5 }

  .listening {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 14px;
    color: #4b5a7a;
    font-size: 13px;
  }
  .listening-label { margin-left: 4px }

  .waiting {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 20px 14px;
    color: #4b5a7a;
    font-size: 13px;
  }

  .wave {
    display: inline-block;
    width: 4px; height: 4px;
    background: #4b5a7a;
    border-radius: 50%;
    animation: bounce 1.2s ease-in-out infinite;
  }
  .wave:nth-child(2) { animation-delay: 0.2s }
  .wave:nth-child(3) { animation-delay: 0.4s }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0) }
    40%           { transform: scale(1) }
  }

  .audio-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-top: 1px solid #1e2535;
    flex-shrink: 0;
  }
  .audio-label { font-size: 11px; color: #4b5a7a; white-space: nowrap }
  .sys-audio-btn {
    padding: 4px 10px;
    background: rgba(59,130,246,0.15);
    border: 1px solid rgba(59,130,246,0.3);
    color: #60a5fa;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .sys-audio-btn:hover { background: rgba(59,130,246,0.25) }
  .audio-vis { display: flex; align-items: center; gap: 2px; flex: 1 }
  .bar {
    width: 3px;
    background: #3b82f6;
    border-radius: 2px;
    opacity: 0.6;
    height: 12px;
    animation: audioBar 0.8s ease-in-out infinite alternate;
  }
  @keyframes audioBar {
    from { transform: scaleY(0.3) }
    to   { transform: scaleY(1) }
  }

  /* Advisor panel */
  .advisor-panel {
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .advisor-header {
    padding: 16px 20px;
    border-bottom: 1px solid #1e2535;
    flex-shrink: 0;
  }
  .advisor-title { font-size: 15px; font-weight: 600; color: #e8eaed }
  .advisor-sub { font-size: 12px; color: #4b5a7a; margin-top: 2px }
  .fetching { color: #f59e0b; animation: blink 1s ease-in-out infinite }
  @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }

  .memory-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    border-bottom: 1px solid #1e2535;
    font-size: 12px;
    color: #4b5a7a;
    flex-shrink: 0;
  }
  .memory-val { color: #10b981; font-weight: 500 }

  .waiting-tips {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    color: #4b5a7a;
    font-size: 14px;
    text-align: center;
  }
  .waiting-icon { font-size: 32px; margin-bottom: 8px }
  .hint { font-size: 12px; color: #2d3a56; line-height: 1.6 }

  .tips-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tip-card {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid;
    animation: slideIn 0.35s ease;
  }
  .tip-card.tip-loading { opacity: 0.6 }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(10px) }
    to   { opacity: 1; transform: translateX(0) }
  }

  .tip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .tip-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .tip-title { font-size: 13px; font-weight: 600; color: #c8d0e7 }
  .tip-advice { font-size: 13px; color: #8896b3; line-height: 1.5; margin-bottom: 8px }
  .tip-source { font-size: 11px; color: #2d3a56 }

  .cascade-info {
    padding: 12px 16px;
    border-top: 1px solid #1e2535;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }
  .cascade-row { display: flex; align-items: center; justify-content: space-between; font-size: 11px }
  .cascade-label { color: #4b5a7a }
  .cascade-status { color: #2d3a56; font-weight: 500; transition: color 0.3s }
  .cascade-status.active { color: #10b981 }
</style>
