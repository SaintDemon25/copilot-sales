<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'

  const dispatch = createEventDispatcher()
  export let meeting

  // ---- Simulated transcript stream ----
  const transcriptLines = [
    { speaker: 'Менеджер', text: 'Добрый день, Дмитрий! Рады видеть вас снова.' },
    { speaker: 'Клиент',   text: 'Добрый день. Я изучил ваше предложение по логистическому модулю.' },
    { speaker: 'Клиент',   text: 'Нас интересует интеграция с нашей текущей 1С. Это реально?' },
    { speaker: 'Менеджер', text: 'Да, у нас есть готовый коннектор для 1С:ERP. Могу показать?' },
    { speaker: 'Клиент',   text: 'Покажите. И ещё — сколько это будет стоить? У нас бюджет ограничен.' },
    { speaker: 'Менеджер', text: 'Стоимость зависит от объёма, давайте обсудим ваши потребности.' },
    { speaker: 'Клиент',   text: 'Нас смущает SAP — они предложили более низкую цену.' },
    { speaker: 'Менеджер', text: 'Понимаю. Позвольте показать разницу в совокупной стоимости владения.' },
  ]

  let displayedLines = []
  let currentIdx = 0
  let advisorCards = []
  let elapsed = 0
  let timerInterval

  const advisorTips = [
    {
      trigger: 2,
      type: 'question',
      title: 'Вопрос об интеграции',
      advice: 'Клиент спросил об интеграции с 1С. Уточните: какая версия 1С? Есть ли внутренний ИТ-отдел для поддержки?',
      source: 'shared_memory: профиль клиента',
    },
    {
      trigger: 4,
      type: 'price',
      title: 'Возражение по цене',
      advice: 'Клиент обозначил ограниченный бюджет. Переходите к TCO-аргументации: наш модуль окупается за 8–12 мес. за счёт сокращения ручного труда на 40%.',
      source: 'competency_tips: ценовые возражения',
    },
    {
      trigger: 6,
      type: 'competitor',
      title: 'Упомянут конкурент: SAP',
      advice: 'SAP WM — тяжёлое решение. Ключевые преимущества: время внедрения 3 мес. vs 12–18 у SAP; нет скрытых лицензий; поддержка госзакупок (ЕИС) из коробки.',
      source: 'shared_memory: конкуренты',
    },
  ]

  onMount(() => {
    const lineTimer = setInterval(() => {
      if (currentIdx < transcriptLines.length) {
        displayedLines = [...displayedLines, transcriptLines[currentIdx]]
        const tip = advisorTips.find(t => t.trigger === currentIdx)
        if (tip) advisorCards = [tip, ...advisorCards].slice(0, 4)
        currentIdx++
      }
    }, 2200)

    timerInterval = setInterval(() => elapsed++, 1000)

    return () => { clearInterval(lineTimer); clearInterval(timerInterval) }
  })

  function fmtElapsed(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const typeColors = { question: '#3b82f6', price: '#f59e0b', competitor: '#ef4444' }
  const typeLabels = { question: 'Вопрос', price: 'Цена', competitor: 'Конкурент' }
</script>

<div class="live-layout">
  <!-- Left: transcript -->
  <div class="transcript-panel">
    <div class="panel-head">
      <div class="live-indicator">
        <span class="live-dot"></span> В ЭФИРЕ
      </div>
      <div class="elapsed">{fmtElapsed(elapsed)}</div>
      <button class="end-btn" on:click={() => dispatch('endMeeting')}>
        ⏹ Завершить
      </button>
    </div>

    <div class="meeting-meta-bar">
      <strong>{meeting?.client ?? '—'}</strong>
      <span>·</span>
      <span>{meeting?.contact ?? ''}</span>
    </div>

    <div class="transcript-scroll">
      {#each displayedLines as line, i}
        <div class="line" class:manager={line.speaker === 'Менеджер'}>
          <span class="speaker">{line.speaker}</span>
          <span class="text">{line.text}</span>
        </div>
      {/each}

      {#if currentIdx < transcriptLines.length}
        <div class="listening">
          <span class="wave"></span><span class="wave"></span><span class="wave"></span>
          <span class="listening-label">Слушаю…</span>
        </div>
      {/if}
    </div>

    <div class="audio-bar">
      <div class="audio-label">🎤 AssemblyAI Streaming</div>
      <div class="audio-vis">
        {#each Array(18) as _, i}
          <div class="bar" style="height:{8 + Math.random() * 20}px; animation-delay:{i * 0.07}s"></div>
        {/each}
      </div>
      <div class="audio-label">transcribe_stream активен</div>
    </div>
  </div>

  <!-- Right: Live Advisor tips -->
  <div class="advisor-panel">
    <div class="advisor-header">
      <div class="advisor-title">⚡ Live Advisor Agent</div>
      <div class="advisor-sub">Советы в реальном времени</div>
    </div>

    <div class="memory-chip">
      <span>🧠 Shared Memory:</span>
      <span class="memory-val">Профиль {meeting?.client ?? '—'} загружен</span>
    </div>

    {#if advisorCards.length === 0}
      <div class="waiting-tips">
        <div class="waiting-icon">👂</div>
        <p>Анализирую диалог…</p>
        <p class="hint">Советы появятся при обнаружении ключевых маркеров</p>
      </div>
    {:else}
      <div class="tips-list">
        {#each advisorCards as card}
          <div class="tip-card" style="border-color:{typeColors[card.type]}33; background:{typeColors[card.type]}0a">
            <div class="tip-header">
              <span class="tip-badge" style="background:{typeColors[card.type]}22; color:{typeColors[card.type]}">
                {typeLabels[card.type]}
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
        <span class="cascade-status active">GigaChat Lite · классификация</span>
      </div>
      <div class="cascade-row">
        <span class="cascade-label">Медленный слой</span>
        <span class="cascade-status" class:active={advisorCards.length > 0}>
          GigaChat Max · {advisorCards.length > 0 ? 'генерирует советы' : 'ожидает триггер'}
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

  /* Transcript panel */
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
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1) }
    50% { opacity: 0.5; transform: scale(0.8) }
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
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .end-btn:hover { background: rgba(239, 68, 68, 0.25) }

  .meeting-meta-bar {
    padding: 8px 20px;
    font-size: 12px;
    color: #4b5a7a;
    border-bottom: 1px solid #1e2535;
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .meeting-meta-bar strong {
    color: #6b7db3;
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
    background: rgba(59, 130, 246, 0.07);
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

  .line.manager .speaker {
    color: #3b82f6;
  }

  .text {
    font-size: 14px;
    color: #c8d0e7;
    line-height: 1.5;
  }

  .listening {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 14px;
    color: #4b5a7a;
    font-size: 13px;
  }

  .listening-label {
    margin-left: 4px;
  }

  .wave {
    display: inline-block;
    width: 4px;
    height: 4px;
    background: #4b5a7a;
    border-radius: 50%;
    animation: bounce 1.2s ease-in-out infinite;
  }

  .wave:nth-child(2) { animation-delay: 0.2s }
  .wave:nth-child(3) { animation-delay: 0.4s }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0) }
    40% { transform: scale(1) }
  }

  .audio-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-top: 1px solid #1e2535;
    flex-shrink: 0;
  }

  .audio-label {
    font-size: 11px;
    color: #4b5a7a;
    white-space: nowrap;
  }

  .audio-vis {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
  }

  .bar {
    width: 3px;
    background: #3b82f6;
    border-radius: 2px;
    opacity: 0.6;
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

  .advisor-title {
    font-size: 15px;
    font-weight: 600;
    color: #e8eaed;
  }

  .advisor-sub {
    font-size: 12px;
    color: #4b5a7a;
    margin-top: 2px;
  }

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

  .memory-val {
    color: #10b981;
    font-weight: 500;
  }

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

  .waiting-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .hint {
    font-size: 12px;
    color: #2d3a56;
  }

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
    animation: slideIn 0.3s ease;
  }

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

  .tip-title {
    font-size: 13px;
    font-weight: 600;
    color: #c8d0e7;
  }

  .tip-advice {
    font-size: 13px;
    color: #8896b3;
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .tip-source {
    font-size: 11px;
    color: #2d3a56;
  }

  .cascade-info {
    padding: 12px 16px;
    border-top: 1px solid #1e2535;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .cascade-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
  }

  .cascade-label {
    color: #4b5a7a;
  }

  .cascade-status {
    color: #2d3a56;
    font-weight: 500;
    transition: color 0.3s;
  }

  .cascade-status.active {
    color: #10b981;
  }
</style>
