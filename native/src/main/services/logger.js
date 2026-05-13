/**
 * LastBrowser — Logger Service
 * Structured logging with levels, channels, and file output.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.lastbrowser', 'logs');
const LOG_FILE = path.join(LOG_DIR, `lastbrowser-${new Date().toISOString().slice(0, 10)}.log`);

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const COLORS = {
  DEBUG: '\x1b[90m',  // gray
  INFO: '\x1b[36m',   // cyan
  WARN: '\x1b[33m',   // yellow
  ERROR: '\x1b[31m',  // red
  RESET: '\x1b[0m',
};
let _minLevel = LEVELS.INFO;
let _channelFilters = null;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function _formatTimestamp() {
  return new Date().toISOString();
}

function _writeToFile(line) {
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch (_) {}
}

function _log(level, channel, message, data) {
  if (LEVELS[level] < _minLevel) return;
  if (_channelFilters && !_channelFilters.includes(channel)) return;

  const timestamp = _formatTimestamp();
  const dataStr = data ? ' ' + JSON.stringify(data) : '';
  const line = `[${timestamp}] [${level}] [${channel}] ${message}${dataStr}`;

  // Console output with color
  const color = COLORS[level] || '';
  const reset = COLORS.RESET || '';
  console.log(`${color}${line}${reset}`);

  // File output (no color)
  _writeToFile(line);
}

const logger = {
  debug: (channel, message, data) => _log('DEBUG', channel, message, data),
  info: (channel, message, data) => _log('INFO', channel, message, data),
  warn: (channel, message, data) => _log('WARN', channel, message, data),
  error: (channel, message, data) => _log('ERROR', channel, message, data),

  setLevel: (level) => { _minLevel = LEVELS[level] || LEVELS.INFO; },
  setChannelFilter: (channels) => { _channelFilters = channels; },
  clearChannelFilter: () => { _channelFilters = null; },
  getLogFile: () => LOG_FILE,
  getLogDir: () => LOG_DIR,
};

module.exports = logger;
