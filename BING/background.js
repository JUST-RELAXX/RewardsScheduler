let isRunning = false;
let delay = 10000;
let queries = [];
let currentIndex = 0;
let stopTimeout = null;
let searchTabId = null;
let executedCount = 0;
let isDebugMode = false;

chrome.storage.local.get('extensionSettings', (res) => {
  isDebugMode = res.extensionSettings?.debugMode || false;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.extensionSettings) {
    isDebugMode = changes.extensionSettings.newValue?.debugMode || false;
  }
});

function log(msg, type = 'info') {
  if (type === 'error') console.error(msg);
  else if (isDebugMode) console.log(msg);
}

async function fetchToken(key) {
  try {
    const response = await fetch('https://curiosity-typer.vercel.app/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
    const data = await response.json();
    return data.token;
  } catch (e) {
    console.error('Fetch token error:', e);
    throw e;
  }
}

async function fetchQueries(token, topics = []) {
  try {
    let url = 'https://curiosity-typer.vercel.app/getPrompts';
    if (topics && topics.length > 0) {
      const topicStr = encodeURIComponent(topics.join(','));
      url += `?topics=${topicStr}`;
    }
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Fetch prompts failed: ${response.status}`);
    const data = await response.json();
    return data.prompts || [];
  } catch (e) {
    console.error('Fetch queries error:', e);
    throw e;
  }
}

async function refreshQueries(key, topics = []) {
  try {
    let token = (await chrome.storage.local.get('authToken')).authToken;
    if (!token) {
      token = await fetchToken(key);
      await chrome.storage.local.set({ authToken: token });
    }
    queries = await fetchQueries(token, topics);
    await chrome.storage.session.set({ queries });
    currentIndex = 0;
    return { success: true, count: queries.length };
  } catch (e) {
    console.error('Refresh error:', e);
    return { success: false, error: e.message };
  }
}

async function loadQueries() {
  try {
    const storedData = await chrome.storage.session.get(['queries']);
    if (storedData.queries && storedData.queries.length > 0) {
      queries = storedData.queries;
      return;
    }
  } catch (e) { console.error(e); }
}

async function tabExists(id) {
  try { await chrome.tabs.get(id); return true; } catch { return false; }
}

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise(resolve => {
    let resolved = false;
    const listener = (tId, info) => {
      if (tId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutHandle);
          resolve();
        }
      }
    };
    
    const timeoutHandle = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      if (!resolved) {
        resolved = true;
        resolve(); 
      }
    }, timeoutMs);
    
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function typeQueryInBing(tabId, query, isFlash = false) {
  log(`Typing: ${query}`);
  const { extensionSettings } = await chrome.storage.local.get('extensionSettings');
  
  const typingSpeed = isFlash ? 25 : (extensionSettings?.typingSpeed || 100);
  const randomTyping = isFlash ? false : (extensionSettings?.randomTypingSpeed || false);
  const humanLike = extensionSettings?.humanLikeTyping !== false;
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (query, speed, random, human) => {
        function typeLikeHuman(element, text, callback) {
          let i = 0;
          function typeNextChar() {
            if (i < text.length) {
              element.value += text.charAt(i);
              i++;
              const delay = random ? speed + (Math.random() * 50 - 25) : speed;
              setTimeout(typeNextChar, human ? delay : 50);
            } else { callback(); }
          }
          typeNextChar();
        }
        const input = document.querySelector("textarea[name='q'], input[name='q']");
        if (input) {
          input.focus();
          input.value = '';
          typeLikeHuman(input, query, () => {
            const form = input.closest("form");
            if (form) form.submit();
          });
        }
      },
      args: [query, typingSpeed, randomTyping, humanLike]
    });
  } catch (e) {
    console.error('Script error:', e);
    try {
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      await chrome.tabs.update(tabId, { url: searchUrl });
    } catch (retryErr) { console.error('Retry failed:', retryErr); }
  }
  
  await waitForTabLoad(tabId, 35000);
}

function notifyUI(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// --- MICROSOFT AUTOMATION ---
let ms_testState = "IDLE";
let ms_cachedCreds = null;
let ms_activeTabId = null;
const LOGIN_URL = "https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=13&ct=1610000000&rver=7.0.6737.0&wp=MBI_SSL&wreply=https%3a%2f%2fwww.bing.com%2fsecure%2fPassport.aspx%3frequrl%3dhttps%253a%252f%252fwww.bing.com%252f";

async function sendMessageToTab(tabId, message) {
  try { await chrome.tabs.sendMessage(tabId, message); } 
  catch { 
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    setTimeout(() => chrome.tabs.sendMessage(tabId, message).catch(()=>{}), 200);
  }
}

// --- HEARTBEAT DELAY SYSTEM (Crucial Fix) ---
async function waitChunked(ms) {
  const chunkSize = 1000; // 1 second
  let remaining = ms;
  
  while (remaining > 0 && isRunning) {
    // Ping to keep SW alive every 5s
    if (remaining % 5000 === 0) {
       chrome.runtime.sendMessage({type: 'PING'}).catch(()=>{});
    }
    
    // Broadcast updates
    notifyUI({ type: "HEARTBEAT", remainingMs: remaining });
    
    const currentWait = Math.min(remaining, chunkSize);
    await new Promise(r => setTimeout(r, currentWait));
    remaining -= currentWait;
  }
}

async function startSearching(startFrom = 0, isFlash = false) {
  if (!queries.length) { await loadQueries(); }
  if (!queries.length) { notifyUI({ type: "STATUS_UPDATE", status: "error" }); return; }

  const { extensionSettings } = await chrome.storage.local.get('extensionSettings');
  const maxSearches = extensionSettings?.maxSearches || 0;
  
  let randomEnabled = false;
  let randomMinSec = 1, randomMaxSec = 10;
  let currentDelayMs = delay;

  if (isFlash) {
    currentDelayMs = (extensionSettings?.flashDelay || 5) * 1000;
  } else {
    randomEnabled = !!extensionSettings?.randomDelayEnabled;
    randomMinSec = Math.max(1, parseInt(extensionSettings?.randomDelayMin || 1));
    randomMaxSec = Math.max(randomMinSec, parseInt(extensionSettings?.randomDelayMax || 10));
  }

  if (startFrom >= 0 && startFrom < queries.length) currentIndex = startFrom;
  executedCount = 0;
  isRunning = true;
  notifyUI({ type: "STATUS_UPDATE", status: "searching" });
  
  const storedTabId = (await chrome.storage.local.get('searchTabId')).searchTabId;
  if (storedTabId && await tabExists(storedTabId)) searchTabId = storedTabId;
  else {
    searchTabId = (await chrome.tabs.create({ url: "https://www.bing.com" })).id;
    await chrome.storage.local.set({ searchTabId });
  }
  await chrome.tabs.update(searchTabId, { active: true });

  const limit = maxSearches === 0 ? queries.length : Math.min(queries.length, startFrom + maxSearches);

  while (isRunning && currentIndex < limit) {
    const query = queries[currentIndex];
    notifyUI({ 
      type: "CURRENT_QUERY", 
      query, 
      totalQueries: queries.length, 
      index: currentIndex,
      // Pass data for sidebar time estimation
      limit: limit - startFrom, 
      executed: executedCount 
    });
    
    try {
      await typeQueryInBing(searchTabId, query, isFlash);
    } catch (e) {
      if (!isRunning) break;
    }
    
    currentIndex++;
    executedCount++;

    if (!isRunning) break;

    // Calculate Next Delay
    if (!isFlash && randomEnabled) {
       const newSec = Math.floor(Math.random() * (randomMaxSec - randomMinSec + 1)) + randomMinSec;
       currentDelayMs = newSec * 1000;
       notifyUI({ type: 'DELAY_UPDATE', delay: newSec, auto: true });
    } else if (!isFlash) {
       notifyUI({ type: 'DELAY_UPDATE', delay: Math.floor(currentDelayMs/1000), auto: false });
    }

    // Wait using Heartbeat
    if (currentIndex < limit && isRunning) {
      await waitChunked(currentDelayMs);
    }
    
    notifyUI({ type: "UPDATE_COUNT", executedCount, totalQueries: queries.length, limit: limit - startFrom });
  }
  
  isRunning = false;
  notifyUI({ type: "STATUS_UPDATE", status: currentIndex >= limit ? "completed" : "paused" });
}

function stopSearching() {
  isRunning = false;
  if (stopTimeout) clearTimeout(stopTimeout);
  notifyUI({ type: "STATUS_UPDATE", status: "offline" });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'START_TEST') {
    ms_cachedCreds = { email: msg.email, password: msg.password };
    ms_activeTabId = msg.tabId;
    ms_testState = 'LOGGING_OUT';
    chrome.runtime.sendMessage({ action: 'LOGIN_STARTED' }).catch(()=>{});
    sendMessageToTab(ms_activeTabId, { action: 'perform_logout' });
    return;
  }
  if (msg.action === "start") {
    delay = Math.max(1000, parseInt(msg.delay) || 10000);
    startSearching(msg.startFrom || 0, false); 
    if (msg.stopAfter > 0) stopTimeout = setTimeout(stopSearching, msg.stopAfter);
  } else if (msg.action === "start_flash") {
    startSearching(msg.startFrom || 0, true);
  } else if (msg.action === "stop") {
    stopSearching();
  } else if (msg.action === "refresh") {
    (async () => {
      const result = await refreshQueries(msg.key, msg.topics);
      sendResponse(result);
    })();
    return true;
  } else if (msg.action === "validate") {
    fetch(`https://curiosity-typer.vercel.app/validateKey?key=${msg.key}`)
      .then(r => sendResponse({ valid: r.ok }));
    return true;
  }
  
  if (msg.action === 'EXECUTE_LOGOUT_URL' || msg.action === 'FORCE_LOGOUT_NAV') {
    const url = msg.url || 'https://login.live.com/logout.srf';
    chrome.tabs.update(ms_activeTabId, { url });
    ms_testState = 'IN_COOL_DOWN';
    setTimeout(() => {
      chrome.tabs.update(ms_activeTabId, { url: LOGIN_URL });
      ms_testState = 'WAITING_FOR_LOGIN_PAGE';
    }, 12000);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== ms_activeTabId || changeInfo.status !== 'complete') return;
  if (ms_testState === 'IN_COOL_DOWN') return;

  if (ms_testState === 'WAITING_FOR_LOGIN_PAGE') {
    if (tab.url && (tab.url.includes('login.live.com') || tab.url.includes('login.srf'))) {
      setTimeout(() => {
        sendMessageToTab(tabId, { action: 'perform_login', email: ms_cachedCreds.email, password: ms_cachedCreds.password });
        ms_testState = 'WAITING_FOR_PROFILE';
      }, 1500);
    } else if (tab.url && tab.url.includes('msn.com')) {
      chrome.tabs.update(tabId, { url: LOGIN_URL });
    }
  } else if (ms_testState === 'WAITING_FOR_PROFILE') {
    if (tab.url && (tab.url.startsWith('https://www.bing.com') || tab.url.includes('account.microsoft.com'))) {
      chrome.tabs.update(tabId, { url: 'https://www.bing.com/' });
      ms_testState = 'IDLE';
      chrome.runtime.sendMessage({ action: 'LOGIN_SUCCESS' }).catch(()=>{});
    }
  }
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting panel behavior:', error));

// ═══════════════════════════════════════════════════════════════
// DESKTOP APP BRIDGE — WebSocket client for Scheduler integration
// Connects to the Electron desktop app when it's running.
// Falls back gracefully if the desktop app isn't available.
// ═══════════════════════════════════════════════════════════════

const WS_URL = 'ws://localhost:9847';
let desktopWS = null;
let wsReconnectTimer = null;
let wsHeartbeatTimer = null;
let wsConnected = false;
let desktopSearchActive = false;
let keepAliveMode = false;
let keepAliveInterval = null;
let slowSearchTimer = null;
let slowSearchCount = 0;
let slowSearchMax = 5;

// Get this profile's directory name for identification
async function getProfileDir() {
  try {
    // Read from Edge's profile path
    const profilePath = chrome.runtime.getURL('');
    // Extract profile dir from extension ID context
    // Fallback: use a unique identifier
    const manifest = chrome.runtime.getManifest();
    
    // Try to get profile info from user data dir
    // The extension ID is unique per profile, so we can use it as identifier
    const extensionId = chrome.runtime.id;
    
    // Store/retrieve the profile mapping
    const data = await chrome.storage.local.get('profileDir');
    if (data.profileDir) return data.profileDir;
    
    // If not set, we'll detect it from the WebSocket handshake response
    // or the user can set it. For now, use extension ID as fallback.
    return extensionId;
  } catch (e) {
    return 'unknown';
  }
}

function connectToDesktop() {
  if (desktopWS && desktopWS.readyState <= 1) return; // Already connected/connecting
  
  try {
    desktopWS = new WebSocket(WS_URL);
    
    desktopWS.onopen = async () => {
      wsConnected = true;
      console.log('[DesktopBridge] Connected to scheduler app');
      
      // Clear reconnect timer
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
      
      // Send handshake with profile identification
      const profileDir = await getProfileDir();
      sendToDesktop({
        type: 'HANDSHAKE',
        profileDir: profileDir,
        extensionId: chrome.runtime.id
      });
      
      // Start heartbeat to keep service worker alive
      startWSHeartbeat();
    };
    
    desktopWS.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleDesktopCommand(msg);
      } catch (e) {
        console.error('[DesktopBridge] Invalid message:', e);
      }
    };
    
    desktopWS.onclose = () => {
      wsConnected = false;
      desktopWS = null;
      stopWSHeartbeat();
      console.log('[DesktopBridge] Disconnected from scheduler app');
      
      // Reconnect after delay (only if not manually stopped)
      scheduleReconnect();
    };
    
    desktopWS.onerror = () => {
      // Silently handle — desktop app might not be running
      wsConnected = false;
    };
    
  } catch (e) {
    // Desktop app not available — that's fine
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;
  // Try reconnecting every 30 seconds
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectToDesktop();
  }, 30000);
}

