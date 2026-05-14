/**
 * CalDAV client — fetches today's events from a CalDAV server.
 *
 * Requests go through Vite proxy (/caldav → actual server) to avoid CORS.
 * In Electron production, requests go directly (no browser CORS).
 */

const CALDAV_URL = import.meta.env.VITE_CALDAV_URL || ''
const CALDAV_USER = import.meta.env.VITE_CALDAV_USER || ''
const CALDAV_PASSWORD = import.meta.env.VITE_CALDAV_PASSWORD || ''

function authHeader() {
  if (!CALDAV_USER) return {}
  return { Authorization: 'Basic ' + btoa(`${CALDAV_USER}:${CALDAV_PASSWORD}`) }
}

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { start: fmt(start), end: fmt(end) }
}

function buildCalendarQueryXml() {
  const { start, end } = todayRange()
  return `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start}" end="${end}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`
}

function parseICalValue(ical, key) {
  const re = new RegExp(`^${key}[^:]*:(.+)$`, 'm')
  const m = ical.match(re)
  return m ? m[1].trim() : ''
}

function parseICalDateTime(val) {
  if (!val) return null
  const clean = val.replace(/[TZ]/g, m => m === 'T' ? 'T' : '')
  const m = clean.match(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/)
  if (!m) return null
  return new Date(
    parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
    parseInt(m[4] || '0'), parseInt(m[5] || '0'), parseInt(m[6] || '0')
  )
}

function durationMinutes(start, end) {
  if (!start || !end) return 30
  return Math.round((end - start) / 60000)
}

function extractVEvents(xml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const events = []

  const responses = doc.getElementsByTagNameNS('DAV:', 'response')
  for (const resp of responses) {
    const calDataNodes = resp.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav', 'calendar-data')
    if (!calDataNodes.length) continue
    const ical = calDataNodes[0].textContent || ''

    const veventMatch = ical.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/)
    if (!veventMatch) continue
    const vevent = veventMatch[0]

    const summary = parseICalValue(vevent, 'SUMMARY') || 'Без названия'
    const location = parseICalValue(vevent, 'LOCATION') || ''
    const description = parseICalValue(vevent, 'DESCRIPTION') || ''
    const dtstart = parseICalDateTime(parseICalValue(vevent, 'DTSTART'))
    const dtend = parseICalDateTime(parseICalValue(vevent, 'DTEND'))
    const uid = parseICalValue(vevent, 'UID') || crypto.randomUUID()

    events.push({ uid, summary, location, description, dtstart, dtend })
  }

  events.sort((a, b) => (a.dtstart || 0) - (b.dtstart || 0))
  return events
}

function calEventToMeeting(ev, idx) {
  const time = ev.dtstart
    ? ev.dtstart.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '??:??'
  const dur = durationMinutes(ev.dtstart, ev.dtend)
  const now = new Date()
  const isPast = ev.dtend && ev.dtend < now
  const isNow = ev.dtstart && ev.dtend && ev.dtstart <= now && now <= ev.dtend

  const contactMatch = ev.description.match(/(?:Контакт|Contact|Участник):\s*(.+)/i)
  const contact = contactMatch ? contactMatch[1].trim() : ''

  return {
    id: `caldav-${idx}-${ev.uid.slice(0, 8)}`,
    time,
    duration: `${dur} мин`,
    client: ev.summary,
    contact,
    inn: '',
    topic: ev.location || ev.description.slice(0, 100) || ev.summary,
    status: isPast ? 'done' : isNow ? 'live' : 'upcoming',
    prepStatus: 'pending',
    tags: ['caldav'],
    caldavUid: ev.uid,
    dtstart: ev.dtstart,
    dtend: ev.dtend,
  }
}

export function isCalDavConfigured() {
  return !!(CALDAV_URL && CALDAV_USER)
}

export async function fetchTodayMeetings() {
  if (!CALDAV_URL) throw new Error('VITE_CALDAV_URL not configured')

  const useProxy = !window.electronAPI
  const url = useProxy ? '/caldav' : CALDAV_URL

  const resp = await fetch(url, {
    method: 'REPORT',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1',
      ...authHeader(),
    },
    body: buildCalendarQueryXml(),
  })

  if (!resp.ok) {
    throw new Error(`CalDAV ${resp.status}: ${resp.statusText}`)
  }

  const xml = await resp.text()
  const events = extractVEvents(xml)
  return events.map(calEventToMeeting)
}
