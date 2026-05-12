<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import { transcribeFile, getSummary } from '../lib/api.js'

  const dispatch = createEventDispatcher()
  export let meeting
  export let liveTranscript = ''
  export let liveDuration = 0

  let phase = 'idle'
  let errorMsg = ''

  let transcript = ''
  let summaryText = ''
  let sections = { summary: '', nextSteps: '', objections: '', clientSignals: '', dealAssessment: '' }
  let actionItems = []

  let fileInput
  let uploadedFile = null
  let uploadedFileName = ''
  let source = 'demo'

  $: hasLiveTranscript = liveTranscript && liveTranscript.trim().length > 0

  function handleFileChange(e) {
    uploadedFile = e.target.files[0] ?? null
    uploadedFileName = uploadedFile?.name ?? ''
  }

  async function startProcessing() {
    if (!uploadedFile) {
      source = 'demo'
      runDemo()
      return
    }
    source = 'upload'
    await runReal()
  }

  async function runReal() {
    try {
      phase = 'transcribing'
      const result = await transcribeFile(uploadedFile, { language: 'ru', diarize: true })
      transcript = result.text
      phase = 'analyzing'
      await analyze()
    } catch (e) {
      errorMsg = e.message
      phase = 'error'
    }
  }

  async function runFromLiveTranscript() {
    try {
      source = 'live'
      phase = 'analyzing'
      transcript = liveTranscript
      await analyze()
    } catch (e) {
      errorMsg = e.message
      phase = 'error'
    }
  }

  async function analyze() {
    const summaryData = await getSummary(transcript, { template_key: 'sales' })
    summaryText = summaryData?.summary ?? summaryData?.text ?? String(summaryData)
    sections = parseSections(summaryText)
    actionItems = parseActionItems(sections.nextSteps)
    phase = 'done'
  }

  // ---- Section parser ----
  function parseSections(md) {
    const result = { summary: '', nextSteps: '', objections: '', clientSignals: '', dealAssessment: '', full: md }
    if (!md) return result

    const parts = md.split(/^## /gm)
    for (const part of parts) {
      const nl = part.indexOf('\n')
      if (nl === -1) continue
      const header = part.substring(0, nl).trim().toLowerCase()
        .replace(/^[\p{Emoji_Presentation}\p{Emoji}️‍\s#]+/u, '')
      const content = part.substring(nl + 1).trim()
      if (!content) continue

      if (header.includes('резюме') || header.includes('итог') || header.includes('обзор')) {
        result.summary = content
      } else if (header.includes('шаг') || header.includes('задач') || header.includes('action')) {
        result.nextSteps = content
      } else if (header.includes('возражен')) {
        result.objections = content
      } else if (header.includes('сигнал')) {
        result.clientSignals = content
      } else if (header.includes('оценк') || header.includes('сделк') || header.includes('воронк')) {
        result.dealAssessment = content
      }
    }

    if (!result.summary && !result.nextSteps && !result.dealAssessment) {
      result.summary = md
    }

    return result
  }

  // ---- Action items parser ----
  function parseActionItems(stepsMarkdown) {
    if (!stepsMarkdown) return []
    const lines = stepsMarkdown.split('\n').filter(l => l.trim().startsWith('-'))
    return lines.map(line => {
      const text = line.replace(/^-\s*/, '').trim()
      const ownerMatch = text.match(/\*\*\[(.+?)\]\*\*/)
      const owner = ownerMatch ? ownerMatch[1] : 'Менеджер'
      const priorityMatch = text.match(/приоритет:\s*(высокий|средний|низкий)/i)
      const priority = priorityMatch
        ? ({ 'высокий': 'high', 'средний': 'medium', 'низкий': 'low' }[priorityMatch[1].toLowerCase()] ?? 'medium')
        : 'medium'
      const task = text
        .replace(/\*\*\[.+?\]\*\*\s*/, '')
        .replace(/·?\s*[Пп]риоритет:.*$/i, '')
        .replace(/·\s*$/,'')
        .trim()
      return { task, owner, priority, done: false }
    })
  }

  // ---- Demo ----
  function runDemo() {
    phase = 'transcribing'
    setTimeout(() => {
      transcript = demoTranscript
      phase = 'analyzing'
      setTimeout(() => {
        summaryText = demoSalesSummary
        sections = parseSections(summaryText)
        actionItems = parseActionItems(sections.nextSteps)
        phase = 'done'
      }, 1800)
    }, 1500)
  }

  function toast(message, type = 'info') {
    dispatch('toast', { message, type })
  }

  function renderMarkdown(md) {
    if (!md) return ''
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h4 class="md-h">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 class="md-h">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 class="md-h">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.+)$/, '<p>$1</p>')
      .replace(/<p>\s*<\/p>/g, '')
  }

  function copyToClipboard(text, label) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(`${label} скопировано`, 'success')).catch(() => fallbackCopy(text, label))
    } else {
      fallbackCopy(text, label)
    }
  }

  function fallbackCopy(text, label) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); toast(`${label} скопировано`, 'success') }
    catch { toast('Не удалось скопировать', 'error') }
    document.body.removeChild(ta)
  }

  function fmtDuration(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  function resetToIdle() {
    phase = 'idle'
    errorMsg = ''
    transcript = ''
    summaryText = ''
    sections = { summary: '', nextSteps: '', objections: '', clientSignals: '', dealAssessment: '' }
    actionItems = []
    uploadedFile = null
    uploadedFileName = ''
    source = 'demo'
  }

  function exportTxt() {
    const content = [
      `Встреча: ${meeting?.client ?? ''}`,
      `Дата: ${new Date().toLocaleDateString('ru-RU')}`,
      source === 'live' ? `Длительность: ${fmtDuration(liveDuration)}` : '',
      '', '---', '',
      summaryText,
      '', '---', '',
      '## Транскрипт', transcript,
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meeting_${meeting?.client ?? 'report'}_${new Date().toISOString().slice(0,10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const priorityColor = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
  const priorityLabel = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }

  const demoTranscript = `[Вы]: Добрый день, Дмитрий! Рады видеть вас снова.
[Оппонент]: Добрый день. Я изучил ваше предложение по логистическому модулю.
[Оппонент]: Нас интересует интеграция с нашей текущей 1С. Это реально?
[Вы]: Да, у нас есть готовый коннектор для 1С:ERP. Интеграция занимает 2 недели.
[Оппонент]: И ещё — сколько это будет стоить? У нас бюджет ограничен.
[Вы]: Стоимость зависит от объёма. Базовый модуль — от 800 тысяч в год.
[Оппонент]: Нас смущает SAP — они предложили более низкую цену.
[Вы]: Позвольте показать разницу в совокупной стоимости владения. SAP требует в 3 раза больше на внедрение.
[Оппонент]: Убедительно. Давайте организуем демо для нашего IT-директора.
[Вы]: Отлично! Предлагаю слот на следующей неделе, 13 или 14 мая.`

  const demoSalesSummary = `## Резюме
Продуктивная встреча с Дмитрием (ООО «ЛогиТрейд»). Клиент подтвердил интерес к логистическому модулю и интеграции с 1С:ERP. Основное возражение — конкурентное предложение SAP по цене. Менеджер успешно применил TCO-аргументацию. Договорились о демо для IT-директора.

## Следующие шаги
- **[Менеджер]** Подготовить TCO-сравнение с SAP WM · _до 12.05_ · Приоритет: высокий
- **[Менеджер]** Организовать демо-стенд: согласовать слот 13–14 мая с IT-директором · Приоритет: высокий
- **[Команда]** Выслать документацию по коннектору 1С клиенту · _до 11.05_ · Приоритет: средний
- **[Менеджер]** Уточнить ЛПР: Дмитрий или генеральный директор принимает решение · Приоритет: средний

## Возражения
- **Возражение**: SAP предложил более низкую цену → **Ответ**: Менеджер показал разницу в TCO — SAP требует в 3 раза больше на внедрение. Клиент принял аргумент.
- **Возражение**: Ограниченный бюджет → **Ответ**: Менеджер озвучил базовую стоимость (от 800 тыс./год), но не предложил гибкую схему оплаты. Стоит проработать.

## Сигналы клиента
- **Интерес**: Клиент сам инициировал обсуждение интеграции с 1С — высокая вовлечённость
- **Боль**: Потребность в логистическом модуле, текущая система не справляется
- **Готовность**: Запросил демо для IT-директора — покупательский сигнал
- **Сомнения**: Ценовое сравнение с SAP — требует дополнительной аргументации

## Оценка сделки
- **Этап воронки**: Работа с возражениями → переход к презентации (демо)
- **Вероятность закрытия**: 65% — клиент заинтересован, но ещё не вовлечён ЛПР
- **Риски**: SAP может дать агрессивный контроффер; бюджетные ограничения на Q3
- **Рекомендация**: Провести демо с IT-директором максимально быстро, подготовить ROI-расчёт под специфику клиента`

  const sourceLabels = {
    live: 'Live-транскрипт',
    demo: 'Demo-режим',
    upload: 'DialogScribe API',
  }

  onMount(() => {
    if (hasLiveTranscript) runFromLiveTranscript()
  })
</script>

<div class="post-layout">
  <div class="post-header">
    <button class="back-btn" on:click={() => dispatch('back')}>← Назад</button>
    <div class="post-title">
      <div class="post-heading">Итоги встречи</div>
      <div class="post-sub">{meeting?.client ?? '—'} · {meeting?.contact ?? ''}</div>
    </div>
    {#if hasLiveTranscript && liveDuration > 0}
      <div class="duration-badge">{fmtDuration(liveDuration)}</div>
    {/if}
    {#if phase === 'done'}
      <button class="export-btn" on:click={exportTxt}>Экспорт</button>
      <button class="copy-all-btn" on:click={() => copyToClipboard(summaryText, 'Отчёт')}>Копировать</button>
    {/if}
  </div>

  <!-- Upload -->
  {#if phase === 'idle' && !hasLiveTranscript}
    <div class="upload-panel">
      <div class="upload-icon">🎙️</div>
      <h3>Загрузите запись встречи</h3>
      <p class="upload-hint">MP3, MP4, WAV, M4A, WEBM · до 100 МБ<br/>
        Транскрипция через <strong>Mistral Voxtral</strong> + диаризация</p>
      <label class="file-label">
        <input type="file" accept="audio/*,video/*" bind:this={fileInput} on:change={handleFileChange} />
        {#if uploadedFileName}
          <span class="file-chosen">{uploadedFileName}</span>
        {:else}
          <span>Выбрать файл</span>
        {/if}
      </label>
      <div class="upload-actions">
        <button class="btn btn-primary" on:click={startProcessing}>
          {uploadedFile ? 'Начать обработку' : 'Демо-режим'}
        </button>
      </div>
      {#if !uploadedFile}
        <p class="demo-note">Без файла запустится демо с mock-данными</p>
      {/if}
    </div>

  {:else if phase === 'idle' && hasLiveTranscript}
    <div class="processing-state">
      <div class="proc-spinner"></div>
      <p class="proc-phase">Подготовка транскрипта...</p>
    </div>

  <!-- Processing -->
  {:else if phase !== 'done' && phase !== 'error'}
    <div class="processing-state">
      <div class="proc-spinner"></div>
      <p class="proc-phase">{phase === 'transcribing' ? 'Транскрибирую запись...' : 'Генерирую отчёт по продаже...'}</p>
      <div class="proc-steps">
        {#if source === 'live'}
          <div class="proc-step done">
            <span class="step-icon">✓</span>
            Транскрипт из live-сессии ({liveTranscript.split('\n').filter(l => l.trim()).length} реплик)
          </div>
        {:else}
          <div class="proc-step" class:active={phase === 'transcribing'} class:done={phase === 'analyzing'}>
            <span class="step-icon">{phase === 'analyzing' ? '✓' : '⟳'}</span>
            Транскрипция{source === 'demo' ? ' (demo)' : ''}
          </div>
        {/if}
        <div class="proc-step" class:active={phase === 'analyzing'}>
          <span class="step-icon">{phase === 'analyzing' ? '⟳' : '·'}</span>
          Анализ продажи: резюме, шаги, возражения, оценка
        </div>
      </div>
    </div>

  <!-- Error -->
  {:else if phase === 'error'}
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <p class="error-msg">{errorMsg}</p>
      <div class="error-actions">
        <button class="btn btn-secondary" on:click={resetToIdle}>Попробовать снова</button>
        {#if hasLiveTranscript}
          <button class="btn btn-ghost" on:click={runFromLiveTranscript}>Повторить анализ</button>
        {/if}
      </div>
    </div>

  <!-- Results -->
  {:else}
    <div class="results-grid">
      <!-- Summary -->
      <div class="result-card wide summary-card">
        <div class="card-header">
          <span class="card-title">Резюме</span>
          <button class="copy-btn" on:click={() => copyToClipboard(sections.summary || summaryText, 'Резюме')}>Копировать</button>
        </div>
        <div class="summary-text">{@html renderMarkdown(sections.summary || summaryText)}</div>
      </div>

      <!-- Next Steps -->
      <div class="result-card steps-card">
        <div class="card-header">
          <span class="card-title">Следующие шаги</span>
          <span class="count">{actionItems.length}</span>
        </div>
        {#if actionItems.length > 0}
          <div class="action-list">
            {#each actionItems as item}
              <label class="action-item">
                <div class="action-left">
                  <input type="checkbox" class="checkbox" bind:checked={item.done} />
                  <div>
                    <div class="action-task" class:done-task={item.done}>{item.task}</div>
                    <div class="action-meta">
                      <span class="action-owner">{item.owner}</span>
                      <span class="priority-dot" style="background:{priorityColor[item.priority] ?? '#f59e0b'}"></span>
                      <span class="priority-text" style="color:{priorityColor[item.priority] ?? '#f59e0b'}">{priorityLabel[item.priority] ?? 'Средний'}</span>
                    </div>
                  </div>
                </div>
              </label>
            {/each}
          </div>
        {:else if sections.nextSteps}
          <div class="section-md">{@html renderMarkdown(sections.nextSteps)}</div>
        {:else}
          <div class="empty-section">Задачи не выявлены</div>
        {/if}
      </div>

      <!-- Deal Assessment -->
      <div class="result-card deal-card">
        <div class="card-header">
          <span class="card-title">Оценка сделки</span>
        </div>
        {#if sections.dealAssessment}
          <div class="section-md deal-md">{@html renderMarkdown(sections.dealAssessment)}</div>
        {:else}
          <div class="empty-section">Нет данных для оценки</div>
        {/if}
      </div>

      <!-- Objections -->
      <div class="result-card objections-card">
        <div class="card-header">
          <span class="card-title">Возражения</span>
        </div>
        {#if sections.objections}
          <div class="section-md">{@html renderMarkdown(sections.objections)}</div>
        {:else}
          <div class="empty-section">Возражений не выявлено</div>
        {/if}
      </div>

      <!-- Client Signals -->
      <div class="result-card signals-card">
        <div class="card-header">
          <span class="card-title">Сигналы клиента</span>
        </div>
        {#if sections.clientSignals}
          <div class="section-md">{@html renderMarkdown(sections.clientSignals)}</div>
        {:else}
          <div class="empty-section">Сигналы не обнаружены</div>
        {/if}
      </div>

      <!-- Transcript -->
      <div class="result-card wide">
        <details>
          <summary class="card-header transcript-toggle">
            <span class="card-title">Транскрипт</span>
            <span class="card-badge">{sourceLabels[source] ?? 'API'}</span>
            <span class="toggle-icon">▸</span>
          </summary>
          <pre class="transcript-text">{transcript}</pre>
        </details>
      </div>

      <!-- Meta -->
      <div class="meta-bar">
        <span>{sourceLabels[source] ?? 'API'}</span>
        {#if source === 'live'}<span>{fmtDuration(liveDuration)}</span>{/if}
        <span>{new Date().toLocaleDateString('ru-RU')}</span>
        <span>{transcript.split(' ').length} слов</span>
        {#if actionItems.length > 0}
          <span>{actionItems.filter(a => a.done).length}/{actionItems.length} задач</span>
        {/if}
      </div>

      {#if source === 'live'}
        <div class="meta-bar" style="justify-content: center">
          <button class="manual-upload-link" on:click={resetToIdle}>
            Загрузить другую запись вручную
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .post-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
  }

  /* Header */
  .post-header {
    display: flex;
    align-items: center;
    gap: 12px;
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
  .duration-badge {
    font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
    color: #10b981; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25);
    padding: 4px 10px; border-radius: 6px; flex-shrink: 0;
  }
  .export-btn, .copy-all-btn {
    background: #1e2535; border: 1px solid #252e42; color: #6b7db3;
    padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500;
    cursor: pointer; transition: all 0.15s; flex-shrink: 0;
  }
  .export-btn:hover, .copy-all-btn:hover { color: #c8d0e7; background: #252e42 }

  /* Upload */
  .upload-panel {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px; background: #161b27; border: 1px solid #1e2535; border-radius: 16px; padding: 40px; text-align: center;
  }
  .upload-icon { font-size: 36px }
  .upload-panel h3 { font-size: 18px; font-weight: 600; color: #e8eaed; margin: 0 }
  .upload-hint { font-size: 13px; color: #4b5a7a; line-height: 1.6; margin: 0 }
  .upload-hint strong { color: #6b7db3 }
  .file-label {
    display: inline-block; padding: 8px 20px; background: #1e2535; border: 1px solid #252e42;
    border-radius: 8px; color: #8896b3; font-size: 13px; cursor: pointer; transition: all 0.15s;
  }
  .file-label:hover { background: #252e42; color: #c8d0e7 }
  .file-label input { display: none }
  .file-chosen { color: #10b981 }
  .upload-actions { display: flex; gap: 10px }
  .btn {
    padding: 9px 20px; border-radius: 8px; border: none;
    font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .btn-primary { background: linear-gradient(135deg, #3b82f6, #6366f1); color: #fff }
  .btn-primary:hover { opacity: 0.9; transform: translateY(-1px) }
  .btn-secondary { background: #1e2535; color: #c8d0e7; border: 1px solid #252e42 }
  .btn-ghost { background: transparent; color: #4b5a7a; border: 1px solid transparent }
  .btn-ghost:hover { color: #6b7db3 }
  .demo-note { font-size: 11px; color: #2d3a56; margin: 0 }

  /* Processing */
  .processing-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1;
    gap: 20px; color: #6b7db3; background: #161b27; border: 1px solid #1e2535; border-radius: 16px; padding: 40px;
  }
  .proc-spinner {
    width: 40px; height: 40px; border: 3px solid #1e2535; border-top-color: #8b5cf6;
    border-radius: 50%; animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg) } }
  .proc-phase { font-size: 14px; color: #8896b3; font-weight: 500 }
  .proc-steps { display: flex; flex-direction: column; gap: 8px; text-align: left }
  .proc-step {
    display: flex; align-items: center; gap: 8px; font-size: 13px; color: #2d3a56;
    padding: 6px 12px; border-radius: 8px; transition: all 0.3s;
  }
  .proc-step.active { color: #8b5cf6; background: rgba(139,92,246,0.08) }
  .proc-step.done { color: #10b981 }
  .step-icon { font-size: 12px; width: 16px; text-align: center }

  /* Error */
  .error-state {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; background: #161b27; border: 1px solid rgba(239,68,68,0.3); border-radius: 16px; padding: 40px; text-align: center;
  }
  .error-icon { font-size: 36px }
  .error-msg { font-size: 13px; color: #f87171; max-width: 420px; line-height: 1.5 }
  .error-actions { display: flex; gap: 10px }

  /* Results Grid */
  .results-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    overflow-y: auto;
    padding-bottom: 8px;
  }

  .result-card {
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 14px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  .card-title { font-size: 13px; font-weight: 600; color: #c8d0e7; flex: 1; text-transform: uppercase; letter-spacing: 0.5px }
  .copy-btn {
    background: none; border: 1px solid #252e42; color: #4b5a7a; font-size: 11px;
    padding: 2px 8px; border-radius: 4px; cursor: pointer; transition: all 0.15s;
  }
  .copy-btn:hover { color: #c8d0e7; border-color: #4b5a7a }
  .count {
    font-size: 11px; background: #1e2535; color: #6b7db3;
    min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center; font-weight: 600;
  }
  .card-badge {
    font-size: 10px; background: rgba(139,92,246,0.15); color: #a78bfa;
    padding: 2px 8px; border-radius: 4px; font-weight: 600;
  }

  /* Summary card */
  .summary-card { border-left: 3px solid #3b82f6 }
  .summary-text { font-size: 14px; color: #8896b3; line-height: 1.7 }
  .summary-text :global(strong) { color: #c8d0e7; font-weight: 600 }
  .summary-text :global(em) { color: #6b7db3 }

  /* Section markdown (for all section cards) */
  .section-md { font-size: 13px; color: #8896b3; line-height: 1.65 }
  .section-md :global(strong) { color: #c8d0e7; font-weight: 600 }
  .section-md :global(em) { color: #6b7db3 }
  .section-md :global(.md-list) { margin: 4px 0; padding-left: 18px; list-style: none }
  .section-md :global(.md-list li) {
    padding: 4px 0 4px 4px; position: relative; line-height: 1.6;
  }
  .section-md :global(.md-list li::before) {
    content: '•'; position: absolute; left: -14px; color: #4b5a7a;
  }
  .section-md :global(.md-h) { font-size: 13px; font-weight: 700; color: #c8d0e7; margin: 10px 0 4px }
  .section-md :global(.md-h:first-child) { margin-top: 0 }

  .empty-section { font-size: 13px; color: #2d3a56; font-style: italic; padding: 8px 0 }

  /* Steps card */
  .steps-card { border-left: 3px solid #10b981 }
  .action-list { display: flex; flex-direction: column; gap: 6px }
  .action-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 8px 10px; background: #1e2535; border-radius: 8px; cursor: pointer; transition: background 0.15s;
  }
  .action-item:hover { background: #252e42 }
  .action-left { display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0 }
  .checkbox { margin-top: 3px; flex-shrink: 0; accent-color: #10b981 }
  .action-task { font-size: 13px; color: #c8d0e7; line-height: 1.4; transition: all 0.2s }
  .action-task.done-task { text-decoration: line-through; color: #4b5a7a }
  .action-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px }
  .action-owner { font-size: 11px; color: #4b5a7a }
  .priority-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0 }
  .priority-text { font-size: 10px; font-weight: 600 }

  /* Deal card */
  .deal-card { border-left: 3px solid #8b5cf6 }
  .deal-md :global(.md-list li::before) { color: #8b5cf6 }

  /* Objections card */
  .objections-card { border-left: 3px solid #f59e0b }
  .objections-card .section-md :global(.md-list li::before) { color: #f59e0b }

  /* Signals card */
  .signals-card { border-left: 3px solid #3b82f6 }

  /* Transcript */
  .transcript-toggle {
    cursor: pointer; list-style: none; user-select: none;
  }
  .transcript-toggle::-webkit-details-marker { display: none }
  .toggle-icon { color: #4b5a7a; font-size: 12px; transition: transform 0.2s }
  details[open] .toggle-icon { transform: rotate(90deg) }
  .transcript-text {
    margin-top: 10px; font-size: 12px; color: #6b7db3; line-height: 1.7;
    white-space: pre-wrap; word-break: break-word; background: #1e2535;
    border-radius: 8px; padding: 12px 14px; max-height: 300px; overflow-y: auto;
  }

  /* Meta */
  .meta-bar {
    grid-column: 1 / -1; display: flex; gap: 16px; font-size: 12px; color: #4b5a7a;
    padding: 8px 16px; background: #161b27; border: 1px solid #1e2535; border-radius: 8px; flex-wrap: wrap;
  }
  .manual-upload-link {
    background: none; border: none; color: #4b5a7a; font-size: 12px; cursor: pointer;
    text-decoration: underline; text-underline-offset: 2px; padding: 0; transition: color 0.15s;
  }
  .manual-upload-link:hover { color: #6b7db3 }
</style>