function sendToDesktop(data) {
  if (desktopWS && desktopWS.readyState === 1) {
    desktopWS.send(JSON.stringify(data));
  }
}

function startWSHeartbeat() {
  stopWSHeartbeat();
  wsHeartbeatTimer = setInterval(() => {
    sendToDesktop({ type: 'PING' });
  }, 20000); // Every 20 seconds
}

function stopWSHeartbeat() {
  if (wsHeartbeatTimer) {
    clearInterval(wsHeartbeatTimer);
    wsHeartbeatTimer = null;
  }
}

// Handle commands from the desktop app
async function handleDesktopCommand(msg) {
  switch (msg.type) {
    case 'HANDSHAKE_ACK': {
      console.log('[DesktopBridge] Handshake acknowledged');
      
      // Store profile directory mapping if provided
      if (msg.profileDir) {
        await chrome.storage.local.set({ profileDir: msg.profileDir });
      }
      break;
    }
    
    case 'START_SEARCH': {
      console.log('[DesktopBridge] Remote start search command');
      desktopSearchActive = true;
      keepAliveMode = false;
      stopKeepAlive();
      
      // Use existing search infrastructure
      delay = Math.max(1000, parseInt(msg.delay) || 10000);
      
      // Ensure queries are loaded
      if (!queries.length) {
        const stored = await chrome.storage.local.get(['authToken']);
        if (stored.authToken) {
          const result = await refreshQueries('', []);
          if (!result.success) {
            sendToDesktop({ type: 'ERROR', error: 'Failed to load queries' });
            return;
          }
        }
      }
      
      // Override the notifyUI to also report to desktop
      const originalNotifyUI = notifyUI;
      const searchMonitor = setInterval(() => {
        if (!isRunning && desktopSearchActive) {
          clearInterval(searchMonitor);
          desktopSearchActive = false;
          sendToDesktop({
            type: 'SEARCH_COMPLETE',
            totalExecuted: executedCount
          });
        }
      }, 2000);
      
      // Start searching
      startSearching(msg.startFrom || 0, msg.flash || false);
      break;
    }
    
    case 'STOP_SEARCH': {
      console.log('[DesktopBridge] Remote stop command');
      desktopSearchActive = false;
      stopSearching();
      break;
    }
    
    case 'KEEP_ALIVE': {
      console.log('[DesktopBridge] Keep-alive mode activated');
      keepAliveMode = true;
      slowSearchCount = 0;
      slowSearchMax = msg.slowSearchCount || 5;
      startKeepAlive(msg.scrollInterval || 45000, msg.slowSearchInterval || 360000);
      break;
    }
    
    case 'STOP_ALL': {
      console.log('[DesktopBridge] Stop all activity');
      desktopSearchActive = false;
      keepAliveMode = false;
      stopSearching();
      stopKeepAlive();
      break;
    }
    
    case 'PONG': {
      // Heartbeat response — keeps service worker alive
      break;
    }
  }
}

