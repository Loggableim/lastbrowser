import { ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { app } from 'electron';

export type ServiceLayout = {
  resourcesDir: string;
  runtimeDir: string;
  sidekickDir: string;
  webuiDir: string;
  webuiServer: string;
  /** 'monorepo' = uvicorn cli.web_server:app, 'legacy' = stdlib web/server.py */
  webuiMode: 'monorepo' | 'legacy';
  pythonExe: string;
  bridgeToken: string;
};

export type ServiceStatus = {
  sidekick: 'starting' | 'ready' | 'stopped' | 'missing' | 'error';
  webuiHealth: 'unknown' | 'checking' | 'ready' | 'unreachable';
  webuiUrl: string;
  port: number | null;
  runtimeDir: string;
  lastError: string | null;
  /** Where the running Sidekick code came from. */
  source: 'bundled' | 'runtime';
  version: string | null;
};

export type PortResolver = (preferredPort: number) => Promise<number>;
export type WebuiHealthChecker = (webuiUrl: string) => Promise<{ ok: boolean; error?: string }>;

/**
 * Where an updated Sidekick copy lives after a runtime update. The updater
 * downloads the live monorepo here; if present it takes precedence over the
 * bundled copy so Sidekick can be updated without a Lastbrowser release.
 */
export function runtimeSidekickDir(runtimeRoot = defaultRuntimeRoot()): string {
  return path.join(runtimeRoot, 'runtime', 'sidekick');
}

export type SidecarLaunch = {
  args: string[];
  cwd: string;
};

/**
 * Read the Sidekick version from a bundled/updated copy. The live monorepo
 * writes `web/api/_version.py` (baked at sync time); older copies have no
 * version file, so fall back to the sync manifest or null.
 */
export function readSidekickVersion(sidekickDir: string): string | null {
  const versionFile = path.join(sidekickDir, 'web', 'api', '_version.py');
  try {
    const raw = readFileSync(versionFile, 'utf8');
    const match = raw.match(/__version__\s*=\s*['"]([^'"]+)['"]/);
    if (match) return match[1];
  } catch {
    // No version file — fall through.
  }
  const manifest = path.join(path.dirname(sidekickDir), 'sidekick-source.json');
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string };
    if (parsed.version) return parsed.version;
  } catch {
    // No manifest either.
  }
  return null;
}

/**
 * Build the sidecar launch command.
 *
 * monorepo: the live Sidekick layout — `python -m uvicorn cli.web_server:app`
 *           run from the sidekick directory (package imports need that cwd).
 * legacy:   the older split layout — `python <webui>/server.py`.
 */
export function buildSidecarLaunch(layout: ServiceLayout, webuiPort: number): SidecarLaunch {
  if (layout.webuiMode === 'monorepo') {
    return {
      args: ['-m', 'uvicorn', 'cli.web_server:app', '--host', '127.0.0.1', '--port', String(webuiPort)],
      cwd: layout.sidekickDir
    };
  }
  return {
    args: [layout.webuiServer],
    cwd: layout.webuiDir
  };
}

export function resolveServiceLayout(
  resourcesDir: string,
  runtimeRoot = defaultRuntimeRoot(),
  env: Partial<Record<'LASTBROWSER_WEBUI_PYTHON' | 'HERMES_WEBUI_PYTHON', string>> = process.env
): ServiceLayout {
  const normalizedResources = path.normalize(resourcesDir);
  const runtimeDir = path.join(runtimeRoot, 'runtime');
  const servicesDir = path.join(normalizedResources, 'services');
  const bundledSidekickDir = path.join(servicesDir, 'sidekick');
  const webuiDir = path.join(servicesDir, 'webui');
  const resourcesPythonExe = path.join(normalizedResources, 'runtime', 'python', 'python.exe');
  const workspacePythonExe = path.join(normalizedResources, 'apps', 'desktop', 'runtime', 'python', 'python.exe');
  const bundledPythonExe = existsSync(resourcesPythonExe)
    ? resourcesPythonExe
    : existsSync(workspacePythonExe)
      ? workspacePythonExe
      : resourcesPythonExe;

  // Prefer a runtime-updated Sidekick copy over the bundled one. The runtime
  // copy is the live monorepo (FastAPI entrypoint); the bundled copy may be
  // either the monorepo or the older split layout.
  const updatedDir = runtimeSidekickDir(runtimeRoot);
  const updatedEntry = path.join(updatedDir, 'cli', 'web_server.py');
  const bundledEntry = path.join(bundledSidekickDir, 'cli', 'web_server.py');
  const useUpdated = existsSync(updatedEntry);
  const sidekickDir = useUpdated ? updatedDir : bundledSidekickDir;
  const monorepoEntry = useUpdated ? updatedEntry : bundledEntry;
  const webuiMode: 'monorepo' | 'legacy' = existsSync(monorepoEntry) ? 'monorepo' : 'legacy';

  return {
    resourcesDir: normalizedResources,
    runtimeDir,
    sidekickDir,
    webuiDir,
    // In monorepo mode the server is launched as `uvicorn cli.web_server:app`
    // from sidekickDir; webuiServer then points at that entry file.
    webuiServer: webuiMode === 'monorepo' ? monorepoEntry : path.join(webuiDir, 'server.py'),
    webuiMode,
    pythonExe: env.LASTBROWSER_WEBUI_PYTHON || env.HERMES_WEBUI_PYTHON || bundledPythonExe,
    bridgeToken: randomBytes(24).toString('hex')
  };
}

