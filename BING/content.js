function simulateTyping(query) {
  const input = document.querySelector('#sb_form_q');
  const button = document.querySelector('#sb_form_go');
  if (!input || !button) return;
  input.focus();
  input.value = '';
  let i = 0;
  function typeChar() {
    if (i < query.length) {
      input.value += query[i++];
      setTimeout(typeChar, 100);
    } else {
      button.click();
    }
  }
  typeChar();
}

if (window.__autoQuery) {
  simulateTyping(window.__autoQuery);
}

// --- Microsoft Account Automation ---
console.log("🔥 CONTENT SCRIPT - MS Login");

// --- Desktop Scheduler Profile Identification ---
// When the scheduler app launches Edge, it adds #_scheduler_profile=ProfileDir to the URL
// We read this, store it for the background script's WebSocket handshake, then clean the URL
(function detectSchedulerProfile() {
  try {
    const hash = window.location.hash;
    if (hash && hash.includes('_scheduler_profile=')) {
      const params = new URLSearchParams(hash.substring(1));
      const profileDir = params.get('_scheduler_profile');
      if (profileDir) {
        chrome.storage.local.set({ profileDir: decodeURIComponent(profileDir) });
        console.log('[Scheduler] Profile identified:', profileDir);
        // Clean the hash from the URL without reloading
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  } catch (e) {
    // Ignore — not launched by scheduler
  }
})();

const MS_SELECTORS = {
  avatar: "#id_p",
  signOutLink: ".id_signout a",
  email: "input[type='email'], input[name='loginfmt']",
  pass: "input[type='password'], input[name='passwd']",
  primaryBtn: "#idSIButton9, button[data-testid='primaryButton'], input[type='submit']"
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function waitFor(selector, timeout = 5000) {
  return new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(interval); resolve(el); }
      else if (Date.now() - start > timeout) { clearInterval(interval); resolve(null); }
    }, 100);
  });
}

function setNativeValue(element, value) {
  const lastValue = element.value;
  element.value = value;
  const event = new Event('input', { bubbles: true });
  const tracker = element._valueTracker;
  if (tracker) { tracker.setValue(lastValue); }
  element.dispatchEvent(event);
}

function forceClick(element) {
  ['mousedown', 'mouseup', 'click'].forEach(eventType => {
    element.dispatchEvent(new MouseEvent(eventType, {
      view: window, bubbles: true, cancelable: true, buttons: 1
    }));
  });
}

function pressEnter(element) {
  element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', keyCode: 13, bubbles: true
  }));
}

async function doLogout() {
  console.log('🤖 Logout...');
  const avatar = await waitFor(MS_SELECTORS.avatar);
  if (!avatar) { console.warn('Avatar not found'); return; }
  avatar.click();
  const linkElement = await waitFor(MS_SELECTORS.signOutLink, 5000);
  if (linkElement) {
    chrome.runtime.sendMessage({ action: 'EXECUTE_LOGOUT_URL', url: linkElement.href });
  } else {
    // If specific logout link not found, try generic
    chrome.runtime.sendMessage({ action: 'FORCE_LOGOUT_NAV' });
  }
}

async function doLogin(email, password) {
  console.log('🤖 Login...');
  const emailField = await waitFor(MS_SELECTORS.email);
  if (emailField) {
    emailField.focus(); emailField.click(); setNativeValue(emailField, email);
    await wait(800); pressEnter(emailField);
    await wait(500);
    const nextBtn = document.querySelector(MS_SELECTORS.primaryBtn);
    if (nextBtn) forceClick(nextBtn);
  }

  let passField = null;
  // Wait longer for password field animation
  for (let i = 0; i < 40; i++) { await wait(250); passField = document.querySelector(MS_SELECTORS.pass); if (passField) break; }

  if (passField) {
    passField.focus(); passField.click(); await wait(200);
    setNativeValue(passField, password); await wait(800); pressEnter(passField);
    await wait(500);
    const signInBtn = document.querySelector(MS_SELECTORS.primaryBtn);
    if (signInBtn) forceClick(signInBtn);

    // Click "Stay Signed In" Yes button if it appears
    setTimeout(() => {
        const stayInBtn = document.querySelector(MS_SELECTORS.primaryBtn);
        if(stayInBtn) forceClick(stayInBtn);
    }, 1500);

  } else {
    console.log('❌ Password field not found.');
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'perform_logout') doLogout();
  if (msg.action === 'perform_login') doLogin(msg.email, msg.password);
});