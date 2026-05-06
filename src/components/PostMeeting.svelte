<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import { transcribeFile, getSummary, getInsights } from '../lib/api.js'

  const dispatch = createEventDispatcher()
  export let meeting

  // ---- State machine ----
  // idle → uploading → transcribing → analyzing → done | error
  let phase = 'idle'
  let errorMsg = ''

  // Results
  let transcript  = ''
  let summaryText = ''
  let actionItems = []
  let decisions   = []
  let insights    = []

  // File upload
  let fileInput
  let uploadedFile = null
  let uploadedFileName = ''

  // ---- Demo mode: if no file selected, use mock data after 3s ----
  let demoMode = false

  function handleFileChange(e) {
    uploadedFile = e.target.files[0] ?? null
    uploadedFileName = uploadedFile?.name ?? ''
  }

  async function startProcessing() {
    if (!uploadedFile) {
      // Fall back to demo mode
      demoMode = true
      runDemo()
      return
    }
    demoMode = false
    await runReal()
  }

  // ---- Real pipeline ----
  async function runReal() {
    try {
      phase = 'transcribing'
      const result = await transcribeFile(uploadedFile, { language: 'ru', diarize: true })
      transcript = result.text

      phase = 'analyzing'
      // Fire summary + insights in parallel
      const [summaryData, insightsData] = await Promise.all([
        getSummary(transcript),
        getInsights(transcript),
      ])

      summaryText = summaryData?.summary ?? summaryData?.text ?? String(summaryData)
      actionItems = normaliseActionItems(insightsData?.action_items ?? summaryData?.action_items ?? [])
      decisions   = insightsData?.decisions ?? summaryData?.decisions ?? []
      insights    = insightsData?.insights  ?? []

      phase = 'done'
    } catch (e) {
      errorMsg = e.message
      phase = 'error'
    }
  }

  // ---- Demo fallback ----
  function runDemo() {
    phase = 'transcribing'
    setTimeout(() => {
      transcript = demoTranscript
      phase = 'analyzing'
      setTimeout(() => {
        summaryText = demoSummary
        actionItems = demoActionItems
        decisions   = demoDecisions
        phase = 'done'
      }, 1800)
    }, 1500)
  }

  // Normalise action items: string[] or {task, owner, priority}[]
  function normaliseActionItems(raw) {
    if (!Array.isArray(raw)) return []
    return raw.map((item, i) => {
      if (typeof item === 'string') {
        return { task: item, owner: 'Менеджер', priority: 'medium' }
      }
      return {
        task:     item.task ?? item.text ?? item.description ?? String(item),
        owner:    item.owner ?? item.assignee ?? 'Менеджер',
        priority: item.priority ?? 'medium',
        done:     false,
      }
    })
  }

  // ---- Export ----
  function exportTxt() {
    const content = [
      `Встреча: ${meeting?.client ?? ''}`,
      `Дата: ${new Date().toLocaleDateString('ru-RU')}`,
      '',
      '## Транскрипт',
      transcript,
      '',
      '## Саммари',
      summaryText,
      '',
      '## Задачи',
      ...actionItems.map(a => `- [${a.done ? 'x' : ' '}] ${a.task} (${a.owner})`),
      '',
      '## Ключевые решения',
      ...decisions.map(d => `- ${d}`),
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `meeting_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const priorityColor = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
  const priorityLabel = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }

  // ---- Demo data ----
  const demoTranscript = `Менеджер: Добрый день, Дмитрий! Рады видеть вас снова.
Клиент: Добрый день. Я изучил ваше предложение по логистическому модулю.
Клиент: Нас интересует интеграция с нашей текущей 1С. Это реально?
Менеджер: Да, у нас есть готовый коннектор для 1С:ERP.
Клиент: И ещё — сколько это будет стоить? У нас бюджет ограничен.
Менеджер: Стоимость зависит от объёма, давайте обсудим ваши потребности.
Клиент: Нас смущает SAP — они предложили более низкую цену.
Менеджер: Позвольте показать разницу в совокупной стоимости владения.`

  const demoSummary = `Встреча прошла продуктивно. Клиент подтвердил интерес к логистическому модулю и
интеграции с 1С:ERP. Основное возражение — конкурентное предложение SAP по цене.
Менеджер успешно применил TCO-аргументацию. Достигнута договорённость о демо-стенде.`

  const demoActionItems = [
    { owner: 'Алексей', task: 'Подготовить TCO-сравнение с SAP WM до 09.05', priority: 'high',   done: false },
    { owner: 'Алексей', task: 'Договориться о демо-стенде: предложить слот 13–14 мая',            priority: 'high',   done: false },
    { owner: 'Команда', task: 'Выслать документацию по коннектору 1С клиенту до 08.05',           priority: 'medium', done: false },
    { owner: 'Алексей', task: 'Уточнить итоговое ЛПР (Орлов vs Генеральный директор)',            priority: 'medium', done: false },
  ]

  const demoDecisions = [
    'Клиент готов рассматривать наше решение при условии демо',
    'Бюджет на Q3 есть, но требуется согласование ЛПР',
    'SAP — основной конкурент, ценовой аргумент критичен',
  ]

  const phaseLabel = {
    idle:         '',
    uploading:    'Загружаю файл…',
    transcribing: 'Транскрибирую запись…',
    analyzing:    'Генерирую саммари и инсайты…',
    done:         '',
    error:        '',
  }
  const phaseTools = {
    transcribing: ['transcribe_file — Mistral Voxtral + pyannote diarization'],
    analyzing:    ['POST /api/summary — GigaChat Max', 'POST /api/insights — GigaChat Max'],
  }
</script>

<div class="post-layout">
  <div class="post-header">
    <button class="back-btn" on:click={() => dispatch('back')}>← Назад</button>
    <div class="post-title">
      <div class="post-heading">Итоги встречи</div>
      <div class="post-sub">{meeting?.client ?? '—'} · {meeting?.contact ?? ''}</div>
    </div>
    {#if phase === 'done'}
      <button class="export-btn" on:click={exportTxt}>⬇ Экспорт TXT</button>
    {/if}
  </div>

  <!-- Upload / Start panel -->
  {#if phase === 'idle'}
    <div class="upload-panel">
      <div class="upload-icon">🎙️</div>
      <h3>Загрузите запись встречи</h3>
      <p class="upload-hint">MP3, MP4, WAV, M4A, WEBM · до 100 МБ<br/>
        Транскрипция через <strong>Mistral Voxtral</strong> + диаризация спикеров</p>

      <label class="file-label">
        <input
          type="file"
          accept="audio/*,video/*"
          bind:this={fileInput}
          on:change={handleFileChange}
        />
        {#if uploadedFileName}
          <span class="file-chosen">📎 {uploadedFileName}</span>
        {:else}
          <span>Выбрать файл</span>
        {/if}
      </label>

      <div class="upload-actions">
        <button class="btn btn-primary" on:click={startProcessing}>
          {uploadedFile ? '▶ Начать обработку' : '▶ Демо-режим (без файла)'}
        </button>
      </div>

      {#if !uploadedFile}
        <p class="demo-note">Без файла запустится демо с mock-данными</p>
      {/if}
    </div>

  <!-- Processing -->
  {:else if phase !== 'done' && phase !== 'error'}
    <div class="processing-state">
      <div class="proc-spinner"></div>
      <p class="proc-phase">{phaseLabel[phase]}</p>

      <div class="proc-steps">
        <div class="proc-step" class:active={phase === 'transcribing'} class:done={phase === 'analyzing' || phase === 'done'}>
          <span class="step-icon">{phase === 'analyzing' || phase === 'done' ? '✓' : phase === 'transcribing' ? '⟳' : '·'}</span>
          transcribe_file — транскрипция{demoMode ? ' (demo)' : ' · Mistral Voxtral'}
        </div>
        <div class="proc-step" class:active={phase === 'analyzing'}>
          <span class="step-icon">{phase === 'analyzing' ? '⟳' : '·'}</span>
          Параллельно: /api/summary · /api/insights
        </div>
        <div class="proc-step">
          <span class="step-icon">·</span>
          Сохранение результатов
        </div>
      </div>
    </div>

  <!-- Error -->
  {:else if phase === 'error'}
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <p class="error-msg">{errorMsg}</p>
      <div class="error-actions">
        <button class="btn btn-secondary" on:click={() => { phase = 'idle'; errorMsg = '' }}>
          ← Попробовать снова
        </button>
        <button class="btn btn-ghost" on:click={() => { demoMode = true; runDemo() }}>
          Запустить демо
        </button>
      </div>
    </div>

  <!-- Results -->
  {:else}
    <div class="results-grid">
      <!-- Summary -->
      <div class="result-card wide">
        <div class="card-header">
          <span class="card-icon">📝</span>
          <span class="card-title">Саммари встречи</span>
          <span class="card-badge">{demoMode ? 'Demo' : 'POST /api/summary'}</span>
        </div>
        <p class="summary-text">{summaryText}</p>
      </div>

      <!-- Action items -->
      <div class="result-card">
        <div class="card-header">
          <span class="card-icon">✅</span>
          <span class="card-title">Action Items</span>
          <span class="count">{actionItems.length}</span>
        </div>
        <div class="action-list">
          {#each actionItems as item}
            <label class="action-item">
              <div class="action-left">
                <input type="checkbox" class="checkbox" bind:checked={item.done} />
                <div>
                  <div class="action-task" class:done-task={item.done}>{item.task}</div>
                  <div class="action-owner">👤 {item.owner}</div>
                </div>
              </div>
              <span class="priority-badge"
                style="color:{priorityColor[item.priority]}; border-color:{priorityColor[item.priority]}44; background:{priorityColor[item.priority]}11">
                {priorityLabel[item.priority] ?? item.priority}
              </span>
            </label>
          {/each}
        </div>
      </div>

      <!-- Key decisions -->
      <div class="result-card">
        <div class="card-header">
          <span class="card-icon">🔑</span>
          <span class="card-title">Ключевые решения</span>
        </div>
        <ul class="decisions-list">
          {#each decisions as d}
            <li>{d}</li>
          {/each}
          {#each insights as ins}
            <li class="insight-item">{ins}</li>
          {/each}
          {#if decisions.length === 0 && insights.length === 0}
            <li class="empty">Нет данных</li>
          {/if}
        </ul>
      </div>

      <!-- Transcript (collapsible) -->
      <div class="result-card wide">
        <details>
          <summary class="card-header transcript-summary">
            <span class="card-icon">🔤</span>
            <span class="card-title">Транскрипт</span>
            <span class="card-badge">{demoMode ? 'Demo' : 'Mistral Voxtral'}</span>
          </summary>
          <pre class="transcript-text">{transcript}</pre>
        </details>
      </div>

      <!-- Metadata -->
      <div class="meta-bar">
        <span>{demoMode ? '🟡 Demo-режим' : '🟢 DialogScribe API'}</span>
        <span>🗓 {new Date().toLocaleDateString('ru-RU')}</span>
        <span>🔤 {transcript.split(' ').length} слов</span>
        <span>✅ {actionItems.filter(a => a.done).length}/{actionItems.length} задач выполнено</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .post-layout {
    display: flex;
    flex-direction: column;
    gap: 20px;
    height: 100%;
  }

  .post-header {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .back-btn {
    background: #1e2535;
    border: 1px solid #252e42;
    color: #6b7db3;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .back-btn:hover { color: #c8d0e7; background: #252e42 }

  .post-title { flex: 1 }
  .post-heading { font-size: 18px; font-weight: 600; color: #e8eaed }
  .post-sub { font-size: 13px; color: #4b5a7a; margin-top: 2px }

  .export-btn {
    background: #1e2535;
    border: 1px solid #252e42;
    color: #6b7db3;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .export-btn:hover { color: #c8d0e7 }

  /* Upload panel */
  .upload-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 16px;
    padding: 40px;
    text-align: center;
  }

  .upload-icon { font-size: 40px }

  .upload-panel h3 {
    font-size: 18px;
    font-weight: 600;
    color: #e8eaed;
    margin: 0;
  }

  .upload-hint {
    font-size: 13px;
    color: #4b5a7a;
    line-height: 1.6;
    margin: 0;
  }

  .upload-hint strong { color: #6b7db3 }

  .file-label {
    display: inline-block;
    padding: 8px 20px;
    background: #1e2535;
    border: 1px solid #252e42;
    border-radius: 8px;
    color: #8896b3;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .file-label:hover { background: #252e42; color: #c8d0e7 }
  .file-label input { display: none }
  .file-chosen { color: #10b981 }

  .upload-actions { display: flex; gap: 10px }

  .btn {
    padding: 9px 20px;
    border-radius: 8px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-primary {
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: #fff;
  }
  .btn-primary:hover { opacity: 0.9; transform: translateY(-1px) }

  .btn-secondary {
    background: #1e2535;
    color: #c8d0e7;
    border: 1px solid #252e42;
  }
  .btn-ghost {
    background: transparent;
    color: #4b5a7a;
    border: 1px solid transparent;
  }
  .btn-ghost:hover { color: #6b7db3 }

  .demo-note { font-size: 11px; color: #2d3a56; margin: 0 }

  /* Processing */
  .processing-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 20px;
    color: #6b7db3;
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 16px;
    padding: 40px;
  }

  .proc-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #1e2535;
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg) } }

  .proc-phase { font-size: 14px; color: #8896b3; font-weight: 500 }

  .proc-steps { display: flex; flex-direction: column; gap: 8px; text-align: left }

  .proc-step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #2d3a56;
    padding: 6px 12px;
    border-radius: 8px;
    transition: all 0.3s;
  }
  .proc-step.active { color: #8b5cf6; background: rgba(139,92,246,0.08) }
  .proc-step.done   { color: #10b981 }
  .step-icon { font-size: 12px; width: 16px; text-align: center }

  /* Error */
  .error-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: #161b27;
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 16px;
    padding: 40px;
    text-align: center;
  }
  .error-icon { font-size: 36px }
  .error-msg { font-size: 13px; color: #f87171; max-width: 420px; line-height: 1.5 }
  .error-actions { display: flex; gap: 10px }

  /* Results */
  .results-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    overflow-y: auto;
    padding-bottom: 8px;
  }

  .result-card {
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 14px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: fadeUp 0.4s ease;
  }
  .result-card.wide { grid-column: 1 / -1 }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px) }
    to   { opacity: 1; transform: translateY(0) }
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card-icon { font-size: 16px }
  .card-title { font-size: 14px; font-weight: 600; color: #c8d0e7; flex: 1 }
  .card-badge {
    font-size: 10px;
    background: rgba(139,92,246,0.15);
    color: #a78bfa;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }
  .count {
    font-size: 12px;
    background: #1e2535;
    color: #6b7db3;
    width: 20px; height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }

  .summary-text { font-size: 14px; color: #8896b3; line-height: 1.65 }

  .action-list { display: flex; flex-direction: column; gap: 8px }

  .action-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    background: #1e2535;
    border-radius: 8px;
    cursor: pointer;
  }
  .action-left { display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0 }
  .checkbox { margin-top: 2px; flex-shrink: 0; accent-color: #3b82f6 }
  .action-task { font-size: 13px; color: #c8d0e7; line-height: 1.4; transition: all 0.2s }
  .action-task.done-task { text-decoration: line-through; color: #4b5a7a }
  .action-owner { font-size: 11px; color: #4b5a7a; margin-top: 2px }

  .priority-badge {
    font-size: 10px; font-weight: 600;
    padding: 2px 7px; border-radius: 4px;
    border: 1px solid; white-space: nowrap; flex-shrink: 0;
  }

  .decisions-list { list-style: none; display: flex; flex-direction: column; gap: 8px }
  .decisions-list li {
    font-size: 13px; color: #8896b3;
    padding-left: 14px; position: relative; line-height: 1.5;
  }
  .decisions-list li::before { content: '›'; position: absolute; left: 0; color: #3b82f6; font-weight: 700 }
  .insight-item { color: #6b7db3 !important }
  .empty { color: #2d3a56 !important; font-style: italic }

  /* Transcript */
  .transcript-summary {
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .transcript-summary::-webkit-details-marker { display: none }

  .transcript-text {
    margin-top: 12px;
    font-size: 12px;
    color: #6b7db3;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    background: #1e2535;
    border-radius: 8px;
    padding: 12px 14px;
    max-height: 300px;
    overflow-y: auto;
  }

  .meta-bar {
    grid-column: 1 / -1;
    display: flex;
    gap: 20px;
    font-size: 12px;
    color: #4b5a7a;
    padding: 10px 16px;
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 10px;
    flex-wrap: wrap;
  }
</style>
