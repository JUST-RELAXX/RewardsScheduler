// Settings Page Controller

const settingsElements = {
  // API Key
  apiKeySettings: document.getElementById('apiKeySettings'),
  saveApiKey: document.getElementById('saveApiKey'),
  clearApiKey: document.getElementById('clearApiKey'),
  apiStatus: document.getElementById('apiStatus'),
  
  // Search Behavior
  defaultDelay: document.getElementById('defaultDelay'),
  defaultDelayValue: document.getElementById('defaultDelayValue'),
  // NEW: Flash Delay
  flashDelay: document.getElementById('flashDelay'),
  flashDelayValue: document.getElementById('flashDelayValue'),

  defaultAutoStop: document.getElementById('defaultAutoStop'),
  maxSearches: document.getElementById('maxSearches'),
  // Random Delay
  randomDelayControls: document.getElementById('randomDelayControls'),
  randomDelayToggleOff: document.querySelector("input[name='randomDelayToggle'][value='off']"),
  randomDelayToggleOn: document.querySelector("input[name='randomDelayToggle'][value='on']"),
  randomDelayMin: document.getElementById('randomDelayMin'),
  randomDelayMax: document.getElementById('randomDelayMax'),
  randomDelayMinValue: document.getElementById('randomDelayMinValue'),
  randomDelayMaxValue: document.getElementById('randomDelayMaxValue'),
  randomTriggerMin: document.getElementById('randomTriggerMin'),
  randomTriggerMax: document.getElementById('randomTriggerMax'),
  randomTriggerMinValue: document.getElementById('randomTriggerMinValue'),
  randomTriggerMaxValue: document.getElementById('randomTriggerMaxValue'),
  // Automize start-from
  automizeQueryControls: document.getElementById('automizeQueryControls'),
  automizeToggleOff: document.querySelector("input[name='automizeQueryToggle'][value='off']"),
  automizeToggleOn: document.querySelector("input[name='automizeQueryToggle'][value='on']"),
  automizeMin: document.getElementById('automizeMin'),
  automizeMax: document.getElementById('automizeMax'),
  automizeMinValue: document.getElementById('automizeMinValue'),
  automizeMaxValue: document.getElementById('automizeMaxValue'),
  
  // Query Management
  queriesPerRefresh: document.getElementById('queriesPerRefresh'),
  shuffleQueries: document.getElementById('shuffleQueries'),
  skipDuplicates: document.getElementById('skipDuplicates'),
  
  // Typing Behavior
  typingSpeed: document.getElementById('typingSpeed'),
  typingSpeedValue: document.getElementById('typingSpeedValue'),
  randomTypingSpeed: document.getElementById('randomTypingSpeed'),
  humanLikeTyping: document.getElementById('humanLikeTyping'),
  
  // Tab Management
  keepTabActive: document.getElementById('keepTabActive'),
  createNewTab: document.getElementById('createNewTab'),
  resetSearchTab: document.getElementById('resetSearchTab'),
  
  // Notifications
  notifyOnComplete: document.getElementById('notifyOnComplete'),
  notifyOnError: document.getElementById('notifyOnError'),
  soundEffects: document.getElementById('soundEffects'),
  
  // Data Management
  storedQueriesCount: document.getElementById('storedQueriesCount'),
  cacheSize: document.getElementById('cacheSize'),
  clearCache: document.getElementById('clearCache'),
  exportQueries: document.getElementById('exportQueries'),
  importQueries: document.getElementById('importQueries'),
  importFile: document.getElementById('importFile'),
  
  // Advanced
  maxRetries: document.getElementById('maxRetries'),
  retryDelay: document.getElementById('retryDelay'),
  debugMode: document.getElementById('debugMode'),
  pauseOnError: document.getElementById('pauseOnError'),
  
  // Actions
  saveSettings: document.getElementById('saveSettings'),
  resetSettings: document.getElementById('resetSettings'),
  openSidebar: document.getElementById('openSidebar'),
  settingsStatus: document.getElementById('settingsStatus')
};

// Accounts UI elements
const accountsElements = {
  accountsList: document.getElementById('accountsList'),
  addMore: document.getElementById('addMoreAccounts'),
  saveAccounts: document.getElementById('saveAccounts'),
  clearAccounts: document.getElementById('clearAccounts')
};

