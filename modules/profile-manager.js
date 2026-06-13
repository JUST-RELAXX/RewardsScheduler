// modules/profile-manager.js — Edge profile discovery, launching & orchestration
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// Edge paths
const EDGE_USER_DATA = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');
const EDGE_EXE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

class ProfileManager extends EventEmitter {
  constructor() {
    super();
    this.profiles = [];        // Discovered profiles: [{ dir, displayName, path }]
    this.activeProcesses = {}; // profileDir → { process, launchedAt, onlineTimer }
    this.onlineTimers = {};    // profileDir → { startTime, elapsed }
    this.edgeExePath = null;
    this.searchQueue = [];     // Queue of profiles to search actively
    this.currentActive = [];   // Currently active (searching) profiles
    this.keepAliveProfiles = []; // Profiles in keep-alive mode
    this.maxConcurrentSearches = 2; // How many profiles search actively at once
  }

  // Discover Edge executable
  findEdge() {
    for (const p of EDGE_EXE_PATHS) {
      if (fs.existsSync(p)) {
        this.edgeExePath = p;
        console.log(`[ProfileManager] Edge found: ${p}`);
        return p;
      }
    }
    console.error('[ProfileManager] Edge executable not found!');
    return null;
  }

  // Discover all Edge profiles
  discoverProfiles() {
    this.profiles = [];
    try {
      if (!fs.existsSync(EDGE_USER_DATA)) {
        console.error('[ProfileManager] Edge User Data directory not found');
        return [];
      }

      const dirs = fs.readdirSync(EDGE_USER_DATA, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .filter(d => d.name === 'Default' || /^Profile \d+$/.test(d.name));

      for (const dir of dirs) {
        const fullPath = path.join(EDGE_USER_DATA, dir.name);
        const prefsPath = path.join(fullPath, 'Preferences');
        const flagPath = path.join(fullPath, 'app_created.flag');
        let displayName = dir.name;
        try {
          if (fs.existsSync(prefsPath)) {
            const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
            displayName = prefs.profile?.name || dir.name;
          }
        } catch (e) { /* use folder name */ }

        this.profiles.push({
          dir: dir.name,
          displayName: displayName,
          fullPath: fullPath,
          isAppCreated: fs.existsSync(flagPath)
        });
      }

      // Sort: Default first, then by profile number
      this.profiles.sort((a, b) => {
        if (a.dir === 'Default') return -1;
        if (b.dir === 'Default') return 1;
        const numA = parseInt(a.dir.replace('Profile ', '')) || 0;
        const numB = parseInt(b.dir.replace('Profile ', '')) || 0;
        return numA - numB;
      });

      console.log(`[ProfileManager] Discovered ${this.profiles.length} profiles`);
      return this.profiles;

    } catch (e) {
      console.error('[ProfileManager] Error discovering profiles:', e.message);
      return [];
    }
  }

  // Create a new mock profile
  createNewProfile(profileName) {
    if (!fs.existsSync(EDGE_USER_DATA)) {
      throw new Error('Edge User Data directory not found');
    }

    const dirs = fs.readdirSync(EDGE_USER_DATA, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^Profile \d+$/.test(d.name));
    
    let maxNum = 0;
    for (const dir of dirs) {
      const num = parseInt(dir.name.replace('Profile ', ''));
      if (num > maxNum) maxNum = num;
    }
    
    const newDirName = `Profile ${maxNum + 1}`;
    const newDirPath = path.join(EDGE_USER_DATA, newDirName);
    
    // Create directory
    fs.mkdirSync(newDirPath, { recursive: true });
    
    // Create preferences file so Edge adopts it correctly
    const prefsPath = path.join(newDirPath, 'Preferences');
    const prefsObj = {
      profile: {
        name: profileName
      }
    };
    fs.writeFileSync(prefsPath, JSON.stringify(prefsObj, null, 2), 'utf8');

    // Create flag file to identify this profile as app-created
    fs.writeFileSync(path.join(newDirPath, 'app_created.flag'), '', 'utf8');

    // Register it in Edge's global Local State so it appears in the Profile Switcher natively
    try {
      const localStatePath = path.join(EDGE_USER_DATA, 'Local State');
      if (fs.existsSync(localStatePath)) {
        const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
        if (!localState.profile) localState.profile = {};
        if (!localState.profile.info_cache) localState.profile.info_cache = {};
        
        // Random avatar icon (Edge has avatars 1 to ~40)
        const randomAvatarId = Math.floor(Math.random() * 40) + 1;
        
        localState.profile.info_cache[newDirName] = {
          "active_time": Date.now() / 1000,
          "avatar_icon": `chrome://theme/IDR_PROFILE_AVATAR_${randomAvatarId}`,
          "is_ephemeral": false,
          "is_using_default_avatar": false,
          "is_using_default_name": false,
          "name": profileName,
          "shortcut_name": profileName
        };
        
        fs.writeFileSync(localStatePath, JSON.stringify(localState, null, 2), 'utf8');
        console.log(`[ProfileManager] Registered ${newDirName} in Edge Local State`);
      }
    } catch (err) {
      console.error(`[ProfileManager] Failed to update Edge Local State: ${err.message}`);
    }
    
    console.log(`[ProfileManager] Created new profile directory: ${newDirName} for "${profileName}"`);
    return newDirName;
  }

  // Rename an app-created profile
  renameProfile(dirName, newName) {
    const fullPath = path.join(EDGE_USER_DATA, dirName);
    if (!fs.existsSync(fullPath)) throw new Error('Profile directory not found');
    if (!fs.existsSync(path.join(fullPath, 'app_created.flag'))) throw new Error('Not an app-created profile');

    // 1. Update Preferences
    const prefsPath = path.join(fullPath, 'Preferences');
    if (fs.existsSync(prefsPath)) {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      if (!prefs.profile) prefs.profile = {};
      prefs.profile.name = newName;
      fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf8');
    }

    // 2. Update Local State
    try {
      const localStatePath = path.join(EDGE_USER_DATA, 'Local State');
      if (fs.existsSync(localStatePath)) {
        const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
        if (localState.profile?.info_cache?.[dirName]) {
          localState.profile.info_cache[dirName].name = newName;
          localState.profile.info_cache[dirName].shortcut_name = newName;
          fs.writeFileSync(localStatePath, JSON.stringify(localState, null, 2), 'utf8');
        }
      }
    } catch (err) {
      console.error(`[ProfileManager] Failed to update Edge Local State on rename: ${err.message}`);
    }

    console.log(`[ProfileManager] Renamed ${dirName} to "${newName}"`);
    return true;
  }

  // Delete an app-created profile
  deleteProfile(dirName) {
    const fullPath = path.join(EDGE_USER_DATA, dirName);
    if (!fs.existsSync(fullPath)) return false; // Already gone
    if (!fs.existsSync(path.join(fullPath, 'app_created.flag'))) throw new Error('Cannot delete native Edge profiles');

    // Recursively delete directory
    fs.rmSync(fullPath, { recursive: true, force: true });

    // Remove from Local State
    try {
      const localStatePath = path.join(EDGE_USER_DATA, 'Local State');
      if (fs.existsSync(localStatePath)) {
        const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
        if (localState.profile?.info_cache?.[dirName]) {
          delete localState.profile.info_cache[dirName];
          fs.writeFileSync(localStatePath, JSON.stringify(localState, null, 2), 'utf8');
        }
      }
    } catch (err) {
      console.error(`[ProfileManager] Failed to update Edge Local State on delete: ${err.message}`);
    }

    console.log(`[ProfileManager] Deleted profile ${dirName}`);
    return true;
  }

  // Calculate optimal grid layout for N windows
  _calculateGrid(count, screenW, screenH) {
    // Find cols x rows where cells have the best aspect ratio (~1.6 for browser windows)
    let bestCols = 1, bestRows = count, bestScore = Infinity;

    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const cellW = screenW / cols;
      const cellH = screenH / rows;
      const cellRatio = cellW / cellH;
      // Target ~1.6 aspect ratio (typical browser), penalize wasted cells
      const score = Math.abs(cellRatio - 1.6) + (cols * rows - count) * 0.05;
      if (score < bestScore) {
        bestScore = score;
        bestCols = cols;
        bestRows = rows;
      }
    }
    return { cols: bestCols, rows: bestRows };
  }

