/**
 * Sales Agent API клиент.
 *
 * Проксируется через Vite:
 *   /agent-api/* → http://localhost:8900/*  (Python FastAPI бэкенд)
 *
 * Бэкенд автоматически сохраняет карточки в SQLite (cards.db)
 * с привязкой к companyName — карточки разных клиентов изолированы.
 *
 * Python-бэкенд возвращает ключи в camelCase (конвертация на стороне сервера).
 */

const API_BASE = '/agent-api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.detail || `Ошибка сервера: ${res.status}`);
  }
  return res.json();
}

// ─── Health ──────────────────────────────────────────────────────────────────

/** Проверка здоровья API агента */
export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Meetings ────────────────────────────────────────────────────────────────

/** Встречи на сегодня */
export async function getMeetingsToday() {
  const result = await request('/api/meetings/today');
  return result.meetings || [];
}

// ─── Card Collection ─────────────────────────────────────────────────────────

/** Быстрый сбор карточки без LLM (2-5 сек). Автосохранение в БД. */
export async function collectCardDirect(companyName, meetingTopic = '', inn = '') {
  return request('/api/agent/collect-direct', {
    method: 'POST',
    body: JSON.stringify({ companyName, meetingTopic, inn }),
  });
}

/** Полный сбор с LLM-анализом (30-60 сек). Автосохранение в БД. */
export async function collectCard(companyName, meetingTopic = '', inn = '') {
  return request('/api/agent/collect-card', {
    method: 'POST',
    body: JSON.stringify({ companyName, meetingTopic, inn }),
  });
}

// ─── Card Persistence ────────────────────────────────────────────────────────

/** Загрузить сохранённую карточку компании из БД */
export async function loadCard(companyName) {
  const result = await request(`/api/cards?companyName=${encodeURIComponent(companyName)}`);
  if (result.found && result.data) {
    return {
      card: result.data,
      hasLLM: result.hasLLMAnalysis || false,
      updatedAt: result.updatedAt || null,
    };
  }
  return null;
}

/** Список всех компаний, у которых есть сохранённые карточки */
export async function listSavedCards() {
  const result = await request('/api/cards');
  return result.cards || [];
}

/** Удалить карточку компании */
export async function deleteCard(companyName) {
  return request(`/api/cards?companyName=${encodeURIComponent(companyName)}`, {
    method: 'DELETE',
  });
}