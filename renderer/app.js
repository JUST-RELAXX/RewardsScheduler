// renderer/app.js — Dashboard logic, live updates, account management
// Direct IPC via require('electron') — no preload bridge needed

const { ipcRenderer } = require('electron');

// ─── Error Boundary ───
window.onerror = function(msg, url, line, col, error) {
  console.error('[Dashboard ERROR]', msg, 'at line', line);
  const grid = document.getElementById('accountsGrid');
  if (grid) {
    grid.innerHTML += `<div style="grid-column:1/-1;color:#ff4444;padding:20px;background:#1a1a2e;border-radius:12px;font-family:monospace;font-size:13px;">
      <strong>⚠️ Dashboard Error:</strong><br>${msg}<br>Line ${line}, Col ${col}
    </div>`;
  }
};

// ─── State ───
let profiles = [];
let selectedProfiles = new Set();
let sessionRunning = false;
let sessionTimer = null;
let sessionStartTime = null;
let pendingCloseProfile = null;
let profilesLoaded = false;

// ─── DOM Refs ───
const $ = (id) => document.getElementById(id);
const dom = {};

function initDOM() {
  [
    'liveClock', 'statusIcon', 'statusText', 'statusTimer',
    'accountsGrid', 'doneCounter', 'btnRunAll', 'btnRunSelected',
    'btnStop', 'btnSelectAll', 'btnSettings', 'sessionPanel',
    'sessionElapsed', 'sessionLog', 'closePromptModal', 'closePromptText',
    'btnCloseMistake', 'btnCloseIntentional', 'settingsOverlay',
    'btnCloseSettings', 'btnSaveSettings', 'setSearchCount',
    'setConcurrent', 'setDelay', 'setDelayValue', 'setReminders',
    'btnMinimize', 'btnClose'
  ].forEach(id => { dom[id] = $(id); });
}

function on(el, event, handler) {
  if (el) el.addEventListener(event, handler);
}

// ─── Live Clock ───
function updateClock() {
  if (!dom.liveClock) return;
  const now = new Date();
  dom.liveClock.textContent = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
  const h = now.getHours(), m = now.getMinutes();
  if (h === 22 && m <= 30) {
    dom.liveClock.style.color = '#ff1744';
    dom.liveClock.style.textShadow = '0 0 10px rgba(255,23,68,0.5)';
  } else if (h >= 21) {
    dom.liveClock.style.color = '#ff9800';
    dom.liveClock.style.textShadow = '0 0 10px rgba(255,152,0,0.3)';
  } else {
    dom.liveClock.style.color = '';
    dom.liveClock.style.textShadow = '';
  }
}

// ─── Profile Loading ───
async function loadProfiles(retries = 3) {
  try {
    const result = await ipcRenderer.invoke('get-profiles');
    const todayStatus = await ipcRenderer.invoke('get-today-status');

    if (!result || result.length === 0) {
      if (retries > 0) {
        setTimeout(() => loadProfiles(retries - 1), 2000);
        return;
      }
      setStatus('⚠️', 'No Edge profiles detected. Is Edge installed?', 'warning');
      profiles = [];
    } else {
      profiles = result;
    }

    profiles.forEach(p => {
      const s = (todayStatus && todayStatus[p.dir]) || {};
      p.searchesDone = s.searchesDone || false;
      p.onlineTimeDone = s.onlineTimeDone || false;
      p.completedAt = s.completedAt || null;
      p.searchCount = s.searchCount || 0;
      p.onlineMinutes = s.onlineMinutes || 0;
      p.inProgress = s.inProgress || false;
      p.isConnected = s.isConnected || false;
      p.executed = 0;
      p.total = 60;
      p.searchStatus = p.searchesDone ? 'done' : 'pending';
    });

    profilesLoaded = profiles.length > 0;
    renderGrid();
    updateDoneCounter();
  } catch (err) {
    console.error('[Dashboard] loadProfiles error:', err);
    if (retries > 0) {
      setTimeout(() => loadProfiles(retries - 1), 2000);
    } else {
      setStatus('❌', 'Failed to load profiles: ' + err.message, 'error');
    }
  }
}

