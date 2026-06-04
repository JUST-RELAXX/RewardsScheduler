// main.js — Electron main process: system tray, notifications, orchestration
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const Scheduler = require('./modules/scheduler');
const ProfileManager = require('./modules/profile-manager');
const WSBridge = require('./modules/ws-bridge');
const Tracker = require('./modules/tracker');

// ─── Globals ───
let mainWindow = null;
let notifWindow = null;
let tray = null;

const scheduler = new Scheduler();
const profileManager = new ProfileManager();
const wsBridge = new WSBridge();
const tracker = new Tracker(path.join(__dirname, 'data'));

// Settings defaults
let appSettings = {
  searchesPerAccount: 60,
  maxConcurrentSearches: 2,
  searchDelay: 10000,
  reminderEnabled: true
};

// Session state
let sessionActive = false;
let sessionProfiles = [];   // Profiles selected for this session
let searchQueue = [];        // Profiles waiting to be searched
let activeSearches = new Set(); // Profiles currently being searched
let connectedProfiles = new Set(); // Profiles whose extensions are connected
let pendingClosePrompts = {}; // profileDir → resolve function
let onlineTimeIntervals = {}; // profileDir → interval IDs
let retryCounters = {};      // profileDir → retry count (prevents infinite loops)
let sessionStartTime = null;

// ─── Settings persistence ───
const settingsFile = path.join(__dirname, 'data', 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      appSettings = { ...appSettings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
    }
  } catch (e) { /* use defaults */ }
}

function saveSettings(s) {
  appSettings = { ...appSettings, ...s };
  const dir = path.dirname(settingsFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(appSettings, null, 2));
}

// ─── Window Creation ───
function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1200, screenW - 100),
    height: Math.min(800, screenH - 100),
    minWidth: 900,
    minHeight: 650,
    frame: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// Notification popup window (custom styled, always on top)
function showNotificationWindow(data) {
  if (notifWindow && !notifWindow.isDestroyed()) {
    notifWindow.close();
  }

  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const nw = 420, nh = 260;

  notifWindow = new BrowserWindow({
    width: nw,
    height: nh,
    x: sw - nw - 20,
    y: sh - nh - 20,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  // Load proper HTML file with data passed via URL hash
  // (preload script doesn't work with data: URLs — this fixes the unclickable buttons)
  const hashParams = new URLSearchParams({
    urgency: data.urgency || 'casual',
    title: data.title || 'Hey bruh! 👋',
    body: data.body || 'Wanna do all the searches now???'
  });
  const notifPath = path.join(__dirname, 'renderer', 'notification.html');
  notifWindow.loadFile(notifPath, { hash: hashParams.toString() });

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.close();
    }
  }, 30000);
}

// ─── System Tray ───
function createTray() {
  // Create a simple colored icon
  const iconSize = 16;
  const canvas = nativeImage.createEmpty();

  // Use a simple file icon or create a data URL icon
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    // Fallback: create a minimal icon programmatically
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARElEQVQ4T2P8z8BQz0BB0MjAwFDPQEkAagYjJQZgGMBIiQFYXUGJC7C6gpIwwOoKSsIAqysoSUdYXUFJOsLqCkrCAQC2RhkRaWBLvQAAAABJRU5ErkJggg=='
    );
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('MS Rewards Scheduler');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📊 Open Dashboard',
      click: () => createMainWindow()
    },
    {
      label: '🔔 Remind Me Now',
      click: () => {
        scheduler._fireReminder(scheduler._getUrgencyLevel(new Date().getHours(), new Date().getMinutes()));
      }
    },
    { type: 'separator' },
    {
      label: '❌ Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => createMainWindow());
}

// ─── Session Orchestration ───
async function startSession(profileDirs) {
  if (sessionActive) {
    console.log('[Main] Session already active');
    return { success: false, error: 'Session already running' };
  }

  sessionActive = true;
  sessionProfiles = [...profileDirs];
  searchQueue = [...profileDirs];
  activeSearches.clear();
  sessionStartTime = Date.now();

  sendToRenderer('status-message', { text: `Launching ${profileDirs.length} Edge profiles...`, type: 'info' });

  // Mark profiles as in-progress
  profileDirs.forEach(dir => tracker.markInProgress(dir));

  // Get screen dimensions for tiled window layout
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;

  // Launch all profiles (staggered)
  await profileManager.launchProfiles(profileDirs);

  sendToRenderer('status-message', { text: 'All profiles launched! Tiling windows...', type: 'info' });

  // Wait for Edge windows to fully open, then tile them using Win32 API
  setTimeout(() => {
    profileManager.tileEdgeWindows(profileDirs.length, screenW, screenH);
    sendToRenderer('status-message', { text: 'Windows tiled! Waiting for extensions to connect...', type: 'info' });
  }, 5000);

  // Start online time tracking for all profiles
  profileDirs.forEach(dir => startOnlineTimeTracking(dir));

  // Reset retry counters
  retryCounters = {};

  // Wait for extensions to connect, then begin search orchestration
  setTimeout(() => startSearchOrchestration(), 12000);

  return { success: true };
}

