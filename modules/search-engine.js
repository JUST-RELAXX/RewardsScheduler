// modules/search-engine.js — Generates realistic search queries and injection scripts
// Used by the renderer to perform Bing searches inside embedded webviews

const SEARCH_TOPICS = [
  // Trending / everyday
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

  // Tech
  'artificial intelligence news', 'best programming tutorials', 'react vs angular',
  'python tips and tricks', 'cloud computing basics', 'cybersecurity tips',
  'machine learning for beginners', 'web development trends', 'best IDE for coding',
  'how does blockchain work', 'best gaming monitors', 'keyboard shortcuts windows',

  // Science & Knowledge
  'how do black holes work', 'interesting space facts', 'history of the internet',
  'how does DNA work', 'renewable energy sources', 'quantum computing explained',
  'evolution of humans', 'deepest ocean trenches', 'how vaccines work',
  'climate change solutions', 'mars exploration updates', 'photosynthesis explained',

  // Life & culture
  'best music playlists', 'how to cook rice perfectly', 'yoga for beginners',
  'best board games', 'how to tie a tie', 'photography tips for beginners',
  'how to write a resume', 'best free online courses', 'gardening tips',
  'how to clean a keyboard', 'best wireless earbuds', 'diy home projects',
  'how to make coffee', 'best anime to watch', 'how to organize your closet',

  // Random curiosity
  'why is the sky blue', 'how many countries in the world', 'tallest building in the world',
  'what is cryptocurrency', 'how to solve a rubiks cube', 'fastest animal on earth',
  'how airplanes fly', 'why do we dream', 'how does wifi work',
  'what causes earthquakes', 'how old is the universe', 'why do cats purr',
  'how does gravity work', 'what is the speed of light', 'how do computers work',

  // Seasonal / trending
  'summer vacation ideas', 'back to school supplies', 'holiday gift ideas',
  'new year resolutions', 'spring cleaning tips', 'winter fashion trends',
  'best sunscreen', 'rainy day activities', 'outdoor picnic ideas',
  'best water bottles', 'camping essentials checklist', 'road trip playlist'
];

// Shuffle array using Fisher-Yates
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generate a unique queue of search queries for a profile
function generateSearchQueue(count = 60) {
  // Shuffle and cycle if needed
  const shuffled = shuffle(SEARCH_TOPICS);
  const queue = [];
  for (let i = 0; i < count; i++) {
    let query = shuffled[i % shuffled.length];
    // Add slight variation for repeats
    if (i >= shuffled.length) {
      const suffixes = ['tips', 'guide', 'tutorial', 'explained', '2026', 'best', 'how to', 'review'];
      query += ' ' + suffixes[Math.floor(Math.random() * suffixes.length)];
    }
    queue.push(query);
  }
  return queue;
}

// JavaScript to inject into a webview to perform a Bing search
function getSearchScript(query) {
  return `
    (function() {
      try {
        const input = document.querySelector('#sb_form_q');
        if (!input) {
          // Fallback: navigate directly
          window.location.href = 'https://www.bing.com/search?q=' + encodeURIComponent('${query.replace(/'/g, "\\'")}');
          return 'navigated';
        }
        // Clear existing text
        input.value = '';
        input.focus();
        // Type the query character by character (more human-like)
        input.value = '${query.replace(/'/g, "\\'")}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // Submit the form
        const form = document.querySelector('#sb_form');
        if (form) {
          setTimeout(() => form.submit(), ${300 + Math.floor(Math.random() * 500)});
        }
        return 'submitted';
      } catch(e) {
        return 'error: ' + e.message;
      }
    })();
  `;
}

// JavaScript to inject for random scrolling (anti-bot behavior)
function getScrollScript() {
  const scrollAmount = 200 + Math.floor(Math.random() * 600);
  const delay = 500 + Math.floor(Math.random() * 1500);
  return `
    (function() {
      setTimeout(() => {
        window.scrollBy({ top: ${scrollAmount}, behavior: 'smooth' });
        setTimeout(() => {
          window.scrollBy({ top: -${Math.floor(scrollAmount * 0.3)}, behavior: 'smooth' });
        }, ${800 + Math.floor(Math.random() * 1000)});
      }, ${delay});
      return 'scrolling';
    })();
  `;
}

// JavaScript to check if we're on Bing
function getCheckBingScript() {
  return `
    (function() {
      return {
        url: window.location.href,
        isBing: window.location.hostname.includes('bing.com'),
        title: document.title,
        hasSearchBox: !!document.querySelector('#sb_form_q')
      };
    })();
  `;
}

// Edge-like user agent string
function getEdgeUserAgent() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
}

module.exports = {
  generateSearchQueue,
  getSearchScript,
  getScrollScript,
  getCheckBingScript,
  getEdgeUserAgent,
  SEARCH_TOPICS
};
