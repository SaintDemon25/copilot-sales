<script>
  import { fade } from 'svelte/transition'
  import Sidebar from './components/Sidebar.svelte'
  import MeetingList from './components/MeetingList.svelte'
  import LiveAdvisor from './components/LiveAdvisor.svelte'
  import PostMeeting from './components/PostMeeting.svelte'
  import MeetingPrep from './components/MeetingPrep.svelte'
  import AgentStatusBar from './components/AgentStatusBar.svelte'
  import Toast from './components/Toast.svelte'

  let activeView = 'today'   // 'today' | 'live' | 'post' | 'prep'
  let activeMeeting = null
  let liveTranscript = ''
  let liveDuration = 0
  let isRecording = false
  let toasts = []
  let toastId = 0

  function showToast(message, type = 'info') {
    const id = ++toastId
    toasts = [...toasts, { id, message, type }]
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id)
    }, 4000)
  }

  function handleMeetingSelect(e) {
    activeMeeting = e.detail
    activeView = 'today'
  }

  function handleStartMeeting(e) {
    activeMeeting = e.detail
    activeView = 'live'
  }

  function handleEndMeeting(e) {
    liveTranscript = e.detail?.transcript ?? ''
    liveDuration = e.detail?.elapsed ?? 0
    activeView = 'post'
  }

  function handleRecordingChange(e) {
    isRecording = e.detail?.isRecording ?? false
  }

  function handlePostMeetingBack() {
    activeView = 'today'
    liveTranscript = ''
    liveDuration = 0
  }

  function handlePostMeeting(e) {
    activeMeeting = e.detail
    liveTranscript = ''
    liveDuration = 0
    activeView = 'post'
  }

  function handleToast(e) {
    showToast(e.detail?.message ?? '', e.detail?.type ?? 'info')
  }
</script>

<div class="app-shell">
  <Sidebar bind:activeView bind:isRecording />

  <div class="main-area">
    <AgentStatusBar {activeView} {activeMeeting} />

    <div class="content-area">
      {#key activeView}
        <div transition:fade={{ duration: 200 }}>
          {#if activeView === 'today'}
            <MeetingList
              {activeMeeting}
              on:select={handleMeetingSelect}
              on:startMeeting={handleStartMeeting}
              on:postMeeting={handlePostMeeting}
            />
          {:else if activeView === 'live'}
            <LiveAdvisor
              meeting={activeMeeting}
              on:endMeeting={handleEndMeeting}
              on:recordingChange={handleRecordingChange}
              on:toast={handleToast}
            />
          {:else if activeView === 'post'}
            <PostMeeting
              meeting={activeMeeting}
              liveTranscript={liveTranscript}
              liveDuration={liveDuration}
              on:back={handlePostMeetingBack}
              on:toast={handleToast}
            />
          {:else if activeView === 'prep'}
            <MeetingPrep on:toast={handleToast} />
          {/if}
        </div>
      {/key}
    </div>
  </div>
</div>

<Toast bind:toasts />

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: 'Inter', system-ui, sans-serif;
    background: #0f1117;
    color: #e8eaed;
    height: 100vh;
    overflow: hidden;
  }

  :global(::-webkit-scrollbar) {
    width: 6px;
  }
  :global(::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #2d3142;
    border-radius: 3px;
  }

  .app-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    padding: 24px 28px;
  }
</style>
