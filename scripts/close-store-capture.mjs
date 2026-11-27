import path from 'node:path';

// Called only after the PowerShell runner has checked the process and TCP owner.
const [portValue, pidValue, executable, profile] = process.argv.slice(2);
const port = Number(portValue);
const pid = Number(pidValue);
if (!Number.isInteger(port) || port < 1024 || port > 65535 ||
    !Number.isInteger(pid) || pid <= 0 ||
    !path.isAbsolute(executable ?? '') || !path.isAbsolute(profile ?? '')) {
  throw new Error('Expected the verified loopback inspector, executable, PID and fixture profile');
}

function scheduleOwnedQuit(input) {
  const { resolve } = process.getBuiltinModule('path');
  const normalized = value => resolve(value).toLowerCase();
  if (process.pid !== input.pid || process.windowsStore !== true ||
      normalized(process.execPath) !== normalized(input.executable) ||
      !process.argv.some(arg => arg.toLowerCase() === `--user-data-dir=${input.profile}`.toLowerCase())) {
    return false;
  }
  const { createRequire } = process.getBuiltinModule('module');
  const { app } = createRequire(process.resourcesPath + '/app.asar/package.json')('electron');
  if (normalized(app.getPath('userData')) !== normalized(input.profile)) return false;
  setTimeout(() => app.quit(), 750);
  return true;
}

async function closeCapture() {
  const origin = `127.0.0.1:${port}`;
  const response = await fetch(`http://${origin}/json/list`, {
    redirect: 'error', signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error('The verified inspector did not provide a target list');
  const targets = (await response.json()).filter(row => row.type === 'node');
  if (targets.length !== 1) throw new Error('Expected one inspector target');
  const address = new URL(targets[0].webSocketDebuggerUrl);
  if (address.origin !== `ws://${origin}` || !/^\/[0-9a-f-]{36}$/i.test(address.pathname) ||
      address.username || address.password || address.hash || address.search) {
    throw new Error('Inspector target is outside the verified loopback endpoint');
  }

  const socket = new WebSocket(address);
  const input = JSON.stringify({ pid, executable, profile });
  try {
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => finish(new Error('Timed out waiting for app.quit() acknowledgement')), 5_000);
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        expression: `(${scheduleOwnedQuit.toString()})(${input})`, returnByValue: true,
      } })), { once: true });
      socket.addEventListener('message', event => {
        const reply = JSON.parse(String(event.data));
        if (reply.id !== 1) return;
        if (reply.result?.result?.value !== true || reply.result?.exceptionDetails) {
          finish(new Error('The verified package process did not acknowledge app.quit()'));
        } else {
          finish();
        }
      });
      socket.addEventListener('error', () => finish(new Error('Inspector connection failed')), { once: true });
      socket.addEventListener('close', () => finish(new Error('Inspector closed before acknowledgement')), { once: true });
    });
  } finally {
    socket.close();
  }
}

closeCapture().catch(error => { console.error(error.message); process.exitCode = 1; });
