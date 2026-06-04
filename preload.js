// preload.js — Secure IPC bridge between main process and renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scheduler', {
  // Profile operations
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  getProfileStatus: (profileDir) => ipcRenderer.invoke('get-profile-status', profileDir),
  getTodayStatus: () => ipcRenderer.invoke('get-today-status'),

  // Launch & search operations
  startSession: (profileDirs) => ipcRenderer.invoke('start-session', profileDirs),
  stopSession: () => ipcRenderer.invoke('stop-session'),
  stopProfile: (profileDir) => ipcRenderer.invoke('stop-profile', profileDir),

  // Handle "closed by mistake" response
  respondToClose: (profileDir, wasMistake) => ipcRenderer.invoke('respond-to-close', profileDir, wasMistake),

  // Notification response
  respondToReminder: (response) => ipcRenderer.invoke('respond-to-reminder', response),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // History
  getHistory: (days) => ipcRenderer.invoke('get-history', days),

  // Window controls (frameless window)
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Events from main process → renderer
  onSearchProgress: (callback) => {
    ipcRenderer.on('search-progress', (_, data) => callback(data));
  },
  onSearchComplete: (callback) => {
    ipcRenderer.on('search-complete', (_, data) => callback(data));
  },
  onProfileLaunched: (callback) => {
    ipcRenderer.on('profile-launched', (_, data) => callback(data));
  },
  onProfileDisconnected: (callback) => {
    ipcRenderer.on('profile-disconnected', (_, data) => callback(data));
  },
  onProfileConnected: (callback) => {
    ipcRenderer.on('extension-connected', (_, data) => callback(data));
  },
  onSessionUpdate: (callback) => {
    ipcRenderer.on('session-update', (_, data) => callback(data));
  },
  onOnlineTimeUpdate: (callback) => {
    ipcRenderer.on('online-time-update', (_, data) => callback(data));
  },
  onStatusMessage: (callback) => {
    ipcRenderer.on('status-message', (_, data) => callback(data));
  },
  onClosePrompt: (callback) => {
    ipcRenderer.on('profile-close-prompt', (_, data) => callback(data));
  },
  onSessionDone: (callback) => {
    ipcRenderer.on('session-done', (_, data) => callback(data));
  },

  // Remove listeners
  removeAllListeners: () => {
    const channels = [
      'search-progress', 'search-complete', 'profile-launched',
      'profile-disconnected', 'extension-connected', 'session-update',
      'online-time-update', 'status-message', 'profile-close-prompt',
      'session-done'
    ];
    channels.forEach(ch => ipcRenderer.removeAllListeners(ch));
  }
});
