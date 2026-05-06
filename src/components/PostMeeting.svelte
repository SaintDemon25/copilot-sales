<script>
  import { createEventDispatcher, onMount } from 'svelte'

  const dispatch = createEventDispatcher()
  export let meeting

  let phase = 'transcribing'  // transcribing → processing → done

  onMount(() => {
    setTimeout(() => phase = 'processing', 1500)
    setTimeout(() => phase = 'done', 3200)
  })

  const summary = `Встреча прошла продуктивно. Клиент подтвердил интерес к логистическому модулю и
интеграции с 1С:ERP. Основное возражение — конкурентное предложение SAP по цене.
Менеджер успешно применил TCO-аргументацию. Достигнута договорённость о демо-стенде.`

  const actionItems = [
    { owner: 'Алексей', task: 'Подготовить TCO-сравнение с SAP WM до 09.05', priority: 'high' },
    { owner: 'Алексей', task: 'Договориться о демо-стенде: предложить слот 13–14 мая', priority: 'high' },
    { owner: 'Команда', task: 'Выслать документацию по коннектору 1С клиенту до 08.05', priority: 'medium' },
    { owner: 'Алексей', task: 'Уточнить итоговое ЛПР (Орлов vs Генеральный директор)', priority: 'medium' },
  ]

  const decisions = [
    'Клиент готов рассматривать наше решение при условии демо',
    'Бюджет на Q3 есть, но требуется согласование ЛПР',
    'SAP — основной конкурент, ценовой аргумент критичен',
  ]

  const competencyTips = [
    { area: 'Работа с возражениями по цене', score: 4, tip: 'Хорошо применена TCO-аргументация. В следующий раз добавьте ROI-калькулятор.' },
    { area: 'Выявление ЛПР', score: 2, tip: 'Не уточнено, кто финальный согласующий. Критичный пробел для сделки.' },
    { area: 'Конкурентное позиционирование', score: 3, tip: 'SAP упомянут, но не закрыт аргументом о скорости внедрения.' },
  ]

  const priorityColor = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
  const priorityLabel = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }
  const scoreColor = s => s >= 4 ? '#10b981' : s >= 3 ? '#f59e0b' : '#ef4444'
</script>

