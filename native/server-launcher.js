/**
 * LastBrowser — Python Server Launcher
 *
 * Spawns the LastBrowser WebUI Python backend as a child process,
 * monitors its health, and provides a graceful shutdown.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const net = require('net');

// ── State ──────────────────────────────────────────────────────────────────
let serverProcess = null;
let serverUrl = null;
const SERVER_PORT = 8787;  // default; could be dynamic via env
const HOST = '127.0.0.1';
const MAX_BOOT_WAIT_MS = 30000;  // 30s timeout for server boot
const HEALTH_CHECK_INTERVAL = 300;  // ms between health checks

// ── Helpers ────────────────────────────────────────────────────────────────
function findPython() {
  // Try common Python paths on Windows
  const candidates = [
    'python',
    'python3',
    'C:\\Python314\\python.exe',
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
  ];

  // Allow override via env var (new + legacy HERMES_PYTHON for backward compat)
  if (process.env.LASTBROWSER_PYTHON) {
    return process.env.LASTBROWSER_PYTHON;
  }
  if (process.env.HERMES_PYTHON) {
    return process.env.HERMES_PYTHON;
  }

  // On dev, try the one from start-windows.bat
  if (process.env.ELECTRON_DEV) {
    const devPython = 'C:\\Python314\\python.exe';
    const fs = require('fs');
    if (fs.existsSync(devPython)) return devPython;
  }

  return 'python'; // fallback to PATH
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1000);
    sock.on('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(port, host);
  });
}

function waitForServer(host, port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      const open = await isPortOpen(host, port);
      if (open) return resolve(true);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Server did not start within ${timeoutMs}ms`));
      }
      setTimeout(poll, HEALTH_CHECK_INTERVAL);
    };
    poll();
  });
}

// ── Public API ─────────────────────────────────────────────────────────────
async function spawnServer(webuiDir, devMode) {
  if (serverProcess) {
    console.log('[lastbrowser] Server already running');
    return true;
  }

  const python = findPython();
  const serverScript = path.join(webuiDir, 'server.py');
  const env = {
    ...process.env,
    LASTBROWSER_PORT: String(SERVER_PORT),
    LASTBROWSER_HOST: HOST,
    LASTBROWSER_STATE_DIR: process.env.LASTBROWSER_STATE_DIR || process.env.HERMES_WEBUI_STATE_DIR || path.join(
      process.env.APPDATA || path.join(require('os').homedir(), '.lastbrowser'),
      'webui'
    ),
    // Legacy backward compat
    HERMES_WEBUI_PORT: String(SERVER_PORT),
    HERMES_WEBUI_HOST: HOST,
    HERMES_WEBUI_STATE_DIR: process.env.HERMES_WEBUI_STATE_DIR || process.env.LASTBROWSER_STATE_DIR || path.join(
      process.env.APPDATA || path.join(require('os').homedir(), '.lastbrowser'),
      'webui'
    ),
  };

  console.log(`[lastbrowser] Starting WebUI server...`);
  console.log(`[lastbrowser]   Python: ${python}`);
  console.log(`[lastbrowser]   Script: ${serverScript}`);
  console.log(`[lastbrowser]   Port:   ${SERVER_PORT}`);
  console.log(`[lastbrowser]   CWD:    ${webuiDir}`);

  try {
    serverProcess = spawn(python, [serverScript], {
      cwd: webuiDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    serverProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(`[webui] ${text}`);
    });

    serverProcess.stderr.on('data', (data) => {
      process.stderr.write(`[webui:err] ${data.toString()}`);
    });

    serverProcess.on('error', (err) => {
      console.error(`[lastbrowser] Failed to start server: ${err.message}`);
      serverProcess = null;
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`[lastbrowser] Server exited (code=${code}, signal=${signal})`);
      serverProcess = null;
      serverUrl = null;
    });

    // Wait for the server to bind the port
    await waitForServer(HOST, SERVER_PORT, MAX_BOOT_WAIT_MS);
    serverUrl = `http://${HOST}:${SERVER_PORT}`;
    console.log(`[lastbrowser] WebUI ready at ${serverUrl}`);
    return true;

  } catch (err) {
    console.error(`[lastbrowser] Server startup failed: ${err.message}`);
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
    return false;
  }
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve(false);
      return;
    }

    console.log('[lastbrowser] Stopping WebUI server...');

    // Graceful shutdown: send SIGTERM (or Ctrl+C on Windows)
    serverProcess.on('exit', () => {
      serverProcess = null;
      serverUrl = null;
      console.log('[lastbrowser] Server stopped');
      resolve(true);
    });

    // Give it 5s to shutdown gracefully
    const forceKillTimer = setTimeout(() => {
      if (serverProcess) {
        console.log('[lastbrowser] Force killing server...');
        serverProcess.kill('SIGKILL');
        serverProcess = null;
        serverUrl = null;
        resolve(true);
      }
    }, 5000);

    serverProcess.on('exit', () => clearTimeout(forceKillTimer));

    // On Windows, spawn('taskkill') is more reliable than signals
    if (process.platform === 'win32' && serverProcess.pid) {
      const { execSync } = require('child_process');
      try {
        execSync(`taskkill /PID ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
      } catch (_) {
        // Already dead or access denied — fallback
        serverProcess.kill('SIGTERM');
      }
    } else {
      serverProcess.kill('SIGTERM');
    }
  });
}

function getServerUrl() {
  return serverUrl;
}

function isServerRunning() {
  return serverProcess !== null && !serverProcess.killed;
}

module.exports = { spawnServer, stopServer, getServerUrl, isServerRunning };