function startSearchOrchestration() {
  if (!sessionActive || searchQueue.length === 0) return;

  const maxActive = appSettings.maxConcurrentSearches || 2;
  const MAX_RETRIES = 10; // Max retry attempts per profile

  // Fill active search slots
  const deferredQueue = []; // profiles to retry later

  while (activeSearches.size < maxActive && searchQueue.length > 0) {
    const profileDir = searchQueue.shift();

    // Check if extension is connected
    if (wsBridge.isConnected(profileDir)) {
      activeSearches.add(profileDir);
      retryCounters[profileDir] = 0; // reset on success
      console.log(`[Main] Starting active search on: ${profileDir}`);

      wsBridge.startSearch(profileDir, {
        delay: appSettings.searchDelay,
        searchCount: appSettings.searchesPerAccount,
        flash: false
      });

      sendToRenderer('session-update', {
        profileDir,
        status: 'searching',
        message: `Active searching on ${profileManager.getProfile(profileDir)?.displayName || profileDir}`
      });
    } else {
      // Track retries — don't loop forever
      retryCounters[profileDir] = (retryCounters[profileDir] || 0) + 1;
      if (retryCounters[profileDir] <= MAX_RETRIES) {
        deferredQueue.push(profileDir);
        console.log(`[Main] Extension not connected for ${profileDir}, retry ${retryCounters[profileDir]}/${MAX_RETRIES}`);
      } else {
        console.warn(`[Main] Gave up on ${profileDir} after ${MAX_RETRIES} retries`);
        sendToRenderer('status-message', {
          text: `⚠️ ${profileManager.getProfile(profileDir)?.displayName || profileDir}: Extension never connected — skipped`,
          type: 'warning'
        });
      }
    }
  }

  // Re-queue deferred profiles and schedule a retry
  if (deferredQueue.length > 0) {
    searchQueue.push(...deferredQueue);
    setTimeout(() => startSearchOrchestration(), 5000); // retry in 5s
  }

  // Start keep-alive on remaining open profiles (not actively searching)
  sessionProfiles.forEach(dir => {
    if (!activeSearches.has(dir) && wsBridge.isConnected(dir) && !tracker.getProfileStatus(dir).searchesDone) {
      wsBridge.startKeepAlive(dir);
    }
  });
}

function onSearchComplete(profileDir, totalExecuted) {
  console.log(`[Main] Search complete for ${profileDir}: ${totalExecuted} searches`);

  activeSearches.delete(profileDir);
  tracker.markSearchesDone(profileDir, totalExecuted);

  sendToRenderer('search-complete', {
    profileDir,
    totalExecuted,
    displayName: profileManager.getProfile(profileDir)?.displayName || profileDir
  });

  // If online time not yet met, switch to keep-alive
  if (!tracker.getProfileStatus(profileDir).onlineTimeDone) {
    wsBridge.startKeepAlive(profileDir);
  }

  // Start searching on next profile in queue
  if (searchQueue.length > 0) {
    startSearchOrchestration();
  }

  // Check if all are done
  checkSessionComplete();
}

function startOnlineTimeTracking(profileDir) {
  // Update online time every 30 seconds
  onlineTimeIntervals[profileDir] = setInterval(() => {
    const minutes = profileManager.getOnlineMinutes(profileDir);
    tracker.updateOnlineTime(profileDir, minutes);

    sendToRenderer('online-time-update', {
      profileDir,
      minutes,
      met: minutes >= 30
    });

    if (minutes >= 30) {
      tracker.markOnlineTimeDone(profileDir, minutes);
      clearInterval(onlineTimeIntervals[profileDir]);
      delete onlineTimeIntervals[profileDir];

      // If searches also done, this profile is fully complete
      if (tracker.getProfileStatus(profileDir).searchesDone) {
        checkSessionComplete();
      }
    }
  }, 30000);
}

