<script>
  export let activeView
  export let activeMeeting

  const agents = [
    { id: 'orchestrator', label: 'Orchestrator', status: 'active' },
    { id: 'prep',         label: 'Prep Agent',   status: 'active' },
    { id: 'live',         label: 'Live Advisor', status: 'standby' },
    { id: 'post',         label: 'Post-Meeting', status: 'standby' },
  ]

  $: agentStates = agents.map(a => {
    if (a.id === 'orchestrator') return { ...a, status: 'active' }
    if (a.id === 'prep')  return { ...a, status: activeView === 'today' ? 'active' : 'idle' }
    if (a.id === 'live')  return { ...a, status: activeView === 'live'  ? 'active' : 'standby' }
    if (a.id === 'post')  return { ...a, status: activeView === 'post'  ? 'active' : 'standby' }
    return a
  })

  const statusLabel = { active: 'активен', standby: 'ожидание', idle: 'простой' }
  const statusColor = { active: '#10b981', standby: '#f59e0b', idle: '#4b5a7a' }

  let now = new Date()
  let timer
  onMount(() => { timer = setInterval(() => now = new Date(), 1000) })
  onDestroy(() => clearInterval(timer))

  import { onMount, onDestroy } from 'svelte'

  function fmt(d) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
</script>

<header class="status-bar">
  <div class="left">
    <span class="page-title">
      {#if activeView === 'today'}📅 Подготовка встреч
      {:else if activeView === 'live'}🎙️ В эфире — {activeMeeting?.client ?? '—'}
      {:else if activeView === 'post'}📊 Итоги встречи — {activeMeeting?.client ?? '—'}
      {/if}
    </span>
  </div>

  <div class="agents-row">
    {#each agentStates as agent}
      <div class="agent-chip" class:agent-active={agent.status === 'active'}>
        <span class="dot" style="background:{statusColor[agent.status]}"></span>
        <span class="agent-name">{agent.label}</span>
        <span class="agent-status" style="color:{statusColor[agent.status]}">{statusLabel[agent.status]}</span>
      </div>
    {/each}
  </div>

  <div class="right">
    <span class="clock">{fmt(now)}</span>
  </div>
</header>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 28px;
    height: 56px;
    border-bottom: 1px solid #1e2535;
    background: #161b27;
    flex-shrink: 0;
    gap: 16px;
  }

  .left {
    min-width: 220px;
  }

  .page-title {
    font-size: 14px;
    font-weight: 600;
    color: #c8d0e7;
    white-space: nowrap;
  }

  .agents-row {
    display: flex;
    gap: 8px;
    flex-wrap: nowrap;
  }

  .agent-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    background: #1e2535;
    border: 1px solid #252e42;
    border-radius: 20px;
    font-size: 11px;
    transition: all 0.2s;
  }

  .agent-chip.agent-active {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.08);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .agent-name {
    color: #8896b3;
    font-weight: 500;
  }

  .agent-status {
    font-weight: 600;
  }

  .right {
    min-width: 80px;
    text-align: right;
  }

  .clock {
    font-size: 13px;
    font-weight: 500;
    color: #4b5a7a;
    font-variant-numeric: tabular-nums;
  }
</style>