// Default settings
const defaultSettings = {
  defaultDelay: 10,
  flashDelay: 5, // NEW
  defaultAutoStop: 0,
  maxSearches: 0, 
  randomDelayEnabled: false,
  randomDelayMin: 1,
  randomDelayMax: 10,
  randomTriggerMin: 1,
  randomTriggerMax: 5,
  automizeEnabled: false,
  automizeMin: 1,
  automizeMax: 5,
  queriesPerRefresh: 60,
  shuffleQueries: false,
  skipDuplicates: false,
  typingSpeed: 100,
  randomTypingSpeed: false,
  humanLikeTyping: true,
  keepTabActive: true,
  createNewTab: false,
  notifyOnComplete: true,
  notifyOnError: true,
  soundEffects: false,
  maxRetries: 3,
  retryDelay: 5,
  debugMode: false,
  pauseOnError: true
};

// Load settings
async function loadSettings() {
  const stored = await chrome.storage.local.get('extensionSettings');
  const settings = stored.extensionSettings || defaultSettings;
  
  // Apply settings to UI
  settingsElements.defaultDelay.value = settings.defaultDelay;
  settingsElements.defaultDelayValue.textContent = settings.defaultDelay + 's';
  
  // Flash Delay
  settingsElements.flashDelay.value = settings.flashDelay || 5;
  settingsElements.flashDelayValue.textContent = (settings.flashDelay || 5) + 's';

  settingsElements.defaultAutoStop.value = settings.defaultAutoStop;
  settingsElements.maxSearches.value = settings.maxSearches;
  
  // Random delay
  if (settings.randomDelayEnabled) {
    settingsElements.randomDelayToggleOn.checked = true;
    settingsElements.randomDelayControls.style.display = 'block';
  } else {
    settingsElements.randomDelayToggleOff.checked = true;
    settingsElements.randomDelayControls.style.display = 'none';
  }
  settingsElements.randomDelayMin.value = settings.randomDelayMin || defaultSettings.randomDelayMin;
  settingsElements.randomDelayMax.value = settings.randomDelayMax || defaultSettings.randomDelayMax;
  settingsElements.randomTriggerMin.value = settings.randomTriggerMin || defaultSettings.randomTriggerMin;
  settingsElements.randomTriggerMax.value = settings.randomTriggerMax || defaultSettings.randomTriggerMax;
  settingsElements.randomDelayMinValue.textContent = settingsElements.randomDelayMin.value + 's';
  settingsElements.randomDelayMaxValue.textContent = settingsElements.randomDelayMax.value + 's';
  settingsElements.randomTriggerMinValue.textContent = settingsElements.randomTriggerMin.value;
  settingsElements.randomTriggerMaxValue.textContent = settingsElements.randomTriggerMax.value;
  settingsElements.queriesPerRefresh.value = settings.queriesPerRefresh;
  
  // Automize
  if (settings.automizeEnabled) {
    settingsElements.automizeToggleOn.checked = true;
    settingsElements.automizeQueryControls.style.display = 'block';
  } else {
    settingsElements.automizeToggleOff.checked = true;
    settingsElements.automizeQueryControls.style.display = 'none';
  }
  settingsElements.automizeMin.value = settings.automizeMin || defaultSettings.automizeMin;
  settingsElements.automizeMax.value = settings.automizeMax || defaultSettings.automizeMax;
  settingsElements.automizeMinValue.textContent = settingsElements.automizeMin.value;
  settingsElements.automizeMaxValue.textContent = settingsElements.automizeMax.value;
  
  settingsElements.shuffleQueries.checked = settings.shuffleQueries;
  settingsElements.skipDuplicates.checked = settings.skipDuplicates;
  settingsElements.typingSpeed.value = settings.typingSpeed;
  settingsElements.typingSpeedValue.textContent = settings.typingSpeed + 'ms';
  settingsElements.randomTypingSpeed.checked = settings.randomTypingSpeed;
  settingsElements.humanLikeTyping.checked = settings.humanLikeTyping;
  settingsElements.keepTabActive.checked = settings.keepTabActive;
  settingsElements.createNewTab.checked = settings.createNewTab;
  settingsElements.notifyOnComplete.checked = settings.notifyOnComplete;
  settingsElements.notifyOnError.checked = settings.notifyOnError;
  settingsElements.soundEffects.checked = settings.soundEffects;
  settingsElements.maxRetries.value = settings.maxRetries;
  settingsElements.retryDelay.value = settings.retryDelay;
  settingsElements.debugMode.checked = settings.debugMode;
  settingsElements.pauseOnError.checked = settings.pauseOnError;
  
  updateDataInfo();
}

