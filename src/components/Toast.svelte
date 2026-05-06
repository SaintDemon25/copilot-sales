<script>
  import { onDestroy } from 'svelte'

  export let toasts = []

  function dismiss(id) {
    toasts = toasts.filter(t => t.id !== id)
  }

  function fmtTime(t) {
    return t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
</script>

{#if toasts.length > 0}
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div
        class="toast"
        class:toast-success={toast.type === 'success'}
        class:toast-error={toast.type === 'error'}
        class:toast-warning={toast.type === 'warning'}
        class:toast-info={toast.type === 'info'}
        in:slideIn
        out:slideOut
      >
        <span class="toast-icon">
          {#if toast.type === 'success'}✅
          {:else if toast.type === 'error'}❌
          {:else if toast.type === 'warning'}⚠️
          {:else}ℹ️{/if}
        </span>
        <span class="toast-msg">{toast.message}</span>
        <button class="toast-close" on:click={() => dismiss(toast.id)}>×</button>
      </div>
    {/each}
  </div>
{/if}

<script context="module">
  import { fly } from 'svelte/transition'

  export const slideIn = fly
  export const slideOut = fly
</script>

<style>
  .toast-container {
    position: fixed;
    top: 16px;
    right: 24px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 380px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    color: #e8eaed;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    animation: toastIn 0.3s ease;
  }

  .toast-success {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  .toast-error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .toast-warning {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
  .toast-info {
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .toast-icon { font-size: 14px; flex-shrink: 0 }
  .toast-msg { flex: 1; line-height: 1.4 }

  .toast-close {
    background: none;
    border: none;
    color: #4b5a7a;
    font-size: 18px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
    transition: color 0.15s;
  }
  .toast-close:hover { color: #e8eaed }

  @keyframes toastIn {
    from { opacity: 0; transform: translateX(30px) }
    to   { opacity: 1; transform: translateX(0) }
  }
</style>