export function buildSidecarEnvironment(layout: ServiceLayout, webuiPort: number): NodeJS.ProcessEnv {
  const webuiPortValue = String(webuiPort);
  const webuiBaseUrl = `http://127.0.0.1:${webuiPortValue}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LASTBROWSER_HOME: layout.runtimeDir,
    LASTBROWSER_WEBUI_AGENT_DIR: layout.sidekickDir,
    LASTBROWSER_WEBUI_STATE_DIR: path.join(layout.runtimeDir, 'webui'),
    LASTBROWSER_WEBUI_PORT: webuiPortValue,
    LASTBROWSER_WEBUI_URL: webuiBaseUrl,
    LASTBROWSER_WEBUI_PYTHON: layout.pythonExe,
    LASTBROWSER_BRIDGE_TOKEN: layout.bridgeToken,
    SIDEKICK_HOME: layout.runtimeDir,
    SIDEKICK_AGENT_DIR: layout.sidekickDir,
    SIDEKICK_BRIDGE_TOKEN: layout.bridgeToken,
    // The live monorepo resolves its agent dir via SIDEKICK_WEBUI_AGENT_DIR,
    // its state dir via SIDEKICK_WEBUI_STATE_DIR, and its port via
    // SIDEKICK_WEBUI_PORT. Without these the WebUI falls back to defaults and
    // writes state (settings, auth, sessions) to the wrong directory.
    SIDEKICK_WEBUI_AGENT_DIR: layout.sidekickDir,
    SIDEKICK_WEBUI_STATE_DIR: path.join(layout.runtimeDir, 'webui'),
    SIDEKICK_WEBUI_PYTHON: layout.pythonExe,
    SIDEKICK_WEBUI_PORT: webuiPortValue,
    SIDEKICK_WEBUI_NO_BROWSER: '1',
    SIDEKICK_STATE_DIR: path.join(layout.runtimeDir, 'webui'),
    HERMES_HOME: layout.runtimeDir,
    HERMES_WEBUI_AGENT_DIR: layout.sidekickDir,
    HERMES_WEBUI_STATE_DIR: path.join(layout.runtimeDir, 'webui'),
    HERMES_WEBUI_PORT: webuiPortValue,
    HERMES_WEBUI_BROWSER_BASE_URL: webuiBaseUrl,
    HERMES_WEBUI_PYTHON: layout.pythonExe,
    HERMES_PYTHON: layout.pythonExe,
    HERMES_WEBUI_NO_BROWSER: '1'
  };
  return env;
}

export async function isPortAvailable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export async function findAvailablePort(preferredPort: number, host = '127.0.0.1', attempts = 50): Promise<number> {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = preferredPort + offset;
    if (await isPortAvailable(port, host)) return port;
  }
  throw new Error(`No free local WebUI port found from ${preferredPort} to ${preferredPort + attempts - 1}.`);
}

export async function checkWebuiHealth(webuiUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(new URL('/api/onboarding/status', webuiUrl));
    // 401/403 still prove the server is up and routing — the newer FastAPI
    // WebUI protects this endpoint with auth, so treating those as failure
    // would leave the sidecar permanently "unreachable".
    if (response.status === 401 || response.status === 403) {
      await response.arrayBuffer();
      return { ok: true };
    }
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    await response.arrayBuffer();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export class SidecarServices {
  private webuiProcess: ChildProcess | null = null;
  private startPromise: Promise<ServiceStatus> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private status: ServiceStatus;

  constructor(
    private readonly layout: ServiceLayout,
    private readonly preferredWebuiPort = 8787,
    private readonly spawnImpl = spawn,
    private readonly portResolver: PortResolver = findAvailablePort,
    private readonly healthChecker: WebuiHealthChecker = checkWebuiHealth
  ) {
    this.status = {
      sidekick: 'stopped',
      webuiHealth: 'unknown',
      webuiUrl: '',
      port: null,
      lastError: null,
      runtimeDir: this.layout.runtimeDir,
      source: this.layout.sidekickDir.includes(`${path.sep}runtime${path.sep}`) ? 'runtime' : 'bundled',
      version: readSidekickVersion(this.layout.sidekickDir)
    };
  }

  getStatus(): ServiceStatus {
    return { ...this.status };
  }

  start(): Promise<ServiceStatus> {
    if (this.webuiProcess) return Promise.resolve(this.getStatus());
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startInternal(): Promise<ServiceStatus> {
    this.status = { ...this.status, sidekick: 'starting' };

    let webuiPort: number;
    try {
      webuiPort = await this.portResolver(this.preferredWebuiPort);
    } catch (error) {
      this.status = {
        ...this.status,
        sidekick: 'error',
        webuiHealth: 'unreachable',
        lastError: error instanceof Error ? error.message : String(error)
      };
      return this.getStatus();
    }

    const webuiUrl = `http://127.0.0.1:${webuiPort}`;
    const env = buildSidecarEnvironment(this.layout, webuiPort);
    this.status = { ...this.status, webuiUrl, port: webuiPort, webuiHealth: 'checking', lastError: null };

    try {
      const launch = buildSidecarLaunch(this.layout, webuiPort);
      this.webuiProcess = this.spawnImpl(
        this.layout.pythonExe,
        launch.args,
        {
          cwd: launch.cwd,
          env,
          windowsHide: true,
          stdio: 'ignore'
        }
      );
    } catch (error) {
      this.status = {
        ...this.status,
        sidekick: 'error',
        webuiHealth: 'unreachable',
        lastError: error instanceof Error ? error.message : String(error)
      };
      this.webuiProcess = null;
      return this.getStatus();
    }

    this.webuiProcess.once('spawn', () => {
      this.status = { ...this.status, sidekick: 'ready', webuiHealth: 'checking', lastError: null };
      this.startHealthLoop();
    });
    this.webuiProcess.once('error', (error) => {
      this.stopHealthLoop();
      this.status = {
        ...this.status,
        sidekick: 'error',
        webuiHealth: 'unreachable',
        lastError: error.message
      };
      this.webuiProcess = null;
    });
    this.webuiProcess.once('exit', (code, signal) => {
      this.stopHealthLoop();
      this.webuiProcess = null;
      const wasRunning = this.status.sidekick === 'ready';
      this.status = {
        ...this.status,
        sidekick: 'stopped',
        webuiHealth: 'unreachable',
        lastError: `Sidekick service stopped (code=${code}, signal=${signal}).`
      };
      // Auto-restart if the process crashed (not a clean stop)
      if (wasRunning && code !== 0 && code !== null) {
        console.warn(`[lastbrowser] WebUI process crashed (code=${code}), restarting in 2s...`);
        setTimeout(() => {
          if (!this.webuiProcess) {
            void this.start();
          }
        }, 2000);
      }
    });
    return this.getStatus();
  }

  private startHealthLoop(): void {
    this.stopHealthLoop();
    void this.refreshHealth();
    this.healthTimer = setInterval(() => {
      void this.refreshHealth();
    }, 1500);
    this.healthTimer.unref?.();
  }

  private stopHealthLoop(): void {
    if (!this.healthTimer) return;
    clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  private async refreshHealth(): Promise<void> {
    const webuiUrl = this.status.webuiUrl;
    if (!webuiUrl || this.status.sidekick !== 'ready') return;

    const result = await this.healthChecker(webuiUrl);
    if (result.ok) {
      this.status = { ...this.status, webuiHealth: 'ready', lastError: null };
      return;
    }

    this.status = {
      ...this.status,
      webuiHealth: this.status.webuiHealth === 'ready' ? 'ready' : 'checking',
      lastError: result.error || 'Waiting for Sidekick WebUI.'
    };
  }

  stop(): void {
    this.startPromise = null;
    this.stopHealthLoop();
    if (!this.webuiProcess) {
      this.status = { ...this.status, sidekick: 'stopped' };
      return;
    }
    this.webuiProcess.kill();
    this.webuiProcess = null;
    this.status = { ...this.status, sidekick: 'stopped' };
  }
}

export function appResourcesDir(): string {
  if (app.isPackaged) return process.resourcesPath;
  return findDevelopmentResourcesDir(app.getAppPath(), process.cwd());
}

export function findDevelopmentResourcesDir(appPath: string, cwd = process.cwd()): string {
  const candidates = [
    path.resolve(appPath, '..', '..'),
    path.resolve(appPath, '..', '..', '..', '..'),
    path.resolve(cwd, '..', '..'),
    path.resolve(cwd)
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'services', 'webui', 'server.py'))) {
      return candidate;
    }
  }

  return candidates[0];
}

function defaultRuntimeRoot(): string {
  try {
    return app.getPath('userData');
  } catch {
    return path.join(process.env.APPDATA || process.cwd(), 'Lastbrowser');
  }
}
