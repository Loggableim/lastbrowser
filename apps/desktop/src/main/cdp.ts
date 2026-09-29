export const DEFAULT_CDP_PORT = 9222;
let persistedCdpEnabled: boolean | undefined;

/** Install the validated, user-owned preference loaded before Electron startup. */
export function setPersistedCdpEnabled(enabled: boolean | undefined): void {
  persistedCdpEnabled = enabled;
}

function parsePort(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : null;
}

function explicitCommandLinePort(argv: string[]): number | null {
  const arg = argv.find((value) => value.startsWith('--remote-debugging-port='));
  return arg ? parsePort(arg.slice('--remote-debugging-port='.length)) : null;
}

/** CDP grants browser-level control and is off unless explicitly requested. */
export function isCdpEnabled(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
  persistedEnabled: boolean | undefined = persistedCdpEnabled
): boolean {
  if (env.LASTBROWSER_ENABLE_CDP === '1' || env.LASTBROWSER_ENABLE_CDP?.toLowerCase() === 'true') {
    return true;
  }
  return persistedEnabled === true || Boolean(
    parsePort(env.LASTBROWSER_CDP_PORT) ||
      parsePort(env.CDP_PORT) ||
      explicitCommandLinePort(argv)
  );
}

export function resolveCdpPort(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): number {
  const envPort = parsePort(env.LASTBROWSER_CDP_PORT) || parsePort(env.CDP_PORT);
  if (envPort) return envPort;
  const argPort = explicitCommandLinePort(argv);
  if (argPort) return argPort;
  return DEFAULT_CDP_PORT;
}

export function formatCdpUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