function checkSessionComplete() {
  if (!sessionActive) return;

  const allDone = sessionProfiles.every(dir => {
    const status = tracker.getProfileStatus(dir);
    return status.searchesDone && status.onlineTimeDone;
  });

  if (allDone) {
    sessionActive = false;
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 60000);

    const doneProfiles = sessionProfiles.map(dir => {
      const profile = profileManager.getProfile(dir);
      return profile?.displayName || dir;
    });

    sendToRenderer('session-done', {
      profiles: doneProfiles,
      elapsedMinutes: elapsed,
      message: `All ${sessionProfiles.length} profiles completed in ${elapsed} minutes! 🎉`
    });

    // Windows notification
    const notif = new Notification({
      title: '✅ MS Rewards Complete!',
      body: `Searches on ${doneProfiles.join(', ')} are all done! (${elapsed} min)`,
      icon: path.join(__dirname, 'assets', 'icon.png')
    });
    notif.show();

    // Cleanup
    Object.values(onlineTimeIntervals).forEach(clearInterval);
    onlineTimeIntervals = {};
  }
}

function stopSession() {
  sessionActive = false;
  searchQueue = [];
  activeSearches.clear();

  // Stop all searches
  sessionProfiles.forEach(dir => {
    wsBridge.stopAll(dir);
  });

  // Clear online timers
  Object.values(onlineTimeIntervals).forEach(clearInterval);
  onlineTimeIntervals = {};

  profileManager.cleanup();
  sendToRenderer('status-message', { text: 'Alr, care to do it later... I\'ll hit you up then 😎', type: 'info' });
}

// ─── Extension Events ───
function setupWSBridgeEvents() {
  wsBridge.on('extension-connected', ({ profileDir }) => {
    console.log(`[Main] Extension connected: ${profileDir}`);
    connectedProfiles.add(profileDir);
    sendToRenderer('extension-connected', { profileDir });

    // If session is active and this profile is in the queue, try to start searching
    if (sessionActive) {
      setTimeout(() => startSearchOrchestration(), 1000);
    }
  });

  wsBridge.on('extension-disconnected', ({ profileDir }) => {
    console.log(`[Main] Extension disconnected: ${profileDir}`);
    connectedProfiles.delete(profileDir);

    if (sessionActive && sessionProfiles.includes(profileDir)) {
      const status = tracker.getProfileStatus(profileDir);
      if (!status.searchesDone) {
        // Profile closed before completing — ask if mistake
        sendToRenderer('profile-close-prompt', {
          profileDir,
          displayName: profileManager.getProfile(profileDir)?.displayName || profileDir
        });
      }
    }

    sendToRenderer('profile-disconnected', { profileDir });
  });

  wsBridge.on('search-progress', (data) => {
    sendToRenderer('search-progress', data);
  });

  wsBridge.on('search-complete', ({ profileDir, totalExecuted }) => {
    onSearchComplete(profileDir, totalExecuted);
  });

  wsBridge.on('extension-error', ({ profileDir, error }) => {
    console.error(`[Main] Extension error from ${profileDir}:`, error);
    sendToRenderer('status-message', {
      text: `Error in ${profileManager.getProfile(profileDir)?.displayName || profileDir}: ${error}`,
      type: 'error'
    });
  });
}

// ─── Profile Manager Events ───
function setupProfileManagerEvents() {
  profileManager.on('profile-launched', (data) => {
    sendToRenderer('profile-launched', data);
  });

  profileManager.on('profile-launch-error', (data) => {
    sendToRenderer('status-message', {
      text: `Failed to launch ${data.profileDir}: ${data.error}`,
      type: 'error'
    });
  });
}

// ─── Scheduler Events ───
function setupSchedulerEvents() {
  scheduler.on('reminder', (data) => {
    console.log(`[Main] Reminder fired: ${data.urgency}`);
    showNotificationWindow(data);
  });

  // Set the done checker
  scheduler.setDoneChecker(() => {
    const profiles = profileManager.profiles.map(p => p.dir);
    return profiles.length > 0 && tracker.isAllDoneToday(profiles);
  });
}

