// renderer/app.js — Dashboard logic, live updates, account management
// Direct IPC via require('electron') — no preload bridge needed

const { ipcRenderer } = require('electron');
const { ExtensionInstance } = require('./extension-logic.js');

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
    'btnSettings', 'closePromptModal', 'closePromptText',
    'btnCloseMistake', 'btnCloseIntentional', 'settingsOverlay',
    'btnCloseSettings', 'btnSaveSettings', 'setSearchCount',
    'setConcurrent', 'setDelay', 'setDelayValue', 'setReminders',
    'btnMinimize', 'btnClose', 'dashboardView', 'sessionView',
    'sessionElapsed', 'sessionProgressText', 'btnStopSession',
    'consolePanel', 'consoleBody', 'btnToggleConsole', 'webviewGrid'
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
  // FORCE BUTTONS TO SHOW
  if (dom.btnRunAll) dom.btnRunAll.style.display = 'flex';
  if (dom.btnRunSelected) dom.btnRunSelected.style.display = 'flex';

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

  // Window controls
  on(dom.btnMinimize, 'click', () => ipcRenderer.send('window-minimize'));
  on(dom.btnClose, 'click', () => ipcRenderer.send('window-close'));

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

  on(dom.btnStopSession, 'click', async () => {
    await ipcRenderer.invoke('stop-session');
    endSessionUI();
  });

  on(dom.btnToggleConsole, 'click', () => {
    if (dom.consolePanel.classList.contains('collapsed')) {
      dom.consolePanel.classList.remove('collapsed');
      dom.btnToggleConsole.style.transform = 'rotate(0deg)';
    } else {
      dom.consolePanel.classList.add('collapsed');
      dom.btnToggleConsole.style.transform = 'rotate(180deg)';
    }
  });
}

const extensionInstances = {};