<div class="post-layout">
  <div class="post-header">
    <button class="back-btn" on:click={() => dispatch('back')}>← Назад</button>
    <div class="post-title">
      <div class="post-heading">Итоги встречи</div>
      <div class="post-sub">{meeting?.client ?? '—'} · {meeting?.contact ?? ''}</div>
    </div>
    <button class="export-btn">⬇ Экспорт в CRM</button>
  </div>

  {#if phase !== 'done'}
    <div class="processing-state">
      <div class="proc-spinner"></div>
      <div class="proc-steps">
        <div class="proc-step" class:active={phase === 'transcribing'} class:done={phase !== 'transcribing'}>
          <span class="step-icon">{phase !== 'transcribing' ? '✓' : '⟳'}</span>
          transcribe_file — транскрипция записи
        </div>
        <div class="proc-step" class:active={phase === 'processing'}>
          <span class="step-icon">⟳</span>
          Параллельная генерация: саммари · action items · компетенции
        </div>
        <div class="proc-step">
          <span class="step-icon">·</span>
          save_meeting — сохранение в БД
        </div>
      </div>
      <div class="proc-label">Post-Meeting Agent обрабатывает запись…</div>
    </div>
  {:else}
    <div class="results-grid">
      <!-- Summary -->
      <div class="result-card wide">
        <div class="card-header">
          <span class="card-icon">📝</span>
          <span class="card-title">Саммари встречи</span>
          <span class="card-badge">AI · GigaChat Max</span>
        </div>
        <p class="summary-text">{summary}</p>
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
            <div class="action-item">
              <div class="action-left">
                <input type="checkbox" class="checkbox" />
                <div>
                  <div class="action-task">{item.task}</div>
                  <div class="action-owner">👤 {item.owner}</div>
                </div>
              </div>
              <span class="priority-badge" style="color:{priorityColor[item.priority]}; border-color:{priorityColor[item.priority]}44; background:{priorityColor[item.priority]}11">
                {priorityLabel[item.priority]}
              </span>
            </div>
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
        </ul>
      </div>

      <!-- Competency coaching -->
      <div class="result-card wide">
        <div class="card-header">
          <span class="card-icon">🎓</span>
          <span class="card-title">Коучинг по компетенциям</span>
          <span class="card-badge">get_competency_tips</span>
        </div>
        <div class="competency-list">
          {#each competencyTips as ct}
            <div class="competency-item">
              <div class="comp-top">
                <span class="comp-area">{ct.area}</span>
                <div class="score-dots">
                  {#each Array(5) as _, i}
                    <span class="score-dot" style="background:{i < ct.score ? scoreColor(ct.score) : '#1e2535'}"></span>
                  {/each}
                  <span class="score-num" style="color:{scoreColor(ct.score)}">{ct.score}/5</span>
                </div>
              </div>
              <p class="comp-tip">{ct.tip}</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Metadata -->
      <div class="meta-bar">
        <span>💾 Сохранено в БД · Postgres</span>
        <span>🗓 {new Date().toLocaleDateString('ru-RU')}</span>
        <span>⏱ Длительность: 42 мин</span>
        <span>🔤 Токенов: ~3 200</span>
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

  .post-title {
    flex: 1;
  }

  .post-heading {
    font-size: 18px;
    font-weight: 600;
    color: #e8eaed;
  }

  .post-sub {
    font-size: 13px;
    color: #4b5a7a;
    margin-top: 2px;
  }

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

  .processing-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 20px;
    color: #6b7db3;
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

  .proc-steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
  }

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

  .proc-step.active {
    color: #8b5cf6;
    background: rgba(139, 92, 246, 0.08);
  }

  .proc-step.done {
    color: #10b981;
  }

  .step-icon {
    font-size: 12px;
    width: 16px;
    text-align: center;
  }

  .proc-label {
    font-size: 13px;
    color: #4b5a7a;
  }

  /* Results grid */
  .results-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto;
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

  .result-card.wide {
    grid-column: 1 / -1;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px) }
    to   { opacity: 1; transform: translateY(0) }
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-icon {
    font-size: 16px;
  }

  .card-title {
    font-size: 14px;
    font-weight: 600;
    color: #c8d0e7;
    flex: 1;
  }

  .card-badge {
    font-size: 10px;
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .count {
    font-size: 12px;
    background: #1e2535;
    color: #6b7db3;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }

  .summary-text {
    font-size: 14px;
    color: #8896b3;
    line-height: 1.65;
  }

  .action-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .action-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    background: #1e2535;
    border-radius: 8px;
  }

  .action-left {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .checkbox {
    margin-top: 2px;
    flex-shrink: 0;
    accent-color: #3b82f6;
  }

  .action-task {
    font-size: 13px;
    color: #c8d0e7;
    line-height: 1.4;
  }

  .action-owner {
    font-size: 11px;
    color: #4b5a7a;
    margin-top: 2px;
  }

  .priority-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .decisions-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .decisions-list li {
    font-size: 13px;
    color: #8896b3;
    padding-left: 14px;
    position: relative;
    line-height: 1.5;
  }

  .decisions-list li::before {
    content: '›';
    position: absolute;
    left: 0;
    color: #3b82f6;
    font-weight: 700;
  }

  .competency-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .competency-item {
    padding: 12px 14px;
    background: #1e2535;
    border-radius: 10px;
  }

  .comp-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .comp-area {
    font-size: 13px;
    font-weight: 600;
    color: #c8d0e7;
  }

  .score-dots {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .score-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: background 0.3s;
  }

  .score-num {
    font-size: 12px;
    font-weight: 700;
    margin-left: 4px;
  }

  .comp-tip {
    font-size: 12px;
    color: #6b7db3;
    line-height: 1.5;
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