// ─── IPC Handlers ───
function setupIPC() {
  ipcMain.handle('get-profiles', () => {
    const data = profileManager.getProfilesData();
    console.log(`[IPC] get-profiles returning ${data.length} profiles`);
    return data;
  });

  // Notification button handler (direct IPC from notification.html)
  ipcMain.on('notif-response', (_, response) => {
    console.log(`[IPC] Notification response: ${response}`);
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.close();
    }
    switch (response) {
      case 'yes':
        createMainWindow();
        break;
      case 'no':
        const dismissNotif = new Notification({
          title: 'No worries 😎',
          body: 'Remember to f**king do it by 10:30 PM MOST!',
          icon: path.join(__dirname, 'assets', 'icon.png')
        });
        dismissNotif.show();
        break;
      case 'later':
        scheduler.snooze(30);
        break;
    }
  });

  ipcMain.handle('get-profile-status', (_, profileDir) => {
    return tracker.getProfileStatus(profileDir);
  });

  ipcMain.handle('get-today-status', () => {
    const statuses = {};
    profileManager.profiles.forEach(p => {
      statuses[p.dir] = {
        ...tracker.getProfileStatus(p.dir),
        displayName: p.displayName,
        isConnected: wsBridge.isConnected(p.dir),
        onlineMinutes: profileManager.getOnlineMinutes(p.dir)
      };
    });
    return statuses;
  });

  ipcMain.handle('start-session', async (_, profileDirs) => {
    return await startSession(profileDirs);
  });

  ipcMain.handle('stop-session', () => {
    stopSession();
    return { success: true };
  });

  ipcMain.handle('stop-profile', (_, profileDir) => {
    wsBridge.stopAll(profileDir);
    activeSearches.delete(profileDir);
    return { success: true };
  });

  ipcMain.handle('respond-to-close', async (_, profileDir, wasMistake) => {
    if (wasMistake) {
      // Relaunch the profile
      sendToRenderer('status-message', { text: `Reopening ${profileDir}...`, type: 'info' });
      profileManager.launchProfile(profileDir);
      // Re-add to search queue if not done
      const status = tracker.getProfileStatus(profileDir);
      if (!status.searchesDone && !searchQueue.includes(profileDir)) {
        searchQueue.push(profileDir);
      }
    } else {
      sendToRenderer('status-message', {
        text: 'Alr, care to do it later... I\'ll hit you up then 😎',
        type: 'info'
      });
    }
    return { success: true };
  });

  ipcMain.handle('respond-to-reminder', (_, response) => {
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.close();
    }

    switch (response) {
      case 'yes':
        createMainWindow();
        break;
      case 'no':
        // Show a quick dismissal notification
        const dismissNotif = new Notification({
          title: 'No worries 😎',
          body: 'Remember to f**king do it by 10:30 PM MOST!',
          icon: path.join(__dirname, 'assets', 'icon.png')
        });
        dismissNotif.show();
        break;
      case 'later':
        scheduler.snooze(30); // Snooze for 30 minutes
        break;
    }
    return { success: true };
  });

  ipcMain.handle('get-settings', () => appSettings);

  ipcMain.handle('save-settings', (_, settings) => {
    saveSettings(settings);
    return { success: true };
  });

  ipcMain.handle('get-history', (_, days) => {
    return tracker.getHistory(days || 7);
  });

  // Window controls
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.hide();
  });
}

// Helper: Send message to renderer
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

// ─── App Lifecycle ───
app.whenReady().then(async () => {
  loadSettings();

  // Discover profiles
  profileManager.findEdge();
  profileManager.discoverProfiles();

  // Start WebSocket server
  try {
    await wsBridge.start();
  } catch (e) {
    console.error('[Main] Failed to start WebSocket server:', e.message);
  }

  // Setup event handlers
  setupWSBridgeEvents();
  setupProfileManagerEvents();
  setupSchedulerEvents();
  setupIPC();

  // Create system tray
  createTray();

  // Start scheduler
  if (appSettings.reminderEnabled) {
    scheduler.start();
  }

  // Show dashboard on first launch
  createMainWindow();

  console.log('[Main] MS Rewards Scheduler started!');
  console.log(`[Main] Discovered ${profileManager.profiles.length} Edge profiles`);
});

app.on('window-all-closed', () => {
  // Don't quit — stay in system tray (default on macOS, explicit on Windows)
});

app.on('before-quit', () => {
  app.isQuitting = true;
  scheduler.stop();
  wsBridge.stop();
  Object.values(onlineTimeIntervals).forEach(clearInterval);
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    createMainWindow();
  });
}
