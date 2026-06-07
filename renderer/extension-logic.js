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
    
    // Topic System State
    this.defaultCategories = [
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
    this.userCategories = [];
    this.selectedCategories = [];
    
    this.initCategories();
    this.initChart();
    this.bindEvents();
    
    // Auto-unlock with the provided test API key
    setTimeout(() => {
      if (this.ui.apiKeyInput) {
        this.ui.apiKeyInput.value = '@Test01';
        this.ui.btnUnlock.click();
      }
    }, 300);
  }
  
  initCategories() {
    const pKey = this.profileDir;
    const savedCustom = localStorage.getItem(`customCategories_${pKey}`);
    if (savedCustom) {
      try { this.userCategories = JSON.parse(savedCustom); } catch(e) {}
    } else {
      this.userCategories = [...this.defaultCategories];
    }
    
    const savedSelected = localStorage.getItem(`selectedCategories_${pKey}`);
    if (savedSelected) {
      try { this.selectedCategories = JSON.parse(savedSelected); } catch(e) {}
    }
    this.renderCategories();
  }

  renderCategories() {
    if (!this.ui.categoryContainer) return;
    this.ui.categoryContainer.innerHTML = '';
    
    this.userCategories.forEach(cat => {
      const isSelected = this.selectedCategories.includes(cat);
      const span = document.createElement('span');
      span.textContent = cat;
      // Replicate the styling from the original extension
      span.style.cssText = `
        display: inline-block;
        padding: 4px 8px;
        margin: 2px;
        border-radius: 12px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        border: 1px solid ${isSelected ? '#00b0ff' : '#2a2d3e'};
        background: ${isSelected ? 'rgba(0, 176, 255, 0.2)' : '#1a1c29'};
        color: ${isSelected ? '#00b0ff' : '#b0bec5'};
      `;
      
      span.addEventListener('click', () => {
        if (isSelected) {
          this.selectedCategories = this.selectedCategories.filter(c => c !== cat);
        } else {
          this.selectedCategories.push(cat);
        }
        localStorage.setItem(`selectedCategories_${this.profileDir}`, JSON.stringify(this.selectedCategories));
        this.renderCategories();
      });
      
      this.ui.categoryContainer.appendChild(span);
    });
  }

  initChart() {
    this.drawCustomGraph();
  }

  updateChart(delaySec) {
    this.chartData.push(parseFloat(delaySec));
    if (this.chartData.length > 20) this.chartData.shift();
    this.drawCustomGraph();
  }

  drawCustomGraph() {
    const canvas = this.ui.chartCanvas;
    if (!canvas) return;
    
    // Support responsive resizing inside zoomed containers
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    if (parent.clientWidth > 0 && parent.clientHeight > 0) {
       canvas.width = parent.clientWidth * dpr;
       canvas.height = parent.clientHeight * dpr;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    ctx.clearRect(0, 0, w, h);
    
    if (this.chartData.length === 0) return;

    // Calculate max value with some padding
    const maxVal = Math.max(15, ...this.chartData) * 1.2;
    
    // ─── DRAW GRID & LABELS ───
    ctx.lineWidth = 1;
    ctx.font = '12px "Segoe UI", Arial';
    
    // Horizontal Grid Lines & Y-Axis Labels
    for (let i = 0; i <= 4; i++) {
      const y = h - (i * (h / 4));
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 176, 255, 0.1)';
      ctx.moveTo(35, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      
      ctx.fillStyle = '#0277bd';
      const labelVal = Math.round((i * (maxVal / 4)));
      const textY = i === 4 ? y + 12 : y - 4; 
      ctx.fillText(labelVal + "s", 5, textY); 
    }
    
    // Y-Axis Title
    ctx.save();
    ctx.translate(10, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#005b9f';
    ctx.font = 'bold 10px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText("Time (s)", 0, 0);
    ctx.restore();

    const xStep = (w - 40) / 19; // 20 maxPoints - 1
    const startX = 35;

    // Vertical Grid Lines & X-Axis Labels
    for (let i = 0; i < 20; i++) {
      const x = startX + (i * xStep);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 176, 255, 0.05)';
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      
      if (i % 4 === 0) {
         ctx.fillStyle = '#0277bd';
         ctx.font = '10px "Segoe UI", Arial';
         ctx.fillText(i + 1, x - 3, h - 5);
      }
    }
    
    // X-Axis Title
    ctx.fillStyle = '#005b9f';
    ctx.font = 'bold 10px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText("Searches ->", w / 2, h - 2);
    ctx.textAlign = 'left'; // reset

    if (this.chartData.length < 2) return;

    // ─── DATA CALCULATION ───
    const points = this.chartData.map((val, i) => {
      return { x: startX + (i * xStep), y: h - ((val / maxVal) * h), val: val };
    });

    // Calculate 3-point Simple Moving Average (Trendline)
    const smaPoints = [];
    for (let i = 0; i < this.chartData.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - 2); j <= i; j++) {
        sum += this.chartData[j];
        count++;
      }
      const avg = sum / count;
      smaPoints.push({ x: startX + (i * xStep), y: h - ((avg / maxVal) * h) });
    }

    // ─── DRAW LATENCY AREA FILL ───
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

    // ─── DRAW LATENCY CURVE ───
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

    // ─── DRAW SMA TRENDLINE ───
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.8)'; // Orange trendline
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Dashed line for trend
    ctx.moveTo(smaPoints[0].x, smaPoints[0].y);
    for (let i = 0; i < smaPoints.length - 1; i++) {
       const p0 = smaPoints[i];
       const p1 = smaPoints[i + 1];
       const midX = (p0.x + p1.x) / 2;
       const midY = (p0.y + p1.y) / 2;
       ctx.quadraticCurveTo(p0.x, p0.y, midX, midY); 
    }
    ctx.lineTo(smaPoints[smaPoints.length-1].x, smaPoints[smaPoints.length-1].y);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // ─── DRAW DATA POINTS ───
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#00b0ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // ─── DRAW LEGEND ───
    ctx.font = '11px "Segoe UI", Arial';
    ctx.fillStyle = '#0277bd';
    ctx.fillText("● Raw Latency", w - 160, 20);
    ctx.fillStyle = '#ff9800';
    ctx.fillText("- - 3-Search Trend", w - 160, 35);
  }

  bindEvents() {
    const pKey = this.profileDir; // Unique key for this profile

    // Load persistent profile-specific settings
    const savedDelay = localStorage.getItem(`delay_${pKey}`);
    if (savedDelay) {
      this.ui.delaySlider.value = savedDelay;
      if (this.ui.delayValue) this.ui.delayValue.textContent = savedDelay;
    }

    const savedStart = localStorage.getItem(`startFrom_${pKey}`);
    if (savedStart) {
      this.ui.startFromInput.value = savedStart;
    }

    const savedApi = localStorage.getItem(`apiKey_${pKey}`);
    if (savedApi) {
      this.ui.apiKeyInput.value = savedApi;
      // Delay auto-unlock slightly to ensure UI is ready
      setTimeout(() => this.ui.btnUnlock.click(), 100);
    }

    this.ui.btnUnlock.addEventListener('click', async () => {
      const key = this.ui.apiKeyInput.value.trim();
      if (!key) return;
      this.ui.statusMessage.textContent = "Unlocking...";
      try {
        this.token = await this.fetchToken(key);
        this.ui.authSection.style.display = 'none';
        this.ui.mainSection.style.display = 'block';
        localStorage.setItem(`apiKey_${pKey}`, key); // Save uniquely
        this.refreshQueries(key);
      } catch (e) {
        this.ui.statusMessage.textContent = "Invalid API Key";
      }
    });

    this.ui.apiKeyInput.addEventListener('change', (e) => {
      localStorage.setItem(`apiKey_${pKey}`, e.target.value.trim());
    });

    if (this.ui.addCategoryBtn) {
      this.ui.addCategoryBtn.addEventListener('click', () => {
        const val = this.ui.newCategoryInput.value.trim();
        if (val && !this.userCategories.includes(val)) {
          this.userCategories.unshift(val);
          this.selectedCategories.push(val);
          localStorage.setItem(`customCategories_${pKey}`, JSON.stringify(this.userCategories));
          localStorage.setItem(`selectedCategories_${pKey}`, JSON.stringify(this.selectedCategories));
          this.ui.newCategoryInput.value = '';
          this.renderCategories();
        }
      });
    }

    this.ui.btnStart.addEventListener('click', () => {
      if (this.isRunning) {
        this.stopSearching();
      } else {
        const startFrom = parseInt(this.ui.startFromInput.value) || 1;
        this.startSearching(startFrom - 1, false);
      }
    });

    this.ui.startFromInput.addEventListener('change', (e) => {
      localStorage.setItem(`startFrom_${pKey}`, e.target.value);
    });

    this.ui.btnFlash.addEventListener('click', () => {
      if (!this.isRunning) {
        const startFrom = parseInt(this.ui.startFromInput.value) || 1;
        this.startSearching(startFrom - 1, true);
      }
    });
    
    this.ui.delaySlider.addEventListener('input', (e) => {
      if (this.ui.delayValue) this.ui.delayValue.textContent = e.target.value;
    });

    this.ui.delaySlider.addEventListener('change', (e) => {
      localStorage.setItem(`delay_${pKey}`, e.target.value);
    });
    
    this.ui.btnRefresh.addEventListener('click', () => {
      const key = localStorage.getItem(`apiKey_${pKey}`);
      if (key) this.refreshQueries(key);
    });
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

  async fetchQueriesFromAPI(token, topics = []) {
    let url = 'https://curiosity-typer.vercel.app/getPrompts';
    if (topics && topics.length > 0) {
      const topicStr = encodeURIComponent(topics.join(','));
      url += `?topics=${topicStr}`;
    }
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Fetch failed');
    const data = await response.json();
    return data.prompts || [];
  }

  async refreshQueries(key) {
    let topicsToSend = this.selectedCategories;
    
    // Reset basic styling first
    this.ui.statusMessage.style.cssText = "display:block; text-align:center; margin-bottom: 15px;";
    
    if (topicsToSend.length === 0) {
      const shuffled = [...this.userCategories].sort(() => 0.5 - Math.random());
      topicsToSend = shuffled.slice(0, 3);
      
      // Apply the Buyer's Edition UI styling for Auto-selected topics
      this.ui.statusMessage.style.cssText = `
        display: block; 
        text-align: center; 
        background: rgba(0, 176, 255, 0.1); 
        border: 1px solid rgba(0, 176, 255, 0.3); 
        border-radius: 8px; 
        padding: 10px; 
        color: #00b0ff; 
        font-size: 12px;
        font-style: italic;
        margin-bottom: 15px;
      `;
      this.ui.statusMessage.innerHTML = `<span style="display:inline-block; font-size: 14px; margin-right: 5px;">↻</span> Auto-selected: ${topicsToSend.join(', ')}`;
    } else {
      this.ui.statusMessage.textContent = "Fetching new queries...";
    }
    
    try {
      if (!this.token) this.token = await this.fetchToken(key);
      this.queries = await this.fetchQueriesFromAPI(this.token, topicsToSend);
      
      if (topicsToSend === this.selectedCategories && topicsToSend.length > 0) {
        this.ui.statusMessage.style.cssText = "display:block; text-align:center; margin-bottom: 15px; color: #4caf50;";
        this.ui.statusMessage.textContent = `Loaded ${this.queries.length} targeted queries!`;
      } else {
        // Update the spinner to a checkmark but keep the topic list
        this.ui.statusMessage.innerHTML = `<span style="display:inline-block; font-size: 14px; margin-right: 5px; color: #4caf50;">✓</span> Auto-selected: ${topicsToSend.join(', ')} (${this.queries.length} loaded)`;
      }
      
      if (this.ui.totalPrompts) this.ui.totalPrompts.textContent = this.queries.length;
      if (this.ui.remainingText) this.ui.remainingText.textContent = this.queries.length;
      
    } catch (e) {
      console.warn("API failed, using fallback queries");
      this.queries = shuffleArray(FALLBACK_QUERIES);
      this.ui.statusMessage.style.cssText = "display:block; text-align:center; margin-bottom: 15px; color: #f44336;";
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
      const key = localStorage.getItem(`apiKey_${this.profileDir}`);
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

      let latency = 0;
      try {
        const t0 = performance.now();
        await this.typeQueryInWebview(query, isFlash);
        latency = (performance.now() - t0) / 1000;
      } catch (e) {
        console.error("Search error:", e);
      }
      
      this.currentIndex++;
      this.executedCount++;
      
      if (!this.isRunning) break;
      
      // Plot the actual search execution latency
      if (latency > 0) {
        this.updateChart(latency.toFixed(1));
      }
      
      // Delay
      let delaySec = isFlash ? 3 : parseInt(this.ui.delaySlider.value);
      if (!isFlash) {
         // Randomize slightly ±20%
         delaySec = delaySec * (0.8 + Math.random() * 0.4);
      }
      
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
