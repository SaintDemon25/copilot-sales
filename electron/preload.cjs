const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Legacy loopback (kept for fallback)
  enableLoopbackAudio:  () => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: () => ipcRenderer.invoke('disable-loopback-audio'),

  // Native WASAPI loopback system audio capture
  startSystemAudio: () => ipcRenderer.invoke('start-system-audio'),
  stopSystemAudio: () => ipcRenderer.invoke('stop-system-audio'),
  onSystemAudioChunk: (callback) => {
    ipcRenderer.on('system-audio-chunk', (_event, data) => callback(data))
  },
  removeSystemAudioListener: () => {
    ipcRenderer.removeAllListeners('system-audio-chunk')
  },
})