// Update data information
async function updateDataInfo() {
  const { queries } = await chrome.storage.session.get('queries');
  const count = queries ? queries.length : 0;
  settingsElements.storedQueriesCount.textContent = count;
  const allData = await chrome.storage.local.get(null);
  const dataStr = JSON.stringify(allData);
  const sizeKB = (new Blob([dataStr]).size / 1024).toFixed(2);
  settingsElements.cacheSize.textContent = sizeKB + ' KB';
}

// ... [API Key Logic - Unchanged] ...
settingsElements.saveApiKey.onclick = async () => {
  const key = settingsElements.apiKeySettings.value.trim();
  if (!key) { showStatus('Please enter an API key', 'error'); return; }
  settingsElements.saveApiKey.disabled = true;
  settingsElements.saveApiKey.textContent = 'Validating...';
  chrome.runtime.sendMessage({ action: 'validate', key }, async (response) => {
    settingsElements.saveApiKey.disabled = false;
    settingsElements.saveApiKey.textContent = 'Save API Key';
    if (response && response.valid) {
      try {
        const tokenResponse = await fetch('https://curiosity-typer.vercel.app/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        const data = await tokenResponse.json();
        await chrome.storage.local.set({ authToken: data.token });
        showStatus('API Key saved successfully!', 'success');
        settingsElements.apiStatus.textContent = '✓ API Key is valid and saved';
        settingsElements.apiStatus.style.color = '#00b050';
      } catch (e) { showStatus('Failed to save API key', 'error'); }
    } else {
      showStatus('Invalid API Key', 'error');
      settingsElements.apiStatus.textContent = '✗ Invalid API Key';
      settingsElements.apiStatus.style.color = '#ff0000';
    }
  });
};

settingsElements.clearApiKey.onclick = async () => {
  if (confirm('Are you sure you want to clear the stored API key?')) {
    await chrome.storage.local.remove('authToken');
    settingsElements.apiKeySettings.value = '';
    settingsElements.apiStatus.textContent = 'API Key cleared';
    settingsElements.apiStatus.style.color = '#666';
    showStatus('API Key cleared successfully', 'success');
  }
};

settingsElements.defaultDelay.oninput = () => {
  settingsElements.defaultDelayValue.textContent = settingsElements.defaultDelay.value + 's';
};

// FLASH DELAY LISTENER
settingsElements.flashDelay.oninput = () => {
  settingsElements.flashDelayValue.textContent = settingsElements.flashDelay.value + 's';
};

// --- LOGIC FIX: SLIDER CONSTRAINTS ---
settingsElements.randomDelayToggleOff?.addEventListener('change', () => { if (settingsElements.randomDelayToggleOff.checked) settingsElements.randomDelayControls.style.display = 'none'; });
settingsElements.randomDelayToggleOn?.addEventListener('change', () => { if (settingsElements.randomDelayToggleOn.checked) settingsElements.randomDelayControls.style.display = 'block'; });

settingsElements.randomDelayMin?.addEventListener('input', () => { 
  let min = parseInt(settingsElements.randomDelayMin.value,10);
  let max = parseInt(settingsElements.randomDelayMax.value,10);
  if (min > max) { settingsElements.randomDelayMax.value = min; max = min; } // Push Max up
  settingsElements.randomDelayMinValue.textContent = min + 's';
  settingsElements.randomDelayMaxValue.textContent = max + 's';
});

settingsElements.randomDelayMax?.addEventListener('input', () => { 
  let min = parseInt(settingsElements.randomDelayMin.value,10);
  let max = parseInt(settingsElements.randomDelayMax.value,10);
  if (max < min) { settingsElements.randomDelayMin.value = max; min = max; } // Push Min down
  settingsElements.randomDelayMaxValue.textContent = max + 's';
  settingsElements.randomDelayMinValue.textContent = min + 's';
});

settingsElements.randomTriggerMin?.addEventListener('input', () => { 
  let min = parseInt(settingsElements.randomTriggerMin.value,10);
  let max = parseInt(settingsElements.randomTriggerMax.value,10);
  if (min > max) { settingsElements.randomTriggerMax.value = min; max = min; }
  settingsElements.randomTriggerMinValue.textContent = min;
  settingsElements.randomTriggerMaxValue.textContent = max;
});

settingsElements.randomTriggerMax?.addEventListener('input', () => { 
  let min = parseInt(settingsElements.randomTriggerMin.value,10);
  let max = parseInt(settingsElements.randomTriggerMax.value,10);
  if (max < min) { settingsElements.randomTriggerMin.value = max; min = max; }
  settingsElements.randomTriggerMaxValue.textContent = max;
  settingsElements.randomTriggerMinValue.textContent = min;
});

settingsElements.automizeToggleOff?.addEventListener('change', () => { if (settingsElements.automizeToggleOff.checked) settingsElements.automizeQueryControls.style.display = 'none'; });
settingsElements.automizeToggleOn?.addEventListener('change', () => { if (settingsElements.automizeToggleOn.checked) settingsElements.automizeQueryControls.style.display = 'block'; });

settingsElements.automizeMin?.addEventListener('input', () => { 
  let min = parseInt(settingsElements.automizeMin.value,10);
  let max = parseInt(settingsElements.automizeMax.value,10);
  if (min > max) { settingsElements.automizeMax.value = min; max = min; }
  settingsElements.automizeMinValue.textContent = min;
  settingsElements.automizeMaxValue.textContent = max;
});

settingsElements.automizeMax?.addEventListener('input', () => { 
  let min = parseInt(settingsElements.automizeMin.value,10);
  let max = parseInt(settingsElements.automizeMax.value,10);
  if (max < min) { settingsElements.automizeMin.value = max; min = max; }
  settingsElements.automizeMaxValue.textContent = max;
  settingsElements.automizeMinValue.textContent = min;
});

settingsElements.typingSpeed.oninput = () => {
  settingsElements.typingSpeedValue.textContent = settingsElements.typingSpeed.value + 'ms';
};

settingsElements.resetSearchTab.onclick = async () => {
  await chrome.storage.local.remove('searchTabId');
  showStatus('Search tab reset successfully', 'success');
};

settingsElements.clearCache.onclick = async () => {
  if (confirm('Clear all cached queries? This will not delete your API key.')) {
    await chrome.storage.session.clear();
    updateDataInfo();
    showStatus('Cache cleared successfully', 'success');
  }
};

settingsElements.exportQueries.onclick = async () => {
  const { queries } = await chrome.storage.session.get('queries');
  if (!queries || queries.length === 0) { showStatus('No queries to export', 'error'); return; }
  const dataStr = JSON.stringify({ queries, exportDate: new Date().toISOString() }, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auto-typer-queries-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('Queries exported successfully', 'success');
};

settingsElements.importQueries.onclick = () => { settingsElements.importFile.click(); };
settingsElements.importFile.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.queries && Array.isArray(data.queries)) {
        await chrome.storage.session.set({ queries: data.queries });
        updateDataInfo();
        showStatus(`Imported ${data.queries.length} queries successfully`, 'success');
      } else { showStatus('Invalid file format', 'error'); }
    } catch (e) { showStatus('Error reading file', 'error'); }
  };
  reader.readAsText(file);
};

