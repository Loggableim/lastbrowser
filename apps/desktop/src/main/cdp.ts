export const DEFAULT_CDP_PORT = 9222;

export function resolveCdpPort(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): number {
  const envPort = env.LASTBROWSER_CDP_PORT || env.CDP_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  const arg = argv.find((a) => a.startsWith('--remote-debugging-port='));
  if (arg) {
    const parsed = parseInt(arg.split('=')[1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_CDP_PORT;
}

export function formatCdpUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
