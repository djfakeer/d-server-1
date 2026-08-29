// 1GB RAM optimization
const MEMORY_LIMIT_MB = 640;
const express = require("express");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const chalk = require("chalk");
const {
    makeInMemoryStore,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion,
    makeWASocket,
    isJidBroadcast
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = 30064;

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     SERVER CONFIGURATION                             ║
// ╚══════════════════════════════════════════════════════════════════════╝

const SERVER_START_TIME = Date.now();
const MAX_MEMORY_MB = 512;
const MEMORY_CRITICAL_MB = 768;
const MAX_TASK_LOGS = 50;
const MAX_RECOVERY_ATTEMPTS = 12;
const MEMORY_CHECK_INTERVAL = 30000;

const ADMIN_CREDENTIALS = {
    username: "lucifer",
    password: "ving+hinsa"
};

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     MODERN LOGGER SYSTEM                             ║
// ╚══════════════════════════════════════════════════════════════════════╝

const STYLES = {
    border:     chalk.hex('#00D4FF'),
    info:       chalk.hex('#60CDFF'),
    success:    chalk.hex('#00FF94'),
    error:      chalk.hex('#FF4F6E'),
    warning:    chalk.hex('#FFD166'),
    dim:        chalk.hex('#6B7280'),
    accent:     chalk.hex('#BF7FFF'),
    white:      chalk.hex('#F0F4FF'),
    tag:        {
        info:    chalk.bgHex('#004466').hex('#00D4FF').bold,
        success: chalk.bgHex('#004422').hex('#00FF94').bold,
        error:   chalk.bgHex('#440022').hex('#FF4F6E').bold,
        warning: chalk.bgHex('#443300').hex('#FFD166').bold,
        system:  chalk.bgHex('#220044').hex('#BF7FFF').bold,
    }
};

const TOP_BAR    = STYLES.border('┌' + '─'.repeat(68) + '┐');
const MID_BAR    = STYLES.border('├' + '─'.repeat(68) + '┤');
const BOT_BAR    = STYLES.border('└' + '─'.repeat(68) + '┘');
const SIDE       = STYLES.border('│');

function getTimestamp() {
    return STYLES.dim(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}]`);
}

function padLine(text, width = 66) {
    // Strip ANSI codes to measure visible length
    const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, width - visible.length);
    return text + ' '.repeat(pad);
}

function logBox(tag, tagFn, icon, message, detail = null) {
    console.log(TOP_BAR);
    const tagStr  = tagFn(` ${tag} `);
    const line1   = ` ${tagStr} ${icon}  ${STYLES.white(message)}`;
    console.log(`${SIDE} ${padLine(line1)} ${SIDE}`);
    if (detail) {
        const line2 = `    ${STYLES.dim('↳')} ${STYLES.dim(detail)}`;
        console.log(`${SIDE} ${padLine(line2)} ${SIDE}`);
    }
    const tsLine = `    ${getTimestamp()}`;
    console.log(`${SIDE} ${padLine(tsLine)} ${SIDE}`);
    console.log(BOT_BAR);
}

function logInfo(message, detail) {
    logBox('INFO', STYLES.tag.info, STYLES.info('ℹ'), message, detail);
}

function logSuccess(message, detail) {
    logBox('OK  ', STYLES.tag.success, STYLES.success('✔'), message, detail);
}

function logError(message, detail) {
    logBox('ERR ', STYLES.tag.error, STYLES.error('✖'), message, detail);
}

function logWarning(message, detail) {
    logBox('WARN', STYLES.tag.warning, STYLES.warning('⚠'), message, detail);
}

function logSystem(message, detail) {
    logBox('SYS ', STYLES.tag.system, STYLES.accent('⚙'), message, detail);
}

function printBanner() {
    const lines = [
        '',
        STYLES.border('╔══════════════════════════════════════════════════════════════════════╗'),
        STYLES.border('║') + STYLES.accent('  ██╗    ██╗ █████╗     ██████╗  ██████╗ ████████╗                   ') + STYLES.border('║'),
        STYLES.border('║') + STYLES.accent('  ██║    ██║██╔══██╗    ██╔══██╗██╔═══██╗╚══██╔══╝                   ') + STYLES.border('║'),
        STYLES.border('║') + STYLES.accent('  ██║ █╗ ██║███████║    ██████╔╝██║   ██║   ██║                      ') + STYLES.border('║'),
        STYLES.border('║') + STYLES.accent('  ██║███╗██║██╔══██║    ██╔══██╗██║   ██║   ██║                      ') + STYLES.border('║'),
        STYLES.border('║') + STYLES.accent('  ╚███╔███╔╝██║  ██║    ██████╔╝╚██████╔╝   ██║                      ') + STYLES.border('║'),
        STYLES.border('║') + STYLES.accent('   ╚══╝╚══╝ ╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝                      ') + STYLES.border('║'),
        STYLES.border('║') + STYLES.dim('  WhatsApp Automation Server  •  Powered by Baileys                   ') + STYLES.border('║'),
        STYLES.border('║') + STYLES.success('  ● Active') + STYLES.dim('  •  Build 2.0  •  Multi-Session  •  Infinite Reconnect       ') + STYLES.border('║'),
        STYLES.border('╚══════════════════════════════════════════════════════════════════════╝'),
        '',
    ];
    lines.forEach(l => console.log(l));
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     DIRECTORY SETUP                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

const DIRS = ['temp', 'tasks', 'logs', 'sessions_backup', 'data', 'tasks/temp_uploads'];
DIRS.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const USERS_FILE = path.join("data", "users.json");
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     MULTER UPLOAD CONFIG                             ║
// ╚══════════════════════════════════════════════════════════════════════╝

const upload = multer({
    dest: "tasks/temp_uploads/",
    limits: { fileSize: 50 * 1024 * 1024 }  // 50MB limit (increased)
});

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     EXPRESS MIDDLEWARE                                ║
// ╚══════════════════════════════════════════════════════════════════════╝

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(express.static('public'));

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     GLOBAL STATE                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝

const activeClients            = new Map();
const activeTasks              = new Map();
const taskLogs                 = new Map();
const userSessions             = new Map();
const sessionRestartAttempts   = new Map();
const taskRunningLocks         = new Map();
const manuallyDisconnectedSessions = new Set();
const pairCodeSessions         = new Map();
const recoveryLocks             = new Map();
const recoveryTimers            = new Map();

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     UTILITY HELPERS                                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

function formatDate(dateInput) {
    const date   = new Date(dateInput);
    const day    = date.getDate();
    const months = ["January","February","March","April","May","June",
                    "July","August","September","October","November","December"];
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatUptime(ms) {
    const s  = Math.floor(ms / 1000);
    const m  = Math.floor(s / 60);
    const h  = Math.floor(m / 60);
    const d  = Math.floor(h / 24);
    if (d > 0)  return `${d}d ${h % 24}h ${m % 60}m`;
    if (h > 0)  return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0)  return `${m}m ${s % 60}s`;
    return `${s}s`;
}

function formatBytes(bytes) {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     USER MANAGEMENT                                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        logError('Failed to save users: ' + e.message);
    }
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function generateUserId()      { return 'user_'  + Date.now() + '_' + Math.random().toString(36).substring(2, 10); }
function generateSessionToken(){ return crypto.randomBytes(32).toString('hex'); }
function generateSessionId()   { return 'sess_'  + Date.now() + '_' + Math.random().toString(36).substring(2, 17); }
function generateShortTaskId() { return 'task_'  + Date.now() + '_' + Math.random().toString(36).substring(2, 8); }

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     AUTH MIDDLEWARE                                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

function requireAuth(req, res, next) {
    const token = req.cookies.sessionToken;
    if (!token) return res.redirect('/login');
    const users = loadUsers();
    const user  = users.find(u => u.sessionToken === token);
    if (!user) {
        res.clearCookie('sessionToken');
        return res.redirect('/login');
    }
    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    const adminToken = req.cookies.adminToken;
    if (!adminToken || adminToken !== 'admin_authenticated') {
        return res.redirect('/admin-login');
    }
    req.isAdmin = true;
    next();
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     PERSISTENT DATA                                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

function loadPersistentData() {
    try {
        if (fs.existsSync('sessions_backup/activeClients.json')) {
            const data = JSON.parse(fs.readFileSync('sessions_backup/activeClients.json', 'utf8'));
            data.forEach(([key, value]) => {
                const restored = { ...value, client: null, isConnected: false };
                if (Array.isArray(restored.tasks)) {
                    restored.tasks = restored.tasks.map(task => {
                        if (task.taskType === 'message' && !Array.isArray(task.messages) && task.messagesPath) {
                            try {
                                if (fs.existsSync(task.messagesPath)) {
                                    task.messages = fs.readFileSync(task.messagesPath, 'utf8')
                                        .split(/\\r?\\n/)
                                        .filter(m => m.trim() !== '');
                                }
                            } catch (e) {
                                logWarning(`Could not restore messages for task ${task.taskId}: ${e.message}`);
                            }
                        }
                        return task;
                    });
                }
                activeClients.set(key, restored);
            });
            logSuccess(`Loaded ${activeClients.size} persistent sessions`);
        }
        if (fs.existsSync('sessions_backup/userSessions.json')) {
            const data = JSON.parse(fs.readFileSync('sessions_backup/userSessions.json', 'utf8'));
            data.forEach(([key, value]) => userSessions.set(key, value));
        }
    } catch (e) {
        logError('Error loading persistent data: ' + e.message);
    }
}

function savePersistentData() {
    try {
        const clientsData = Array.from(activeClients.entries())
            .filter(([id]) => !manuallyDisconnectedSessions.has(id))
            .map(([key, value]) => [key, {
                number:       value.number,
                authPath:      value.authPath,
                isConnected:   value.isConnected,
                tasks: (value.tasks || []).map(task => {
                    const saved = { ...task };
                    // Message bodies and runtime logs are already stored/handled elsewhere.
                    // Do not duplicate a potentially huge message array in activeClients.json.
                    delete saved.messages;
                    delete saved.logs;
                    return saved;
                }),
                lastActivity: value.lastActivity,
                userId:       value.userId,
                username:     value.username,
                createdAt:    value.createdAt
            }]);
        fs.writeFileSync('sessions_backup/activeClients.json', JSON.stringify(clientsData));

        const sessionsData = Array.from(userSessions.entries())
            .filter(([id]) => !manuallyDisconnectedSessions.has(id));
        fs.writeFileSync('sessions_backup/userSessions.json', JSON.stringify(sessionsData));
    } catch (e) {
        logError('Error saving persistent data: ' + e.message);
    }
}

loadPersistentData();

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     MEMORY MANAGEMENT                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

function optimizeMemory() {
    const mem = process.memoryUsage();
    const heapHigh = mem.heapUsed > MAX_MEMORY_MB * 1024 * 1024 * 0.80;
    const rssHigh  = mem.rss > MEMORY_CRITICAL_MB * 1024 * 1024;

    // Keep only a small bounded log history for every task.
    for (const [taskId, logs] of taskLogs.entries()) {
        if (logs.length > MAX_TASK_LOGS) logs.length = MAX_TASK_LOGS;
        if (!activeTasks.has(taskId)) {
            // Completed/stopped tasks are removed from the hot in-memory log map.
            const stillKnown = Array.from(activeClients.values())
                .some(c => c.tasks?.some(t => t.taskId === taskId));
            if (!stillKnown) taskLogs.delete(taskId);
        }
    }

    if (heapHigh || rssHigh) {
        logWarning(`Memory high — heap ${formatBytes(mem.heapUsed)}, RSS ${formatBytes(mem.rss)}`);
        if (global.gc) {
            try { global.gc(); } catch {}
        }
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     SESSION KEY CLEANUP                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

const KEY_PREFIXES = [
    'pre-key-', 'session-', 'sender-key-',
    'device-list-', 'tctoken-', 'lid-mapping-'
];

function cleanupSessionKeys() {
    logSystem('Starting parallel key cleanup for all sessions...');
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) return;

    const sessionFolders = fs.readdirSync(tempDir)
        .filter(f => fs.statSync(path.join(tempDir, f)).isDirectory());

    Promise.all(sessionFolders.map(async (folder) => {
        const sessionPath = path.join(tempDir, folder);
        try {
            const files      = fs.readdirSync(sessionPath);
            const fileGroups = {};

            for (const file of files) {
                if (file === 'creds.json') continue;
                for (const prefix of KEY_PREFIXES) {
                    if (file.startsWith(prefix)) {
                        if (!fileGroups[prefix]) fileGroups[prefix] = [];
                        fileGroups[prefix].push(file);
                        break;
                    }
                }
            }

            await Promise.all(Object.entries(fileGroups).map(async ([prefix, groupFiles]) => {
                if (groupFiles.length <= 5) return;
                const sorted   = groupFiles
                    .map(name => ({
                        name,
                        path:  path.join(sessionPath, name),
                        mtime: fs.statSync(path.join(sessionPath, name)).mtime.getTime()
                    }))
                    .sort((a, b) => b.mtime - a.mtime);
                const toDelete = sorted.slice(5);
                for (const file of toDelete) {
                    try { fs.unlinkSync(file.path); } catch {}
                }
                if (toDelete.length > 0) {
                    logSuccess(`Cleaned ${toDelete.length} old '${prefix}' files in ${folder}`);
                }
            }));
        } catch (e) {
            logError(`Cleanup error in ${folder}: ${e.message}`);
        }
    })).then(() => logSuccess('Parallel key cleanup complete'));
}

setInterval(cleanupSessionKeys, 3 * 60 * 1000);
setTimeout(cleanupSessionKeys, 30000);

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     TASK FOLDER MANAGEMENT                            ║
// ╚══════════════════════════════════════════════════════════════════════╝

function createTaskFolder(taskId, taskInfo) {
    const taskFolder = path.join(__dirname, 'tasks', taskId);
    try {
        if (!fs.existsSync(taskFolder)) fs.mkdirSync(taskFolder, { recursive: true });
        const metadata = {
            taskId:        taskInfo.taskId,
            sessionId:     taskInfo.sessionId,
            target:        taskInfo.target,
            targetType:    taskInfo.targetType,
            prefix:        taskInfo.prefix,
            delaySec:      taskInfo.delaySec,
            taskType:      taskInfo.taskType || 'message',
            totalMessages: taskInfo.totalMessages || 0,
            createdAt:     taskInfo.createdAt,
            startTime:     taskInfo.startTime,
            status:        'running',
            lastUpdated:   new Date().toISOString()
        };
        fs.writeFileSync(path.join(taskFolder, 'metadata.json'), JSON.stringify(metadata, null, 2));
        if (taskInfo.messages?.length > 0) {
            const messagesPath = path.join(taskFolder, 'messages.txt');
            fs.writeFileSync(messagesPath, taskInfo.messages.join('\n'));
            taskInfo.messagesPath = messagesPath;
        }
        if (taskInfo.imagePath) {
            fs.writeFileSync(path.join(taskFolder, 'image_info.json'), JSON.stringify({ imagePath: taskInfo.imagePath }, null, 2));
        }
        logSuccess(`Task folder created: ${taskId}`);
        return taskFolder;
    } catch (e) {
        logError(`Failed to create task folder ${taskId}: ${e.message}`);
        return null;
    }
}

function updateTaskMetadata(taskId, updates) {
    const metaPath = path.join(__dirname, 'tasks', taskId, 'metadata.json');
    try {
        if (fs.existsSync(metaPath)) {
            const meta    = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const updated = { ...meta, ...updates, lastUpdated: new Date().toISOString() };
            fs.writeFileSync(metaPath, JSON.stringify(updated, null, 2));
        }
    } catch (e) {
        logError(`Failed to update task metadata ${taskId}: ${e.message}`);
    }
}

function deleteTaskFolder(taskId) {
    const taskFolder = path.join(__dirname, 'tasks', taskId);
    try {
        if (fs.existsSync(taskFolder)) {
            fs.rmSync(taskFolder, { recursive: true, force: true });
            logSuccess(`Task folder deleted: ${taskId}`);
        }
    } catch (e) {
        logError(`Failed to delete task folder ${taskId}: ${e.message}`);
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     SESSION CLEANUP                                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

function completeSessionCleanup(sessionId) {
    logSystem(`Starting PERMANENT cleanup for session: ${sessionId}`);
    manuallyDisconnectedSessions.add(sessionId);

    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) {
        logWarning(`Session ${sessionId} not found in activeClients`);
        return;
    }

    if (clientInfo.tasks) {
        clientInfo.tasks.forEach(task => {
            task.stopRequested = true;
            task.isSending     = false;
            task.endTime       = new Date();
            taskRunningLocks.delete(task.taskId);
            taskLogs.delete(task.taskId);
            deleteTaskFolder(task.taskId);
        });
    }

    try { clientInfo.client?.end(); } catch {}

    sessionRestartAttempts.delete(sessionId);
    recoveryLocks.delete(sessionId);
    if (recoveryTimers.has(sessionId)) {
        clearTimeout(recoveryTimers.get(sessionId));
        recoveryTimers.delete(sessionId);
    }
    pairCodeSessions.delete(sessionId);

    if (clientInfo.authPath && fs.existsSync(clientInfo.authPath)) {
        try { fs.rmSync(clientInfo.authPath, { recursive: true, force: true }); } catch {}
    }

    activeClients.delete(sessionId);
    userSessions.delete(sessionId);
    savePersistentData();
    logSuccess(`PERMANENT cleanup complete for session: ${sessionId}`);
}


function unlinkTaskMedia(taskInfo) {
    const mediaPath = taskInfo?.imagePath || taskInfo?.videoPath ||
        taskInfo?.docPath || taskInfo?.audioPath;
    if (!mediaPath) return;
    try {
        if (fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath);
    } catch {}
}

function completeTaskCleanup(sessionId, taskId) {
    logSystem(`Starting PERMANENT cleanup for task: ${taskId}`);
    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) return;
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo) return;

    taskInfo.stopRequested = true;
    taskInfo.isSending     = false;
    taskInfo.endTime       = new Date();
    taskRunningLocks.delete(taskId);
    taskLogs.delete(taskId);
    unlinkTaskMedia(taskInfo);
    deleteTaskFolder(taskId);

    clientInfo.tasks = clientInfo.tasks.filter(t => t.taskId !== taskId);
    savePersistentData();
    logSuccess(`PERMANENT cleanup complete for task: ${taskId}`);
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     PAIR CODE TIMEOUT CHECK                           ║
// ╚══════════════════════════════════════════════════════════════════════╝

function checkPairCodeTimeouts() {
    const now        = Date.now();
    const TIMEOUT_MS = 10 * 60 * 1000;
    pairCodeSessions.forEach((info, sessionId) => {
        if (!info.hasConnected && (now - info.createdAt) > TIMEOUT_MS) {
            logWarning(`Pair code session ${sessionId} timed out — never connected`);
            completeSessionCleanup(sessionId);
        }
    });
}

setInterval(checkPairCodeTimeouts, 2 * 60 * 1000);

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     SESSION RECOVERY                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

function scheduleRecovery(sessionId, clientInfo, baseDelay = 5000) {
    if (manuallyDisconnectedSessions.has(sessionId)) return;
    if (recoveryLocks.get(sessionId)) return;
    if (recoveryTimers.has(sessionId)) return;

    const attempts = sessionRestartAttempts.get(sessionId) || 0;
    if (attempts >= MAX_RECOVERY_ATTEMPTS) {
        logError(`Session ${sessionId} reached recovery limit (${MAX_RECOVERY_ATTEMPTS}).`);
        return;
    }

    const delayMs = Math.min(baseDelay * Math.pow(2, Math.min(attempts, 6)), 60000);
    const timer = setTimeout(() => {
        recoveryTimers.delete(sessionId);
        if (!manuallyDisconnectedSessions.has(sessionId)) {
            recoverSession(sessionId, clientInfo).catch(() => {});
        }
    }, delayMs);
    recoveryTimers.set(sessionId, timer);
}

async function recoverSession(sessionId, clientInfo) {
    if (manuallyDisconnectedSessions.has(sessionId)) return null;
    if (recoveryLocks.get(sessionId)) return null;

    recoveryLocks.set(sessionId, true);
    try {
        const attempts = sessionRestartAttempts.get(sessionId) || 0;
        logInfo(`Recovering session ${sessionId} (attempt ${attempts + 1})`);
        sessionRestartAttempts.set(sessionId, attempts + 1);

        const { state, saveCreds } = await useMultiFileAuthState(clientInfo.authPath);
        const { version }          = await fetchLatestBaileysVersion();

        // Prevent duplicate sockets during reconnect storms.
        if (clientInfo.client) {
            try { clientInfo.client.end(); } catch {}
            clientInfo.client = null;
        }

        const waClient = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
            },
            printQRInTerminal:        false,
            logger:                   pino({ level: "silent" }),
            browser:                  Browsers.ubuntu('Chrome'),
            syncFullHistory:          false,
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid:          jid => isJidBroadcast(jid),
            getMessage:               async () => ({}),
            markOnlineOnConnect:      false,
            retryRequestDelayMs: 5000,
            maxRetries:               20,
            connectTimeoutMs:         60000
        });

        clientInfo.client      = waClient;
        clientInfo.isConnected = false;
        activeClients.set(sessionId, clientInfo);
        waClient.ev.on("creds.update", saveCreds);

        waClient.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (manuallyDisconnectedSessions.has(sessionId)) {
                try { waClient.end(); } catch {}
                return;
            }
            if (connection === "open") {
                logSuccess(`Session ${sessionId} reconnected!`);
                clientInfo.isConnected = true;
                clientInfo.lastActivity = Date.now();
                sessionRestartAttempts.set(sessionId, 0);
                if (pairCodeSessions.has(sessionId)) {
                    pairCodeSessions.get(sessionId).hasConnected = true;
                }
                recoveryLocks.delete(sessionId);
                clientInfo.tasks?.forEach(task => {
                    if (task.isSending && !task.stopRequested) {
                        resumeTask(sessionId, task.taskId);
                    }
                });
            } else if (connection === "close") {
                clientInfo.isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                logWarning(`Session ${sessionId} disconnected. Status: ${statusCode}`);
                if (manuallyDisconnectedSessions.has(sessionId)) return;
                if (statusCode === 401) {
                    logError(`Session ${sessionId} logged out — removing`);
                    completeSessionCleanup(sessionId);
                    return;
                }
                recoveryLocks.delete(sessionId);
                scheduleRecovery(sessionId, clientInfo, 1000);
            }
        });

        return waClient;
    } catch (error) {
        recoveryLocks.delete(sessionId);
        logError(`Failed to recover session ${sessionId}: ${error.message}`);
        if (manuallyDisconnectedSessions.has(sessionId)) return null;
        scheduleRecovery(sessionId, clientInfo, 5000);
        return null;
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     TASK RESUME                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

async function resumeTask(sessionId, taskId) {
    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) return;
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo || !taskInfo.isSending || taskInfo.stopRequested) return;
    if (taskRunningLocks.get(taskId)) return;

    const logs = taskLogs.get(taskId) || [];
    logs.unshift({
        type: "info",
        message: `[${new Date().toLocaleString()}] Task resumed automatically`,
        timestamp: new Date()
    });
    taskLogs.set(taskId, logs);

    while (!clientInfo.isConnected && taskInfo.isSending && !taskInfo.stopRequested) {
        await delay(5000);
    }

    if (clientInfo.isConnected && taskInfo.isSending && !taskInfo.stopRequested && !taskRunningLocks.get(taskId)) {
        const loopFn = getLoopFunction(taskInfo.taskType);
        if (loopFn) loopFn(sessionId, taskId);
    }
}

function getLoopFunction(taskType) {
    switch (taskType) {
        case 'image':    return sendImagesLoop;
        case 'video':    return sendVideosLoop;
        case 'document': return sendDocumentsLoop;
        case 'audio':    return sendVoiceLoop;
        default:         return sendMessagesLoop;
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     PERIODIC MAINTENANCE                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

setInterval(() => {
    const now = Date.now();
    for (const [sessionId, clientInfo] of activeClients.entries()) {
        if (manuallyDisconnectedSessions.has(sessionId)) continue;
        if (clientInfo.lastActivity && (now - clientInfo.lastActivity > 48 * 60 * 60 * 1000)) {
            logInfo(`Cleaning up inactive session: ${sessionId}`);
            completeSessionCleanup(sessionId);
        }
    }
    for (const [sessionId, clientInfo] of activeClients.entries()) {
        if (manuallyDisconnectedSessions.has(sessionId)) continue;
        if (!clientInfo.isConnected && clientInfo.client) {
            const hasActiveTasks = clientInfo.tasks?.some(t => t.isSending);
            if (hasActiveTasks && !recoveryLocks.get(sessionId) && !recoveryTimers.has(sessionId)) {
                scheduleRecovery(sessionId, clientInfo, 5000);
            }
        }
    }
    savePersistentData();
    optimizeMemory();
}, 5 * 60 * 1000);

setInterval(savePersistentData, 2 * 60 * 1000);

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     CORE SENDING LOOPS                                ║
// ╚══════════════════════════════════════════════════════════════════════╝

async function sendMessagesLoop(sessionId, taskId) {
    if (taskRunningLocks.get(taskId)) return;
    taskRunningLocks.set(taskId, true);

    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) { taskRunningLocks.delete(taskId); return; }
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo)  { taskRunningLocks.delete(taskId); return; }
    const logs = taskLogs.get(taskId) || [];

    try {
        let index     = taskInfo.currentMessageIndex || 0;
        const recipient = taskInfo.targetType === "group"
            ? taskInfo.target + "@g.us"
            : taskInfo.target + "@s.whatsapp.net";

        while (taskInfo.isSending && !taskInfo.stopRequested) {
            optimizeMemory();
            if (!clientInfo.isConnected) {
                logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Waiting for connection...`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                await delay(10000);
                continue;
            }

            let msg = taskInfo.messages[index];
            if (taskInfo.prefix?.trim()) msg = `${taskInfo.prefix.trim()} ${msg}`;
            const ts = new Date().toLocaleString();
            const num = taskInfo.sentMessages + 1;

            try {
                await clientInfo.client.sendMessage(recipient, { text: msg });
                logs.unshift({ type:"success", message:`[${ts}] Message #${num} sent`, details:`To: ${taskInfo.target} | "${msg.substring(0, 60)}${msg.length > 60 ? '...' : ''}"`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                taskInfo.sentMessages++;
                index = (index + 1) % taskInfo.messages.length;
                taskInfo.currentMessageIndex = index;
                clientInfo.lastActivity = Date.now();
            } catch (sendError) {
                logs.unshift({ type:"error", message:`[${ts}] Failed to send message #${num}`, details:`Error: ${sendError.message}`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                logError(`[${sessionId}] Send error: ${sendError.message}`);
                if (/connection|socket|timeout|not connected/i.test(sendError.message)) {
                    clientInfo.isConnected = false;
                    await delay(5000);
                    continue;
                }
                await delay(taskInfo.delaySec * 1000);
            }

            if (taskInfo.sentMessages % 25 === 0) savePersistentData();
            await delay(taskInfo.delaySec * 1000);
        }

        taskInfo.isSending = false;
        taskInfo.endTime   = new Date();
        taskRunningLocks.delete(taskId);
        activeTasks.delete(taskId);
        updateTaskMetadata(taskId, { isSending: false, status: taskInfo.stopRequested ? 'stopped' : 'completed', endTime: taskInfo.endTime.toISOString() });
        logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Task ${taskInfo.stopRequested ? 'stopped' : 'completed'} — Total sent: ${taskInfo.sentMessages}`, timestamp:new Date() });
        taskLogs.delete(taskId);

    } catch (error) {
        logError(`Critical error in task ${taskId}: ${error.message}`);
        const ti = clientInfo.tasks.find(t => t.taskId === taskId);
        if (ti) { ti.isSending = false; ti.endTime = new Date(); }
        taskRunningLocks.delete(taskId);
        activeTasks.delete(taskId);
        if (!ti?.stopRequested) {
            setTimeout(() => {
                const cur = activeClients.get(sessionId)?.tasks.find(t => t.taskId === taskId);
                if (cur && !cur.stopRequested && !taskRunningLocks.get(taskId)) {
                    cur.isSending = true;
                    sendMessagesLoop(sessionId, taskId);
                }
            }, 10000);
        }
    }
}

// ─── IMAGE LOOP ────────────────────────────────────────────────────────

async function sendImagesLoop(sessionId, taskId) {
    if (taskRunningLocks.get(taskId)) return;
    taskRunningLocks.set(taskId, true);

    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) { taskRunningLocks.delete(taskId); return; }
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo)  { taskRunningLocks.delete(taskId); return; }
    const logs     = taskLogs.get(taskId) || [];

    try {
        const recipient = taskInfo.targetType === "group"
            ? taskInfo.target + "@g.us"
            : taskInfo.target + "@s.whatsapp.net";

        while (taskInfo.isSending && !taskInfo.stopRequested) {
            optimizeMemory();
            if (!clientInfo.isConnected) {
                logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Waiting for connection...`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                await delay(10000);
                continue;
            }
            const ts  = new Date().toLocaleString();
            const num = taskInfo.sentMessages + 1;
            try {
                const imageBuffer = await fs.promises.readFile(taskInfo.imagePath);
                const msgObj = { image: imageBuffer };
                if (taskInfo.prefix?.trim()) msgObj.caption = taskInfo.prefix.trim();
                await clientInfo.client.sendMessage(recipient, msgObj);
                logs.unshift({ type:"success", message:`[${ts}] Image #${num} sent`, details:`To: ${taskInfo.target}`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                taskInfo.sentMessages++;
                clientInfo.lastActivity = Date.now();
            } catch (e) {
                logs.unshift({ type:"error", message:`[${ts}] Failed to send image #${num}`, details:e.message, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                if (/connection|socket|timeout|not connected/i.test(e.message)) {
                    clientInfo.isConnected = false;
                    await delay(5000);
                    continue;
                }
                await delay(taskInfo.delaySec * 1000);
            }
            if (taskInfo.sentMessages % 25 === 0) savePersistentData();
            await delay(taskInfo.delaySec * 1000);
        }

        taskInfo.isSending = false;
        taskInfo.endTime   = new Date();
        taskRunningLocks.delete(taskId);
        activeTasks.delete(taskId);
        updateTaskMetadata(taskId, { isSending: false, status: taskInfo.stopRequested ? 'stopped' : 'completed', endTime: taskInfo.endTime.toISOString() });
        logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Image task ${taskInfo.stopRequested ? 'stopped' : 'completed'} — Total: ${taskInfo.sentMessages}`, timestamp:new Date() });
        taskLogs.delete(taskId);

    } catch (error) {
        logError(`Critical error in image task ${taskId}: ${error.message}`);
        taskRunningLocks.delete(taskId);
        activeTasks.delete(taskId);
    }
}

// ─── VIDEO LOOP ────────────────────────────────────────────────────────

async function sendVideosLoop(sessionId, taskId) {
    if (taskRunningLocks.get(taskId)) return;
    taskRunningLocks.set(taskId, true);

    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) { taskRunningLocks.delete(taskId); return; }
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo)  { taskRunningLocks.delete(taskId); return; }
    const logs = taskLogs.get(taskId) || [];

    try {
        const recipient = taskInfo.targetType === "group"
            ? taskInfo.target + "@g.us"
            : taskInfo.target + "@s.whatsapp.net";

        while (taskInfo.isSending && !taskInfo.stopRequested) {
            optimizeMemory();
            if (!clientInfo.isConnected) {
                logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Waiting for connection...`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                await delay(10000);
                continue;
            }
            const ts  = new Date().toLocaleString();
            const num = taskInfo.sentMessages + 1;
            try {
                const videoBuffer = await fs.promises.readFile(taskInfo.videoPath);
                const msgObj = { video: videoBuffer, mimetype: 'video/mp4' };
                if (taskInfo.prefix?.trim()) msgObj.caption = taskInfo.prefix.trim();
                await clientInfo.client.sendMessage(recipient, msgObj);
                logs.unshift({ type:"success", message:`[${ts}] Video #${num} sent`, details:`To: ${taskInfo.target}`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                taskInfo.sentMessages++;
                clientInfo.lastActivity = Date.now();
            } catch (e) {
                logs.unshift({ type:"error", message:`[${ts}] Failed to send video #${num}`, details:e.message, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                if (/connection|socket|timeout|not connected/i.test(e.message)) {
                    clientInfo.isConnected = false;
                    await delay(5000);
                    continue;
                }
                await delay(taskInfo.delaySec * 1000);
            }
            if (taskInfo.sentMessages % 25 === 0) savePersistentData();
            await delay(taskInfo.delaySec * 1000);
        }

        taskInfo.isSending = false;
        taskInfo.endTime   = new Date();
        taskRunningLocks.delete(taskId);
        activeTasks.delete(taskId);
        updateTaskMetadata(taskId, { isSending: false, status: taskInfo.stopRequested ? 'stopped' : 'completed', endTime: taskInfo.endTime.toISOString() });
        logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Video task ${taskInfo.stopRequested ? 'stopped' : 'completed'} — Total: ${taskInfo.sentMessages}`, timestamp:new Date() });
        taskLogs.delete(taskId);

    } catch (error) {
        logError(`Critical error in video task ${taskId}: ${error.message}`);
        taskRunningLocks.delete(taskId);
    }
}

// ─── DOCUMENT LOOP ─────────────────────────────────────────────────────

async function sendDocumentsLoop(sessionId, taskId) {
    if (taskRunningLocks.get(taskId)) return;
    taskRunningLocks.set(taskId, true);

    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) { taskRunningLocks.delete(taskId); return; }
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo)  { taskRunningLocks.delete(taskId); return; }
    const logs = taskLogs.get(taskId) || [];

    try {
        const recipient = taskInfo.targetType === "group"
            ? taskInfo.target + "@g.us"
            : taskInfo.target + "@s.whatsapp.net";

        while (taskInfo.isSending && !taskInfo.stopRequested) {
            optimizeMemory();
            if (!clientInfo.isConnected) {
                logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Waiting for connection...`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                await delay(10000);
                continue;
            }
            const ts  = new Date().toLocaleString();
            const num = taskInfo.sentMessages + 1;
            try {
                const docBuffer = await fs.promises.readFile(taskInfo.docPath);
                const fileName  = path.basename(taskInfo.docPath);
                const msgObj = {
                    document:  docBuffer,
                    fileName:  taskInfo.fileName || fileName,
                    mimetype:  taskInfo.mimetype || 'application/octet-stream',
                    caption:   taskInfo.prefix?.trim() || undefined
                };
                await clientInfo.client.sendMessage(recipient, msgObj);
                logs.unshift({ type:"success", message:`[${ts}] Document #${num} sent`, details:`To: ${taskInfo.target} | File: ${msgObj.fileName}`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                taskInfo.sentMessages++;
                clientInfo.lastActivity = Date.now();
            } catch (e) {
                logs.unshift({ type:"error", message:`[${ts}] Failed to send document #${num}`, details:e.message, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                if (/connection|socket|timeout|not connected/i.test(e.message)) {
                    clientInfo.isConnected = false;
                    await delay(5000);
                    continue;
                }
                await delay(taskInfo.delaySec * 1000);
            }
            if (taskInfo.sentMessages % 25 === 0) savePersistentData();
            await delay(taskInfo.delaySec * 1000);
        }

        taskInfo.isSending = false;
        taskInfo.endTime   = new Date();
        taskRunningLocks.delete(taskId);
        activeTasks.delete(taskId);
        updateTaskMetadata(taskId, { isSending: false, status: taskInfo.stopRequested ? 'stopped' : 'completed', endTime: taskInfo.endTime.toISOString() });
        logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Document task ${taskInfo.stopRequested ? 'stopped' : 'completed'} — Total: ${taskInfo.sentMessages}`, timestamp:new Date() });
        taskLogs.delete(taskId);

    } catch (error) {
        logError(`Critical error in document task ${taskId}: ${error.message}`);
        taskRunningLocks.delete(taskId);
    }
}

// ─── VOICE / AUDIO LOOP ────────────────────────────────────────────────

async function sendVoiceLoop(sessionId, taskId) {
    if (taskRunningLocks.get(taskId)) return;
    taskRunningLocks.set(taskId, true);

    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) { taskRunningLocks.delete(taskId); return; }
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo)  { taskRunningLocks.delete(taskId); return; }
    const logs = taskLogs.get(taskId) || [];

    try {
        const recipient = taskInfo.targetType === "group"
            ? taskInfo.target + "@g.us"
            : taskInfo.target + "@s.whatsapp.net";

        while (taskInfo.isSending && !taskInfo.stopRequested) {
            optimizeMemory();
            if (!clientInfo.isConnected) {
                logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Waiting for connection...`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                await delay(10000);
                continue;
            }
            const ts  = new Date().toLocaleString();
            const num = taskInfo.sentMessages + 1;
            try {
                const audioBuffer = await fs.promises.readFile(taskInfo.audioPath);
                const msgObj = {
                    audio:    audioBuffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt:      true   // sends as voice note (push-to-talk)
                };
                await clientInfo.client.sendMessage(recipient, msgObj);
                logs.unshift({ type:"success", message:`[${ts}] Voice note #${num} sent`, details:`To: ${taskInfo.target}`, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                taskInfo.sentMessages++;
                clientInfo.lastActivity = Date.now();
            } catch (e) {
                logs.unshift({ type:"error", message:`[${ts}] Failed to send voice note #${num}`, details:e.message, timestamp:new Date() });
                if (logs.length > MAX_TASK_LOGS) logs.pop();
                taskLogs.set(taskId, logs);
                if (/connection|socket|timeout|not connected/i.test(e.message)) {
                    clientInfo.isConnected = false;
                    await delay(5000);
                    continue;
                }
                await delay(taskInfo.delaySec * 1000);
            }
            if (taskInfo.sentMessages % 25 === 0) savePersistentData();
            await delay(taskInfo.delaySec * 1000);
        }

        taskInfo.isSending = false;
        taskInfo.endTime   = new Date();
        taskRunningLocks.delete(taskId);
        activeTasks.delete(taskId);
        updateTaskMetadata(taskId, { isSending: false, status: taskInfo.stopRequested ? 'stopped' : 'completed', endTime: taskInfo.endTime.toISOString() });
        logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Voice task ${taskInfo.stopRequested ? 'stopped' : 'completed'} — Total: ${taskInfo.sentMessages}`, timestamp:new Date() });
        taskLogs.delete(taskId);

    } catch (error) {
        logError(`Critical error in voice task ${taskId}: ${error.message}`);
        taskRunningLocks.delete(taskId);
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     PUBLIC ROUTES                                     ║
// ╚══════════════════════════════════════════════════════════════════════╝

app.get("/",              (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get("/login",         (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get("/signup",        (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get("/admin-login",   (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get("/dashboard",     requireAuth,  (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get("/admin-dashboard", requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get("/session-status",  requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get("/task-logs",       requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── HEALTH / STATS ────────────────────────────────────────────────────

app.get("/health", (req, res) => {
    const mem    = process.memoryUsage();
    const uptime = Date.now() - SERVER_START_TIME;
    res.json({
        status:      "RUNNING",
        uptime:       formatUptime(uptime),
        uptimeMs:     uptime,
        memory: {
            used:     formatBytes(mem.heapUsed),
            total:    formatBytes(mem.heapTotal),
            rss:      formatBytes(mem.rss),
            external: formatBytes(mem.external)
        },
        sessions:     activeClients.size,
        totalTasks:   Array.from(activeClients.values()).reduce((s, c) => s + (c.tasks?.length || 0), 0),
        activeTasks:  Array.from(activeClients.values()).reduce((s, c) => s + (c.tasks?.filter(t => t.isSending).length || 0), 0),
        timestamp:    new Date().toISOString()
    });
});

// Detailed server stats — requires auth
app.get("/api/stats", requireAuth, (req, res) => {
    const mem    = process.memoryUsage();
    const uptime = Date.now() - SERVER_START_TIME;

    let totalSent      = 0;
    let totalTasks     = 0;
    let runningTasks   = 0;
    let stoppedTasks   = 0;
    let connectedSessions   = 0;
    let disconnectedSessions = 0;

    const sessionBreakdown = [];

    activeClients.forEach((clientInfo, sessionId) => {
        if (clientInfo.userId !== req.user.userId) return;
        const running  = clientInfo.tasks?.filter(t => t.isSending).length   || 0;
        const stopped  = clientInfo.tasks?.filter(t => !t.isSending).length  || 0;
        const sent     = clientInfo.tasks?.reduce((s, t) => s + (t.sentMessages || 0), 0) || 0;
        totalSent    += sent;
        totalTasks   += clientInfo.tasks?.length || 0;
        runningTasks += running;
        stoppedTasks += stopped;
        if (clientInfo.isConnected) connectedSessions++;
        else disconnectedSessions++;
        sessionBreakdown.push({
            sessionId,
            number:     clientInfo.number,
            isConnected: clientInfo.isConnected,
            tasks:       clientInfo.tasks?.length || 0,
            running,
            totalSent:  sent,
            createdAt:  clientInfo.createdAt
        });
    });

    res.json({
        server: {
            uptime:        formatUptime(uptime),
            uptimeMs:      uptime,
            memory:        formatBytes(mem.heapUsed),
            memoryTotal:   formatBytes(mem.heapTotal),
            startedAt:     new Date(SERVER_START_TIME).toISOString(),
            nodeVersion:   process.version,
            platform:      process.platform
        },
        user: {
            username:              req.user.username,
            connectedSessions,
            disconnectedSessions,
            totalSessions:         connectedSessions + disconnectedSessions,
            totalTasks,
            runningTasks,
            stoppedTasks,
            totalMessagesSent:     totalSent,
            sessions:              sessionBreakdown
        },
        timestamp: new Date().toISOString()
    });
});

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     AUTH ROUTES                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const users = loadUsers();
    const user  = users.find(u => u.username === username && u.password === hashPassword(password));
    if (!user) return res.json({ success: false, error: "Invalid username or password" });
    const token = generateSessionToken();
    user.sessionToken = token;
    user.lastLogin    = new Date().toISOString();
    saveUsers(users);
    res.cookie('sessionToken', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, redirect: '/dashboard' });
});

app.post("/signup", (req, res) => {
    const { username, email, password } = req.body;
    const users = loadUsers();
    if (users.find(u => u.username === username)) {
        return res.json({ success: false, error: "Username already exists" });
    }
    if (users.find(u => u.email === email)) {
        return res.json({ success: false, error: "Email already registered" });
    }
    if (password.length < 6) {
        return res.json({ success: false, error: "Password must be at least 6 characters" });
    }
    const newUser = {
        userId:       generateUserId(),
        username,
        email,
        password:     hashPassword(password),
        createdAt:    new Date().toISOString(),
        sessionToken: generateSessionToken()
    };
    users.push(newUser);
    saveUsers(users);
    res.cookie('sessionToken', newUser.sessionToken, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, redirect: '/dashboard' });
});

app.post("/admin-login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        res.cookie('adminToken', 'admin_authenticated', { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ success: true, redirect: '/admin-dashboard' });
    } else {
        res.json({ success: false, error: "Invalid admin credentials" });
    }
});

app.get("/logout", (req, res) => {
    res.clearCookie('sessionToken');
    res.clearCookie('adminToken');
    res.redirect('/login');
});

// ─── USER PROFILE ──────────────────────────────────────────────────────

app.get("/api/user-profile", requireAuth, (req, res) => {
    const user = req.user;
    const userSessions_count = Array.from(activeClients.values())
        .filter(c => c.userId === user.userId).length;
    const totalSent = Array.from(activeClients.values())
        .filter(c => c.userId === user.userId)
        .reduce((s, c) => s + (c.tasks?.reduce((a, t) => a + (t.sentMessages || 0), 0) || 0), 0);

    res.json({
        userId:        user.userId,
        username:      user.username,
        email:         user.email,
        createdAt:     user.createdAt,
        lastLogin:     user.lastLogin,
        activeSessions: userSessions_count,
        totalMessagesSent: totalSent
    });
});

// ─── CHANGE PASSWORD ───────────────────────────────────────────────────

app.post("/change-password", requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.json({ success: false, error: "All fields are required" });
    }
    if (newPassword.length < 6) {
        return res.json({ success: false, error: "New password must be at least 6 characters" });
    }
    const users = loadUsers();
    const user  = users.find(u => u.userId === req.user.userId);
    if (!user) return res.json({ success: false, error: "User not found" });
    if (user.password !== hashPassword(currentPassword)) {
        return res.json({ success: false, error: "Current password is incorrect" });
    }
    user.password     = hashPassword(newPassword);
    user.sessionToken = generateSessionToken();  // invalidate old sessions
    saveUsers(users);
    res.clearCookie('sessionToken');
    res.json({ success: true, message: "Password changed successfully. Please log in again." });
});

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     WHATSAPP SESSION ROUTES                           ║
// ╚══════════════════════════════════════════════════════════════════════╝

app.post("/generate-pairing-code", requireAuth, async (req, res) => {
    const { number: num } = req.body;
    const user = req.user;

    if (!num) return res.json({ success: false, error: "Phone number is required" });

    try {
        const sessionId   = generateSessionId();
        const sessionPath = path.join("temp", sessionId);
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version }          = await fetchLatestBaileysVersion();

        const waClient = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
            },
            printQRInTerminal:        false,
            logger:                   pino({ level: "silent" }),
            browser:                  Browsers.ubuntu('Chrome'),
            syncFullHistory:          false,
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid:          jid => isJidBroadcast(jid),
            getMessage:               async () => ({}),
            markOnlineOnConnect:      false,
            retryRequestDelayMs: 5000,
            maxRetries:               20,
            connectTimeoutMs:         60000
        });

        if (!waClient.authState.creds.registered) {
            await delay(1500);
            const phoneNumber = num.replace(/[^0-9]/g, "");
            const code = await waClient.requestPairingCode(phoneNumber);

            activeClients.set(sessionId, {
                client:       waClient,
                number:       num,
                authPath:     sessionPath,
                isConnected:  false,
                tasks:        [],
                lastActivity: Date.now(),
                userId:       user.userId,
                username:     user.username,
                createdAt:    new Date().toISOString()
            });

            pairCodeSessions.set(sessionId, { createdAt: Date.now(), hasConnected: false });
            logInfo(`Pair code session created: ${sessionId} — timeout in 10 min`);

            res.json({ success: true, code, sessionId, number: num });
        }

        waClient.ev.on("creds.update", saveCreds);
        waClient.ev.on("connection.update", async (s) => {
            const { connection, lastDisconnect } = s;
            if (manuallyDisconnectedSessions.has(sessionId)) return;
            if (connection === "open") {
                logSuccess(`WhatsApp connected for ${num} — Session: ${sessionId}`);
                const ci = activeClients.get(sessionId);
                if (ci) {
                    ci.isConnected  = true;
                    ci.lastActivity = Date.now();
                    sessionRestartAttempts.set(sessionId, 0);
                    if (pairCodeSessions.has(sessionId)) {
                        pairCodeSessions.get(sessionId).hasConnected = true;
                    }
                }
            } else if (connection === "close") {
                const ci = activeClients.get(sessionId);
                if (ci) {
                    ci.isConnected = false;
                    if (manuallyDisconnectedSessions.has(sessionId)) return;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === 401) { completeSessionCleanup(sessionId); return; }
                    scheduleRecovery(sessionId, ci, 10000);
                }
            }
        });

    } catch (err) {
        logError("Pairing error: " + err.message);
        res.json({ success: false, error: err.message });
    }
});

// ─── LIVE STATUS ───────────────────────────────────────────────────────

app.get("/api/live-status", requireAuth, (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId || !activeClients.has(sessionId)) return res.json({ error: "Invalid session" });
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ error: "Access denied" });

    const runningTasksCount = clientInfo.tasks?.filter(t => t.isSending).length || 0;
    const tasksStatus = clientInfo.tasks?.map(task => ({
        taskId:       task.taskId,
        target:       task.target,
        targetType:   task.targetType,
        taskType:     task.taskType || 'message',
        isSending:    task.isSending,
        sentMessages: task.sentMessages,
        totalMessages: task.totalMessages,
        currentIndex: task.currentMessageIndex || 0,
        createdAt:    task.createdAt,
        createdAtFormatted: task.createdAt ? formatDate(task.createdAt) : null
    })) || [];

    res.json({
        isConnected:    clientInfo.isConnected,
        number:         clientInfo.number,
        tasks:          tasksStatus,
        runningTasksCount,
        lastActivity:   clientInfo.lastActivity,
        createdAt:      clientInfo.createdAt,
        createdAtFormatted: clientInfo.createdAt ? formatDate(clientInfo.createdAt) : null
    });
});

// ─── LIVE LOGS ─────────────────────────────────────────────────────────

app.get("/api/live-logs", requireAuth, (req, res) => {
    const { sessionId, taskId } = req.query;
    if (!sessionId || !activeClients.has(sessionId) || !taskLogs.has(taskId)) {
        return res.json({ error: "Invalid session or task" });
    }
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ error: "Access denied" });

    const logs     = taskLogs.get(taskId) || [];
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);

    res.json({
        logs: logs.slice(0, 50),
        taskInfo: taskInfo ? {
            isSending:    taskInfo.isSending,
            sentMessages: taskInfo.sentMessages,
            totalMessages: taskInfo.totalMessages,
            taskType:     taskInfo.taskType || 'message',
            createdAt:    taskInfo.createdAt,
            createdAtFormatted: taskInfo.createdAt ? formatDate(taskInfo.createdAt) : null
        } : null
    });
});

// ─── GET NUMBERS ───────────────────────────────────────────────────────

app.get("/api/get-numbers", requireAuth, (req, res) => {
    const numbers = new Map();
    activeClients.forEach((clientInfo, sessionId) => {
        if (clientInfo.userId !== req.user.userId) return;
        if (!numbers.has(clientInfo.number)) numbers.set(clientInfo.number, []);
        numbers.get(clientInfo.number).push({
            sessionId,
            isConnected:      clientInfo.isConnected,
            runningTasksCount: clientInfo.tasks?.filter(t => t.isSending).length || 0,
            createdAt:         clientInfo.createdAt,
            createdAtFormatted: clientInfo.createdAt ? formatDate(clientInfo.createdAt) : null
        });
    });
    res.json(Array.from(numbers.entries()).map(([number, sessions]) => ({ number, sessions })));
});

// ─── GET GROUPS ────────────────────────────────────────────────────────

app.get("/get-groups", requireAuth, async (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId || !activeClients.has(sessionId)) {
        return res.json({ success: false, error: "Invalid session" });
    }
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ success: false, error: "Access denied" });

    try {
        const groups      = await clientInfo.client.groupFetchAllParticipating();
        const groupsList  = Object.keys(groups).map((groupId, index) => {
            const group = groups[groupId];
            return {
                index:             index + 1,
                groupId:           groupId.replace('@g.us', ''),
                subject:           group.subject || 'Unnamed Group',
                participantsCount: group.participants?.length || 0,
                creation:          group.creation ? formatDate(group.creation * 1000) : null
            };
        });
        res.json({ success: true, number: clientInfo.number, groups: groupsList });
    } catch (e) {
        logError("Error fetching groups: " + e.message);
        res.json({ success: false, error: e.message });
    }
});

// ─── CHECK IF NUMBER IS ON WHATSAPP ────────────────────────────────────

app.post("/api/check-number", requireAuth, async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !activeClients.has(sessionId)) {
        return res.json({ success: false, error: "Invalid session" });
    }
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ success: false, error: "Access denied" });
    if (!clientInfo.isConnected) return res.json({ success: false, error: "Session not connected" });
    if (!number) return res.json({ success: false, error: "Phone number is required" });

    try {
        const cleaned  = number.replace(/[^0-9]/g, "");
        const jid      = cleaned + "@s.whatsapp.net";
        const [result] = await clientInfo.client.onWhatsApp(jid);
        res.json({
            success:   true,
            number:    cleaned,
            exists:    result?.exists || false,
            jid:       result?.jid || null
        });
    } catch (e) {
        logError("Number check error: " + e.message);
        res.json({ success: false, error: e.message });
    }
});

// ─── GET GROUP PARTICIPANTS ─────────────────────────────────────────────

app.get("/api/group-participants", requireAuth, async (req, res) => {
    const { sessionId, groupId } = req.query;
    if (!sessionId || !activeClients.has(sessionId)) {
        return res.json({ success: false, error: "Invalid session" });
    }
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ success: false, error: "Access denied" });
    if (!clientInfo.isConnected) return res.json({ success: false, error: "Session not connected" });
    if (!groupId) return res.json({ success: false, error: "Group ID is required" });

    try {
        const jid       = groupId.includes('@g.us') ? groupId : groupId + "@g.us";
        const metadata  = await clientInfo.client.groupMetadata(jid);
        const participants = metadata.participants.map((p, i) => ({
            index:   i + 1,
            number:  p.id.replace('@s.whatsapp.net', ''),
            jid:     p.id,
            isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
            role:    p.admin || 'member'
        }));
        res.json({
            success:      true,
            groupId:      metadata.id,
            subject:      metadata.subject,
            participants: participants,
            total:        participants.length
        });
    } catch (e) {
        logError("Group participants error: " + e.message);
        res.json({ success: false, error: e.message });
    }
});

// ─── SEND TEXT MESSAGES ─────────────────────────────────────────────────

app.post("/send-message", requireAuth, upload.single("messageFile"), async (req, res) => {
    const { target, targetType, delaySec, prefix, selectedSession } = req.body;
    const user = req.user;

    if (!selectedSession || !activeClients.has(selectedSession)) {
        return res.json({ success: false, error: "Invalid session selected" });
    }
    const clientInfo = activeClients.get(selectedSession);
    if (clientInfo.userId !== user.userId) return res.json({ success: false, error: "Access denied" });
    const filePath = req.file?.path;
    if (!target || !filePath || !targetType || !delaySec) {
        return res.json({ success: false, error: "Missing required fields" });
    }

    try {
        const messages = fs.readFileSync(filePath, "utf-8")
            .split("\n").filter(m => m.trim() !== "");
        if (messages.length === 0) return res.json({ success: false, error: "Message file is empty" });

        const taskId   = generateShortTaskId();
        const taskInfo = {
            taskId, sessionId: selectedSession, target, targetType, messages,
            delaySec: parseInt(delaySec), prefix, taskType: 'message',
            isSending: true, stopRequested: false, totalMessages: messages.length,
            sentMessages: 0, currentMessageIndex: 0,
            startTime: new Date(), createdAt: new Date().toISOString(), logs: []
        };

        if (!clientInfo.tasks) clientInfo.tasks = [];
        clientInfo.tasks.push(taskInfo);
        clientInfo.lastActivity = Date.now();
        taskLogs.set(taskId, []);
        createTaskFolder(taskId, taskInfo);
        fs.unlinkSync(filePath);

        res.json({ success: true, redirect: `/session-status?sessionId=${selectedSession}` });
        sendMessagesLoop(selectedSession, taskId);
    } catch (e) {
        logError(`[${selectedSession}] Error starting message task: ${e.message}`);
        return res.json({ success: false, error: e.message });
    }
});

// ─── SEND IMAGES ───────────────────────────────────────────────────────

app.post("/send-image", requireAuth, upload.single("imageFile"), async (req, res) => {
    const { target, targetType, delaySec, prefix, selectedSession } = req.body;
    const user = req.user;

    if (!selectedSession || !activeClients.has(selectedSession)) {
        return res.json({ success: false, error: "Invalid session selected" });
    }
    const clientInfo = activeClients.get(selectedSession);
    if (clientInfo.userId !== user.userId) return res.json({ success: false, error: "Access denied" });
    const imagePath = req.file?.path;
    if (!target || !imagePath || !targetType || !delaySec) {
        return res.json({ success: false, error: "Missing required fields" });
    }

    try {
        const taskId   = generateShortTaskId();
        const taskInfo = {
            taskId, sessionId: selectedSession, target, targetType, imagePath,
            delaySec: parseInt(delaySec), prefix, taskType: 'image',
            isSending: true, stopRequested: false, totalMessages: 0,
            sentMessages: 0, startTime: new Date(), createdAt: new Date().toISOString(), logs: []
        };
        if (!clientInfo.tasks) clientInfo.tasks = [];
        clientInfo.tasks.push(taskInfo);
        clientInfo.lastActivity = Date.now();
        taskLogs.set(taskId, []);
        createTaskFolder(taskId, taskInfo);
        res.json({ success: true, redirect: `/session-status?sessionId=${selectedSession}` });
        sendImagesLoop(selectedSession, taskId);
    } catch (e) {
        logError(`[${selectedSession}] Error starting image task: ${e.message}`);
        return res.json({ success: false, error: e.message });
    }
});

// ─── SEND VIDEO ────────────────────────────────────────────────────────

app.post("/send-video", requireAuth, upload.single("videoFile"), async (req, res) => {
    const { target, targetType, delaySec, prefix, selectedSession } = req.body;
    const user = req.user;

    if (!selectedSession || !activeClients.has(selectedSession)) {
        return res.json({ success: false, error: "Invalid session selected" });
    }
    const clientInfo = activeClients.get(selectedSession);
    if (clientInfo.userId !== user.userId) return res.json({ success: false, error: "Access denied" });
    const videoPath = req.file?.path;
    if (!target || !videoPath || !targetType || !delaySec) {
        return res.json({ success: false, error: "Missing required fields" });
    }

    try {
        const taskId   = generateShortTaskId();
        const taskInfo = {
            taskId, sessionId: selectedSession, target, targetType, videoPath,
            delaySec: parseInt(delaySec), prefix, taskType: 'video',
            isSending: true, stopRequested: false, totalMessages: 0,
            sentMessages: 0, startTime: new Date(), createdAt: new Date().toISOString(), logs: []
        };
        if (!clientInfo.tasks) clientInfo.tasks = [];
        clientInfo.tasks.push(taskInfo);
        clientInfo.lastActivity = Date.now();
        taskLogs.set(taskId, []);
        createTaskFolder(taskId, taskInfo);
        res.json({ success: true, redirect: `/session-status?sessionId=${selectedSession}` });
        sendVideosLoop(selectedSession, taskId);
    } catch (e) {
        logError(`[${selectedSession}] Error starting video task: ${e.message}`);
        return res.json({ success: false, error: e.message });
    }
});

// ─── SEND DOCUMENT ─────────────────────────────────────────────────────

app.post("/send-document", requireAuth, upload.single("docFile"), async (req, res) => {
    const { target, targetType, delaySec, prefix, selectedSession, fileName } = req.body;
    const user = req.user;

    if (!selectedSession || !activeClients.has(selectedSession)) {
        return res.json({ success: false, error: "Invalid session selected" });
    }
    const clientInfo = activeClients.get(selectedSession);
    if (clientInfo.userId !== user.userId) return res.json({ success: false, error: "Access denied" });
    const docPath = req.file?.path;
    if (!target || !docPath || !targetType || !delaySec) {
        return res.json({ success: false, error: "Missing required fields" });
    }

    // Detect MIME type from extension
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const mimeMap = {
        '.pdf':  'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc':  'application/msword',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls':  'application/vnd.ms-excel',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt':  'text/plain',
        '.zip':  'application/zip',
        '.mp3':  'audio/mpeg',
        '.mp4':  'video/mp4',
    };
    const mimetype = mimeMap[ext] || 'application/octet-stream';

    try {
        const taskId   = generateShortTaskId();
        const taskInfo = {
            taskId, sessionId: selectedSession, target, targetType, docPath, mimetype,
            fileName: fileName || req.file.originalname || 'document' + ext,
            delaySec: parseInt(delaySec), prefix, taskType: 'document',
            isSending: true, stopRequested: false, totalMessages: 0,
            sentMessages: 0, startTime: new Date(), createdAt: new Date().toISOString(), logs: []
        };
        if (!clientInfo.tasks) clientInfo.tasks = [];
        clientInfo.tasks.push(taskInfo);
        clientInfo.lastActivity = Date.now();
        taskLogs.set(taskId, []);
        createTaskFolder(taskId, taskInfo);
        res.json({ success: true, redirect: `/session-status?sessionId=${selectedSession}` });
        sendDocumentsLoop(selectedSession, taskId);
    } catch (e) {
        logError(`[${selectedSession}] Error starting document task: ${e.message}`);
        return res.json({ success: false, error: e.message });
    }
});

// ─── SEND VOICE NOTE ───────────────────────────────────────────────────

app.post("/send-voice", requireAuth, upload.single("audioFile"), async (req, res) => {
    const { target, targetType, delaySec, selectedSession } = req.body;
    const user = req.user;

    if (!selectedSession || !activeClients.has(selectedSession)) {
        return res.json({ success: false, error: "Invalid session selected" });
    }
    const clientInfo = activeClients.get(selectedSession);
    if (clientInfo.userId !== user.userId) return res.json({ success: false, error: "Access denied" });
    const audioPath = req.file?.path;
    if (!target || !audioPath || !targetType || !delaySec) {
        return res.json({ success: false, error: "Missing required fields" });
    }

    try {
        const taskId   = generateShortTaskId();
        const taskInfo = {
            taskId, sessionId: selectedSession, target, targetType, audioPath,
            delaySec: parseInt(delaySec), taskType: 'audio',
            isSending: true, stopRequested: false, totalMessages: 0,
            sentMessages: 0, startTime: new Date(), createdAt: new Date().toISOString(), logs: []
        };
        if (!clientInfo.tasks) clientInfo.tasks = [];
        clientInfo.tasks.push(taskInfo);
        clientInfo.lastActivity = Date.now();
        taskLogs.set(taskId, []);
        createTaskFolder(taskId, taskInfo);
        res.json({ success: true, redirect: `/session-status?sessionId=${selectedSession}` });
        sendVoiceLoop(selectedSession, taskId);
    } catch (e) {
        logError(`[${selectedSession}] Error starting voice task: ${e.message}`);
        return res.json({ success: false, error: e.message });
    }
});

// ─── BULK BROADCAST TO MULTIPLE TARGETS ────────────────────────────────

app.post("/send-bulk", requireAuth, upload.single("messageFile"), async (req, res) => {
    const { targets, targetType, delaySec, prefix, selectedSession } = req.body;
    const user = req.user;

    if (!selectedSession || !activeClients.has(selectedSession)) {
        return res.json({ success: false, error: "Invalid session selected" });
    }
    const clientInfo = activeClients.get(selectedSession);
    if (clientInfo.userId !== user.userId) return res.json({ success: false, error: "Access denied" });
    if (!clientInfo.isConnected) return res.json({ success: false, error: "Session not connected" });

    const filePath = req.file?.path;
    let targetList = [];

    try {
        if (targets) {
            targetList = targets.split('\n').map(t => t.trim()).filter(Boolean);
        }
        if (targetList.length === 0) return res.json({ success: false, error: "No targets provided" });

        let messages = [];
        if (filePath) {
            messages = fs.readFileSync(filePath, "utf-8").split("\n").filter(m => m.trim() !== "");
            fs.unlinkSync(filePath);
        }
        if (messages.length === 0) return res.json({ success: false, error: "Message file is empty" });

        const results  = [];
        const taskIds  = [];

        for (const target of targetList) {
            const taskId   = generateShortTaskId();
            const taskInfo = {
                taskId, sessionId: selectedSession, target, targetType, messages,
                delaySec: parseInt(delaySec), prefix, taskType: 'message',
                isSending: true, stopRequested: false, totalMessages: messages.length,
                sentMessages: 0, currentMessageIndex: 0,
                startTime: new Date(), createdAt: new Date().toISOString(), logs: [],
                isBulk: true
            };
            if (!clientInfo.tasks) clientInfo.tasks = [];
            clientInfo.tasks.push(taskInfo);
            clientInfo.lastActivity = Date.now();
            taskLogs.set(taskId, []);
            createTaskFolder(taskId, taskInfo);
            taskIds.push(taskId);
            results.push({ target, taskId, status: 'started' });
        }

        res.json({
            success: true,
            message: `Started ${taskIds.length} bulk task(s)`,
            tasks:   results,
            redirect: `/session-status?sessionId=${selectedSession}`
        });

        // Start loops with staggered delay to avoid flooding
        taskIds.forEach((taskId, i) => {
            setTimeout(() => {
                sendMessagesLoop(selectedSession, taskId);
            }, i * 2000);
        });

    } catch (e) {
        logError(`[${selectedSession}] Bulk send error: ${e.message}`);
        return res.json({ success: false, error: e.message });
    }
});

// ─── STOP SESSION ──────────────────────────────────────────────────────

app.post("/stop-session", requireAuth, (req, res) => {
    const { sessionId } = req.body;
    if (!activeClients.has(sessionId)) return res.json({ success: false, error: "Invalid Session ID" });
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ success: false, error: "Access denied" });
    completeSessionCleanup(sessionId);
    res.json({ success: true, message: "Session permanently stopped and deleted" });
});

// ─── STOP TASK ─────────────────────────────────────────────────────────

app.post("/stop-task", requireAuth, (req, res) => {
    const { sessionId, taskId } = req.body;
    if (!activeClients.has(sessionId)) return res.json({ success: false, error: "Invalid Session ID" });
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ success: false, error: "Access denied" });
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo) return res.json({ success: false, error: "Task not found" });
    completeTaskCleanup(sessionId, taskId);
    res.json({ success: true, message: "Task permanently stopped and deleted" });
});

// ─── PAUSE / RESUME TASK ────────────────────────────────────────────────

app.post("/pause-task", requireAuth, (req, res) => {
    const { sessionId, taskId } = req.body;
    if (!activeClients.has(sessionId)) return res.json({ success: false, error: "Invalid Session ID" });
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ success: false, error: "Access denied" });
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo) return res.json({ success: false, error: "Task not found" });
    if (!taskInfo.isSending) return res.json({ success: false, error: "Task is not running" });
    taskInfo.stopRequested = true;
    taskInfo.isSending     = false;
    taskInfo.pausedAt      = new Date().toISOString();
    taskRunningLocks.delete(taskId);
    updateTaskMetadata(taskId, { status: 'paused', isSending: false, pausedAt: taskInfo.pausedAt });
    const logs = taskLogs.get(taskId) || [];
    logs.unshift({ type:"warning", message:`[${new Date().toLocaleString()}] Task paused at message ${taskInfo.sentMessages}`, timestamp:new Date() });
    taskLogs.set(taskId, logs);
    res.json({ success: true, message: "Task paused successfully" });
});

app.post("/resume-task", requireAuth, (req, res) => {
    const { sessionId, taskId } = req.body;
    if (!activeClients.has(sessionId)) return res.json({ success: false, error: "Invalid Session ID" });
    const clientInfo = activeClients.get(sessionId);
    if (clientInfo.userId !== req.user.userId) return res.json({ success: false, error: "Access denied" });
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo) return res.json({ success: false, error: "Task not found" });
    if (taskInfo.isSending) return res.json({ success: false, error: "Task is already running" });
    taskInfo.stopRequested = false;
    taskInfo.isSending     = true;
    taskInfo.resumedAt     = new Date().toISOString();
    updateTaskMetadata(taskId, { status: 'running', isSending: true, resumedAt: taskInfo.resumedAt });
    const logs = taskLogs.get(taskId) || [];
    logs.unshift({ type:"info", message:`[${new Date().toLocaleString()}] Task resumed`, timestamp:new Date() });
    taskLogs.set(taskId, logs);
    const loopFn = getLoopFunction(taskInfo.taskType);
    if (loopFn) loopFn(sessionId, taskId);
    res.json({ success: true, message: "Task resumed successfully" });
});

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     ADMIN ROUTES                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝

app.get("/api/admin/all-sessions", requireAdmin, (req, res) => {
    const allSessions = [];
    activeClients.forEach((clientInfo, sessionId) => {
        allSessions.push({
            sessionId,
            number:           clientInfo.number,
            isConnected:      clientInfo.isConnected,
            userId:           clientInfo.userId,
            username:         clientInfo.username,
            tasksCount:       clientInfo.tasks?.length || 0,
            activeTasksCount: clientInfo.tasks?.filter(t => t.isSending).length || 0,
            totalSent:        clientInfo.tasks?.reduce((s, t) => s + (t.sentMessages || 0), 0) || 0,
            lastActivity:     clientInfo.lastActivity,
            createdAt:        clientInfo.createdAt,
            createdAtFormatted: clientInfo.createdAt ? formatDate(clientInfo.createdAt) : null
        });
    });
    res.json(allSessions);
});

app.get("/api/admin/session-details", requireAdmin, (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId || !activeClients.has(sessionId)) return res.json({ error: "Invalid session" });
    const clientInfo  = activeClients.get(sessionId);
    const tasksStatus = clientInfo.tasks?.map(task => ({
        taskId:       task.taskId,
        target:       task.target,
        targetType:   task.targetType,
        taskType:     task.taskType || 'message',
        isSending:    task.isSending,
        sentMessages: task.sentMessages,
        totalMessages: task.totalMessages,
        currentIndex: task.currentMessageIndex || 0,
        startTime:    task.startTime,
        endTime:      task.endTime,
        createdAt:    task.createdAt,
        createdAtFormatted: task.createdAt ? formatDate(task.createdAt) : null
    })) || [];

    res.json({
        sessionId, isConnected: clientInfo.isConnected, number: clientInfo.number,
        userId: clientInfo.userId, username: clientInfo.username,
        tasks: tasksStatus, lastActivity: clientInfo.lastActivity, createdAt: clientInfo.createdAt
    });
});

app.get("/api/admin/task-logs", requireAdmin, (req, res) => {
    const { taskId } = req.query;
    if (!taskId || !taskLogs.has(taskId)) return res.json({ error: "Invalid task" });
    res.json({ logs: (taskLogs.get(taskId) || []).slice(0, 100) });
});

app.post("/api/admin/delete-session", requireAdmin, (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId || !activeClients.has(sessionId)) return res.json({ success: false, error: "Invalid session" });
    completeSessionCleanup(sessionId);
    res.json({ success: true, message: "Session permanently deleted" });
});

app.post("/api/admin/delete-task", requireAdmin, (req, res) => {
    const { sessionId, taskId } = req.body;
    if (!sessionId || !activeClients.has(sessionId)) return res.json({ success: false, error: "Invalid session" });
    completeTaskCleanup(sessionId, taskId);
    res.json({ success: true, message: "Task permanently deleted" });
});

// ─── ADMIN: LIST ALL USERS ─────────────────────────────────────────────

app.get("/api/admin/users", requireAdmin, (req, res) => {
    const users = loadUsers();
    const result = users.map(u => {
        const sessions = Array.from(activeClients.values()).filter(c => c.userId === u.userId);
        return {
            userId:         u.userId,
            username:       u.username,
            email:          u.email,
            createdAt:      u.createdAt,
            lastLogin:      u.lastLogin,
            activeSessions: sessions.filter(s => s.isConnected).length,
            totalSessions:  sessions.length,
            totalTasks:     sessions.reduce((s, c) => s + (c.tasks?.length || 0), 0),
            totalSent:      sessions.reduce((s, c) => s + (c.tasks?.reduce((a, t) => a + (t.sentMessages || 0), 0) || 0), 0)
        };
    });
    res.json({ success: true, users: result, total: result.length });
});

// ─── ADMIN: DELETE USER ────────────────────────────────────────────────

app.post("/api/admin/delete-user", requireAdmin, (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false, error: "User ID is required" });
    const users   = loadUsers();
    const userIdx = users.findIndex(u => u.userId === userId);
    if (userIdx === -1) return res.json({ success: false, error: "User not found" });

    // Cleanup all sessions belonging to this user
    activeClients.forEach((clientInfo, sessionId) => {
        if (clientInfo.userId === userId) completeSessionCleanup(sessionId);
    });

    users.splice(userIdx, 1);
    saveUsers(users);
    logSystem(`Admin deleted user: ${userId}`);
    res.json({ success: true, message: "User and all their sessions deleted" });
});

// ─── ADMIN: RESET USER PASSWORD ────────────────────────────────────────

app.post("/api/admin/reset-password", requireAdmin, (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.json({ success: false, error: "userId and newPassword are required" });
    if (newPassword.length < 6) return res.json({ success: false, error: "Password must be at least 6 characters" });
    const users = loadUsers();
    const user  = users.find(u => u.userId === userId);
    if (!user) return res.json({ success: false, error: "User not found" });
    user.password     = hashPassword(newPassword);
    user.sessionToken = generateSessionToken();  // invalidate existing session
    saveUsers(users);
    logSystem(`Admin reset password for user: ${user.username}`);
    res.json({ success: true, message: `Password reset for user: ${user.username}` });
});

// ─── ADMIN: SERVER-WIDE STATS ──────────────────────────────────────────

app.get("/api/admin/server-stats", requireAdmin, (req, res) => {
    const mem    = process.memoryUsage();
    const uptime = Date.now() - SERVER_START_TIME;
    const users  = loadUsers();

    let totalSessions    = 0, connectedSessions = 0;
    let totalTasks       = 0, runningTasks      = 0;
    let totalSent        = 0;

    activeClients.forEach(clientInfo => {
        totalSessions++;
        if (clientInfo.isConnected) connectedSessions++;
        const tasks = clientInfo.tasks || [];
        totalTasks += tasks.length;
        runningTasks += tasks.filter(t => t.isSending).length;
        totalSent    += tasks.reduce((s, t) => s + (t.sentMessages || 0), 0);
    });

    res.json({
        server: {
            uptime:      formatUptime(uptime),
            uptimeMs:    uptime,
            startedAt:   new Date(SERVER_START_TIME).toISOString(),
            memory:      formatBytes(mem.heapUsed),
            memoryTotal: formatBytes(mem.heapTotal),
            rss:         formatBytes(mem.rss),
            nodeVersion: process.version,
            platform:    process.platform,
            pid:         process.pid
        },
        users: {
            total:             users.length,
            withActiveSessions: Array.from(new Set(Array.from(activeClients.values()).map(c => c.userId))).length
        },
        sessions: {
            total:       totalSessions,
            connected:   connectedSessions,
            disconnected: totalSessions - connectedSessions
        },
        tasks: {
            total:   totalTasks,
            running: runningTasks,
            stopped: totalTasks - runningTasks,
            totalMessagesSent: totalSent
        },
        timestamp: new Date().toISOString()
    });
});

// ─── ADMIN: BROADCAST MESSAGE VIA ADMIN ────────────────────────────────
// Sends a message to ALL connected sessions — admin override

app.post("/api/admin/broadcast", requireAdmin, async (req, res) => {
    const { target, targetType, message } = req.body;
    if (!target || !targetType || !message) {
        return res.json({ success: false, error: "target, targetType and message are required" });
    }
    const recipient = targetType === "group"
        ? target + "@g.us"
        : target + "@s.whatsapp.net";

    const results = [];
    const sendPromises = [];

    activeClients.forEach((clientInfo, sessionId) => {
        if (!clientInfo.isConnected) {
            results.push({ sessionId, status: 'skipped', reason: 'not connected' });
            return;
        }
        sendPromises.push(
            clientInfo.client.sendMessage(recipient, { text: message })
                .then(() => results.push({ sessionId, status: 'sent' }))
                .catch(e => results.push({ sessionId, status: 'failed', error: e.message }))
        );
    });

    await Promise.allSettled(sendPromises);
    logSystem(`Admin broadcast to ${target}: ${results.filter(r => r.status === 'sent').length}/${results.length} sent`);
    res.json({ success: true, results, summary: {
        sent:    results.filter(r => r.status === 'sent').length,
        failed:  results.filter(r => r.status === 'failed').length,
        skipped: results.filter(r => r.status === 'skipped').length
    }});
});

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     GLOBAL ERROR HANDLING                             ║
// ╚══════════════════════════════════════════════════════════════════════╝

process.on('uncaughtException', (error) => {
    logError('UNCAUGHT EXCEPTION: ' + error.message, error.stack?.split('\n')[1]?.trim());
    savePersistentData();
});

process.on('unhandledRejection', (reason) => {
    logError('UNHANDLED REJECTION: ' + String(reason));
    savePersistentData();
});

process.on('SIGINT', () => {
    logWarning('Graceful shutdown initiated...');
    activeClients.forEach(clientInfo => {
        try { clientInfo.client?.end(); } catch {}
    });
    savePersistentData();
    setTimeout(() => {
        logSuccess('Server shutdown complete');
        process.exit(0);
    }, 5000);
});

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                     STARTUP                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Auto-recover sessions after 5s
setTimeout(() => {
    logSystem('Recovering previous sessions...');
    activeClients.forEach((clientInfo, sessionId) => {
        if (!clientInfo.isConnected && !manuallyDisconnectedSessions.has(sessionId)) {
            recoverSession(sessionId, clientInfo);
        }
    });
}, 5000);

process.on('unhandledRejection', (reason) => {
    logError(`Unhandled promise rejection: ${reason?.message || reason}`);
});

process.on('uncaughtException', (error) => {
    logError(`Uncaught exception: ${error?.stack || error?.message || error}`);
    // Do not force-exit here; allow the server to remain available for recoverable errors.
});

process.on('SIGTERM', () => {
    logInfo('SIGTERM received — shutting down gracefully...');
    for (const [sessionId, clientInfo] of activeClients.entries()) {
        try { clientInfo.client?.end(); } catch {}
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    logInfo('SIGINT received — shutting down gracefully...');
    for (const [sessionId, clientInfo] of activeClients.entries()) {
        try { clientInfo.client?.end(); } catch {}
    }
    process.exit(0);
});

app.listen(PORT, () => {
    printBanner();
    logSuccess(`Server running on http://localhost:${PORT}`, 'Accepting connections');
    logSystem(`Admin credentials: ${ADMIN_CREDENTIALS.username} / ${ADMIN_CREDENTIALS.password}`);
    logInfo('Features enabled:', [
        'Text   ✔', 'Image  ✔', 'Video  ✔', 'Document ✔', 'Voice Note ✔',
        'Bulk Send ✔', 'Pause/Resume ✔', 'Number Check ✔', 'Group Participants ✔',
        'User Profile ✔', 'Admin User Mgmt ✔', 'Admin Broadcast ✔',
        'Infinite Reconnect ✔', 'Key Cleanup ✔', 'Pair Code Timeout ✔'
    ].join(' | '));
});
