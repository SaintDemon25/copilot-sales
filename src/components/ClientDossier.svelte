<script>
  import { createEventDispatcher, onMount } from 'svelte'

  const dispatch = createEventDispatcher()
  export let meeting

  let loading = true
  let dossierReady = false

  $: if (meeting) {
    if (meeting.caldavUid) {
      loading = false
      dossierReady = true
    } else {
      loading = true
      dossierReady = false
      const delay = meeting.prepStatus === 'loading' ? 1800 : 400
      setTimeout(() => { loading = false; dossierReady = true }, delay)
    }
  }

  const SKIP_WORDS = /^(ООО|АО|ПАО|ГУП|ЗАО|ОАО|ИП|НКО|ФГУП|МУП)$/i
  function getInitials(name) {
    if (!name) return '?'
    const words = name.replace(/[«»""()]/g, '').split(/\s+/).filter(w => w && !SKIP_WORDS.test(w))
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return name[0]?.toUpperCase() || '?'
  }

  $: initials = getInitials(meeting?.client || '')
  $: isCalDav = !!meeting?.caldavUid

  const mockDossier = {
    revenue: '₽ 2.4 млрд',
    employees: '1 200+',
    region: 'Центральный ФО',
    lastDeal: '14 марта 2026 — ₽ 8.2 млн',
    openDeals: 2,
    painPoints: [
      'Устаревшая система складского учёта',
      'Медленная обработка заявок на закупки (>72 ч)',
      'Нет интеграции с ЕИС Закупки',
    ],
    questions: [
      'Какие KPI по снижению времени обработки заявок?',
      'Есть ли бюджет на Q3 или только Q4?',
      'Кто конечный согласующий — Орлов или Генеральный?',
    ],
    news: [
      { source: 'zakupki.gov.ru', text: 'Тендер №32512345 на 18 млн руб — автоматизация склада', date: '04.05' },
      { source: 'GigaSearch',     text: 'Компания расширяет логистическое направление на Урал',   date: '02.05' },
    ],
    competitors: ['1С:ERP', 'SAP WM', 'WMS Axelot'],
  }
</script>

