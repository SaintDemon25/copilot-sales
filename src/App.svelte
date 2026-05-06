<script>
  import { onMount, onDestroy } from 'svelte'
  import Sidebar from './components/Sidebar.svelte'
  import MeetingList from './components/MeetingList.svelte'
  import LiveAdvisor from './components/LiveAdvisor.svelte'
  import PostMeeting from './components/PostMeeting.svelte'
  import AgentStatusBar from './components/AgentStatusBar.svelte'

  let activeView = 'today'   // 'today' | 'live' | 'post'
  let activeMeeting = null
  let liveTranscript = ''
  let liveDuration = 0

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
</script>

<div class="app-shell">
  <Sidebar bind:activeView />

  <div class="main-area">
    <AgentStatusBar {activeView} {activeMeeting} />

    <div class="content-area">
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
        />
      {:else if activeView === 'post'}
        <PostMeeting
          meeting={activeMeeting}
          liveTranscript={liveTranscript}
          liveDuration={liveDuration}
          on:back={handlePostMeetingBack}
        />
      {/if}
    </div>
  </div>
</div>

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
