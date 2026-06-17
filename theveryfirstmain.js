// main.js — Electron main process: system tray, notifications, orchestration
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const exec = promisify(execCb);

if (process.platform === 'win32') {
    app.setAppUserModelId('com.bhoomi.msrewardsscheduler');
}

const Scheduler = require('./modules/scheduler');
const ProfileManager = require('./modules/profile-manager');
const Tracker = require('./modules/tracker');

// ─── Globals ───
let mainWindow = null;
let notifWindow = null;
let tray = null;

const scheduler = new Scheduler();
const profileManager = new ProfileManager();
const tracker = new Tracker(path.join(__dirname, 'data'));

// Settings defaults
let appSettings = {
    searchesPerAccount: 60,
    maxConcurrentSearches: 2,
    searchDelay: 10000,
    reminderEnabled: true
};

// Session state
let sessionActive = false;
let sessionProfiles = [];
let sessionStartTime = null;

// ─── Settings persistence ───
const settingsFile = path.join(__dirname, 'data', 'settings.json');

function loadSettings() {
    try {
        if (fs.existsSync(settingsFile)) {
            appSettings = { ...appSettings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
        }
    } catch (e) { /* use defaults */ }
}

function saveSettings(s) {
    appSettings = { ...appSettings, ...s };
    const dir = path.dirname(settingsFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(appSettings, null, 2));
}

// ─── Window Creation ───
function createMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        return;
    }

    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1200, screenW - 100),
        height: Math.min(800, screenH - 100),
        minWidth: 900,
        minHeight: 650,
        frame: false,
        backgroundColor: '#0a0e1a',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,  // Enable <webview> tags for embedded browsers
            webSecurity: false // Fix CORS issues for API fetches
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        show: false,
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    mainWindow.once('ready-to-show', () => mainWindow.show());

    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer] ${message}`);
    });
}

// Notification popup window (custom styled, always on top)
function showNotificationWindow(data) {
    if (notifWindow && !notifWindow.isDestroyed()) {
        notifWindow.close();
    }

    const display = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = display.workAreaSize;
    const nw = 420, nh = 260;

    notifWindow = new BrowserWindow({
        width: nw,
        height: nh,
        x: sw - nw - 20,
        y: sh - nh - 20,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    const hashParams = new URLSearchParams({
        urgency: data.urgency || 'casual',
        title: data.title || 'Hey bruh! 👋',
        body: data.body || 'Wanna do all the searches now???'
    });
    const notifPath = path.join(__dirname, 'renderer', 'notification.html');
    notifWindow.loadFile(notifPath, { hash: hashParams.toString() });

    setTimeout(() => {
        if (notifWindow && !notifWindow.isDestroyed()) {
            notifWindow.close();
        }
    }, 30000);
}

// ─── System Tray ───
function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    let trayIcon;
    if (fs.existsSync(iconPath)) {
        trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } else {
        trayIcon = nativeImage.createFromDataURL(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARElEQVQ4T2P8z8BQz0BB0MjAwFDPQEkAagYjJQZgGMBIiQFYXUGJC7C6gpIwwOoKSsIAqysoSUdYXUFJOsLqCkrCAQC2RhkRaWBLvQAAAABJRU5ErkJggg=='
        );
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('MS Rewards Scheduler');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '📊 Open Dashboard',
            click: () => createMainWindow()
        },
        {
            label: '🔔 Remind Me Now',
            click: () => {
                scheduler._fireReminder(scheduler._getUrgencyLevel(new Date().getHours(), new Date().getMinutes()));
            }
        },
        { type: 'separator' },
        {
            label: '❌ Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => createMainWindow());
}

// ─── Session Orchestration (simplified — renderer handles webviews) ───
async function startSession(profileDirs, searchMode = 'edge') {
    if (sessionActive) {
        console.log('[Main] Session already active');
        return { success: false, error: 'Session already running' };
    }

    sessionActive = true;
    sessionProfiles = [...profileDirs];
    sessionStartTime = Date.now();

    // Mark profiles as in-progress
    profileDirs.forEach(dir => tracker.markInProgress(dir));

    if (searchMode === 'bluestacks') {
        console.log(`[Main] Launching ${profileDirs.length} instances...`);
        // Find BlueStacks instances
        const getBlueStacksInstances = () => {
            const bsConfPath = 'E:\\TAUDIOS\\BlueStacks_nxt\\bluestacks.conf';
            if (!fs.existsSync(bsConfPath)) {
                throw new Error('BlueStacks configuration not found. Is BlueStacks 5 installed?');
            }

            const confData = fs.readFileSync(bsConfPath, 'utf8');
            const instanceMatches = [...confData.matchAll(/bst\.instance\.(.*?)\.adb_port="(.*?)"/g)];

            const instances = instanceMatches.map(m => ({ name: m[1], port: m[2] })).filter(i => !i.name.endsWith('.status'));

            instances.forEach(inst => {
                const titleMatch = confData.match(new RegExp(`bst\\.instance\\.${inst.name}\\.display_name="(.*?)"`));
                inst.title = titleMatch ? titleMatch[1] : "BlueStacks App Player";
            });
            return instances;
        };

        try {
            const instances = getBlueStacksInstances();
            global.sessionBlueStacksInstances = instances;

            if (instances.length < profileDirs.length) {
                throw new Error(`You selected ${profileDirs.length} profiles, but only have ${instances.length} BlueStacks instances. Please clone more instances in Multi-Instance Manager.`);
            }

            const bsPath = 'C:\\Program Files\\BlueStacks_nxt\\HD-Player.exe';

            if (!fs.existsSync(bsPath)) {
                throw new Error('BlueStacks executable not found in C:\\Program Files\\BlueStacks_nxt\\');
            }

            for (let i = 0; i < profileDirs.length; i++) {
                const inst = instances[i];
                console.log(`[Main] Launching BlueStacks instance: ${inst.name} on adb port ${inst.port}`);

                // Launch the instance
                const child = require('child_process').spawn(bsPath, ['--instance', inst.name], { detached: true });
                inst.pid = child.pid;

                // Run async so multiple instances can boot in parallel
                (async () => {
                    try {
                        // Wait for ADB to be reachable (poll up to 60s)
                        const adbPath = path.join(__dirname, 'vendor', 'adb', 'adb.exe');
                        let connected = false;
                        for (let attempt = 0; attempt < 60; attempt++) {
                            try {
                                const { stdout } = await exec(`"${adbPath}" connect 127.0.0.1:${inst.port}`, { timeout: 3000 });
                                if (stdout.includes('connected') || stdout.includes('already')) { connected = true; break; }
                            } catch (e) { }
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        if (!connected) throw new Error(`ADB connect failed for ${inst.name}`);

                        // Wait for Android to finish booting
                        let booted = false;
                        for (let attempt = 0; attempt < 60; attempt++) {
                            try {
                                const { stdout } = await exec(`"${adbPath}" -s 127.0.0.1:${inst.port} shell getprop sys.boot_completed`, { timeout: 3000 });
                                if (stdout.trim() === '1') { booted = true; break; }
                            } catch (e) { }
                            await new Promise(r => setTimeout(r, 2000));
                        }
                        if (!booted) throw new Error(`Android boot timeout for ${inst.name}`);

                        // Give launcher 4 seconds to settle after boot
                        await new Promise(r => setTimeout(r, 4000));

                        // Launch Bing app
                        console.log(`[Main] Launching Bing in ${inst.name}...`);
                        const { stdout } = await exec(
                            `"${adbPath}" -s 127.0.0.1:${inst.port} shell monkey -p com.microsoft.bing -c android.intent.category.LAUNCHER 1`,
                            { timeout: 10000 }
                        );
                        if (stdout.includes('Events injected: 1')) {
                            console.log(`[Main] ✓ Bing launched in ${inst.name}`);
                        } else {
                            console.error(`[Main] ✗ Bing launch failed in ${inst.name} - is Bing installed?`);
                        }
                    } catch (e) {
                        console.error(`[Main] Automation error for ${inst.name}:`, e.message);
                    }
                })();
            }
        } catch (e) {
            console.error('[Main] BlueStacks launch failed:', e);
            sessionActive = false;
            return { success: false, error: e.message };
        }
    } else {
        // Edge Mode: Maximize the window to fit all webviews
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.maximize();
        }
        console.log(`[Main] Session started with ${profileDirs.length} profiles (embedded mode)`);
    }

    return {
        success: true,
        settings: appSettings
    };
}

function stopSession() {
    sessionActive = false;
    sessionProfiles = [];

    // Restore window size
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.unmaximize();
    }

    console.log('[Main] Session stopped');
}

// ─── Scheduler Events ───
function setupSchedulerEvents() {
    scheduler.on('reminder', (data) => {
        console.log(`[Main] Reminder fired: ${data.urgency}`);
        showNotificationWindow(data);
    });

    scheduler.setDoneChecker(() => {
        const profiles = profileManager.profiles.map(p => p.dir);
        return profiles.length > 0 && tracker.isAllDoneToday(profiles);
    });
}

// ─── IPC Handlers ───
function setupIPC() {
    ipcMain.handle('get-profiles', () => {
        profileManager.discoverProfiles(); // Refresh from disk
        const data = profileManager.getProfilesData();
        console.log(`[IPC] get-profiles returning ${data.length} profiles`);
        return data;
    });

    ipcMain.handle('create-new-profile', (_, { name }) => {
        try {
            const newDirName = profileManager.createNewProfile(name);
            // Rediscover so get-profiles returns it correctly
            profileManager.discoverProfiles();
            return newDirName;
        } catch (e) {
            console.error('[IPC] Failed to create new profile:', e);
            throw e;
        }
    });

    ipcMain.handle('rename-profile', (_, { dir, newName }) => {
        try {
            profileManager.renameProfile(dir, newName);
            profileManager.discoverProfiles();
            return { success: true };
        } catch (e) {
            console.error('[IPC] Failed to rename profile:', e);
            throw e;
        }
    });

    ipcMain.handle('delete-profile', (_, { dir }) => {
        try {
            profileManager.deleteProfile(dir);
            profileManager.discoverProfiles();
            return { success: true };
        } catch (e) {
            console.error('[IPC] Failed to delete profile:', e);
            throw e;
        }
    });

    // Notification button handler
    ipcMain.on('notif-response', (_, response) => {
        console.log(`[IPC] Notification response: ${response}`);
        if (notifWindow && !notifWindow.isDestroyed()) {
            notifWindow.close();
        }
        switch (response) {
            case 'yes':
                createMainWindow();
                break;
            case 'no':
                const dismissNotif = new Notification({
                    title: 'No worries 😎',
                    body: 'Remember to f**king do it by 10:30 PM MOST!',
                    icon: path.join(__dirname, 'assets', 'icon.png')
                });
                dismissNotif.show();
                break;
            case 'later':
                scheduler.snooze(30);
                break;
        }
    });

    ipcMain.handle('get-profile-status', (_, profileDir) => {
        return tracker.getProfileStatus(profileDir);
    });

    ipcMain.handle('get-today-status', () => {
        const statuses = {};
        profileManager.profiles.forEach(p => {
            statuses[p.dir] = {
                ...tracker.getProfileStatus(p.dir),
                displayName: p.displayName,
                onlineMinutes: 0
            };
        });
        return statuses;
    });

    ipcMain.handle('start-session', async (_, { profileDirs, searchMode }) => {
        return await startSession(profileDirs, searchMode);
    });

    ipcMain.handle('dock-bluestacks', (_, { index, x, y, width, height }) => {
        if (!global.sessionBlueStacksInstances || !global.sessionBlueStacksInstances[index]) return;
        const inst = global.sessionBlueStacksInstances[index];

        // Read 8-byte buffer as signed 64-bit int (works reliably in Node on 64-bit systems)
        const hwndHex = mainWindow.getNativeWindowHandle().readBigInt64LE(0).toString(16);

        const overlayExe = path.join(__dirname, 'overlay.exe');
        if (fs.existsSync(overlayExe)) {
            console.log(`[Main] Docking ${inst.title} to Electron window at ${x},${y} (${width}x${height})`);
            if (!global.overlayProcs) global.overlayProcs = {};

            // Kill existing overlay process if it exists to prevent ghost process memory leaks
            if (global.overlayProcs[index]) {
                try {
                    global.overlayProcs[index].stdin.write("exit\n");
                    global.overlayProcs[index].kill();
                } catch (e) { }
            }

            const child = require('child_process').spawn(overlayExe, [
                hwndHex, inst.title, x.toString(), y.toString(), width.toString(), height.toString()
            ]);
            global.overlayProcs[index] = child;
        } else {
            console.error('[Main] overlay.exe not found!');
        }
    });

    ipcMain.handle('update-bluestacks-bounds', (_, { index, x, y, width, height }) => {
        if (global.overlayProcs && global.overlayProcs[index]) {
            global.overlayProcs[index].stdin.write(`${x},${y},${width},${height}\n`);
        }
    });

    ipcMain.handle('stop-session', () => {
        if (global.overlayProcs) {
            for (const idx in global.overlayProcs) {
                try {
                    global.overlayProcs[idx].stdin.write("exit\n");
                    global.overlayProcs[idx].kill();
                } catch (e) { }
            }
            global.overlayProcs = {};
        }
        stopSession();
        return { success: true };
    });

    // Renderer dynamically reports search progress
    ipcMain.handle('report-search-progress', (_, profileDir, currentCount) => {
        tracker.updateSearchProgress(profileDir, currentCount);
    });

    // Renderer reports a profile's searches are complete
    ipcMain.handle('report-search-complete', (_, profileDir, totalExecuted) => {
        console.log(`[Main] Search complete for ${profileDir}: ${totalExecuted} searches`);
        tracker.markSearchesDone(profileDir, totalExecuted);

        // Check if all done
        const allDone = sessionProfiles.every(dir => tracker.getProfileStatus(dir).searchesDone);
        if (allDone) {
            sessionActive = false;
            const elapsed = Math.floor((Date.now() - sessionStartTime) / 60000);
            console.log(`[Main] All ${sessionProfiles.length} profiles complete in ${elapsed} minutes!`);

            const notif = new Notification({
                title: '✅ MS Rewards Complete!',
                body: `All ${sessionProfiles.length} accounts done in ${elapsed} min! 🎉`,
                icon: path.join(__dirname, 'assets', 'icon.png')
            });
            notif.show();
        }
        return { success: true, allDone };
    });

    ipcMain.handle('get-settings', () => appSettings);

    ipcMain.handle('save-settings', (_, settings) => {
        saveSettings(settings);
        return { success: true };
    });

    ipcMain.handle('mark-profile-done-manual', (_, profileDir, maxSearches) => {
        tracker.markSearchesDone(profileDir, maxSearches);
        return { success: true };
    });

    ipcMain.handle('reset-profile-points', (_, profileDir) => {
        tracker.resetSearchCount(profileDir);
        return { success: true };
    });

    ipcMain.handle('reset-global-points', () => {
        tracker.resetAllGlobalPoints();
        return { success: true };
    });

    ipcMain.handle('mark-profile-undone-manual', (_, profileDir) => {
        tracker.markSearchesUndone(profileDir);
        return { success: true };
    });

    ipcMain.handle('get-history', (_, days) => {
        return tracker.getHistory(days || 7);
    });

    ipcMain.handle('get-screen-size', () => {
        const display = screen.getPrimaryDisplay();
        return display.workAreaSize;
    });

    // Window controls
    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.hide();
    });

    ipcMain.on('window-maximize', () => {
        if (mainWindow) mainWindow.maximize();
    });

    ipcMain.on('window-unmaximize', () => {
        if (mainWindow) mainWindow.unmaximize();
    });
}

// Helper: Send message to renderer
function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, data);
    }
}

// ─── App Lifecycle ───
// Compile C# overlay if needed
const overlayExe = path.join(__dirname, 'overlay.exe');
const overlayCs = path.join(__dirname, 'overlay.cs');
if (!fs.existsSync(overlayExe) && fs.existsSync(overlayCs)) {
    console.log('[Main] Compiling overlay.cs...');
    try {
        require('child_process').execSync(`"C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe" /out:"${overlayExe}" "${overlayCs}"`);
    } catch (e) {
        console.error('[Main] Failed to compile overlay.cs:', e.message);
    }
}

app.whenReady().then(async () => {
    loadSettings();

    // Discover profiles
    profileManager.findEdge();
    profileManager.discoverProfiles();

    // Setup event handlers
    setupSchedulerEvents();
    setupIPC();

    // Create system tray
    createTray();

    // Start scheduler
    if (appSettings.reminderEnabled) {
        scheduler.start();
    }

    // Configure app to run on Windows startup in the background
    app.setLoginItemSettings({
        openAtLogin: true,
        args: app.isPackaged ? ['--hidden'] : [`"${app.getAppPath()}"`, '--hidden'] // Add quoted app path in dev mode
    });

    // Show dashboard on first launch UNLESS launched silently via startup
    if (!process.argv.includes('--hidden')) {
        createMainWindow();
    } else {
        console.log('[Main] Launched silently via Windows Startup');

        // Check if there are still pending searches
        const profiles = profileManager.profiles.map(p => p.dir);
        const allDone = profiles.length > 0 && tracker.isAllDoneToday(profiles);

        if (!allDone) {
            showNotificationWindow({
                urgency: 'casual',
                title: 'Hey bruh! 👋',
                body: 'Wanna do all the searches now??? Your rewards are waiting!'
            });
        }
    }

    console.log('[Main] MS Rewards Scheduler started!');
    console.log(`[Main] Discovered ${profileManager.profiles.length} Edge profiles`);
});

app.on('window-all-closed', () => {
    // Don't quit — stay in system tray
});

app.on('before-quit', () => {
    app.isQuitting = true;
    scheduler.stop();
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        createMainWindow();
    });
}