<div class="dossier">
  <div class="dossier-header">
    <div class="client-block">
      <div class="client-avatar">{initials}</div>
      <div>
        <div class="client-title">{meeting.client}</div>
        <div class="client-sub">
          {#if meeting.inn}ИНН {meeting.inn} · {/if}{meeting.contact || ''}
          {#if !meeting.inn && !meeting.contact && meeting.topic}
            {meeting.topic}
          {/if}
        </div>
      </div>
    </div>
    <div class="header-actions">
      {#if meeting.status === 'done'}
        <button class="btn btn-secondary" on:click={() => dispatch('postMeeting', meeting)}>
          📊 Итоги встречи
        </button>
      {:else}
        <button class="btn btn-primary" on:click={() => dispatch('startMeeting', meeting)}>
          🎙️ Начать встречу
        </button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Prep Agent собирает досье…</p>
      <div class="tool-calls">
        <div class="tool-call">⚙️ get_client_card <span class="tc-src">CRM / ЕГРЮЛ</span></div>
        <div class="tool-call">⚙️ search_news <span class="tc-src">Tavilу / GigaSearch</span></div>
        <div class="tool-call">⚙️ search_procurement <span class="tc-src">zakupki.gov.ru</span></div>
      </div>
    </div>
  {:else if isCalDav}
    <div class="dossier-body">
      <!-- CalDAV meeting info -->
      <div class="caldav-info">
        <div class="info-row">
          <span class="info-label">Время</span>
          <span class="info-value">{meeting.time} · {meeting.duration}</span>
        </div>
        {#if meeting.topic && meeting.topic !== meeting.client}
          <div class="info-row">
            <span class="info-label">Тема / место</span>
            <span class="info-value">{meeting.topic}</span>
          </div>
        {/if}
        {#if meeting.contact}
          <div class="info-row">
            <span class="info-label">Контакт</span>
            <span class="info-value">{meeting.contact}</span>
          </div>
        {/if}
      </div>

      <div class="empty-dossier">
        <div class="empty-icon">📋</div>
        <p class="empty-title">Досье не загружено</p>
        <p class="empty-hint">Данные из CRM и новостей пока недоступны для CalDAV-встреч.<br/>Prep Agent заработает после подключения CRM-интеграции.</p>
      </div>
    </div>
  {:else}
    <div class="dossier-body">
      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">Выручка</div>
          <div class="stat-value">{mockDossier.revenue}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Сотрудники</div>
          <div class="stat-value">{mockDossier.employees}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Регион</div>
          <div class="stat-value small">{mockDossier.region}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Открытых сделок</div>
          <div class="stat-value">{mockDossier.openDeals}</div>
        </div>
      </div>

      <div class="two-col">
        <div class="section">
          <div class="section-title">🎯 Гипотезы о болях</div>
          <ul class="list">
            {#each mockDossier.painPoints as p}
              <li>{p}</li>
            {/each}
          </ul>
        </div>

        <div class="section">
          <div class="section-title">❓ Ключевые вопросы на встрече</div>
          <ul class="list accent">
            {#each mockDossier.questions as q}
              <li>{q}</li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📰 Свежие новости о клиенте</div>
        <div class="news-list">
          {#each mockDossier.news as n}
            <div class="news-item">
              <span class="news-source">{n.source}</span>
              <span class="news-text">{n.text}</span>
              <span class="news-date">{n.date}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="section">
        <div class="section-title">⚔️ Конкуренты в воронке</div>
        <div class="competitor-row">
          {#each mockDossier.competitors as c}
            <span class="competitor-chip">{c}</span>
          {/each}
        </div>
      </div>

      <div class="last-deal">
        🕐 Последняя сделка: <strong>{mockDossier.lastDeal}</strong>
      </div>
    </div>
  {/if}
</div>

<style>
  .dossier {
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 16px;
    overflow: hidden;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .dossier-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #1e2535;
    gap: 16px;
    flex-shrink: 0;
  }

  .client-block {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .client-avatar {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, #8b5cf6, #3b82f6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }

  .client-title {
    font-size: 15px;
    font-weight: 600;
    color: #e8eaed;
  }

  .client-sub {
    font-size: 12px;
    color: #4b5a7a;
    margin-top: 2px;
  }

  .header-actions {
    flex-shrink: 0;
  }

  .btn {
    padding: 8px 16px;
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

  .btn-primary:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: #1e2535;
    color: #c8d0e7;
    border: 1px solid #252e42;
  }

  .btn-secondary:hover {
    background: #252e42;
  }

  .loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: #6b7db3;
    font-size: 14px;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #1e2535;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg) } }

  .tool-calls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }

  .tool-call {
    font-size: 12px;
    color: #4b5a7a;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tc-src {
    font-size: 11px;
    color: #2d3a56;
    background: #1e2535;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .dossier-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .stat-card {
    background: #1e2535;
    border-radius: 10px;
    padding: 12px 14px;
  }

  .stat-label {
    font-size: 11px;
    color: #4b5a7a;
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 16px;
    font-weight: 700;
    color: #e8eaed;
  }

  .stat-value.small {
    font-size: 13px;
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: #6b7db3;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .list li {
    font-size: 13px;
    color: #8896b3;
    padding-left: 12px;
    position: relative;
    line-height: 1.4;
  }

  .list li::before {
    content: '·';
    position: absolute;
    left: 0;
    color: #4b5a7a;
  }

  .list.accent li {
    color: #b3c2e0;
  }

  .list.accent li::before {
    color: #3b82f6;
  }

  .news-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .news-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 12px;
    background: #1e2535;
    border-radius: 8px;
    font-size: 12px;
  }

  .news-source {
    color: #3b82f6;
    font-weight: 600;
    flex-shrink: 0;
  }

  .news-text {
    color: #8896b3;
    flex: 1;
  }

  .news-date {
    color: #4b5a7a;
    flex-shrink: 0;
  }

  .competitor-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .competitor-chip {
    font-size: 12px;
    padding: 4px 10px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 6px;
    color: #f87171;
  }

  .last-deal {
    font-size: 12px;
    color: #4b5a7a;
    padding-top: 4px;
    border-top: 1px solid #1e2535;
  }

  .last-deal strong {
    color: #8896b3;
  }

  .caldav-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: #1e2535;
    border-radius: 10px;
  }

  .info-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .info-label {
    font-size: 11px;
    color: #4b5a7a;
    min-width: 90px;
    flex-shrink: 0;
  }

  .info-value {
    font-size: 13px;
    color: #c8d0e7;
  }

  .empty-dossier {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    text-align: center;
  }

  .empty-icon {
    font-size: 36px;
    margin-bottom: 4px;
  }

  .empty-title {
    font-size: 15px;
    font-weight: 600;
    color: #6b7db3;
  }

  .empty-hint {
    font-size: 12px;
    color: #4b5a7a;
    line-height: 1.5;
  }
</style>
