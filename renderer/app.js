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
    'btnRefreshProfiles', 'closePromptModal', 'closePromptText',
    'btnCloseMistake', 'btnCloseIntentional', 'settingsOverlay',
    'btnCloseSettings', 'btnSaveSettings', 'setSearchCount',
    'setConcurrent', 'setDelay', 'setDelayValue', 'setReminders',
    'btnMinimize', 'btnClose', 'dashboardView', 'sessionView',
    'btnStopSession', 'consoleBody', 'btnToggleConsole', 'webviewGrid',
    'holisticPointsCounter', 'nutshellList', 'globalTimeframeInput', 
    'btnGlobalRefresh', 'btnGlobalStart', 'setGroqApiKey',
    'btnGlobalFlash', 'btnProfileFlash', 'profFlashCountdown',
    'homeHolisticPoints'
  ].forEach(id => { dom[id] = $(id); });
  
  if (dom.setGroqApiKey) {
    dom.setGroqApiKey.value = localStorage.getItem('GROQ_API_KEY') || '';
  }
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
      p.executed = s.searchCount || 0;
      
      const customMaxStr = localStorage.getItem('customMaxPoints_' + p.dir);
      const customMax = customMaxStr ? parseInt(customMaxStr) : null;
      p.total = customMax ? Math.ceil(customMax / 3) : 60;
      
      p.searchStatus = p.searchesDone ? 'done' : 'pending';
    });

    profilesLoaded = profiles.length > 0;
    renderGrid();
    updateDoneCounter();
    updateProfileDropdown();
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
  
  let homeTotalPoints = 0;

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

    const pct = p.searchesDone ? 100 : (p.total > 0 ? Math.min(100, Math.round((p.executed / p.total) * 100)) : 0);
    const progressClass = p.searchesDone ? 'done' : (p.searchStatus === 'searching' ? 'active' : '');

    // Holistic Point Calculation for Dashboard
    let currentPts = p.searchesDone ? (p.searchCount * 3) : (p.executed * 3);
    const customMax = localStorage.getItem('customMaxPoints_' + p.dir);
    const maxPts = customMax ? parseInt(customMax) : (p.total * 3);
    homeTotalPoints += Math.min(currentPts, maxPts);

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
        <span class="progress-text">${Math.min(p.searchesDone ? (p.searchCount * 3) : (p.executed * 3), p.total * 3)}/${p.total * 3}</span>
      </div>
      <div class="card-meta">
        <div class="online-timer">
          <div class="online-dot ${p.isConnected ? 'active' : ''}"></div>
          <span>${p.onlineTimeDone ? '30m ✓' : p.onlineMinutes + 'm / 30m'}</span>
        </div>
        ${p.completedAt ? `<span class="completed-time">Done at ${p.completedAt}</span>` : ''}
      </div>`;

    card.addEventListener('click', () => {
      if (sessionRunning) return;
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
  
  // Add "Add more profiles" Card
  const addCard = document.createElement('div');
  addCard.className = 'add-profile-card';
  addCard.innerHTML = `
    <div class="add-bg-text">Add more profiles</div>
    <div class="add-icon">+</div>
    <div class="add-profile-form" id="addProfileForm">
      <input type="text" id="newProfileName" placeholder="Profile Name (e.g. Work)">
      <input type="number" id="newProfileMaxPts" placeholder="Max Points (e.g. 60)" value="60">
      <div class="form-actions">
        <button class="action-btn ghost" id="btnCancelAdd">CANCEL</button>
        <button class="action-btn primary" id="btnDoneAdd">DONE</button>
      </div>
    </div>
  `;
  dom.accountsGrid.appendChild(addCard);

  // Setup Add Profile Interactions
  const addIcon = addCard.querySelector('.add-icon');
  const addBgText = addCard.querySelector('.add-bg-text');
  const addForm = addCard.querySelector('.add-profile-form');
  const btnCancelAdd = addCard.querySelector('#btnCancelAdd');
  const btnDoneAdd = addCard.querySelector('#btnDoneAdd');
  const inputName = addCard.querySelector('#newProfileName');
  const inputPts = addCard.querySelector('#newProfileMaxPts');

  addCard.addEventListener('click', (e) => {
    if (e.target === addCard || e.target === addIcon || e.target === addBgText) {
      addIcon.style.display = 'none';
      addBgText.style.display = 'none';
      addForm.style.display = 'flex';
      addCard.style.cursor = 'default';
      inputName.focus();
    }
  });

  btnCancelAdd.addEventListener('click', (e) => {
    e.stopPropagation();
    addForm.style.display = 'none';
    addIcon.style.display = 'block';
    addBgText.style.display = 'block';
    addCard.style.cursor = 'pointer';
    inputName.value = '';
    inputPts.value = '60';
  });

  btnDoneAdd.addEventListener('click', async (e) => {
    e.stopPropagation();
    const name = inputName.value.trim();
    const maxPts = parseInt(inputPts.value) || 60;
    if (!name) return alert('Please enter a profile name');
    
    // Call IPC to create new profile directory
    btnDoneAdd.textContent = '...';
    try {
      const newDir = await ipcRenderer.invoke('create-new-profile', { name });
      if (newDir) {
        localStorage.setItem('customMaxPoints_' + newDir, maxPts.toString());
        loadProfiles();
      } else {
        alert('Failed to create profile directory.');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  if (dom.homeHolisticPoints) {
    dom.homeHolisticPoints.textContent = homeTotalPoints;
  }
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
  if (dom.btnRefreshProfiles) dom.btnRefreshProfiles.style.display = 'flex';

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

  dom.nutshellInfoBtn = document.getElementById('nutshellInfoBtn');
  dom.nutshellInfoModal = document.getElementById('nutshellInfoModal');
  dom.nutshellInfoClose = document.getElementById('nutshellInfoClose');
  
  if (dom.nutshellInfoBtn) {
    dom.nutshellInfoBtn.addEventListener('click', () => {
       dom.nutshellInfoModal.classList.toggle('show');
    });
  }
  
  if (dom.nutshellInfoClose) {
    dom.nutshellInfoClose.addEventListener('click', () => {
       dom.nutshellInfoModal.classList.remove('show');
    });
  }

  // Close prompt
  on(dom.btnCloseMistake, 'click', () => {
    if (pendingCloseProfile) {
      ipcRenderer.invoke('respond-to-close', pendingCloseProfile, true);
      addLogEntry(`Reopening ${pendingCloseProfile}...`, 'info');
    }
    if (dom.closePromptModal) dom.closePromptModal.style.display = 'none';
    pendingCloseProfile = null;
  });

  // Context Menu Setup
  let contextMenuTargetDir = null;
  const ctxMenu = document.getElementById('profileContextMenu');
  if (ctxMenu) {
      document.getElementById('accountsGrid').addEventListener('contextmenu', (e) => {
        const card = e.target.closest('.account-card');
        if (card && !sessionRunning) {
          e.preventDefault();
          contextMenuTargetDir = card.querySelector('.card-dir').textContent;
          const p = profiles.find(pr => pr.dir === contextMenuTargetDir);
          
          if (p && p.searchesDone) {
             document.getElementById('ctxMarkDone').style.display = 'none';
             document.getElementById('ctxMarkUndone').style.display = 'block';
          } else {
             document.getElementById('ctxMarkDone').style.display = 'block';
             document.getElementById('ctxMarkUndone').style.display = 'none';
          }
          
          if (p && p.isAppCreated) {
             document.getElementById('ctxRenameProfile').style.display = 'block';
             document.getElementById('ctxDeleteProfile').style.display = 'block';
          } else {
             document.getElementById('ctxRenameProfile').style.display = 'none';
             document.getElementById('ctxDeleteProfile').style.display = 'none';
          }

          ctxMenu.style.display = 'block';
          ctxMenu.style.left = e.pageX + 'px';
          ctxMenu.style.top = e.pageY + 'px';
        } else {
          ctxMenu.style.display = 'none';
        }
      });
      
      const globalCtxMenu = document.getElementById('globalPointsContextMenu');
      const globalCanvas = document.getElementById('globalPointsCanvas');
      if (globalCtxMenu && globalCanvas) {
          globalCanvas.addEventListener('contextmenu', (e) => {
            if (!sessionRunning) {
              e.preventDefault();
              globalCtxMenu.style.display = 'block';
              globalCtxMenu.style.left = e.pageX + 'px';
              globalCtxMenu.style.top = e.pageY + 'px';
            }
          });
      }

      document.addEventListener('click', () => {
        ctxMenu.style.display = 'none';
        if (globalCtxMenu) globalCtxMenu.style.display = 'none';
      });

      document.getElementById('ctxMarkDone')?.addEventListener('click', async () => {
        if (contextMenuTargetDir) {
          const p = profiles.find(pr => pr.dir === contextMenuTargetDir);
          await ipcRenderer.invoke('mark-profile-done-manual', contextMenuTargetDir, p ? p.total : 60);
          loadProfiles();
        }
      });

      document.getElementById('ctxMarkUndone')?.addEventListener('click', async () => {
        if (contextMenuTargetDir) {
          await ipcRenderer.invoke('mark-profile-undone-manual', contextMenuTargetDir);
          loadProfiles();
        }
      });

      document.getElementById('ctxRenameProfile')?.addEventListener('click', async () => {
        if (contextMenuTargetDir) {
          const p = profiles.find(pr => pr.dir === contextMenuTargetDir);
          const modal = document.getElementById('promptModal');
          const input = document.getElementById('promptModalInput');
          const btnCancel = document.getElementById('btnPromptCancel');
          const btnConfirm = document.getElementById('btnPromptConfirm');
          
          input.value = p ? p.displayName : '';
          modal.style.display = 'flex';
          input.focus();
          
          const cleanup = () => {
             modal.style.display = 'none';
             btnCancel.removeEventListener('click', onCancel);
             btnConfirm.removeEventListener('click', onConfirm);
          };
          
          const onCancel = () => cleanup();
          const onConfirm = async () => {
             const newName = input.value.trim();
             cleanup();
             if (newName) {
               try {
                 await ipcRenderer.invoke('rename-profile', { dir: contextMenuTargetDir, newName });
                 loadProfiles();
               } catch (e) {
                 alert('Failed to rename profile.');
               }
             }
          };
          
          btnCancel.addEventListener('click', onCancel);
          btnConfirm.addEventListener('click', onConfirm);
        }
      });

      document.getElementById('ctxDeleteProfile')?.addEventListener('click', async () => {
        if (contextMenuTargetDir) {
          if (confirm('Are you absolutely sure you want to permanently delete this profile and all its data? This cannot be undone.')) {
            try {
              await ipcRenderer.invoke('delete-profile', { dir: contextMenuTargetDir });
              loadProfiles();
            } catch (e) {
              alert('Failed to delete profile.');
            }
          }
        }
      });

      document.getElementById('ctxResetGlobalPoints')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to completely reset the Global Points tracker and start fresh for today?')) {
          await ipcRenderer.invoke('reset-global-points');
          loadProfiles();
        }
      });
      
      // Inject hover styles
      const style = document.createElement('style');
      style.innerHTML = '.ctx-item:hover { background: #2a354a; }';
      document.head.appendChild(style);
  }
  // Context menu logic ends here.

  on(dom.btnCloseIntentional, 'click', () => {
    if (pendingCloseProfile) {
      ipcRenderer.invoke('respond-to-close', pendingCloseProfile, false);
      addLogEntry(`${pendingCloseProfile} closed intentionally`, 'warning');
    }
    if (dom.closePromptModal) dom.closePromptModal.style.display = 'none';
    pendingCloseProfile = null;
  });

  // Settings / Refresh Profiles
  on(dom.btnRefreshProfiles, 'click', async () => {
    addLogEntry('Refreshing profiles...', 'info');
    dom.btnRefreshProfiles.classList.add('spinning'); // optional css animation class if added
    await loadProfiles();
    setTimeout(() => dom.btnRefreshProfiles.classList.remove('spinning'), 500);
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
    if (dom.setGroqApiKey) localStorage.setItem('GROQ_API_KEY', dom.setGroqApiKey.value.trim());
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

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;

function stringifyArgs(args) {
  return Array.from(args).map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  addLogEntry(stringifyArgs(args), 'log');
};
console.warn = function(...args) {
  originalConsoleWarn.apply(console, args);
  addLogEntry(stringifyArgs(args), 'warn');
};
console.error = function(...args) {
  originalConsoleError.apply(console, args);
  addLogEntry(stringifyArgs(args), 'error');
};
console.info = function(...args) {
  originalConsoleInfo.apply(console, args);
  addLogEntry(stringifyArgs(args), 'info');
};

function addLogEntry(text, type = 'info') {
  if (!dom.consoleBody) return;
  const entry = document.createElement('div');
  
  let cleanText = esc(text);
  let prefix = '';
  // Extract [SYS], [BOT], or [ProfileName] to style it separately
  const match = cleanText.match(/^(\[.*?\])\s*(.*)/);
  if (match) {
    prefix = `<span class="log-prefix">${match[1]}</span> `;
    cleanText = match[2];
  }

  entry.className = `log-entry ${type}`;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const time = `${h}:${m}:${s}.${ms}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span> ${prefix}<span class="log-msg">${cleanText}</span>`;
  dom.consoleBody.appendChild(entry);
  dom.consoleBody.scrollTop = dom.consoleBody.scrollHeight;
  while (dom.consoleBody.children.length > 500) dom.consoleBody.firstChild.remove();
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
  
  // Clear any existing instances from previous sessions to prevent zombie ghosting
  for (let key in extensionInstances) {
      delete extensionInstances[key];
  }

  addLogEntry(`Session started with ${profileDirs.length} profiles`, 'info');

  // Update the Profile Level dropdown immediately with just the running profiles
  updateProfileDropdown(profileDirs);

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
        <div>
          <button class="toggle-extension-btn" id="toggleGraph-${index}" style="margin-right: 5px;">📊 Graph</button>
          <button class="toggle-extension-btn" id="toggle-${index}">⚙️ Config</button>
        </div>
      </div>
      <webview id="wv-${index}" src="https://www.bing.com" partition="persist:${dir}" 
               useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0" 
               style="flex:1; width:100%; height:100%; border:none;"></webview>
      
      <!-- The Dedicated Graph Panel -->
      <div class="extension-panel graph-panel-view lavish-container" id="graphPanel-${index}" style="display:none; padding: 8px 12px; max-height:400px; overflow: hidden;">
        <div class="graph-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <label class="label-text" style="font-size: 12px;">Advanced Search Analytics</label>
        </div>
        <div class="graph-container" style="flex: 1; height: 120px; padding: 2px;">
          <canvas id="chartCanvas-${index}" width="600" height="120"></canvas>
        </div>
      </div>

      <!-- The Collapsible Config Extension UI -->
      <div class="extension-panel lavish-container" id="panel-${index}" style="display:none; overflow-y:auto; padding: 10px; max-height:400px;">
        
        <h1 style="text-align:center; font-size: 18px; margin-top: 0; color: #00b0ff;">AUTO TYPER(v2.3)</h1>

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

          <div class="control-section" style="margin-top: 15px;">
            <label class="label-text">Choose Topics (Diversify History) ✨</label>
            <div id="categoryContainer-${index}" class="category-wrapper" style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;">
            </div>
            <div class="custom-category-input" style="display: flex; gap: 5px;">
               <input type="text" id="newCategoryInput-${index}" placeholder="+ Add your desire..." class="input-field" style="margin:0; font-size: 12px; height: 32px; flex: 1;">
               <button id="addCategoryBtn-${index}" class="btn secondary-btn" style="width: auto; margin:0; height: 32px; padding: 0 12px;">Add</button>
            </div>
          </div>
          
          <button id="btnRefresh-${index}" class="btn secondary-btn">Refresh Prompts</button>
          
          <!-- Flash button removed per user request -->
        </div>
      </div>
    `;
    
    dom.webviewGrid.appendChild(wrapper);

    // Setup Toggle Logic for Config Panel
    const toggleBtn = wrapper.querySelector(`#toggle-${index}`);
    const panel = wrapper.querySelector(`#panel-${index}`);
    const toggleGraphBtn = wrapper.querySelector(`#toggleGraph-${index}`);
    const graphPanel = wrapper.querySelector(`#graphPanel-${index}`);

    toggleBtn.addEventListener('click', () => {
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
        graphPanel.style.display = 'none'; // Ensure only one panel is open
        toggleBtn.classList.add('active');
        toggleGraphBtn.classList.remove('active');
      } else {
        panel.style.display = 'none';
        toggleBtn.classList.remove('active');
      }
    });

    // Setup Toggle Logic for Graph Panel
    toggleGraphBtn.addEventListener('click', () => {
      if (graphPanel.style.display === 'none') {
        graphPanel.style.display = 'block';
        panel.style.display = 'none'; // Ensure only one panel is open
        toggleGraphBtn.classList.add('active');
        toggleBtn.classList.remove('active');
        // Force chart to draw when becoming visible
        if (extensionInstances[dir] && typeof extensionInstances[dir].drawCustomGraph === 'function') {
           extensionInstances[dir].drawCustomGraph();
        }
      } else {
        graphPanel.style.display = 'none';
        toggleGraphBtn.classList.remove('active');
      }
    });

    // Initialize Extension Logic for this webview
    const webviewEl = wrapper.querySelector(`#wv-${index}`);
    
    // Hide native scrollbars in the embedded page and handle zoom
    webviewEl.addEventListener('dom-ready', () => {
      webviewEl.insertCSS('::-webkit-scrollbar { display: none !important; }');
      
      // Auto-scale zoom based on the wrapper width for both webview and extension overlay
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
           const width = entry.contentRect.width;
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
      btnRefresh: wrapper.querySelector(`#btnRefresh-${index}`),
      categoryContainer: wrapper.querySelector(`#categoryContainer-${index}`),
      newCategoryInput: wrapper.querySelector(`#newCategoryInput-${index}`),
      addCategoryBtn: wrapper.querySelector(`#addCategoryBtn-${index}`)
    };

    // Instantiate and store
    extensionInstances[dir] = new ExtensionInstance(dir, webviewEl, uiElements);
    if (p && p.executed > 0) {
       extensionInstances[dir].executedCount = p.executed;
       extensionInstances[dir].ui.countText.textContent = p.executed;
    }
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

  // Setup Global Holistic Controls
  if (dom.btnGlobalRefresh) {
    dom.btnGlobalRefresh.onclick = () => {
      const globalKey = '@Test01';
      Object.values(extensionInstances).forEach(inst => {
        localStorage.setItem(`apiKey_${inst.profileDir}`, globalKey);
        inst.refreshQueries(globalKey);
      });
      addLogEntry("Global Refresh triggered for all profiles.", "info");
    };
  }

  if (dom.btnGlobalStart) {
    dom.btnGlobalStart.onclick = () => {
      const globalKey = '@Test01';
      
      let customMins = parseInt(dom.globalTimeframeInput?.value);
      if (isNaN(customMins) || customMins <= 0) customMins = null;
      
      addLogEntry(`Global START triggered! Enforcing ${customMins ? customMins : '30-40 dynamic'} min timeframe.`, "success");
      
      Object.values(extensionInstances).forEach(inst => {
        localStorage.setItem(`apiKey_${inst.profileDir}`, globalKey);
        
        // Randomize number of searches strictly between 15 and 25 as requested
        const randomizedLimit = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
        inst.randomizedLimitOverride = randomizedLimit; // Set the override for the instance
        
        // Pass the custom timeframe down
        inst.globalTimeframeMinsOverride = customMins;
        inst.isGlobalStart = true;
        
        inst.startSearching();
      });
    };
  }

  if (dom.btnGlobalFlash) {
    dom.btnGlobalFlash.onclick = () => {
      const isStopping = dom.btnGlobalFlash.classList.contains('stop');
      if (isStopping) {
        dom.btnGlobalFlash.classList.remove('stop');
        dom.btnGlobalFlash.textContent = "ACTIVATE FLASH ⚡";
        Object.values(extensionInstances).forEach(inst => {
          inst.isRunning = false;
          inst.updateUIStatus('Stopped');
        });
        addLogEntry("Global Flash STOPPED manually.", "warning");
      } else {
        dom.btnGlobalFlash.classList.add('stop');
        dom.btnGlobalFlash.textContent = "STOP FLASH ⚡";
        addLogEntry("⚡ GLOBAL FLASH TRIGGERED! Bypassing constraints for all profiles...", "success");
        
        const globalKey = '@Test01';
        Object.values(extensionInstances).forEach(inst => {
          localStorage.setItem(`apiKey_${inst.profileDir}`, globalKey);
          
          // Set flash properties
          inst.isGlobalStart = false; // Disable global pacing
          inst.startSearching(0, true); // true = isFlash
        });
      }
    };
  }

  sessionTimer = setInterval(() => {
    if (!sessionRunning) return;
    
    let totalPoints = 0;
    
    // Ensure we don't have stray elements if profiles change
    if (dom.nutshellList && dom.nutshellList.children.length > profileDirs.length) {
        dom.nutshellList.innerHTML = ''; 
    }
    
    profileDirs.forEach((dir, i) => {
       const inst = extensionInstances[dir];
       if (!inst) return;
       const pName = profiles.find(pr => pr.dir === dir)?.displayName || `Profile ${i+1}`;
       
       const limit = inst.randomizedLimitOverride || (inst.queries ? Math.min(inst.queries.length, 60) : 0);
       const currentPts = inst.executedCount * 3;
       
       const customMax = localStorage.getItem('customMaxPoints_' + dir);
       const maxPts = customMax ? parseInt(customMax) : (limit * 3);
       
       totalPoints += Math.min(currentPts, maxPts);
       
       let statusColor = '#b0bec5';
       let isGlowing = false;
       
       if (inst.isRunning) {
           if (inst.isWaiting) {
               statusColor = '#00b0ff'; // Blue (Idle - Waiting for delay)
           } else {
               statusColor = '#69f0ae'; // Green (Active/Typing)
               isGlowing = true;
           }
       }
       else if (inst.executedCount >= limit && limit > 0) statusColor = '#b0bec5'; // Grey (Completed)
       else if (inst.executedCount > 0 && !inst.isRunning) statusColor = '#ff5252'; // Red (Error/Halted)
       
       if (dom.nutshellList) {
           let itemDiv = dom.nutshellList.children[i];
           if (!itemDiv) {
               itemDiv = document.createElement('div');
               itemDiv.className = 'nutshell-item';
               itemDiv.innerHTML = `
                  <span class="nutshell-name" style="white-space:nowrap; overflow:visible; font-weight:500; padding: 2px 0;"></span>
                  <span class="nutshell-points" style="font-weight:bold; transition: opacity 0.2s;"></span>
                  <div class="nutshell-edit-btn">✏️ Edit</div>
               `;
               dom.nutshellList.appendChild(itemDiv);
           }
           
           const nameSpan = itemDiv.querySelector('.nutshell-name');
           const ptsSpan = itemDiv.querySelector('.nutshell-points');
           const editBtn = itemDiv.querySelector('.nutshell-edit-btn');
           
           const newClass = isGlowing ? 'nutshell-name glowing-green' : 'nutshell-name';
           if (nameSpan.className !== newClass) nameSpan.className = newClass;
           if (nameSpan.style.color !== statusColor) nameSpan.style.color = statusColor;
           
           const nameText = `● ${pName}`;
           if (nameSpan.textContent !== nameText) {
               nameSpan.textContent = nameText;
               nameSpan.title = pName;
           }
           
           const ptsText = `${currentPts}/${maxPts}`;
           if (ptsSpan.textContent !== ptsText) ptsSpan.textContent = ptsText;
           
           // Using setAttribute to avoid function recreation loop issues but onclick works too
           editBtn.onclick = () => window.showPointsPrompt(dir.replace(/\\/g, '\\\\'), maxPts, pName.replace(/'/g, "\\'"));
       }
    });
    
    if (dom.holisticPointsCounter) dom.holisticPointsCounter.textContent = totalPoints;
  }, 1000);
}

window.showPointsPrompt = function(dir, currentMax, pName) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#1e2030;padding:20px;border-radius:8px;border:1px solid #00b0ff;color:#fff;width:300px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);';
  
  modal.innerHTML = `
    <h3 style="margin-top:0;font-size:16px;color:#00b0ff;margin-bottom:10px;">Edit Max Points</h3>
    <p style="font-size:12px;color:#b0bec5;margin-top:0;margin-bottom:15px;">Enter maximum points for <b>${pName}</b>:</p>
    <input type="number" id="promptInput" value="${currentMax}" style="width:100%;padding:10px;background:#0f111a;border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:4px;margin-bottom:20px;box-sizing:border-box;font-size:14px;outline:none;">
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button id="promptCancel" style="padding:8px 16px;background:rgba(255,255,255,0.1);border:none;color:#fff;border-radius:4px;cursor:pointer;transition:background 0.2s;">Cancel</button>
      <button id="promptSave" style="padding:8px 16px;background:#00b0ff;border:none;color:#000;font-weight:bold;border-radius:4px;cursor:pointer;transition:background 0.2s;">Save</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  const input = modal.querySelector('#promptInput');
  input.focus();
  input.select();
  
  const close = () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); };
  
  modal.querySelector('#promptCancel').onclick = close;
  modal.querySelector('#promptSave').onclick = () => {
    const val = parseInt(input.value);
    if (!isNaN(val)) {
      localStorage.setItem('customMaxPoints_' + dir, val);
    }
    close();
  };
  
  input.onkeydown = (e) => {
    if (e.key === 'Enter') modal.querySelector('#promptSave').click();
    if (e.key === 'Escape') close();
  };
};

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
  loadProfiles(0);
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

function updateProfileDropdown(activeDirsOverride = null) {
  const dropdown = document.getElementById('profileSettingsDropdown');
  const panel = document.getElementById('profileSettingsPanel');
  if (!dropdown) return;
  
  const currentVal = dropdown.value;
  dropdown.innerHTML = '<option value="">Select a profile...</option>';
  
  // If session is running, only show active profiles. Otherwise show all selected profiles or all profiles.
  let activeDirs = [];
  if (activeDirsOverride) {
    activeDirs = activeDirsOverride;
  } else if (sessionRunning) {
    activeDirs = Object.keys(extensionInstances);
  } else {
    activeDirs = selectedProfiles.size > 0 ? Array.from(selectedProfiles) : profiles.map(p => p.dir);
  }
  
  activeDirs.forEach(dir => {
    const p = profiles.find(pr => pr.dir === dir);
    if (p) {
      const opt = document.createElement('option');
      opt.value = p.dir;
      opt.textContent = p.displayName || p.dir;
      dropdown.appendChild(opt);
    }
  });
  
  if (currentVal && activeDirs.includes(currentVal)) {
    dropdown.value = currentVal;
  } else if (activeDirs.length === 1) {
    dropdown.value = activeDirs[0];
  } else {
    dropdown.value = '';
  }
  
  // Trigger change event so the panel updates visibility
  dropdown.dispatchEvent(new Event('change'));
}

function setupProfileSettings() {
  const dropdown = document.getElementById('profileSettingsDropdown');
  const panel = document.getElementById('profileSettingsPanel');
  if (!dropdown || !panel) return;

  const elements = {
    flashDelay: document.getElementById('profFlashDelay'),
    flashDelayValue: document.getElementById('profFlashDelayValue'),
    randomDelayToggle: document.getElementsByName('profRandomDelayToggle'),
    randomDelayControls: document.getElementById('profRandomDelayControls'),
    randomDelayMin: document.getElementById('profRandomDelayMin'),
    randomDelayMinValue: document.getElementById('profRandomDelayMinValue'),
    randomDelayMax: document.getElementById('profRandomDelayMax'),
    randomDelayMaxValue: document.getElementById('profRandomDelayMaxValue'),
    randomTriggerMin: document.getElementById('profRandomTriggerMin'),
    randomTriggerMinValue: document.getElementById('profRandomTriggerMinValue'),
    randomTriggerMax: document.getElementById('profRandomTriggerMax'),
    randomTriggerMaxValue: document.getElementById('profRandomTriggerMaxValue'),
    
    automizeToggle: document.getElementsByName('profAutomizeQueryToggle'),
    automizeControls: document.getElementById('profAutomizeQueryControls'),
    automizeMin: document.getElementById('profAutomizeMin'),
    automizeMinValue: document.getElementById('profAutomizeMinValue'),
    automizeMax: document.getElementById('profAutomizeMax'),
    automizeMaxValue: document.getElementById('profAutomizeMaxValue'),
    
    autoStop: document.getElementById('profDefaultAutoStop'),
    maxSearches: document.getElementById('profMaxSearches'),
    
    typingSpeed: document.getElementById('profTypingSpeed'),
    typingSpeedValue: document.getElementById('profTypingSpeedValue'),
    randomTypingSpeed: document.getElementById('profRandomTypingSpeed'),
    humanLikeTyping: document.getElementById('profHumanLikeTyping')
  };

  const loadProfileSettings = (dir) => {
    if (!dir) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';

    const getNum = (key, def) => parseInt(localStorage.getItem(`prof_${dir}_${key}`)) || def;
    const getBool = (key, def) => {
      const v = localStorage.getItem(`prof_${dir}_${key}`);
      return v === null ? def : v === 'true';
    };

    elements.flashDelay.value = getNum('flashDelay', 5);
    elements.flashDelayValue.textContent = elements.flashDelay.value + 's';
    
    const randomDelay = getBool('randomDelay', false);
    elements.randomDelayToggle[randomDelay ? 1 : 0].checked = true;
    elements.randomDelayControls.style.display = randomDelay ? 'block' : 'none';
    elements.randomDelayMin.value = getNum('randomDelayMin', 1);
    elements.randomDelayMinValue.textContent = elements.randomDelayMin.value + 's';
    elements.randomDelayMax.value = getNum('randomDelayMax', 10);
    elements.randomDelayMaxValue.textContent = elements.randomDelayMax.value + 's';
    elements.randomTriggerMin.value = getNum('randomTriggerMin', 1);
    elements.randomTriggerMinValue.textContent = elements.randomTriggerMin.value;
    elements.randomTriggerMax.value = getNum('randomTriggerMax', 5);
    elements.randomTriggerMaxValue.textContent = elements.randomTriggerMax.value;

    const automize = getBool('automize', false);
    elements.automizeToggle[automize ? 1 : 0].checked = true;
    elements.automizeControls.style.display = automize ? 'block' : 'none';
    elements.automizeMin.value = getNum('automizeMin', 1);
    elements.automizeMinValue.textContent = elements.automizeMin.value;
    elements.automizeMax.value = getNum('automizeMax', 5);
    elements.automizeMaxValue.textContent = elements.automizeMax.value;

    elements.autoStop.value = getNum('autoStop', 0);
    elements.maxSearches.value = getNum('maxSearches', 0);

    elements.typingSpeed.value = getNum('typingSpeed', 100);
    elements.typingSpeedValue.textContent = elements.typingSpeed.value + 'ms';
    elements.randomTypingSpeed.checked = getBool('randomTypingSpeed', false);
    elements.humanLikeTyping.checked = getBool('humanLikeTyping', true);
  };

  const saveProfileSettings = () => {
    const dir = dropdown.value;
    if (!dir) return;
    
    localStorage.setItem(`prof_${dir}_flashDelay`, elements.flashDelay.value);
    const randomDelay = elements.randomDelayToggle[1].checked;
    localStorage.setItem(`prof_${dir}_randomDelay`, randomDelay);
    localStorage.setItem(`prof_${dir}_randomDelayMin`, elements.randomDelayMin.value);
    localStorage.setItem(`prof_${dir}_randomDelayMax`, elements.randomDelayMax.value);
    localStorage.setItem(`prof_${dir}_randomTriggerMin`, elements.randomTriggerMin.value);
    localStorage.setItem(`prof_${dir}_randomTriggerMax`, elements.randomTriggerMax.value);
    
    const automize = elements.automizeToggle[1].checked;
    localStorage.setItem(`prof_${dir}_automize`, automize);
    localStorage.setItem(`prof_${dir}_automizeMin`, elements.automizeMin.value);
    localStorage.setItem(`prof_${dir}_automizeMax`, elements.automizeMax.value);
    
    localStorage.setItem(`prof_${dir}_autoStop`, elements.autoStop.value);
    localStorage.setItem(`prof_${dir}_maxSearches`, elements.maxSearches.value);
    
    localStorage.setItem(`prof_${dir}_typingSpeed`, elements.typingSpeed.value);
    localStorage.setItem(`prof_${dir}_randomTypingSpeed`, elements.randomTypingSpeed.checked);
    localStorage.setItem(`prof_${dir}_humanLikeTyping`, elements.humanLikeTyping.checked);
  };

  dropdown.addEventListener('change', () => loadProfileSettings(dropdown.value));

  // Bind input listeners
  const bindSlider = (input, display, suffix = '') => {
    input.addEventListener('input', () => {
      display.textContent = input.value + suffix;
      saveProfileSettings();
    });
  };

  bindSlider(elements.flashDelay, elements.flashDelayValue, 's');
  bindSlider(elements.randomDelayMin, elements.randomDelayMinValue, 's');
  bindSlider(elements.randomDelayMax, elements.randomDelayMaxValue, 's');
  bindSlider(elements.randomTriggerMin, elements.randomTriggerMinValue);
  bindSlider(elements.randomTriggerMax, elements.randomTriggerMaxValue);
  bindSlider(elements.automizeMin, elements.automizeMinValue);
  bindSlider(elements.automizeMax, elements.automizeMaxValue);
  bindSlider(elements.typingSpeed, elements.typingSpeedValue, 'ms');

  elements.randomDelayToggle.forEach(t => t.addEventListener('change', () => {
    elements.randomDelayControls.style.display = elements.randomDelayToggle[1].checked ? 'block' : 'none';
    saveProfileSettings();
  }));

  elements.automizeToggle.forEach(t => t.addEventListener('change', () => {
    elements.automizeControls.style.display = elements.automizeToggle[1].checked ? 'block' : 'none';
    saveProfileSettings();
  }));

  [elements.autoStop, elements.maxSearches, elements.randomTypingSpeed, elements.humanLikeTyping].forEach(el => {
    el.addEventListener('change', saveProfileSettings);
  });

  if (dom.btnProfileFlash) {
    dom.btnProfileFlash.onclick = () => {
      const dir = dropdown.value;
      if (!dir) {
        addLogEntry("No profile selected for Flash Mode.", "error");
        return;
      }
      const inst = extensionInstances[dir];
      if (!inst) {
        addLogEntry("Profile instance not found.", "error");
        return;
      }

      const isStopping = dom.btnProfileFlash.classList.contains('stop');
      if (isStopping) {
        dom.btnProfileFlash.classList.remove('stop');
        dom.btnProfileFlash.textContent = "ACTIVATE FLASH ⚡";
        inst.isRunning = false;
        inst.updateUIStatus('Stopped');
        addLogEntry(`Flash Mode STOPPED manually for ${inst.profileDir}.`, "warning");
      } else {
        dom.btnProfileFlash.classList.add('stop');
        dom.btnProfileFlash.textContent = "STOP FLASH ⚡";
        addLogEntry(`⚡ FLASH MODE TRIGGERED for ${inst.profileDir}! Bypassing normal constraints...`, "success");
        
        inst.isGlobalStart = false; // Disable global pacing
        inst.startSearching(0, true); // true = isFlash
      }
    };
  }
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  initDOM();
  updateClock();
  setInterval(updateClock, 1000);
  setupUI();
  setupIPC();
  setupProfileSettings();
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