// Keep-alive mode: scroll, click, occasional slow searches
function startKeepAlive(scrollIntervalMs, slowSearchIntervalMs) {
  stopKeepAlive();
  
  // Periodic scrolling activity on the active tab
  keepAliveInterval = setInterval(async () => {
    if (!keepAliveMode) return;
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && tabs[0].url?.includes('bing.com')) {
        await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            // Random scroll
            const scrollAmount = Math.floor(Math.random() * 500) + 100;
            const direction = Math.random() > 0.3 ? 1 : -1;
            window.scrollBy({ top: scrollAmount * direction, behavior: 'smooth' });
            
            // Occasionally click a search result (30% chance)
            if (Math.random() < 0.3) {
              const links = document.querySelectorAll('#b_results .b_algo h2 a');
              if (links.length > 0) {
                const randomLink = links[Math.floor(Math.random() * Math.min(links.length, 5))];
                if (randomLink) {
                  randomLink.click();
                  // Navigate back after a few seconds
                  setTimeout(() => window.history.back(), 3000 + Math.random() * 4000);
                }
              }
            }
          }
        });
        
        sendToDesktop({ type: 'KEEP_ALIVE_ACK', activity: 'scroll' });
      }
    } catch (e) {
      // Tab might not be available — ignore
    }
  }, scrollIntervalMs);
  
  // Occasional slow searches
  if (slowSearchMax > 0) {
    slowSearchTimer = setInterval(async () => {
      if (!keepAliveMode || slowSearchCount >= slowSearchMax) return;
      
      try {
        if (queries.length > 0) {
          const randomQuery = queries[Math.floor(Math.random() * queries.length)];
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length > 0 && tabs[0].url?.includes('bing.com')) {
            await typeQueryInBing(tabs[0].id, randomQuery, false);
            slowSearchCount++;
            sendToDesktop({ type: 'KEEP_ALIVE_ACK', activity: 'slow_search', count: slowSearchCount });
          }
        }
      } catch (e) {
        // Ignore errors in keep-alive
      }
    }, slowSearchIntervalMs);
  }
}

