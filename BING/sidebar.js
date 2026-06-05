// Sidebar UI Controller
const elements = {
  apiKey: document.getElementById('apiKeySidebar'),
  validateBtn: document.getElementById('validateKeySidebar'),
  status: document.getElementById('statusSidebar'),
  toggleBtn: document.getElementById('toggleSidebar'),
  delaySlider: document.getElementById('delaySliderSidebar'),
  delayValue: document.getElementById('delayValueSidebar'),
  delayAutoFlag: document.getElementById('delayAutoFlag'),
  stopMinutes: document.getElementById('stopMinutesSidebar'),
  startFromQuery: document.getElementById('startFromQuery'),
  startFromAutoFlag: document.getElementById('startFromAutoFlag'),
  refreshBtn: document.getElementById('refreshSidebar'),
  count: document.getElementById('countSidebar'),
  elapsed: document.getElementById('elapsedSidebar'),
  totalPrompts: document.getElementById('totalPromptsSidebar'),
  remaining: document.getElementById('remainingSidebar'),
  estimatedTime: document.getElementById('estimatedTimeSidebar'),
  progressBar: document.getElementById('progressBar'),
  progressPercentage: document.getElementById('progressPercentage'),
  progressDetails: document.getElementById('progressDetails'),
  currentQueryBox: document.getElementById('currentQueryBox'),
  statusMessage: document.getElementById('statusMessageSidebar'),
  viewPromptsBtn: document.getElementById('viewPromptsSidebar'),
  openSettingsBtn: document.getElementById('openSettingsSidebar'),
  authSection: document.getElementById('authSection'),
  mainSection: document.getElementById('mainSection'),
  accountSwitcher: document.getElementById('accountSwitcher'),
  vizStatus: document.getElementById('vizStatus'),
  searchChartCanvas: document.getElementById('searchChart'),
  categoryContainer: document.getElementById('categoryContainer'),
  newCategoryInput: document.getElementById('newCategoryInput'),
  addCategoryBtn: document.getElementById('addCategoryBtn'),
  flashBtn: document.getElementById('flashBtn'),
  flashCountdown: document.getElementById('flashCountdown') 
};

// Global State
let savedAccounts = [];
let selectedAccountId = null;
let running = false;
let currentDelay = 10;
let startTime = null;
let elapsedTimer = null;
let isUnlocked = false;
let totalPrompts = 0;
let currentExecutedCount = 0;
let sessionSearchLimit = 0;
let isDebugMode = false;
let currentFlashDelaySetting = 5;

// Initialize Debug Mode & Flash Delay
chrome.storage.local.get('extensionSettings', (res) => {
  isDebugMode = res.extensionSettings?.debugMode || false;
  currentFlashDelaySetting = res.extensionSettings?.flashDelay || 5;
});

function log(msg, type='info') {
  if(isDebugMode || type === 'basic') console.log(msg);
}

// --- 1. PERSISTENT CATEGORY LOGIC ---
const defaultCategories = [
  "Air Quality Index", "Geopolitics News", "Satellite Traffic", "Gold Prices", "NFT Floor Prices", "AI Hardware Reviews",
   "VR Game Releases", "Streaming Trends", "Influencer Scandals", "Deepfake Detection", "Indie Games", "Mobile Esports",
    "Webtoons", "Light Novels", "Graphic Novels", "Audiobook Hits", "Vinyl Sales", "Immersive Theater", "Art Biennales",
     "Slow Travel", "Train Vacations", "Eco-Resorts", "Ultralight Packing", "Wild Camping", "Meal Prep Ideas",
      "Plant-Based Meat", "Michelin Guide", "Specialty Tea", "Zero-Proof Spirits", "Biohacking Tips", "Somatic Yoga", 
      "Intermittent Fasting", "Digital Detox", "Sound Bathing", "Breathwork", "Upcycling Ideas", "Biophilic Design", 
      "Smart Irrigation", "Aquascaping", "Cat Behavior", "Reptile Care", "Co-living Spaces", "Solar Incentives", "Gig Economy", 
      "Remote Work Skills", "Passion Projects", "High-Yield Savings", "Crypto Tax Laws", "Labor Rights", "Voting Records",
       "Quantum Physics", "Mars Mission Updates", "Local Folklore", "Drone Photography", "Digital Art", "Sustainable Fabrics",
        "Vintage Revival", "Skincare Science", "Hydrogen Cars", "Autonomous Shuttles", "Electric Bikes", "Micro-Mobility"

];

