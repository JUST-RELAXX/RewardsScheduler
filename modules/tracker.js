// modules/tracker.js — Daily completion tracking with persistent JSON storage
const fs = require('fs');
const path = require('path');

class Tracker {
  constructor(dataDir) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'data');
    this.dataFile = path.join(this.dataDir, 'tracker-data.json');
    this.data = {};
    this._ensureDir();
    this._load();
    this.cleanOldData(30); // Auto-clean on startup
  }

  _ensureDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        this.data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      }
    } catch (e) {
      console.error('[Tracker] Failed to load data:', e.message);
      this.data = {};
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error('[Tracker] Failed to save data:', e.message);
    }
  }

  _todayKey() {
    // Use LOCAL date, not UTC — MS Rewards resets at midnight local time
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Get all profile statuses for today
  getTodayStatus() {
    return this.data[this._todayKey()] || {};
  }

  // Get status for a specific profile
  getProfileStatus(profileDir) {
    const today = this.getTodayStatus();
    return today[profileDir] || {
      searchesDone: false,
      onlineTimeDone: false,
      completedAt: null,
      searchCount: 0,
      onlineMinutes: 0,
      inProgress: false
    };
  }

  // Mark a profile's searches as in-progress
  markInProgress(profileDir) {
    const key = this._todayKey();
    if (!this.data[key]) this.data[key] = {};
    if (!this.data[key][profileDir]) {
      this.data[key][profileDir] = this._defaultStatus();
    }
    this.data[key][profileDir].inProgress = true;
    this._save();
  }

  // Mark a profile's searches as complete
  markSearchesDone(profileDir, searchCount = 60) {
    const key = this._todayKey();
    if (!this.data[key]) this.data[key] = {};
    if (!this.data[key][profileDir]) {
      this.data[key][profileDir] = this._defaultStatus();
    }
    this.data[key][profileDir].searchesDone = true;
    this.data[key][profileDir].searchCount = searchCount;
    this.data[key][profileDir].inProgress = false;
    this.data[key][profileDir].completedAt = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
    this._save();
  }

  // Mark a profile's searches as undone (manual override)
  markSearchesUndone(profileDir) {
    const key = this._todayKey();
    if (!this.data[key]) this.data[key] = {};
    if (!this.data[key][profileDir]) {
      this.data[key][profileDir] = this._defaultStatus();
    }
    this.data[key][profileDir].searchesDone = false;
    this.data[key][profileDir].searchCount = 0;
    this.data[key][profileDir].inProgress = false;
    this.data[key][profileDir].completedAt = null;
    this._save();
  }

  // Mark a profile's 30-min online time as complete
  markOnlineTimeDone(profileDir, minutes = 30) {
    const key = this._todayKey();
    if (!this.data[key]) this.data[key] = {};
    if (!this.data[key][profileDir]) {
      this.data[key][profileDir] = this._defaultStatus();
    }
    this.data[key][profileDir].onlineTimeDone = true;
    this.data[key][profileDir].onlineMinutes = minutes;
    this._save();
  }

  // Update online time accumulator
  updateOnlineTime(profileDir, minutes) {
    const key = this._todayKey();
    if (!this.data[key]) this.data[key] = {};
    if (!this.data[key][profileDir]) {
      this.data[key][profileDir] = this._defaultStatus();
    }
    this.data[key][profileDir].onlineMinutes = minutes;
    if (minutes >= 30) {
      this.data[key][profileDir].onlineTimeDone = true;
    }
    this._save();
  }

  // Check if all given profiles are fully done today
  isAllDoneToday(profiles) {
    const today = this.getTodayStatus();
    return profiles.every(p => {
      const status = today[p];
      return status && status.searchesDone && status.onlineTimeDone;
    });
  }

  // Get count of completed profiles today
  getDoneCount(profiles) {
    const today = this.getTodayStatus();
    return profiles.filter(p => {
      const status = today[p];
      return status && status.searchesDone;
    }).length;
  }

  // Get historical data
  getHistory(days = 7) {
    const result = {};
    const keys = Object.keys(this.data).sort().reverse().slice(0, days);
    keys.forEach(k => { result[k] = this.data[k]; });
    return result;
  }

  // Clean data older than N days
  cleanOldData(keepDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const year = cutoff.getFullYear();
    const month = String(cutoff.getMonth() + 1).padStart(2, '0');
    const day = String(cutoff.getDate()).padStart(2, '0');
    const cutoffStr = `${year}-${month}-${day}`;
    let cleaned = 0;
    Object.keys(this.data).forEach(key => {
      if (key < cutoffStr) {
        delete this.data[key];
        cleaned++;
      }
    });
    if (cleaned > 0) this._save();
  }

  _defaultStatus() {
    return {
      searchesDone: false,
      onlineTimeDone: false,
      completedAt: null,
      searchCount: 0,
      onlineMinutes: 0,
      inProgress: false
    };
  }
}

module.exports = Tracker;