// ─── Render Account Cards ───
function renderGrid() {
  if (!dom.accountsGrid) return;
  dom.accountsGrid.innerHTML = '';

  if (profiles.length === 0) {
    dom.accountsGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:#667788;">
        <div style="font-size:40px;margin-bottom:12px;">🔍</div>
        <div style="font-size:15px;font-weight:500;">Loading Edge profiles...</div>
        <div style="font-size:12px;margin-top:6px;">If this persists, restart the app</div>
      </div>`;
    return;
  }

  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'account-card';
    card.dataset.dir = p.dir;

    if (p.searchesDone) card.classList.add('done');
    if (selectedProfiles.has(p.dir) && !p.searchesDone) card.classList.add('selected');
    if (p.searchStatus === 'searching') card.classList.add('searching');
    if (p.searchStatus === 'keepalive') card.classList.add('keepalive');

    let badgeClass = 'badge-pending', badgeText = 'Pending';
    if (p.searchesDone && p.onlineTimeDone) { badgeClass = 'badge-done'; badgeText = '✅ Done'; }
    else if (p.searchesDone) { badgeClass = 'badge-done-earlier'; badgeText = 'Searches Done'; }
    else if (p.searchStatus === 'searching') { badgeClass = 'badge-searching'; badgeText = '🔍 Searching'; }
    else if (p.searchStatus === 'keepalive') { badgeClass = 'badge-keepalive'; badgeText = '💤 Keep-Alive'; }

    const pct = p.searchesDone ? 100 : (p.total > 0 ? Math.round((p.executed / p.total) * 100) : 0);
    const progressClass = p.searchesDone ? 'done' : (p.searchStatus === 'searching' ? 'active' : '');

    card.innerHTML = `
      <div class="card-header">
        <div class="card-checkbox"></div>
        <span class="card-status-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="card-name">${esc(p.displayName)}</div>
      <div class="card-dir">${p.dir}</div>
      <div class="card-progress">
        <div class="progress-track">
          <div class="progress-fill ${progressClass}" style="width:${pct}%"></div>
        </div>
        <span class="progress-text">${p.searchesDone ? p.searchCount : p.executed}/${p.total}</span>
      </div>
      <div class="card-meta">
        <div class="online-timer">
          <div class="online-dot ${p.isConnected ? 'active' : ''}"></div>
          <span>${p.onlineTimeDone ? '30m ✓' : p.onlineMinutes + 'm / 30m'}</span>
        </div>
        ${p.completedAt ? `<span class="completed-time">Done at ${p.completedAt}</span>` : ''}
      </div>`;

    card.addEventListener('click', () => {
      if (p.searchesDone || sessionRunning) return;
      if (selectedProfiles.has(p.dir)) {
        selectedProfiles.delete(p.dir);
        card.classList.remove('selected');
      } else {
        selectedProfiles.add(p.dir);
        card.classList.add('selected');
      }
    });

    dom.accountsGrid.appendChild(card);
  });
}

function updateDoneCounter() {
  if (!dom.doneCounter) return;
  const done = profiles.filter(p => p.searchesDone).length;
  dom.doneCounter.textContent = `${done}/${profiles.length} done today`;
}

// ─── Event Listeners ───
function setupUI() {
  // Run All
  on(dom.btnRunAll, 'click', async () => {
    if (!profilesLoaded || profiles.length === 0) {
      setStatus('⚠️', 'Profiles still loading... hang on!', 'warning');
      loadProfiles();
      return;
    }
    const undone = profiles.filter(p => !p.searchesDone).map(p => p.dir);
    if (undone.length === 0) {
      setStatus('🎉', 'All accounts are already done today!', 'success');
      return;
    }
    await startSession(undone);
  });

  // Run Selected
  on(dom.btnRunSelected, 'click', async () => {
    if (selectedProfiles.size === 0) {
      setStatus('⚠️', 'Select at least one account first!', 'warning');
      return;
    }
    await startSession([...selectedProfiles]);
  });

  // Stop
  on(dom.btnStop, 'click', async () => {
    await ipcRenderer.invoke('stop-session');
    endSessionUI();
  });

  // Select All
  on(dom.btnSelectAll, 'click', () => {
    const undone = profiles.filter(p => !p.searchesDone);
    if (selectedProfiles.size === undone.length) {
      selectedProfiles.clear();
    } else {
      undone.forEach(p => selectedProfiles.add(p.dir));
    }
    renderGrid();
  });

  // Close prompt
  on(dom.btnCloseMistake, 'click', () => {
    if (pendingCloseProfile) {
      ipcRenderer.invoke('respond-to-close', pendingCloseProfile, true);
      addLogEntry(`Reopening ${pendingCloseProfile}...`, 'info');
    }
    if (dom.closePromptModal) dom.closePromptModal.style.display = 'none';
    pendingCloseProfile = null;
  });

  on(dom.btnCloseIntentional, 'click', () => {
    if (pendingCloseProfile) {
      ipcRenderer.invoke('respond-to-close', pendingCloseProfile, false);
      addLogEntry(`${pendingCloseProfile} closed intentionally`, 'warning');
    }
    if (dom.closePromptModal) dom.closePromptModal.style.display = 'none';
    pendingCloseProfile = null;
  });

  // Settings
  on(dom.btnSettings, 'click', async () => {
    const settings = await ipcRenderer.invoke('get-settings');
    if (dom.setSearchCount) dom.setSearchCount.value = settings.searchesPerAccount || 60;
    if (dom.setConcurrent) dom.setConcurrent.value = settings.maxConcurrentSearches || 2;
    if (dom.setDelay) dom.setDelay.value = Math.floor((settings.searchDelay || 10000) / 1000);
    if (dom.setDelayValue) dom.setDelayValue.textContent = dom.setDelay.value + 's';
    if (dom.setReminders) dom.setReminders.checked = settings.reminderEnabled !== false;
    if (dom.settingsOverlay) dom.settingsOverlay.style.display = 'flex';
  });

  on(dom.btnCloseSettings, 'click', () => {
    if (dom.settingsOverlay) dom.settingsOverlay.style.display = 'none';
  });

  on(dom.setDelay, 'input', () => {
    if (dom.setDelayValue) dom.setDelayValue.textContent = dom.setDelay.value + 's';
  });

  on(dom.btnSaveSettings, 'click', async () => {
    await ipcRenderer.invoke('save-settings', {
      searchesPerAccount: parseInt(dom.setSearchCount?.value) || 60,
      maxConcurrentSearches: parseInt(dom.setConcurrent?.value) || 2,
      searchDelay: parseInt(dom.setDelay?.value) * 1000 || 10000,
      reminderEnabled: dom.setReminders?.checked ?? true
    });
    if (dom.settingsOverlay) dom.settingsOverlay.style.display = 'none';
    setStatus('✅', 'Settings saved!', 'success');
    setTimeout(() => setStatus('🟢', 'Ready — Select accounts and start your session', 'info'), 3000);
  });

  // Window controls — direct IPC send
  on(dom.btnMinimize, 'click', () => ipcRenderer.send('window-minimize'));
  on(dom.btnClose, 'click', () => ipcRenderer.send('window-close'));
}

// ─── Session ───
async function startSession(profileDirs) {
  const result = await ipcRenderer.invoke('start-session', profileDirs);
  if (!result.success) {
    setStatus('❌', result.error || 'Failed to start session', 'error');
    return;
  }
  sessionRunning = true;
  sessionStartTime = Date.now();

  if (dom.btnRunAll) dom.btnRunAll.style.display = 'none';
  if (dom.btnRunSelected) dom.btnRunSelected.style.display = 'none';
  if (dom.btnStop) dom.btnStop.style.display = 'flex';
  if (dom.sessionPanel) dom.sessionPanel.style.display = 'block';
  if (dom.sessionLog) dom.sessionLog.innerHTML = '';

  addLogEntry(`Session started with ${profileDirs.length} profiles`, 'info');

  profileDirs.forEach(dir => {
    const p = profiles.find(pr => pr.dir === dir);
    if (p) p.searchStatus = 'waiting';
  });
  renderGrid();

  sessionTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    if (dom.sessionElapsed) dom.sessionElapsed.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

function endSessionUI() {
  sessionRunning = false;
  if (sessionTimer) clearInterval(sessionTimer);
  if (dom.btnRunAll) dom.btnRunAll.style.display = 'flex';
  if (dom.btnRunSelected) dom.btnRunSelected.style.display = 'flex';
  if (dom.btnStop) dom.btnStop.style.display = 'none';
  profiles.forEach(p => { if (p.searchStatus !== 'done') p.searchStatus = 'pending'; });
  renderGrid();
}

// ─── IPC Events from Main Process ───
function setupIPC() {
  ipcRenderer.on('search-progress', (_, data) => {
    const p = profiles.find(pr => pr.dir === data.profileDir);
    if (p) { p.executed = data.executed; p.total = data.total; p.searchStatus = 'searching'; renderGrid(); }
  });

  ipcRenderer.on('search-complete', (_, data) => {
    const p = profiles.find(pr => pr.dir === data.profileDir);
    if (p) {
      p.searchesDone = true; p.searchCount = data.totalExecuted; p.searchStatus = 'done'; p.executed = data.totalExecuted;
      renderGrid(); updateDoneCounter();
      addLogEntry(`✅ ${data.displayName}: ${data.totalExecuted} searches complete!`, 'success');
    }
  });

  ipcRenderer.on('profile-launched', (_, data) => {
    addLogEntry(`🚀 Launched profile ${data.index}/${data.total}: ${data.profileDir}`, 'info');
  });

  ipcRenderer.on('extension-connected', (_, data) => {
    const p = profiles.find(pr => pr.dir === data.profileDir);
    if (p) { p.isConnected = true; renderGrid(); }
    addLogEntry(`🔗 Extension connected: ${data.profileDir}`, 'info');
  });

  ipcRenderer.on('profile-disconnected', (_, data) => {
    const p = profiles.find(pr => pr.dir === data.profileDir);
    if (p) { p.isConnected = false; renderGrid(); }
  });

  ipcRenderer.on('online-time-update', (_, data) => {
    const p = profiles.find(pr => pr.dir === data.profileDir);
    if (p) { p.onlineMinutes = data.minutes; p.onlineTimeDone = data.met; renderGrid(); }
  });

  ipcRenderer.on('status-message', (_, data) => {
    setStatus(data.type === 'error' ? '❌' : data.type === 'info' ? 'ℹ️' : '✅', data.text, data.type);
    if (data.type !== 'error') addLogEntry(data.text, data.type);
  });

  ipcRenderer.on('profile-close-prompt', (_, data) => {
    pendingCloseProfile = data.profileDir;
    if (dom.closePromptText) dom.closePromptText.textContent = `"${data.displayName}" was closed. Did you close it by mistake?`;
    if (dom.closePromptModal) dom.closePromptModal.style.display = 'flex';
  });

  ipcRenderer.on('session-done', (_, data) => {
    addLogEntry(`🎉 ${data.message}`, 'success');
    setStatus('🎉', data.message, 'success');
    endSessionUI();
    loadProfiles();
  });

  ipcRenderer.on('session-update', (_, data) => {
    const p = profiles.find(pr => pr.dir === data.profileDir);
    if (p && data.status === 'searching') { p.searchStatus = 'searching'; renderGrid(); }
    if (data.message) addLogEntry(data.message, 'info');
  });
}

// ─── Helpers ───
function setStatus(icon, text, type) {
  if (dom.statusIcon) dom.statusIcon.textContent = icon;
  if (dom.statusText) dom.statusText.textContent = text;
  const banner = dom.statusIcon?.closest('.status-banner');
  if (banner) {
    if (type === 'error') banner.style.borderColor = 'rgba(255,23,68,0.3)';
    else if (type === 'success') banner.style.borderColor = 'rgba(0,230,118,0.3)';
    else if (type === 'warning') banner.style.borderColor = 'rgba(255,171,0,0.3)';
    else banner.style.borderColor = '';
  }
}

function addLogEntry(text, type = 'info') {
  if (!dom.sessionLog) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  entry.innerHTML = `<span class="log-time">${time}</span><span>${esc(text)}</span>`;
  dom.sessionLog.prepend(entry);
  while (dom.sessionLog.children.length > 50) dom.sessionLog.lastChild.remove();
}

function esc(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  initDOM();
  updateClock();
  setInterval(updateClock, 1000);
  setupUI();
  setupIPC();
  loadProfiles();
  setInterval(() => { if (!sessionRunning) loadProfiles(); }, 30000);
});