function addLogEntry(text, type = 'info') {
  if (!dom.consoleBody) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${esc(text)}</span>`;
  dom.consoleBody.appendChild(entry);
  dom.consoleBody.scrollTop = dom.consoleBody.scrollHeight;
  while (dom.consoleBody.children.length > 200) dom.consoleBody.firstChild.remove();
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

  dom.dashboardView.style.display = 'none';
  dom.sessionView.style.display = 'flex';
  dom.consoleBody.innerHTML = '';
  dom.webviewGrid.innerHTML = '';

  addLogEntry(`Session started with ${profileDirs.length} profiles`, 'info');

  profileDirs.forEach((dir, index) => {
    const p = profiles.find(pr => pr.dir === dir);
    if (p) p.searchStatus = 'waiting';

    // Create wrapper for webview and extension panel
    const wrapper = document.createElement('div');
    wrapper.className = 'webview-wrapper';
    
    // Create the HTML template for the UI
    wrapper.innerHTML = `
      <div class="webview-header">
        <span class="webview-title">${esc(p ? p.displayName : dir)}</span>
        <button class="toggle-extension-btn" id="toggle-${index}">⚙️ Config</button>
      </div>
      <webview id="wv-${index}" src="https://www.bing.com" partition="persist:${dir}" 
               useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0" 
               style="flex:1; width:100%; height:100%; border:none;"></webview>
      
      <!-- The Collapsible Extension UI -->
      <div class="extension-panel lavish-container" id="panel-${index}" style="display:none; overflow-y:auto; padding: 10px; max-height:400px;">
        
        <div id="authSection-${index}" style="text-align:center;">
          <input type="text" id="apiKey-${index}" placeholder="Enter API Key to Unlock" class="input-field">
          <button id="btnUnlock-${index}" class="btn">Unlock</button>
        </div>

        <div id="mainSection-${index}" style="display: none;">
          <div id="statusMessage-${index}" class="status-message" style="display:block; text-align:center;"></div>
          <p id="status-${index}" class="status" style="text-align:center;">Offline</p>
          
          <button id="btnStart-${index}" class="btn">Start</button>
          
          <div class="control-section">
            <label class="label-text">Start from query number:</label>
            <input type="number" id="startFrom-${index}" class="number-input" min="1" max="60" value="1">
          </div>
          
          <div class="control-section">
            <label class="label-text">Delay between searches: <span id="delayValue-${index}">10</span>s</label>
            <input type="range" id="delaySlider-${index}" class="slider" min="1" max="60" value="10">
          </div>
          
          <div class="progress-section">
            <div class="progress-header">
              <span class="progress-label">Search Progress</span>
              <span class="progress-percentage" id="progressPct-${index}">0%</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar" id="progressBar-${index}"></div>
            </div>
          </div>
          
          <div class="control-section graph-wrapper">
            <div class="graph-header">
              <label class="label-text">Live Search Latency</label>
            </div>
            <div class="graph-container">
              <canvas id="chartCanvas-${index}" width="600" height="300"></canvas>
            </div>
          </div>

          <div class="current-query-section">
            <label class="label-text">Current Query:</label>
            <div class="current-query-box" id="currentQuery-${index}">Ready...</div>
          </div>
          
          <div class="stats-section">
            <div class="stat-row">
              <span class="stat-label">Searches done:</span>
              <span class="stat-value" id="countText-${index}">0</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total prompts:</span>
              <span class="stat-value" id="totalPrompts-${index}">0</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Remaining:</span>
              <span class="stat-value" id="remainingText-${index}">0</span>
            </div>
          </div>
          
          <button id="btnRefresh-${index}" class="btn secondary-btn">Refresh Prompts</button>
          
          <div class="control-section" style="text-align: center; margin-top:20px;">
            <button id="btnFlash-${index}" class="btn flash-btn" style="background: linear-gradient(45deg, #ff9800, #ff5722);">ACTIVATE FLASH ⚡</button>
          </div>
          
        </div>
      </div>
    `;
    
    dom.webviewGrid.appendChild(wrapper);

    // Setup Toggle Logic
    const toggleBtn = wrapper.querySelector(`#toggle-${index}`);
    const panel = wrapper.querySelector(`#panel-${index}`);
    toggleBtn.addEventListener('click', () => {
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
        toggleBtn.classList.add('active');
        // Force chart to resize correctly after becoming visible
        if (extensionInstances[dir] && extensionInstances[dir].chart) {
           extensionInstances[dir].chart.resize();
        }
      } else {
        panel.style.display = 'none';
        toggleBtn.classList.remove('active');
      }
    });

    // Initialize Extension Logic for this webview
    const webviewEl = wrapper.querySelector(`#wv-${index}`);
    
    // Hide native scrollbars in the embedded page and handle zoom
    webviewEl.addEventListener('dom-ready', () => {
      webviewEl.insertCSS('::-webkit-scrollbar { display: none !important; }');
      
      // Auto-scale zoom based on the wrapper width
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
           const width = entry.contentRect.width;
           // If width is 800px or more, zoom is 1.0. If width is 400px, zoom is 0.5.
           let zoom = width / 800;
           if (zoom > 1.0) zoom = 1.0;
           if (zoom < 0.25) zoom = 0.25;
           try {
             webviewEl.setZoomFactor(zoom);
           } catch(e) {}
        }
      });
      resizeObserver.observe(wrapper);
    });

    const uiElements = {
      authSection: wrapper.querySelector(`#authSection-${index}`),
      mainSection: wrapper.querySelector(`#mainSection-${index}`),
      apiKeyInput: wrapper.querySelector(`#apiKey-${index}`),
      btnUnlock: wrapper.querySelector(`#btnUnlock-${index}`),
      statusMessage: wrapper.querySelector(`#statusMessage-${index}`),
      statusText: wrapper.querySelector(`#status-${index}`),
      btnStart: wrapper.querySelector(`#btnStart-${index}`),
      btnFlash: wrapper.querySelector(`#btnFlash-${index}`),
      startFromInput: wrapper.querySelector(`#startFrom-${index}`),
      delaySlider: wrapper.querySelector(`#delaySlider-${index}`),
      delayValue: wrapper.querySelector(`#delayValue-${index}`),
      progressPct: wrapper.querySelector(`#progressPct-${index}`),
      progressBar: wrapper.querySelector(`#progressBar-${index}`),
      chartCanvas: wrapper.querySelector(`#chartCanvas-${index}`),
      currentQuery: wrapper.querySelector(`#currentQuery-${index}`),
      countText: wrapper.querySelector(`#countText-${index}`),
      totalPrompts: wrapper.querySelector(`#totalPrompts-${index}`),
      remainingText: wrapper.querySelector(`#remainingText-${index}`),
      btnRefresh: wrapper.querySelector(`#btnRefresh-${index}`)
    };

    // Instantiate and store
    extensionInstances[dir] = new ExtensionInstance(dir, webviewEl, uiElements);
  });

  // Calculate dynamic Flexbox layout to perfectly fill screen without gaps or squishing
  const count = profileDirs.length;
  let targetCols;
  if (count <= 2) targetCols = count;
  else if (count <= 4) targetCols = 2;
  else if (count <= 6) targetCols = 3;
  else targetCols = 4; // Max 4 columns for 7+ profiles

  const rowCount = Math.ceil(count / targetCols);
  let rowHeight;
  if (rowCount === 1) rowHeight = 'calc(100vh - 200px)';
  else if (rowCount === 2) rowHeight = 'calc(50vh - 100px)';
  else rowHeight = '380px'; // fixed height to prevent vertical squishing for 3+ rows

  const basis = `calc(${100 / targetCols}% - 20px)`; // flex-basis accounting for gap

  dom.webviewGrid.style.display = 'flex';
  dom.webviewGrid.style.flexWrap = 'wrap';
  dom.webviewGrid.style.overflowY = 'auto';
  dom.webviewGrid.style.alignContent = 'flex-start';

  // Apply flex properties to each wrapper directly so last row expands to fill space
  Array.from(dom.webviewGrid.children).forEach(wrapper => {
    wrapper.style.flex = `1 1 ${basis}`;
    wrapper.style.height = rowHeight;
    wrapper.style.minWidth = '240px'; // Prevent it from getting too impossibly tiny
  });

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
  
  // Stop all extensions
  Object.values(extensionInstances).forEach(inst => inst.stopSearching());
  
  dom.dashboardView.style.display = 'block';
  dom.sessionView.style.display = 'none';
  if (dom.btnRunAll) dom.btnRunAll.style.display = 'flex';
  if (dom.btnRunSelected) dom.btnRunSelected.style.display = 'flex';
  
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

// No longer needed: function addLogEntry... (moved to top)

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

  // DEBUG LOGGING
  const fs = require('fs');
  const path = require('path');
  setInterval(() => {
    const actionBar = document.querySelector('.action-bar');
    if (actionBar) {
      fs.writeFileSync(path.join(__dirname, '..', 'debug_actionbar.txt'), actionBar.outerHTML);
    }
  }, 2000);
});