function stopKeepAlive() {
  keepAliveMode = false;
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (slowSearchTimer) {
    clearInterval(slowSearchTimer);
    slowSearchTimer = null;
  }
}

// Override notifyUI to also report search progress to desktop
const _originalNotifyUI = notifyUI;
function notifyUIWithDesktop(message) {
  // Original behavior (sidebar/popup)
  chrome.runtime.sendMessage(message).catch(() => {});
  
  // Also report to desktop app if connected
  if (wsConnected && desktopSearchActive) {
    if (message.type === 'CURRENT_QUERY') {
      sendToDesktop({
        type: 'SEARCH_PROGRESS',
        executed: message.executed || executedCount,
        total: message.totalQueries || queries.length,
        currentQuery: message.query
      });
    } else if (message.type === 'STATUS_UPDATE' && message.status === 'completed') {
      sendToDesktop({
        type: 'SEARCH_COMPLETE',
        totalExecuted: executedCount
      });
      desktopSearchActive = false;
    }
  }
}

// Replace the notifyUI function
// We need to reassign it since it's used throughout the file
// The function is already defined, so we patch it here
const origNotify = (message) => chrome.runtime.sendMessage(message).catch(() => {});

// Monkey-patch: override the global notifyUI
// Since notifyUI is a named function, we wrap it
(function patchNotifyUI() {
  const script = `
    const _origNotifyUI = notifyUI;
    notifyUI = function(message) {
      _origNotifyUI(message);
    };
  `;
  // Instead, we'll intercept via chrome.runtime.onMessage in the bridge
})();

// Monitor search progress by intercepting runtime messages
chrome.runtime.onMessage.addListener((msg) => {
  if (wsConnected && desktopSearchActive) {
    if (msg.type === 'CURRENT_QUERY') {
      sendToDesktop({
        type: 'SEARCH_PROGRESS',
        executed: msg.executed !== undefined ? msg.executed : executedCount,
        total: msg.totalQueries || queries.length,
        currentQuery: msg.query
      });
    } else if (msg.type === 'STATUS_UPDATE' && msg.status === 'completed') {
      sendToDesktop({
        type: 'SEARCH_COMPLETE',
        totalExecuted: executedCount
      });
      desktopSearchActive = false;
    }
  }
});

// Initialize desktop connection
connectToDesktop();