let userCategories = [];
let selectedCategories = [];
let isEditMode = false;

async function initCategories() {
  if (!elements.categoryContainer) return;

  const data = await chrome.storage.local.get('customCategories');
  if (data.customCategories && data.customCategories.length > 0) {
    userCategories = data.customCategories;
  } else {
    userCategories = [...defaultCategories];
  }

  const label = elements.categoryContainer.previousElementSibling;
  if(label && !label.querySelector('.edit-cats-btn')) {
    const editBtn = document.createElement('span');
    editBtn.className = 'edit-cats-btn';
    editBtn.innerHTML = '✏️ Edit';
    editBtn.style.cssText = "font-size:11px; cursor:pointer; margin-left:10px; color:#00b0ff; border:1px solid #b3e5fc; padding:2px 6px; border-radius:4px;";
    editBtn.onclick = toggleCategoryEditMode;
    label.appendChild(editBtn);
  }

  renderCategories();

  if (elements.addCategoryBtn) {
    elements.addCategoryBtn.onclick = async () => {
      const val = elements.newCategoryInput.value.trim();
      if (val && !userCategories.includes(val)) {
        userCategories.push(val);
        selectedCategories.push(val);
        await chrome.storage.local.set({ customCategories: userCategories });
        renderCategories();
        elements.newCategoryInput.value = '';
      }
    };
  }
}

function toggleCategoryEditMode() {
  isEditMode = !isEditMode;
  const btn = document.querySelector('.edit-cats-btn');
  if(btn) btn.textContent = isEditMode ? '✅ Done' : '✏️ Edit';
  if(btn) btn.style.backgroundColor = isEditMode ? '#e1f5fe' : 'transparent';
  renderCategories();
}

function renderCategories() {
  elements.categoryContainer.innerHTML = '';
  
  userCategories.forEach(cat => {
    const chip = document.createElement('div');
    chip.className = `category-chip ${isEditMode ? 'shaking' : (selectedCategories.includes(cat) ? 'selected' : '')}`;
    
    if (isEditMode) {
      chip.innerHTML = `${cat} <span style="margin-left:5px;color:red;font-weight:bold;">✕</span>`;
      chip.style.borderColor = "#ffcdd2";
      chip.style.background = "#ffebee";
    } else {
      chip.textContent = cat;
    }

    chip.onclick = async () => {
      if (isEditMode) {
        if(confirm(`Remove "${cat}"?`)) {
            userCategories = userCategories.filter(c => c !== cat);
            selectedCategories = selectedCategories.filter(c => c !== cat);
            await chrome.storage.local.set({ customCategories: userCategories });
            renderCategories();
        }
      } else {
        if (selectedCategories.includes(cat)) {
          selectedCategories = selectedCategories.filter(c => c !== cat);
        } else {
          selectedCategories.push(cat);
        }
        renderCategories();
      }
    };
    elements.categoryContainer.appendChild(chip);
  });
}

// --- 2. CUSTOM GRAPH ENGINE ---
const graphData = { labels: [], values: [], maxPoints: 20 };

function initChart() { drawCustomGraph(); }

function updateChart(delayValue) {
  const count = parseInt(elements.count.textContent || 0);
  graphData.labels.push(count);
  graphData.values.push(delayValue);
  if (graphData.labels.length > graphData.maxPoints) {
    graphData.labels.shift();
    graphData.values.shift();
  }
  
  if (elements.vizStatus) {
    elements.vizStatus.textContent = `Active (${delayValue}s)`;
    elements.vizStatus.className = 'status-badge active';
  }
  drawCustomGraph();
}

function drawCustomGraph() {
  const canvas = elements.searchChartCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  
  ctx.strokeStyle = 'rgba(0, 176, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const y = h - (i * (h / 4));
    ctx.moveTo(30, y);
    ctx.lineTo(w, y);
    ctx.fillStyle = '#0277bd';
    ctx.font = '10px Segoe UI';
    ctx.fillText((i * 15), 5, y - 2); 
  }
  ctx.stroke();

  if (graphData.values.length < 2) return;

  const maxVal = 60; 
  const xStep = (w - 40) / (graphData.maxPoints - 1);
  const startX = 35;
  const points = graphData.values.map((val, i) => {
    return { x: startX + (i * xStep), y: h - ((val / maxVal) * h) };
  });

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(0, 176, 255, 0.4)');
  grad.addColorStop(1, 'rgba(0, 176, 255, 0.0)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, h);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = '#00b0ff';
  ctx.lineWidth = 2.5;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
     const p0 = points[i];
     const p1 = points[i + 1];
     const midX = (p0.x + p1.x) / 2;
     const midY = (p0.y + p1.y) / 2;
     ctx.quadraticCurveTo(p0.x, p0.y, midX, midY); 
  }
  ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
  ctx.stroke();

  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#00b0ff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// --- 3. ACCOUNT SWITCHER UI ---
