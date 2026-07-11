const path = require('path');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const db = require('./db');
const { handleMessage } = require('../controllers/messageEngine');

const clients = {};
const qrCodes = {};
const reconnectTimers = {};
const reconnectAttempts = {};
const manualDisconnect = new Set();

const sessionsDir = path.join(__dirname, '..', 'sessions');
const unhealthyStreaks = {};
const readyAt = {};
const HEARTBEAT_INTERVAL = 15 * 60 * 1000;
let heartbeatTimer = null;

const MAX_RETRIES = 12;
const BASE_DELAY = 20000;
const MAX_DELAY = 5 * 60 * 1000;

function forceKillBrowser(client) {
  try {
    const browser = client && client.pupBrowser;
    const proc = browser && typeof browser.process === 'function' ? browser.process() : null;
    if (proc && typeof proc.kill === 'function') {
      const signal = process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL';
      try {
        proc.kill(signal);
      } catch (killErr) {
        try {
          proc.kill();
        } catch (killErr2) {
          // ignore
        }
      }
    }
  } catch (err) {
    // ignore
  }
}

async function removeSessionDir(sessionPath, accountId) {
  try {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  } catch (err) {
    if (err && err.code === 'EBUSY') {
      console.warn(`Session dir for account ${accountId} is busy, retrying removal...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        return;
      } catch (err2) {
        err = err2;
      }
    }
    console.error(`Failed to remove session dir for account ${accountId}:`, err && err.message);
  }
}

process.on('unhandledRejection', (reason) => {
  const message = reason && reason.message ? reason.message : reason;
  console.error('Unhandled promise rejection (ignored to keep bot alive):', message);
});

process.on('uncaughtException', (err) => {
  const message = err && err.message ? err.message : err;
  console.error('Uncaught exception (logging; exiting so PM2 can restart):', message);
  process.exit(1);
});

function scheduleReconnect(account) {
  const accountId = String(account.id);

  if (manualDisconnect.has(accountId)) {
    return;
  }

  const attempt = reconnectAttempts[accountId] || 0;
  if (attempt >= MAX_RETRIES) {
    console.error(`Max reconnect attempts reached for account ${accountId}. Stopping auto-reconnect.`);
    return;
  }

  const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
  reconnectAttempts[accountId] = attempt + 1;

  console.log(`Scheduling reconnect for account ${accountId} in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);

  clearTimeout(reconnectTimers[accountId]);
  reconnectTimers[accountId] = setTimeout(() => {
    if (manualDisconnect.has(accountId)) {
      return;
    }
    createClient(account);
  }, delay);
}

function createClient(account) {
  const accountId = String(account.id);
  const st = { replacing: false, manual: false };

  clearTimeout(reconnectTimers[accountId]);
  manualDisconnect.delete(accountId);
  reconnectAttempts[accountId] = 0;
  delete unhealthyStreaks[accountId];
  delete readyAt[accountId];

  const existing = clients[accountId];
  if (existing) {
    if (existing._st) {
      existing._st.replacing = true;
    }
    try {
      existing.destroy();
    } catch (err) {
      console.error(`Error destroying previous client ${accountId}:`, err && err.message);
    }
    delete clients[accountId];
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'account_' + accountId,
      dataPath: './sessions',
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });

  client._st = st;

  client.on('qr', (qr) => {
    qrCodes[accountId] = qr;
  });

  client.on('authenticated', () => {
    delete qrCodes[accountId];
  });

  client.on('ready', () => {
    delete qrCodes[accountId];
    reconnectAttempts[accountId] = 0;
    readyAt[accountId] = Date.now();
    db.run(
      `UPDATE accounts SET status = 'connected' WHERE id = ?`,
      [accountId]
    );
  });

  client.on('auth_failure', (msg) => {
    console.error(`Auth failure for account ${accountId}:`, msg);
    scheduleReconnect(account);
  });

  client.on('disconnected', () => {
    db.run(
      `UPDATE accounts SET status = 'disconnected' WHERE id = ?`,
      [accountId]
    );

    if (client._st.replacing || client._st.manual || manualDisconnect.has(accountId)) {
      return;
    }

    scheduleReconnect(account);
  });

  client.on('error', (err) => {
    console.error(`Client error for account ${accountId}:`, err && err.message);
  });

  client.on('message', function (msg) {
    handleMessage(accountId, msg.from, msg.body, client);
  });

  clients[accountId] = client;

  client.initialize().catch((err) => {
    console.error(`Initialize failed for account ${accountId}:`, err && err.message);
    forceKillBrowser(client);
    scheduleReconnect(account);
  });
}

function destroyClient(accountId) {
  accountId = String(accountId);

  clearTimeout(reconnectTimers[accountId]);
  delete reconnectTimers[accountId];
  delete reconnectAttempts[accountId];
  delete unhealthyStreaks[accountId];
  delete readyAt[accountId];

  manualDisconnect.add(accountId);

  const client = clients[accountId];
  if (client) {
    try {
      client.destroy();
    } catch (err) {
      console.error(`Error destroying client ${accountId}:`, err && err.message);
    }
    forceKillBrowser(client);
  }

  delete clients[accountId];
  delete qrCodes[accountId];
}

function cleanupOrphanSessions() {
  fs.readdir(sessionsDir, (err, entries) => {
    if (err) {
      return;
    }

    const folders = (entries || []).filter((name) => /^session-account_\d+$/.test(name));
    if (folders.length === 0) {
      return;
    }

    db.all(`SELECT id FROM accounts`, (dbErr, rows) => {
      const validIds = new Set((rows || []).map((row) => String(row.id)));

      folders.forEach((name) => {
        const id = name.replace('session-account_', '');
        if (!validIds.has(id)) {
          const dirPath = path.join(sessionsDir, name);
          fs.rm(dirPath, { recursive: true, force: true }, (rmErr) => {
            if (rmErr) {
              console.error(`Failed to remove orphan session ${name}:`, rmErr && rmErr.message);
            } else {
              console.log(`Removed orphan session ${name}`);
            }
          });
        }
      });
    });
  });
}

function destroyAllClients() {
  Object.keys(clients).forEach((accountId) => {
    destroyClient(accountId);
  });
}

async function logoutAndCleanup(accountId) {
  accountId = String(accountId);

  manualDisconnect.add(accountId);
  clearTimeout(reconnectTimers[accountId]);
  delete reconnectTimers[accountId];
  delete reconnectAttempts[accountId];

  const client = clients[accountId];
  if (client) {
    try {
      await client.logout();
    } catch (err) {
      console.error(`logout() failed for account ${accountId}:`, err && err.message);
    }
    forceKillBrowser(client);
    delete clients[accountId];
  }
  delete qrCodes[accountId];

  const sessionPath = path.join(sessionsDir, `session-account_${accountId}`);
  await removeSessionDir(sessionPath, accountId);
}

function setupGracefulShutdown() {
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    destroyAllClients();
    setTimeout(() => process.exit(0), 2500).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function checkClientHealth(accountId) {
  const client = clients[accountId];
  if (!client || manualDisconnect.has(accountId)) {
    return;
  }

  if (!readyAt[accountId]) {
    unhealthyStreaks[accountId] = 0;
    return;
  }

  let healthy = false;
  try {
    const state = await Promise.race([
      client.getState(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health check timeout')), 15000)),
    ]);
    healthy = state === 'CONNECTED';
  } catch (err) {
    healthy = false;
  }

  if (healthy) {
    unhealthyStreaks[accountId] = 0;
    return;
  }

  unhealthyStreaks[accountId] = (unhealthyStreaks[accountId] || 0) + 1;
  if (unhealthyStreaks[accountId] < 2) {
    return;
  }

  console.warn(`Heartbeat: account ${accountId} unhealthy for 2 consecutive checks, recreating client.`);
  unhealthyStreaks[accountId] = 0;

  db.get(`SELECT * FROM accounts WHERE id = ?`, [accountId], (err, account) => {
    if (!err && account) {
      destroyClient(accountId);
      createClient(account);
    }
  });
}

function startHeartbeat() {
  if (heartbeatTimer) {
    return;
  }
  heartbeatTimer = setInterval(() => {
    Object.keys(clients).forEach((id) => {
      checkClientHealth(id).catch((err) => {
        console.error(`Heartbeat error for account ${id}:`, err && err.message);
      });
    });
  }, HEARTBEAT_INTERVAL);
  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }
}

module.exports = {
  clients,
  qrCodes,
  createClient,
  destroyClient,
  destroyAllClients,
  logoutAndCleanup,
  cleanupOrphanSessions,
  startHeartbeat,
  manualDisconnect,
  setupGracefulShutdown,
};
