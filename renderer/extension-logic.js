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
    if (this.chartData.length > 60) this.chartData.shift();
    this.drawCustomGraph();
  }

  drawCustomGraph() {
    const canvas = this.ui.chartCanvas;
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 2; // Default to at least 2 for HD
    const w = parent.clientWidth || 300;
    const h = parent.clientHeight || 120;
    
    if (w > 0 && h > 0) {
       canvas.width = w * dpr;
       canvas.height = h * dpr;
       canvas.style.width = `${w}px`;
       canvas.style.height = `${h}px`;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    
    if (this.chartData.length === 0) return;

    const maxVal = Math.max(15, ...this.chartData) * 1.2;
    
    // Layout Margins
    const marginLeft = 45;
    const marginBottom = 35; // Increased margin to prevent clipping
    const graphW = w - marginLeft - 10; // 10px right padding
    const graphH = h - marginBottom - 10; // 10px top padding
    
    ctx.lineWidth = 1;
    ctx.font = '10px "Segoe UI", Arial';
    
    // Horizontal Grid Lines & Y-Axis Labels
    for (let i = 0; i <= 4; i++) {
      const y = 10 + graphH - (i * (graphH / 4));
      
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 176, 255, 0.2)'; // Darker grid lines
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(marginLeft + graphW, y);
      ctx.stroke();
      
      ctx.fillStyle = '#0288d1'; // Darker text for light background visibility
      ctx.textAlign = 'right';
      const labelVal = Math.round((i * (maxVal / 4)));
      ctx.fillText(labelVal + "s", marginLeft - 5, y + 4); 
    }
    
    // Y-Axis Title
    ctx.save();
    ctx.translate(12, 10 + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#0091ea'; // Vibrant dark blue
    ctx.font = 'bold 10px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText("Pacing (s)", 0, 0);
    ctx.restore();

    const maxPoints = Math.max(20, this.chartData.length);
    const xStep = graphW / (maxPoints - 1);

    // Vertical Grid Lines & X-Axis Labels
    for (let i = 0; i < maxPoints; i++) {
      const x = marginLeft + (i * xStep);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 176, 255, 0.1)';
      ctx.moveTo(x, 10);
      ctx.lineTo(x, 10 + graphH);
      ctx.stroke();
      
      const labelInterval = maxPoints > 40 ? 10 : (maxPoints > 20 ? 5 : 4);
      if (i % labelInterval === 0 || i === maxPoints - 1) {
         ctx.fillStyle = '#0288d1';
         ctx.textAlign = 'center';
         ctx.fillText(i + 1, x, 10 + graphH + 14); // Pushed down safely
      }
    }
    
    // X-Axis Title
    ctx.fillStyle = '#0091ea';
    ctx.font = 'bold 10px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText("Searches", marginLeft + graphW / 2, 10 + graphH + 28); // Safely inside height

    if (this.chartData.length < 2) return;

    // ─── DATA CALCULATION ───
    const points = this.chartData.map((val, i) => {
      return { x: marginLeft + (i * xStep), y: 10 + graphH - ((val / maxVal) * graphH), val: val };
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
      smaPoints.push({ x: marginLeft + (i * xStep), y: 10 + graphH - ((avg / maxVal) * graphH) });
    }

    // ─── DRAW LATENCY AREA FILL ───
    const grad = ctx.createLinearGradient(0, 10, 0, 10 + graphH);
    grad.addColorStop(0, 'rgba(0, 176, 255, 0.4)');
    grad.addColorStop(1, 'rgba(0, 176, 255, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, 10 + graphH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, 10 + graphH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // ─── DRAW DATA POINTS ───
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#00b0ff';
      ctx.fill();
      ctx.strokeStyle = '#1a1c29';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

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
    ctx.strokeStyle = 'rgba(230, 81, 0, 0.9)'; // Darker orange trendline
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
    ctx.font = 'bold 10px "Segoe UI", Arial';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0288d1';
    ctx.fillText("● Total Pacing", marginLeft + graphW - 5, 20);
    ctx.fillStyle = '#e65100'; // Darker orange for light background
    ctx.fillText("- - Trend", marginLeft + graphW - 5, 34);
    ctx.textAlign = 'left'; // Reset
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

    if (this.ui.btnFlash) {
      this.ui.btnFlash.addEventListener('click', () => {
        if (!this.isRunning) {
          const startFrom = parseInt(this.ui.startFromInput.value) || 1;
          this.startSearching(startFrom - 1, true);
        }
      });
    }
    
    this.ui.delaySlider.addEventListener('input', (e) => {
      if (this.ui.delayValue) this.ui.delayValue.textContent = e.target.value;
    });

    this.ui.delaySlider.addEventListener('change', (e) => {
      localStorage.setItem(`delay_${pKey}`, e.target.value);
    });
    
    this.ui.btnRefresh.addEventListener('click', () => {
      this.refreshQueries('@Test01');
    });
  }

  async fetchToken(key) {
    const https = require('https');
    return new Promise((resolve, reject) => {
      const dataStr = JSON.stringify({ key });
      const req = https.request('https://curiosity-typer.vercel.app/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          'Accept': 'application/json'
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(body).token); } catch (e) { reject(e); }
          } else {
            reject(new Error(`Auth failed: ${res.statusCode} - ${body}`));
          }
        });
      });
      req.on('error', reject);
      req.write(dataStr);
      req.end();
    });
  }

  async fetchQueriesFromAPI(token, topics = []) {
    const https = require('https');
    let url = 'https://curiosity-typer.vercel.app/getPrompts';
    if (topics && topics.length > 0) {
      url += `?topics=${encodeURIComponent(topics.join(','))}`;
    }
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          'Accept': 'application/json'
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(body).prompts || []); } catch (e) { reject(e); }
          } else {
            reject(new Error(`Fetch failed: ${res.statusCode} - ${body}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  async fetchGroqDelays(limit, ySeconds, minDelay, maxDelay) {
    const groqKey = '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';

    const systemInstruction = `You must generate a list of exactly ${limit} integers between ${minDelay} and ${maxDelay}. 
CRITICAL RULES:
1. The sum of all ${limit} numbers MUST be EXACTLY ${ySeconds}.
2. The numbers MUST have EXTREME DISPARITY and HIGH VARIANCE. Mix very low numbers (close to ${minDelay}) and very high numbers (close to ${maxDelay}) chaotically. DO NOT just output the mathematical average repeatedly. Make it look like highly erratic human behavior.
3. Only return the numbered list. No other text. Format exactly like this:
1. 10
2. 29`;
    
    try {
      this.ui.statusMessage.style.cssText = "display:block; text-align:center; margin-bottom: 15px; color: #b388ff;";
      this.ui.statusMessage.innerHTML = `🧠 AI Calculating ${limit} perfect delays...`;
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', 
          messages: [{ role: 'user', content: systemInstruction }],
          temperature: 0.7 
        })
      });
      
      if (!response.ok) {
        throw new Error(`Groq API Error: ${response.status}`);
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      // Parse numbers from the output
      const lines = content.split('\n');
      const delays = [];
      for (const line of lines) {
         // Try to parse format like "1. 15" or "1- 15"
         const parts = line.split(/[.-]/);
         if (parts.length >= 2) {
             const val = parseInt(parts[1].trim());
             if (!isNaN(val)) delays.push(val);
         } else {
             // Fallback: just extract the first number found if there's no numbering
             const match = line.match(/\d+/);
             if (match) delays.push(parseInt(match[0]));
         }
      }
      
      // Filter out invalid ones
      const validDelays = delays.filter(d => !isNaN(d) && d > 0);
      
      // If it generated at least the amount we need, return it
      if (validDelays.length >= limit) {
         return validDelays.slice(0, limit);
      } else if (validDelays.length > 0) {
         // If it generated some, but not enough, repeat them to fill
         const padded = [...validDelays];
         while (padded.length < limit) {
           padded.push(validDelays[Math.floor(Math.random() * validDelays.length)]);
         }
         return padded;
      }
      return null;
    } catch (err) {
      console.warn("Groq API Delay Fetch Failed:", err);
      return null;
    }
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
      if (!this.token) this.token = await this.fetchToken('@Test01');
      this.queries = await this.fetchQueriesFromAPI(this.token, topicsToSend);
      
      if (topicsToSend === this.selectedCategories && topicsToSend.length > 0) {
        this.ui.statusMessage.style.cssText = "display:block; text-align:center; margin-bottom: 15px; color: #4caf50;";
        this.ui.statusMessage.textContent = `Loaded ${this.queries.length} queries from API`;
      } else {
        this.ui.statusMessage.innerHTML += `<br><span style="color:#69f0ae; font-style:normal;">Loaded ${this.queries.length} queries</span>`;
      }
      
      if (this.ui.totalPrompts) this.ui.totalPrompts.textContent = this.queries.length;
      if (this.ui.remainingText) this.ui.remainingText.textContent = `${this.queries.length} remaining`;
      
    } catch (e) {
      console.warn("API failed, using fallback queries:", e.message, e);
      this.queries = shuffleArray(FALLBACK_QUERIES);
      
      if (e.message && e.message.includes("Rate limit reached")) {
        this.ui.statusMessage.style.cssText = "display:block; text-align:center; margin-bottom: 15px; color: #ff5252;";
        this.ui.statusMessage.innerHTML = `<b>Groq API Limit Reached!</b><br><span style="font-size:10px;">Backend AI is out of tokens.</span><br>Loaded ${this.queries.length} offline queries`;
      } else {
        this.ui.statusMessage.style.cssText = "display:block; text-align:center; margin-bottom: 15px; color: #f44336;";
        this.ui.statusMessage.textContent = `Loaded ${this.queries.length} offline queries`;
      }
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
      await this.refreshQueries('@Test01');
    }
    
    if (this.queries.length === 0) {
      this.isRunning = false;
      this.updateUIStatus('Error: No Queries');
      addLogEntry(`[${this.profileDir}] Failed to start: No queries fetched from API.`, 'error');
      return;
    }
    
    const pKey = this.profileDir;
    const automize = localStorage.getItem(`prof_${pKey}_automize`) === 'true';
    if (automize && startFromIndex === 0) {
       const aMin = parseInt(localStorage.getItem(`prof_${pKey}_automizeMin`)) || 1;
       const aMax = parseInt(localStorage.getItem(`prof_${pKey}_automizeMax`)) || 5;
       let rnd = aMin + Math.floor(Math.random() * (aMax - aMin + 1));
       startFromIndex = Math.max(0, rnd - 1);
    }
    
    this.isRunning = true;
    this.currentIndex = startFromIndex;
    this.executedCount = 0;
    this.updateUIStatus('Searching');
    
    // ─── MATHEMATICALLY PRECISE LIMIT CALCULATION ───
    let maxPoints = parseInt(localStorage.getItem('customMaxPoints_' + this.profileDir));
    if (isNaN(maxPoints) || maxPoints <= 0) {
       maxPoints = 60; // Default to 60 points (20 base searches) if not explicitly set
    }
    const X = Math.ceil(maxPoints / 3); // Base searches needed
    
    // Limit is the absolute index to stop at. Must account for the randomized start index!
    let limit = this.currentIndex + X + (Math.random() < 0.6 ? 10 : 15); // +10 (60%) or +15 (40%) extra searches
    
    // Safety clamp
    if (limit > this.queries.length) limit = this.queries.length;
    
    // Explicit override if set
    const maxSearchesOverride = parseInt(localStorage.getItem(`prof_${pKey}_maxSearches`));
    if (!isNaN(maxSearchesOverride) && maxSearchesOverride > 0) {
       limit = this.currentIndex + maxSearchesOverride;
    }
    
    const remainingSearches = limit - this.currentIndex;
    
    // ─── DYNAMIC PACING LOGIC ───
    const useRandomDelay = localStorage.getItem(`prof_${pKey}_randomDelay`) === 'true';
    const isGlobal = !!this.isGlobalStart;
    
    this.aiDelays = null;
    let cycleTargetSec = 0;
    
    if (isGlobal) {
       // Global Mode AI Pacing
       let targetMins = this.globalTimeframeMinsOverride;
       if (!targetMins) targetMins = 30 + Math.random() * 10;
       cycleTargetSec = (targetMins * 60) / (remainingSearches || 1);
       
       let l = 10;
       let m = 30;
       if (useRandomDelay) {
           l = parseInt(localStorage.getItem(`prof_${pKey}_randomDelayMin`)) || 10;
           m = parseInt(localStorage.getItem(`prof_${pKey}_randomDelayMax`)) || 30;
       }
       let Y = targetMins * 60;
       
       // ─── STRICT MATHEMATICAL CLAMPING ───
       // If the user's explicit delay bounds make the timeframe impossible, we MUST 
       // adjust the total time target (Y) to the closest possible mathematical boundary.
       const minPossibleTime = remainingSearches * l;
       const maxPossibleTime = remainingSearches * m;
       
       if (Y < minPossibleTime) {
          Y = minPossibleTime + 10; // add a small variance buffer
          addLogEntry(`[${this.profileDir}] Warning: Target timeframe too short for ${remainingSearches} searches (Min delay: ${l}s). Increased total target to ${Y}s.`, 'warning');
       } else if (Y > maxPossibleTime) {
          Y = maxPossibleTime - 10; // subtract a small variance buffer
          addLogEntry(`[${this.profileDir}] Warning: Target timeframe too long for ${remainingSearches} searches (Max delay: ${m}s). Decreased total target to ${Y}s.`, 'warning');
       }
       
       this.aiDelays = await this.fetchGroqDelays(remainingSearches, Y, l, m);
       
       if (this.aiDelays && this.aiDelays.length > 0) {
         addLogEntry(`[${this.profileDir}] AI generated exactly ${this.aiDelays.length} pacing intervals: ${this.aiDelays.join(', ')}`, 'success');
       } else {
         addLogEntry(`[${this.profileDir}] AI Pacing fallback to standard algorithm.`, 'warning');
       }
    } else if (!useRandomDelay) {
       cycleTargetSec = parseInt(this.ui.delaySlider?.value) || 10;
    }
    
    if (!isFlash && this.ui.delaySlider && cycleTargetSec > 0) {
       this.ui.delaySlider.value = Math.min(60, Math.round(cycleTargetSec));
       if (this.ui.delayValue) this.ui.delayValue.textContent = Math.round(cycleTargetSec);
    }
    
    let searchesSinceLastTrigger = 0;
    let currentRandomDelay = cycleTargetSec;
    let currentRandomTrigger = 1;
    
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
      searchesSinceLastTrigger++;
      
      if (!this.isRunning) break;
      
      let currentDelaySec = cycleTargetSec;
      if (isFlash) {
         currentDelaySec = parseInt(localStorage.getItem(`prof_${pKey}_flashDelay`)) || 5;
      } else {
         let pDelay = cycleTargetSec;
         if (useRandomDelay) {
            if (searchesSinceLastTrigger >= currentRandomTrigger) {
               const rMin = parseInt(localStorage.getItem(`prof_${pKey}_randomDelayMin`)) || 1;
               const rMax = parseInt(localStorage.getItem(`prof_${pKey}_randomDelayMax`)) || 10;
               const tMin = parseInt(localStorage.getItem(`prof_${pKey}_randomTriggerMin`)) || 1;
               const tMax = parseInt(localStorage.getItem(`prof_${pKey}_randomTriggerMax`)) || 5;
               currentRandomDelay = rMin + Math.random() * (rMax - rMin);
               currentRandomTrigger = tMin + Math.floor(Math.random() * (tMax - tMin + 1));
               searchesSinceLastTrigger = 0;
            }
            pDelay = currentRandomDelay;
         } else {
            pDelay = cycleTargetSec * (0.8 + Math.random() * 0.4);
         }
         
         if (isGlobal) {
            if (this.aiDelays && this.aiDelays.length > 0) {
                // Mathematically perfect AI-driven pacing
                const aiTarget = this.aiDelays.shift();
                // We subtract the typing latency so the total time from start to next query is exactly aiTarget
                currentDelaySec = Math.max(1, aiTarget - latency);
            } else {
                let waitTime = pDelay;
                const timeSpentSoFar = latency + waitTime;
                
                if (timeSpentSoFar < cycleTargetSec) {
                    const compensationDelay = cycleTargetSec - timeSpentSoFar;
                    waitTime += compensationDelay;
                } else if (timeSpentSoFar > cycleTargetSec) {
                    waitTime = Math.max(1, cycleTargetSec - latency);
                }
                currentDelaySec = waitTime;
            }
         } else {
            // Local start respects profile delays explicitly, just subtracting typing latency
            currentDelaySec = Math.max(1, pDelay - latency);
         }
      }
      
      // Plot the FULL pacing time on the graph (latency + wait time)
      const totalPacingSec = latency + currentDelaySec;
      if (totalPacingSec > 0) {
        this.updateChart(totalPacingSec.toFixed(1));
      }
      
      await this.waitChunked(currentDelaySec * 1000);
    }
    
    this.isRunning = false;
    this.updateUIStatus(this.currentIndex >= limit ? 'Completed' : 'Offline');
    
    // Notify Main process we're done
    if (this.currentIndex >= limit) {
       require('electron').ipcRenderer.invoke('report-search-complete', this.profileDir, this.executedCount);
    }
    
    // Reset Flash buttons if they were active
    const btnGlobalFlash = document.getElementById('btnGlobalFlash');
    if (btnGlobalFlash && btnGlobalFlash.classList.contains('stop')) {
       btnGlobalFlash.classList.remove('stop');
       btnGlobalFlash.textContent = "ACTIVATE FLASH ⚡";
    }
    const btnProfileFlash = document.getElementById('btnProfileFlash');
    if (btnProfileFlash && btnProfileFlash.classList.contains('stop')) {
       btnProfileFlash.classList.remove('stop');
       btnProfileFlash.textContent = "ACTIVATE FLASH ⚡";
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
    const pKey = this.profileDir;
    const humanLike = localStorage.getItem(`prof_${pKey}_humanLikeTyping`) !== 'false';
    const randomSpeed = localStorage.getItem(`prof_${pKey}_randomTypingSpeed`) === 'true';
    let baseSpeed = parseInt(localStorage.getItem(`prof_${pKey}_typingSpeed`));
    if (isNaN(baseSpeed)) baseSpeed = 100;
    if (isFlash) baseSpeed = 10;
    
    const script = `
      (function() {
        return new Promise((resolve) => {
          function typeLikeHuman(element, text, callback) {
            let i = 0;
            function typeNextChar() {
              if (i < text.length) {
                element.value += text.charAt(i);
                i++;
                let speed = ${!humanLike ? '1' : baseSpeed};
                if (${humanLike} && ${randomSpeed}) {
                   speed = speed * (0.5 + Math.random());
                }
                setTimeout(typeNextChar, speed);
              } else { callback(); }
            }
            typeNextChar();
          }
          const input = document.querySelector("textarea[name='q'], input[name='q']");
          if (input) {
            input.focus();
            input.value = '';
            typeLikeHuman(input, "${query.replace(/"/g, '\\"')}", () => {
              const form = input.closest("form");
              resolve(true);
              if (form) setTimeout(() => form.submit(), 10);
            });
          } else {
            resolve(true);
            setTimeout(() => {
              window.location.href = "https://www.bing.com/search?q=" + encodeURIComponent("${query.replace(/"/g, '\\"')}");
            }, 10);
          }
        });
      })();
    `;
    await this.webview.executeJavaScript(script);
    
    // Wait for navigation
    await new Promise(r => setTimeout(r, isFlash ? 3000 : 6000));
    
  }
}

module.exports = { ExtensionInstance };
