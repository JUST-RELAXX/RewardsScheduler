// renderer/extension-logic.js

const FALLBACK_QUERIES = [
  'best restaurants near me', 'weather today', 'latest news headlines',
  'how to make pasta', 'top movies 2026', 'best workout routines',
  'healthy breakfast ideas', 'how to fix slow wifi', 'best budget phones 2026',
  'funny cat videos', 'how to learn guitar', 'best hiking trails',
  'tips for better sleep', 'home office setup ideas', 'easy dinner recipes',
  'best books to read', 'how to save money', 'morning routine tips',
  'best travel destinations', 'how to meditate', 'best coding languages to learn',
  'how to grow indoor plants', 'best productivity apps', 'how to start a blog',
  'best netflix shows', 'how to do laundry properly', 'easy home workouts',
  'best podcasts 2026', 'how to make smoothies', 'best laptop for students',
  'artificial intelligence news', 'best programming tutorials', 'react vs angular',
  'python tips and tricks', 'cloud computing basics', 'cybersecurity tips',
  'machine learning for beginners', 'web development trends', 'best IDE for coding',
  'how does blockchain work', 'best gaming monitors', 'keyboard shortcuts windows',
  'how do black holes work', 'interesting space facts', 'history of the internet',
  'how does DNA work', 'renewable energy sources', 'quantum computing explained',
  'evolution of humans', 'deepest ocean trenches', 'how vaccines work',
  'climate change solutions', 'mars exploration updates', 'photosynthesis explained',
  'best music playlists', 'how to cook rice perfectly', 'yoga for beginners',
  'best board games', 'how to tie a tie', 'photography tips for beginners'
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class ExtensionInstance {
  constructor(profileDir, webviewEl, uiElements) {
    this.profileDir = profileDir;
    this.webview = webviewEl;
    this.ui = uiElements;
    
    this.isRunning = false;
    this.queries = [];
    this.currentIndex = 0;
    this.executedCount = 0;
    
    this.token = null;
    this.chart = null;
    this.chartData = [];
    
    this.initChart();
    this.bindEvents();
  }
  
  initChart() {
    if (this.ui.chartCanvas && window.Chart) {
      const ctx = this.ui.chartCanvas.getContext('2d');
      this.chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Delay (s)',
            data: [],
            borderColor: '#0277bd',
            backgroundColor: 'rgba(2, 119, 189, 0.2)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#0277bd',
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400 },
          scales: {
            y: { beginAtZero: true, suggestedMax: 15, grid: { color: 'rgba(0,0,0,0.1)' } },
            x: { grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }

  updateChart(delaySec) {
    if (!this.chart) return;
    this.chartData.push(delaySec);
    if (this.chartData.length > 20) this.chartData.shift();
    
    this.chart.data.labels = this.chartData.map((_, i) => i + 1);
    this.chart.data.datasets[0].data = this.chartData;
    this.chart.update();
  }

  bindEvents() {
    this.ui.btnUnlock.addEventListener('click', async () => {
      const key = this.ui.apiKeyInput.value.trim();
      if (!key) return;
      this.ui.statusMessage.textContent = "Unlocking...";
      try {
        this.token = await this.fetchToken(key);
        this.ui.authSection.style.display = 'none';
        this.ui.mainSection.style.display = 'block';
        localStorage.setItem('typerApiKey', key);
        this.refreshQueries(key);
      } catch (e) {
        this.ui.statusMessage.textContent = "Invalid API Key";
      }
    });

    this.ui.btnStart.addEventListener('click', () => {
      if (this.isRunning) {
        this.stopSearching();
      } else {
        const startFrom = parseInt(this.ui.startFromInput.value) || 1;
        this.startSearching(startFrom - 1, false);
      }
    });

    this.ui.btnFlash.addEventListener('click', () => {
      if (!this.isRunning) {
        const startFrom = parseInt(this.ui.startFromInput.value) || 1;
        this.startSearching(startFrom - 1, true);
      }
    });
    
    this.ui.delaySlider.addEventListener('input', (e) => {
      this.ui.delayValue.textContent = e.target.value;
    });
    
    this.ui.btnRefresh.addEventListener('click', () => {
      const key = localStorage.getItem('typerApiKey');
      if (key) this.refreshQueries(key);
    });

    // Auto-login check
    const savedKey = localStorage.getItem('typerApiKey');
    if (savedKey) {
      this.ui.apiKeyInput.value = savedKey;
      this.ui.btnUnlock.click();
    }
  }

  async fetchToken(key) {
    const response = await fetch('https://curiosity-typer.vercel.app/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!response.ok) throw new Error(`Auth failed`);
    const data = await response.json();
    return data.token;
  }

  async fetchQueriesFromAPI(token) {
    const response = await fetch('https://curiosity-typer.vercel.app/getPrompts', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Fetch failed');
    const data = await response.json();
    return data.prompts || [];
  }

  async refreshQueries(key) {
    this.ui.statusMessage.textContent = "Fetching new queries...";
    try {
      if (!this.token) this.token = await this.fetchToken(key);
      this.queries = await this.fetchQueriesFromAPI(this.token);
      this.ui.statusMessage.textContent = `Loaded ${this.queries.length} queries from API`;
    } catch (e) {
      console.warn("API failed, using fallback queries");
      this.queries = shuffleArray(FALLBACK_QUERIES);
      this.ui.statusMessage.textContent = `Loaded ${this.queries.length} offline queries`;
    }
    this.ui.totalPrompts.textContent = this.queries.length;
  }

  updateUIStatus(status) {
    this.ui.statusText.textContent = status.toUpperCase();
    this.ui.btnStart.textContent = this.isRunning ? 'Stop' : 'Start';
    if (this.isRunning) {
      this.ui.btnStart.classList.add('danger-btn');
    } else {
      this.ui.btnStart.classList.remove('danger-btn');
    }
  }

  async startSearching(startFromIndex = 0, isFlash = false) {
    if (this.queries.length === 0) {
      const key = localStorage.getItem('typerApiKey');
      await this.refreshQueries(key || 'fallback');
    }
    
    this.isRunning = true;
    this.currentIndex = startFromIndex;
    this.executedCount = 0;
    this.updateUIStatus('Searching');
    
    const limit = Math.min(this.queries.length, 60); // Max 60 searches default
    
    while (this.isRunning && this.currentIndex < limit) {
      const query = this.queries[this.currentIndex];
      
      this.ui.currentQuery.textContent = query;
      this.ui.countText.textContent = this.executedCount;
      this.ui.remainingText.textContent = limit - this.currentIndex;
      
      const pct = Math.round((this.executedCount / limit) * 100);
      this.ui.progressBar.style.width = `${pct}%`;
      this.ui.progressPct.textContent = `${pct}%`;

      try {
        await this.typeQueryInWebview(query, isFlash);
      } catch (e) {
        console.error("Search error:", e);
      }
      
      this.currentIndex++;
      this.executedCount++;
      
      if (!this.isRunning) break;
      
      // Delay
      let delaySec = isFlash ? 3 : parseInt(this.ui.delaySlider.value);
      if (!isFlash) {
         // Randomize slightly ±20%
         delaySec = delaySec * (0.8 + Math.random() * 0.4);
      }
      
      this.updateChart(delaySec.toFixed(1));
      await this.waitChunked(delaySec * 1000);
    }
    
    this.isRunning = false;
    this.updateUIStatus(this.currentIndex >= limit ? 'Completed' : 'Offline');
    
    // Notify Main process we're done
    if (this.currentIndex >= limit) {
       require('electron').ipcRenderer.invoke('report-search-complete', this.profileDir, this.executedCount);
    }
  }
  
  stopSearching() {
    this.isRunning = false;
    this.updateUIStatus('Offline');
  }

  async waitChunked(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && this.isRunning) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  async typeQueryInWebview(query, isFlash) {
    const script = `
      (function() {
        return new Promise((resolve) => {
          function typeLikeHuman(element, text, speed, callback) {
            let i = 0;
            function typeNextChar() {
              if (i < text.length) {
                element.value += text.charAt(i);
                i++;
                setTimeout(typeNextChar, speed);
              } else { callback(); }
            }
            typeNextChar();
          }
          const input = document.querySelector("textarea[name='q'], input[name='q']");
          if (input) {
            input.focus();
            input.value = '';
            typeLikeHuman(input, "${query.replace(/"/g, '\\"')}", ${isFlash ? 10 : 80}, () => {
              const form = input.closest("form");
              if (form) form.submit();
              resolve(true);
            });
          } else {
            // Fallback navigation
            window.location.href = "https://www.bing.com/search?q=" + encodeURIComponent("${query.replace(/"/g, '\\"')}");
            resolve(true);
          }
        });
      })();
    `;
    await this.webview.executeJavaScript(script);
    
    // Wait for navigation
    await new Promise(r => setTimeout(r, isFlash ? 3000 : 6000));
    
    // Optional Anti-bot scroll
    if (!isFlash) {
      await this.webview.executeJavaScript(`
        window.scrollBy({ top: 300 + Math.random()*400, behavior: 'smooth' });
      `);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

module.exports = { ExtensionInstance };
