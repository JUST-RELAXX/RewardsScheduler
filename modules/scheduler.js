// modules/scheduler.js — Smart notification timing engine
// Fires: 1 min after boot/app start, then every 2 hours while PC is on
// Escalates urgency as 10:30 PM approaches, stops reminding after 10:30 PM
const { EventEmitter } = require('events');
const os = require('os');

class Scheduler extends EventEmitter {
  constructor() {
    super();
    this.checkInterval = null;
    this.lastReminderTime = 0;
    this.snoozedUntil = 0;
    this.appStartTime = Date.now();
    this.firstReminderFired = false;
    this.reminderIntervalMs = 2 * 60 * 60 * 1000; // 2 hours
    this.firstReminderDelayMs = 60 * 1000; // 1 minute after start
    this.deadlineHour = 22; // 10:30 PM
    this.deadlineMinute = 30;
    this.allDoneChecker = null; // Function set externally to check if all accounts are done
  }

  start() {
    console.log('[Scheduler] Starting notification engine...');
    // Check every 30 seconds for precise timing
    this.checkInterval = setInterval(() => this._check(), 30 * 1000);
    // Also do an immediate check after the first-reminder delay
    setTimeout(() => this._check(), this.firstReminderDelayMs);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  snooze(minutes = 30) {
    this.snoozedUntil = Date.now() + (minutes * 60 * 1000);
    console.log(`[Scheduler] Snoozed for ${minutes} minutes`);
  }

  // Set the external checker function
  setDoneChecker(fn) {
    this.allDoneChecker = fn;
  }

  _check() {
    const now = Date.now();
    const currentTime = new Date();
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();

    // Don't remind after 10:30 PM (deadline passed)
    if (hours > this.deadlineHour || (hours === this.deadlineHour && minutes > this.deadlineMinute)) {
      return;
    }

    // Don't remind before 6 AM
    if (hours < 6) return;

    // Don't remind if snoozed
    if (now < this.snoozedUntil) return;

    // Don't remind if all accounts are done today
    if (this.allDoneChecker && this.allDoneChecker()) return;

    // First reminder: 1 minute after app start
    if (!this.firstReminderFired) {
      const timeSinceStart = now - this.appStartTime;
      if (timeSinceStart >= this.firstReminderDelayMs) {
        this.firstReminderFired = true;
        this.lastReminderTime = now;
        this._fireReminder(this._getUrgencyLevel(hours, minutes));
        return;
      }
      return;
    }

    // Recurring reminders: every 2 hours
    const timeSinceLastReminder = now - this.lastReminderTime;
    if (timeSinceLastReminder >= this.reminderIntervalMs) {
      this.lastReminderTime = now;
      this._fireReminder(this._getUrgencyLevel(hours, minutes));
    }
  }

  _getUrgencyLevel(hours, minutes) {
    // 10:00 PM - 10:30 PM → CRITICAL
    if (hours === 22 && minutes <= 30) return 'critical';
    // 9:00 PM - 10:00 PM → HIGH
    if (hours >= 21) return 'high';
    // 8:00 PM - 9:00 PM → MEDIUM
    if (hours >= 20) return 'medium';
    // Before 8:00 PM → CASUAL
    return 'casual';
  }

  _getMessages(urgency) {
    const messages = {
      casual: {
        title: 'Hey bruh! 👋',
        body: 'Wanna do all the searches now??? Your rewards are waiting!',
        noMessage: 'No worries, do it later... but remember to f**king do it by 10:30 MOST!'
      },
      medium: {
        title: 'Yo, time\'s ticking! ⏰',
        body: 'You should probably get those MS Rewards searches done... Evening\'s flying by!',
        noMessage: 'Aight, but seriously... 10:30 PM is the absolute deadline. Don\'t mess up your streak!'
      },
      high: {
        title: '⚠️ Getting Late!',
        body: 'It\'s past 9 PM! Your MS Rewards streak is at risk. Do the searches NOW!',
        noMessage: 'You\'re playing with fire... Rewards reset after midnight. GET IT DONE!'
      },
      critical: {
        title: '🚨 LAST CHANCE!!!',
        body: `MS Rewards resets in ${30 - new Date().getMinutes()} minutes! Do it RIGHT NOW or lose your streak!`,
        noMessage: 'Bruh... you literally have minutes left. RIP streak if you don\'t act NOW.'
      }
    };
    return messages[urgency] || messages.casual;
  }

  _fireReminder(urgency) {
    const messages = this._getMessages(urgency);
    console.log(`[Scheduler] Firing ${urgency} reminder`);
    this.emit('reminder', {
      urgency,
      title: messages.title,
      body: messages.body,
      noMessage: messages.noMessage,
      timestamp: Date.now()
    });
  }
}

module.exports = Scheduler;