  // Launch a single Edge profile
  launchProfile(profileDir, url = 'https://www.bing.com') {
    if (!this.edgeExePath) {
      if (!this.findEdge()) {
        throw new Error('Edge executable not found');
      }
    }

    // Append profile dir as hash param so the extension can identify itself
    const launchUrl = `${url}#_scheduler_profile=${encodeURIComponent(profileDir)}`;

    // Use 'start' via cmd.exe — this is the reliable way to launch Edge on Windows.
    // spawn() with detached:true fails because Edge delegates to its existing instance
    // and the spawned process exits immediately without creating a visible window.
    const cmd = `start "" "${this.edgeExePath}" --profile-directory="${profileDir}" --new-window "${launchUrl}"`;

    console.log(`[ProfileManager] Launching: ${profileDir}`);

    const { exec } = require('child_process');
    exec(cmd, { shell: 'cmd.exe' }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[ProfileManager] Launch error for ${profileDir}:`, err.message);
      } else {
        console.log(`[ProfileManager] Launched OK: ${profileDir}`);
      }
    });

    // Track the launch
    this.activeProcesses[profileDir] = {
      launchedAt: Date.now()
    };

    // Start online time tracking
    this.onlineTimers[profileDir] = {
      startTime: Date.now(),
      elapsed: 0
    };
  }

  // Kill all existing Edge processes — required before launching profiles
  // Edge's "Startup boost" keeps background processes alive that swallow launch requests
  killAllEdge() {
    return new Promise((resolve) => {
      console.log('[ProfileManager] Killing all Edge processes for clean launch...');
      const { exec } = require('child_process');
      exec('taskkill /IM msedge.exe /F 2>nul', { shell: 'cmd.exe' }, (err) => {
        // Ignore errors (no Edge processes running is fine)
        if (err) {
          console.log('[ProfileManager] No Edge processes to kill (or already gone)');
        } else {
          console.log('[ProfileManager] Edge processes killed');
        }
        // Wait for processes to fully exit
        setTimeout(resolve, 3000);
      });
    });
  }

  // Launch multiple profiles (staggered, with pre-cleanup)
  async launchProfiles(profileDirs, url = 'https://www.bing.com') {
    // Kill existing Edge first — this is critical
    await this.killAllEdge();

    const launched = [];
    const delay = 2000; // 2 seconds between launches for reliable window creation

    return new Promise((resolve) => {
      let index = 0;

      const launchNext = () => {
        if (index >= profileDirs.length) {
          resolve(launched);
          return;
        }

        const dir = profileDirs[index];

        try {
          this.launchProfile(dir, url);
          launched.push(dir);
          this.emit('profile-launched', { profileDir: dir, index: index + 1, total: profileDirs.length });
        } catch (e) {
          console.error(`[ProfileManager] Failed to launch ${dir}:`, e.message);
          this.emit('profile-launch-error', { profileDir: dir, error: e.message });
        }

        index++;
        if (index < profileDirs.length) {
          setTimeout(launchNext, delay);
        } else {
          resolve(launched);
        }
      };

      launchNext();
    });
  }

  // Get online time in minutes for a profile
  getOnlineMinutes(profileDir) {
    const timer = this.onlineTimers[profileDir];
    if (!timer) return 0;
    return Math.floor((Date.now() - timer.startTime) / 60000);
  }

  // Check if a profile has met the 30-minute requirement
  isOnlineTimeMet(profileDir) {
    return this.getOnlineMinutes(profileDir) >= 30;
  }

  // Get profile info by directory name
  getProfile(profileDir) {
    return this.profiles.find(p => p.dir === profileDir);
  }

  // Get all profile data for the UI
  getProfilesData() {
    return this.profiles.map(p => ({
      ...p,
      isLaunched: !!this.activeProcesses[p.dir],
      onlineMinutes: this.getOnlineMinutes(p.dir),
      onlineTimeMet: this.isOnlineTimeMet(p.dir)
    }));
  }

  // Tile all open Edge windows into a grid using Win32 API
  tileEdgeWindows(count, screenW, screenH) {
    const { cols, rows } = this._calculateGrid(count, screenW, screenH);
    const cellW = Math.floor(screenW / cols);
    const cellH = Math.floor(screenH / rows);

    console.log(`[ProfileManager] Tiling ${count} Edge windows → ${cols}x${rows} grid (${cellW}x${cellH} each)`);

    // PowerShell script using EnumWindows to find ALL Edge browser windows
    // Edge uses Chrome_WidgetWin_1 class for its browser windows
    const psScript = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Text;

public class EdgeTiler {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetParent(IntPtr hWnd);

    private static List<IntPtr> _found = new List<IntPtr>();
    private static HashSet<uint> _edgePids = new HashSet<uint>();

    public static IntPtr[] FindEdgeWindows() {
        _found.Clear();
        _edgePids.Clear();

        // Collect all msedge.exe PIDs
        foreach (var proc in System.Diagnostics.Process.GetProcessesByName("msedge")) {
            _edgePids.Add((uint)proc.Id);
        }

        EnumWindows(new EnumWindowsProc(EnumCallback), IntPtr.Zero);
        return _found.ToArray();
    }

    private static bool EnumCallback(IntPtr hWnd, IntPtr lParam) {
        // Must be visible
        if (!IsWindowVisible(hWnd)) return true;

        // Must be a top-level window (no parent)
        if (GetParent(hWnd) != IntPtr.Zero) return true;

        // Check class name — Edge browser windows use Chrome_WidgetWin_1
        var classSb = new StringBuilder(256);
        GetClassName(hWnd, classSb, 256);
        string className = classSb.ToString();
        if (className != "Chrome_WidgetWin_1") return true;

        // Check it belongs to msedge.exe
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (!_edgePids.Contains(pid)) return true;

        // Must have a window title (real browser windows have titles)
        int titleLen = GetWindowTextLength(hWnd);
        if (titleLen < 3) return true;

        _found.Add(hWnd);
        return true;
    }
}
'@

$$SW_RESTORE = 9
$$handles = [EdgeTiler]::FindEdgeWindows()
Write-Output "Found $$($handles.Length) Edge windows"

$$cols = ${cols}
$$rows = ${rows}
$$screenW = ${screenW}
$$cellW = ${cellW}
$$cellH = ${cellH}
$$count = [Math]::Min($$handles.Length, ${count})

for ($$i = 0; $$i -lt $$count; $$i++) {
    $$row = [Math]::Floor($$i / $$cols)
    $$col = $$i % $$cols

    # Check if this is the last row
    $$lastRowStart = ($$rows - 1) * $$cols
    $$inLastRow = $$i -ge $$lastRowStart
    $$itemsInLastRow = $$count - $$lastRowStart

    if ($$inLastRow -and $$itemsInLastRow -lt $$cols) {
        # Last row has fewer windows — spread them to fill full width
        $$lastCol = $$i - $$lastRowStart
        $$lastCellW = [Math]::Floor($$screenW / $$itemsInLastRow)
        $$x = $$lastCol * $$lastCellW
        $$y = $$row * $$cellH
        $$w = $$lastCellW
    } else {
        $$x = $$col * $$cellW
        $$y = $$row * $$cellH
        $$w = $$cellW
    }

    [EdgeTiler]::ShowWindow($$handles[$$i], $$SW_RESTORE) | Out-Null
    [EdgeTiler]::MoveWindow($$handles[$$i], $$x, $$y, $$w, $$cellH, $$true) | Out-Null
}
Write-Output "Tiled $$count windows in ${cols}x${rows} grid"
`.replace(/\$\$/g, '$');

    const scriptPath = path.join(os.tmpdir(), 'ms-rewards-tile.ps1');
    fs.writeFileSync(scriptPath, psScript, 'utf8');

    const { exec } = require('child_process');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, (err, stdout, stderr) => {
      if (err) {
        console.error('[ProfileManager] Tile error:', err.message);
        if (stderr) console.error('[ProfileManager] Tile stderr:', stderr);
      } else {
        console.log('[ProfileManager]', stdout.trim());
      }
      try { fs.unlinkSync(scriptPath); } catch(_) {}
    });
  }

  // Clean up tracking for a profile (when done)
  cleanupProfile(profileDir) {
    delete this.activeProcesses[profileDir];
  }

  // Clean up all
  cleanup() {
    this.activeProcesses = {};
    this.onlineTimers = {};
    this.searchQueue = [];
    this.currentActive = [];
    this.keepAliveProfiles = [];
  }
}

module.exports = ProfileManager;