// Save All Settings
settingsElements.saveSettings.onclick = async () => {
  const settings = {
    defaultDelay: parseInt(settingsElements.defaultDelay.value),
    flashDelay: parseInt(settingsElements.flashDelay.value), // NEW
    defaultAutoStop: parseInt(settingsElements.defaultAutoStop.value),
    maxSearches: parseInt(settingsElements.maxSearches.value),
    randomDelayEnabled: !!settingsElements.randomDelayToggleOn.checked,
    randomDelayMin: parseInt(settingsElements.randomDelayMin.value,10),
    randomDelayMax: parseInt(settingsElements.randomDelayMax.value,10),
    randomTriggerMin: parseInt(settingsElements.randomTriggerMin.value,10),
    randomTriggerMax: parseInt(settingsElements.randomTriggerMax.value,10),
    automizeEnabled: !!settingsElements.automizeToggleOn.checked,
    automizeMin: parseInt(settingsElements.automizeMin.value,10),
    automizeMax: parseInt(settingsElements.automizeMax.value,10),
    queriesPerRefresh: parseInt(settingsElements.queriesPerRefresh.value),
    shuffleQueries: settingsElements.shuffleQueries.checked,
    skipDuplicates: settingsElements.skipDuplicates.checked,
    typingSpeed: parseInt(settingsElements.typingSpeed.value),
    randomTypingSpeed: settingsElements.randomTypingSpeed.checked,
    humanLikeTyping: settingsElements.humanLikeTyping.checked,
    keepTabActive: settingsElements.keepTabActive.checked,
    createNewTab: settingsElements.createNewTab.checked,
    notifyOnComplete: settingsElements.notifyOnComplete.checked,
    notifyOnError: settingsElements.notifyOnError.checked,
    soundEffects: settingsElements.soundEffects.checked,
    maxRetries: parseInt(settingsElements.maxRetries.value),
    retryDelay: parseInt(settingsElements.retryDelay.value),
    debugMode: settingsElements.debugMode.checked,
    pauseOnError: settingsElements.pauseOnError.checked
  };
  
  await chrome.storage.local.set({ extensionSettings: settings });
  showStatus('All settings saved successfully!', 'success');
};

