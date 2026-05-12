const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Legacy loopback (kept for fallback)
  enableLoopbackAudio:  () => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: () => ipcRenderer.invoke('disable-loopback-audio'),

  // Native WASAPI loopback system audio capture
  startSystemAudio: () => ipcRenderer.invoke('start-system-audio'),
  stopSystemAudio: () => ipcRenderer.invoke('stop-system-audio'),
  onSystemAudioChunk: (callback) => {
    ipcRenderer.removeAllListeners('system-audio-chunk')
    ipcRenderer.on('system-audio-chunk', (_event, data) => callback(data))
  },
  removeSystemAudioListener: () => {
    ipcRenderer.removeAllListeners('system-audio-chunk')
  },

  // Native WASAPI microphone capture
  startMic: () => ipcRenderer.invoke('start-mic'),
  stopMic: () => ipcRenderer.invoke('stop-mic'),
  onMicAudioChunk: (callback) => {
    ipcRenderer.removeAllListeners('mic-audio-chunk')
    ipcRenderer.on('mic-audio-chunk', (_event, data) => callback(data))
  },
  removeMicListener: () => {
    ipcRenderer.removeAllListeners('mic-audio-chunk')
  },
})
