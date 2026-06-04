// modules/ws-bridge.js — WebSocket server for extension ↔ desktop app communication
const { WebSocketServer } = require('ws');
const { EventEmitter } = require('events');

const WS_PORT = 9847;

class WSBridge extends EventEmitter {
  constructor() {
    super();
    this.wss = null;
    this.clients = new Map(); // profileDir → ws connection
    this.heartbeatInterval = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: WS_PORT });

        this.wss.on('listening', () => {
          console.log(`[WSBridge] Server listening on ws://localhost:${WS_PORT}`);
          this._startHeartbeat();
          resolve();
        });

        this.wss.on('connection', (ws, req) => {
          console.log('[WSBridge] New extension connection');

          ws.isAlive = true;
          ws.profileDir = null;

          ws.on('pong', () => { ws.isAlive = true; });

          ws.on('message', (data) => {
            try {
              const msg = JSON.parse(data.toString());
              this._handleMessage(ws, msg);
            } catch (e) {
              console.error('[WSBridge] Invalid message:', e.message);
            }
          });

          ws.on('close', () => {
            const profileDir = ws.profileDir;
            if (profileDir) {
              console.log(`[WSBridge] Extension disconnected: ${profileDir}`);
              this.clients.delete(profileDir);
              this.emit('extension-disconnected', { profileDir });
            }
          });

          ws.on('error', (err) => {
            console.error('[WSBridge] WebSocket error:', err.message);
          });
        });

        this.wss.on('error', (err) => {
          console.error('[WSBridge] Server error:', err.message);
          reject(err);
        });

      } catch (e) {
        reject(e);
      }
    });
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
  }

  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach(ws => {
        if (!ws.isAlive) {
          console.log('[WSBridge] Terminating stale connection');
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 25000); // 25s heartbeat
  }

  _handleMessage(ws, msg) {
    switch (msg.type) {
      case 'HANDSHAKE': {
        // Extension identifies which profile it's running in
        ws.profileDir = msg.profileDir || 'unknown';
        this.clients.set(ws.profileDir, ws);
        console.log(`[WSBridge] Handshake from profile: ${ws.profileDir}`);
        this._send(ws, { type: 'HANDSHAKE_ACK', status: 'connected' });
        this.emit('extension-connected', { profileDir: ws.profileDir });
        break;
      }

      case 'SEARCH_PROGRESS': {
        // Extension reports search progress
        this.emit('search-progress', {
          profileDir: ws.profileDir,
          executed: msg.executed,
          total: msg.total,
          currentQuery: msg.currentQuery
        });
        break;
      }

      case 'SEARCH_COMPLETE': {
        // Extension reports all searches done
        this.emit('search-complete', {
          profileDir: ws.profileDir,
          totalExecuted: msg.totalExecuted
        });
        break;
      }

      case 'KEEP_ALIVE_ACK': {
        // Extension confirms it's doing keep-alive activity
        this.emit('keep-alive-ack', {
          profileDir: ws.profileDir,
          activity: msg.activity
        });
        break;
      }

      case 'ERROR': {
        this.emit('extension-error', {
          profileDir: ws.profileDir,
          error: msg.error
        });
        break;
      }

      case 'PING': {
        this._send(ws, { type: 'PONG' });
        break;
      }

      default:
        console.log(`[WSBridge] Unknown message type: ${msg.type}`);
    }
  }

  // Send command to a specific profile's extension
  sendToProfile(profileDir, message) {
    const ws = this.clients.get(profileDir);
    if (ws && ws.readyState === 1) { // WebSocket.OPEN
      this._send(ws, message);
      return true;
    }
    console.warn(`[WSBridge] No active connection for profile: ${profileDir}`);
    return false;
  }

  // Send to all connected extensions
  broadcast(message) {
    this.clients.forEach((ws, profileDir) => {
      if (ws.readyState === 1) {
        this._send(ws, message);
      }
    });
  }

  // Command: Start searching on a profile
  startSearch(profileDir, options = {}) {
    return this.sendToProfile(profileDir, {
      type: 'START_SEARCH',
      delay: options.delay || 10000,
      searchCount: options.searchCount || 60,
      startFrom: options.startFrom || 0,
      flash: options.flash || false
    });
  }

  // Command: Stop searching on a profile
  stopSearch(profileDir) {
    return this.sendToProfile(profileDir, { type: 'STOP_SEARCH' });
  }

  // Command: Start keep-alive mode (light activity)
  startKeepAlive(profileDir) {
    return this.sendToProfile(profileDir, {
      type: 'KEEP_ALIVE',
      scrollInterval: 45000,  // scroll every 45s
      slowSearchInterval: 360000, // slow search every 6 min
      slowSearchCount: 5 // max 5 slow searches
    });
  }

  // Command: Stop all activity
  stopAll(profileDir) {
    return this.sendToProfile(profileDir, { type: 'STOP_ALL' });
  }

  // Check if a profile's extension is connected
  isConnected(profileDir) {
    const ws = this.clients.get(profileDir);
    return ws && ws.readyState === 1;
  }

  // Get all connected profile directories
  getConnectedProfiles() {
    return Array.from(this.clients.keys());
  }

  _send(ws, data) {
    try {
      ws.send(JSON.stringify(data));
    } catch (e) {
      console.error('[WSBridge] Send error:', e.message);
    }
  }
}

module.exports = WSBridge;