settingsElements.resetSettings.onclick = async () => {
  if (confirm('Reset all settings to defaults? This will not delete your API key or queries.')) {
    await chrome.storage.local.set({ extensionSettings: defaultSettings });
    loadSettings();
    showStatus('Settings reset to defaults', 'success');
  }
};

settingsElements.openSidebar.onclick = () => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  showStatus('Opening sidebar...', 'success');
};

function showStatus(message, type) {
  settingsElements.settingsStatus.textContent = message;
  settingsElements.settingsStatus.className = 'status-message ' + type;
  if (type === 'success') { setTimeout(() => { settingsElements.settingsStatus.textContent = ''; settingsElements.settingsStatus.className = 'status-message'; }, 3000); }
}

// ... [Accounts Logic - Unchanged] ...
const MAX_ACCOUNTS = 20;
function genId() { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function createAccountEntry(account = {}) {
  const container = document.createElement('div');
  container.className = 'account-entry';
  container.style.padding = '8px';
  container.style.border = '1px solid rgba(0,176,255,0.15)';
  container.style.borderRadius = '8px';
  container.style.marginBottom = '8px';
  container.dataset.id = account.id || genId();

  container.innerHTML = `
    <label class="setting-label">Alias (Nickname)</label>
    <input class="settings-input acct-alias" placeholder="e.g. Mom" value="${account.alias ? account.alias.replace(/"/g,'&quot;') : ''}">
    <label class="setting-label">Email</label>
    <input class="settings-input acct-email" placeholder="email@example.com" value="${account.email ? account.email.replace(/"/g,'&quot;') : ''}">
    <label class="setting-label">Password</label>
    <input class="settings-input acct-pass" type="password" placeholder="password" value="${account.password ? account.password.replace(/"/g,'&quot;') : ''}">
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button class="btn danger-btn remove-entry">Remove</button>
    </div>
  `;
  container.querySelector('.remove-entry').addEventListener('click', () => { container.remove(); });
  return container;
}
async function loadAccounts() {
  const data = await chrome.storage.local.get('savedAccounts');
  const accounts = data.savedAccounts || [];
  renderAccounts(accounts);
}
function renderAccounts(accounts) {
  accountsElements.accountsList.innerHTML = '';
  if (!accounts || accounts.length === 0) { accountsElements.accountsList.appendChild(createAccountEntry({})); return; }
  accounts.forEach(acc => { accountsElements.accountsList.appendChild(createAccountEntry(acc)); });
}
accountsElements.addMore?.addEventListener('click', () => {
  const current = accountsElements.accountsList.querySelectorAll('.account-entry').length;
  if (current >= MAX_ACCOUNTS) { showStatus('Maximum accounts reached (20)', 'error'); return; }
  accountsElements.accountsList.appendChild(createAccountEntry({}));
});
accountsElements.saveAccounts?.addEventListener('click', async () => {
  const nodes = Array.from(accountsElements.accountsList.querySelectorAll('.account-entry'));
  const accounts = nodes.map(n => ({
    id: n.dataset.id,
    alias: n.querySelector('.acct-alias').value.trim(),
    email: n.querySelector('.acct-email').value.trim(),
    password: n.querySelector('.acct-pass').value
  })).filter(a => a.email || a.alias);
  await chrome.storage.local.set({ savedAccounts: accounts });
  showStatus('Accounts saved successfully', 'success');
});
accountsElements.clearAccounts?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete all saved accounts?')) return;
  await chrome.storage.local.remove('savedAccounts');
  renderAccounts([]);
  showStatus('All accounts cleared', 'success');
});

loadAccounts();
loadSettings();