const Icons = {
  pen: `<svg class="lavish-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  trash: `<svg class="lavish-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
};

async function loadSavedAccounts() {
  const data = await chrome.storage.local.get('savedAccounts');
  savedAccounts = data.savedAccounts || [];
  renderAccountSwitcher();
}

function renderAccountSwitcher() {
  const container = elements.accountSwitcher;
  if (!container) return;
  container.innerHTML = '';

  if (!savedAccounts || savedAccounts.length === 0) {
    container.innerHTML = `<div style="color:#0277bd; font-style:italic; padding:12px; text-align:center;">No accounts saved. Add from Settings.</div>`;
    return;
  }

  let currentAccount = savedAccounts.find(a => a.id === selectedAccountId);
  if (!currentAccount) {
    currentAccount = savedAccounts[0];
    selectedAccountId = currentAccount.id;
  }

  const lavishContainer = document.createElement('div');
  lavishContainer.className = 'lavish-container';
  const trigger = document.createElement('div');
  trigger.className = 'lavish-trigger';
  const triggerText = document.createElement('span');
  triggerText.textContent = currentAccount.alias || currentAccount.email;
  const arrow = document.createElement('div');
  arrow.innerHTML = `<svg class="lavish-arrow" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  trigger.appendChild(triggerText);
  trigger.appendChild(arrow);
  const menuList = document.createElement('div');
  menuList.className = 'lavish-menu';

  const toggleMenu = (e) => {
    if(e) e.stopPropagation();
    lavishContainer.classList.toggle('open');
    trigger.classList.toggle('active');
  };
  trigger.addEventListener('click', toggleMenu);
  const closeMenuHandler = (e) => {
    if (!lavishContainer.contains(e.target)) {
      lavishContainer.classList.remove('open');
      trigger.classList.remove('active');
    }
  };
  document.removeEventListener('click', closeMenuHandler); 
  document.addEventListener('click', closeMenuHandler);

  savedAccounts.forEach((acc) => {
    const item = document.createElement('li');
    item.className = 'lavish-item';
    const label = document.createElement('span');
    label.className = 'lavish-item-text';
    label.textContent = acc.alias || acc.email; 
    label.addEventListener('click', () => {
      selectedAccountId = acc.id;
      triggerText.textContent = label.textContent;
      toggleMenu();
    });
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'lavish-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'lavish-btn';
    editBtn.innerHTML = Icons.pen;
    editBtn.title = "Edit in Settings";
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'lavish-btn delete-btn';
    deleteBtn.innerHTML = Icons.trash;
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    const deleteOverlay = document.createElement('div');
    deleteOverlay.className = 'lavish-delete-overlay';
    deleteOverlay.innerHTML = `<span class="lavish-confirm-text">Delete?</span><div class="lavish-confirm-actions"><button class="lavish-confirm-btn lavish-btn-yes">Yes</button><button class="lavish-confirm-btn lavish-btn-no">No</button></div>`;

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.windows.create({ url: `popup.html?editId=${acc.id}`, type: 'popup', width: 400, height: 650, focused: true });
      lavishContainer.classList.remove('open');
      trigger.classList.remove('active');
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      item.classList.add('confirm-delete');
    });

    deleteOverlay.querySelector('.lavish-btn-yes').addEventListener('click', async (e) => {
      e.stopPropagation();
      item.classList.add('removing');
      savedAccounts = savedAccounts.filter(a => a !== acc);
      await chrome.storage.local.set({ savedAccounts });
      setTimeout(() => {
        item.remove();
        if (selectedAccountId === acc.id) {
            if (savedAccounts.length > 0) {
                const newAcc = savedAccounts[0];
                selectedAccountId = newAcc.id;
                triggerText.textContent = newAcc.alias || newAcc.email;
            } else {
                selectedAccountId = null;
                renderAccountSwitcher(); 
            }
        }
      }, 400);
    });
    deleteOverlay.querySelector('.lavish-btn-no').addEventListener('click', (e) => {
      e.stopPropagation();
      item.classList.remove('confirm-delete');
    });

    item.appendChild(label);
    item.appendChild(actionsDiv);
    item.appendChild(deleteOverlay);
    menuList.appendChild(item);
  });

  lavishContainer.appendChild(trigger);
  lavishContainer.appendChild(menuList);
  container.appendChild(lavishContainer);

  const loginBtn = document.createElement('button');
  loginBtn.id = 'loginAccountBtn';
  loginBtn.className = 'btn primary-btn';
  loginBtn.textContent = 'LOG IN⚡';
  loginBtn.style.marginTop = '15px';
  
  loginBtn.addEventListener('click', async () => {
    const acc = savedAccounts.find(a => a.id === selectedAccountId);
    if (!acc) { showMessage('Please select an account first', 'error'); return; }
    loginBtn.disabled = true;
    showMessage('Hold on✋! Getting you in🙂‍↕️', 'loading');
    try {
      const allTabs = await chrome.tabs.query({});
      let bingTab = allTabs.find(t => t.url && t.url.includes('bing.com'));
      if (!bingTab) {
        bingTab = await chrome.tabs.create({ url: 'https://www.bing.com' });
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === bingTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      } else { await chrome.tabs.update(bingTab.id, { active: true }); }
      
      chrome.runtime.sendMessage({
        action: 'START_TEST',
        email: acc.email,
        password: acc.password,
        tabId: bingTab.id
      });
    } catch (error) {
      console.error('Login error:', error);
      showMessage('Failed to initiate login', 'error');
      loginBtn.disabled = false;
    }
  });
  container.appendChild(loginBtn);
}

// --- 4. MAIN LOGIC ---
async function initializeSidebar() {
  const { authToken, extensionSettings } = await chrome.storage.local.get(['authToken', 'extensionSettings']);
  const { queries } = await chrome.storage.session.get(['queries']);
  
  if (authToken) {
    unlockSidebar();
    if (queries && queries.length > 0) {
      totalPrompts = queries.length;
      elements.totalPrompts.textContent = totalPrompts;
      elements.remaining.textContent = totalPrompts;
      elements.startFromQuery.max = totalPrompts;
    }
  }
  
  if (extensionSettings) {
    elements.delaySlider.value = extensionSettings.defaultDelay || 10;
    elements.delayValue.textContent = extensionSettings.defaultDelay || 10;
    elements.stopMinutes.value = extensionSettings.defaultAutoStop || 0;
    currentDelay = extensionSettings.defaultDelay || 10;
    if (extensionSettings.randomDelayEnabled) {
      elements.delayAutoFlag.textContent = '(Auto delay✨)';
    }
    if (extensionSettings.automizeEnabled) {
      elements.startFromAutoFlag.textContent = '(Automized✨)';
    }
    if (extensionSettings.flashDelay) {
      currentFlashDelaySetting = extensionSettings.flashDelay;
    }
  }

  // Init Chips & Charts
  initCategories();
  initChart();
}

function updateStats() {
  elements.count.textContent = currentExecutedCount;
  let percentage = 0;
  if (sessionSearchLimit > 0) {
    percentage = Math.round((currentExecutedCount / sessionSearchLimit) * 100);
  }
  elements.progressBar.style.width = percentage + '%';
  elements.progressPercentage.textContent = percentage + '%';
  elements.progressDetails.textContent = `${currentExecutedCount} / ${sessionSearchLimit} searches`;

  if ((sessionSearchLimit - currentExecutedCount) > 0 && currentDelay > 0) {
    const secondsLeft = (sessionSearchLimit - currentExecutedCount) * currentDelay;
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    elements.estimatedTime.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  } else {
    elements.estimatedTime.textContent = '--:--';
  }
}

function unlockSidebar() {
  isUnlocked = true;
  elements.authSection.style.display = 'none';
  elements.mainSection.style.display = 'block';
  updateStatus('offline');
}

function updateStatus(status) {
  const statusTexts = {
    offline: 'Offline',
    ready: 'Ready',
    searching: 'Searching...',
    error: 'Error',
    paused: 'Paused',
    completed: 'Completed!'
  };
  elements.status.textContent = statusTexts[status] || statusTexts.offline;
}

function updateElapsed() {
  const sec = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  elements.elapsed.textContent = m + ":" + s.toString().padStart(2, "0");
}

function showMessage(text, type) {
  elements.statusMessage.textContent = text;
  elements.statusMessage.className = 'status-message ' + type;
  elements.statusMessage.style.display = text ? 'block' : 'none';
  if (type === 'success') setTimeout(() => { elements.statusMessage.style.display = 'none'; }, 5000);
}

// --- 5. EVENT LISTENERS ---
elements.validateBtn.onclick = async () => {
  const key = elements.apiKey.value.trim();
  if (!key) { showMessage('Please enter an API key', 'error'); return; }
  chrome.runtime.sendMessage({ action: 'validate', key }, (response) => {
     if (response && response.valid) { unlockSidebar(); showMessage('Authenticated!', 'success'); }
     else { showMessage('Invalid API Key', 'error'); }
  });
};

// FLASH BUTTON LOGIC
elements.flashBtn.onclick = async () => {
  if (!isUnlocked) return;
  
  running = !running;
  
  if (running) {
    // Start Flash
    elements.flashBtn.textContent = "STOP FLASH ⚡";
    elements.flashBtn.classList.add('stop');
    elements.flashCountdown.style.display = "block"; // Show countdown
    
    elements.toggleBtn.disabled = true;
    elements.toggleBtn.style.opacity = '0.5';
    
    startTime = Date.now();
    elapsedTimer = setInterval(updateElapsed, 1000);
    graphData.labels = []; graphData.values = []; drawCustomGraph();
    
    let startFrom = parseInt(elements.startFromQuery.value, 10) || 1;
    currentExecutedCount = 0;
    sessionSearchLimit = 0;
    updateStats();
    
    // Get updated flash delay
    const stored = await chrome.storage.local.get('extensionSettings');
    currentFlashDelaySetting = stored.extensionSettings?.flashDelay || 5;

    chrome.runtime.sendMessage({
      action: "start_flash",
      startFrom: startFrom - 1
    });
    
  } else {
    // Stop Flash
    elements.flashBtn.textContent = "ACTIVATE FLASH ⚡";
    elements.flashBtn.classList.remove('stop');
    elements.flashCountdown.style.display = "none"; // Hide countdown
    
    elements.toggleBtn.disabled = false;
    elements.toggleBtn.style.opacity = '1';
    
    clearInterval(elapsedTimer);
    chrome.runtime.sendMessage({ action: "stop" });
  }
};

elements.toggleBtn.onclick = async () => {
  if (!isUnlocked) return;
  if (elements.flashBtn.classList.contains('stop')) return; // Prevent double run

  const { extensionSettings } = await chrome.storage.local.get('extensionSettings');
  const maxSearches = extensionSettings?.maxSearches || 0;
  running = !running;
  
  elements.toggleBtn.textContent = running ? "Stop" : "Start";
  elements.toggleBtn.classList.toggle("stop", running);
  
  if (running) {
    startTime = Date.now();
    elapsedTimer = setInterval(updateElapsed, 1000);
    let delaySeconds = parseInt(elements.delaySlider.value, 10) || 10;
    delaySeconds = Math.max(1, Math.min(60, delaySeconds));
    currentDelay = delaySeconds;
    
    graphData.labels = []; graphData.values = []; drawCustomGraph();
    let startFrom = parseInt(elements.startFromQuery.value, 10) || 1;
    
    if (extensionSettings?.automizeEnabled) {
        const min = Math.max(1, parseInt(extensionSettings.automizeMin || 1, 10));
        const max = Math.max(min, parseInt(extensionSettings.automizeMax || min, 10));
        const effectiveMax = Math.min(max, totalPrompts || max);
        
        // Randomize startFrom
        startFrom = Math.floor(Math.random() * (effectiveMax - min + 1)) + min;
        
        // VISUALLY UPDATE THE INPUT
        elements.startFromQuery.value = startFrom;
        
        elements.startFromAutoFlag.textContent = '(Automized✨)';
    }
    
    currentExecutedCount = 0;
    sessionSearchLimit = maxSearches === 0 ? Math.max(0, totalPrompts - (startFrom - 1)) : maxSearches;
    updateStats();
    
    chrome.runtime.sendMessage({
      action: "start",
      delay: delaySeconds * 1000,
      stopAfter: parseInt(elements.stopMinutes.value, 10) * 60 * 1000,
      startFrom: startFrom - 1
    });
  } else {
    clearInterval(elapsedTimer);
    chrome.runtime.sendMessage({ action: "stop" });
  }
};

elements.delaySlider.oninput = () => {
  let value = parseInt(elements.delaySlider.value, 10);
  value = Math.max(1, Math.min(60, value));
  elements.delaySlider.value = value;
  elements.delayValue.textContent = value;
  currentDelay = value;
  updateStats();
};

elements.refreshBtn.onclick = () => {
    elements.refreshBtn.disabled = true;
    showMessage('Generating targeted prompts...', 'loading');
    let topicsToSend = selectedCategories;
    if (topicsToSend.length === 0) {
      const shuffled = userCategories.sort(() => 0.5 - Math.random());
      topicsToSend = shuffled.slice(0, 3);
      showMessage(`Auto-selected: ${topicsToSend.join(', ')}`, 'loading');
    }
    chrome.runtime.sendMessage({ 
      action: "refresh", 
      key: elements.apiKey.value,
      topics: topicsToSend 
    }, (res) => {
        elements.refreshBtn.disabled = false;
        if(res.success) { 
          totalPrompts=res.count; 
          elements.totalPrompts.textContent=totalPrompts; 
          updateStats(); 
          showMessage(`${res.count} prompts loaded!`, 'success'); 
        }
        else showMessage(`Error: ${res.error}`, 'error');
    });
};

if(elements.viewPromptsBtn) elements.viewPromptsBtn.onclick = () => chrome.windows.create({url:"view_prompts.html", type:"popup", width:400, height:600});
if(elements.openSettingsBtn) elements.openSettingsBtn.onclick = () => chrome.windows.create({url:"popup.html", type:"popup", width:400, height:650});

// Message Listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'LOGIN_SUCCESS') {
    showMessage('Enjoy!✋🙂‍↕️', 'success');
    const btn = document.getElementById('loginAccountBtn');
    if (btn) btn.disabled = false;
  } else if (msg.action === 'LOGIN_STARTED') {
    showMessage('Logging in...', 'loading');
  } else if (msg.action === 'LOGIN_FAILED') {
    showMessage('Login failed. Please try again.', 'error');
    const btn = document.getElementById('loginAccountBtn');
    if (btn) btn.disabled = false;
  } else if (msg.type === "UPDATE_COUNT") {
    currentExecutedCount = msg.executedCount;
    sessionSearchLimit = msg.limit;
    updateStats();
    updateChart(currentDelay);
    const index = msg.index !== undefined ? msg.index : currentExecutedCount;
    elements.remaining.textContent = Math.max(0, totalPrompts - (index + 1));
  } else if (msg.type === "CURRENT_QUERY") {
    elements.currentQueryBox.textContent = msg.query;
    totalPrompts = msg.totalQueries;
    elements.totalPrompts.textContent = totalPrompts;
    elements.startFromQuery.max = totalPrompts;
    
    // NEW: Update Flash Countdown Calculation
    if (elements.flashBtn.classList.contains('stop') && msg.limit) {
      const remainingSearches = msg.limit - msg.executed;
      if (remainingSearches > 0) {
        // Calculation: SearchesLeft * (FlashDelay + 4s buffer per search)
        const totalSecondsLeft = remainingSearches * (currentFlashDelaySetting + 4);
        const m = Math.floor(totalSecondsLeft / 60);
        const s = totalSecondsLeft % 60;
        const timeString = `${m}m ${s}s`;
        elements.flashCountdown.textContent = `FINISH IN: ~${timeString}`;
      } else {
        elements.flashCountdown.textContent = "FINISHING...";
      }
    }

  } else if (msg.type === "STATUS_UPDATE") {
    updateStatus(msg.status);
    if (msg.status === 'completed' || msg.status === 'offline' || msg.status === 'paused') {
      clearInterval(elapsedTimer);
      running = false;
      
      // Reset Normal Button
      elements.toggleBtn.textContent = "Start";
      elements.toggleBtn.classList.remove("stop");
      elements.toggleBtn.disabled = false;
      elements.toggleBtn.style.opacity = '1';
      
      // Reset Flash Button
      elements.flashBtn.textContent = "ACTIVATE FLASH ⚡";
      elements.flashBtn.classList.remove("stop");
      elements.flashCountdown.style.display = "none";
      
      if (msg.status === 'completed') showMessage(`Session complete.`, 'success');
    }
  } else if (msg.type === 'DELAY_UPDATE') {
    const sec = parseInt(msg.delay, 10) || 0;
    let validSec = Math.max(1, Math.min(60, sec));
    currentDelay = validSec;
    elements.delaySlider.value = validSec;
    elements.delayValue.textContent = validSec;
    if (msg.auto) { elements.delayAutoFlag.textContent = '(Auto delay✨)'; } 
    else { elements.delayAutoFlag.textContent = ''; }
  }
});

loadSavedAccounts();
initializeSidebar();