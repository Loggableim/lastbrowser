import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statfs } from 'node:fs/promises';
import type { HardwareReport, LocalModel } from './local-ai-contract.js';
const execute = promisify(execFile);
export async function scanLocalHardware(storagePath: string): Promise<HardwareReport> {
  const report: HardwareReport = {
    platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model || 'Unbekannt',
    cores: os.availableParallelism(), ramBytes: os.totalmem(), availableRamBytes: os.freemem(),
    freeDiskBytes: null, gpus: [], warnings: []
  };
  const probes = await Promise.allSettled([
    statfs(storagePath),
    process.platform === 'win32' ? execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion | ConvertTo-Json -Compress'], { timeout: 8000, windowsHide: true }) : Promise.resolve(null),
    execute('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], { timeout: 3000, windowsHide: true })
  ]);
  if (probes[0].status === 'fulfilled') report.freeDiskBytes = Number(probes[0].value.bavail) * Number(probes[0].value.bsize);
  else report.warnings.push('Freier Festplattenspeicher konnte nicht ermittelt werden.');
  if (probes[1].status === 'fulfilled' && probes[1].value) {
    try {
      const values = JSON.parse(probes[1].value.stdout || '[]');
      report.gpus = (Array.isArray(values) ? values : [values]).filter(Boolean).map((value) => ({ name: String(value.Name), driver: String(value.DriverVersion || ''), vramBytes: null, source: 'Windows CIM' }));
    } catch { report.warnings.push('GPU-Daten konnten nicht ausgewertet werden.'); }
  }
  if (probes[2].status === 'fulfilled') {
    const nvidia = probes[2].value.stdout.trim().split(/\r?\n/).map((line) => {
      const [name, memory, driver] = line.split(',').map((part) => part.trim());
      return { name, driver, vramBytes: Number.isFinite(Number(memory)) ? Number(memory) * 1024 ** 2 : null, source: 'nvidia-smi' };
    }).filter((gpu) => gpu.name);
    report.gpus = [...report.gpus.filter((gpu) => !/nvidia/i.test(gpu.name)), ...nvidia];
  }
  if (!report.gpus.length) report.warnings.push('Keine GPU ermittelt. CPU-Betrieb wird angeboten.');
  return report;
}
export function assessModel(model: LocalModel, hardware: HardwareReport): { usable: boolean; reason: string } {
  if (hardware.platform !== 'win32' || hardware.arch !== 'x64') return { usable: false, reason: 'Die gebündelte Runtime benötigt Windows x64.' };
  if (hardware.freeDiskBytes === null) return { usable: false, reason: 'Freien Speicher vor dem Download erneut prüfen.' };
  if (hardware.freeDiskBytes < model.bytes + 512 * 1024 ** 2) return { usable: false, reason: 'Nicht genügend freier Festplattenspeicher.' };
  if (hardware.availableRamBytes < model.estimatedRamBytes + 1024 ** 3) return { usable: false, reason: 'Zu wenig freier RAM mit Reserve für Browser und Betriebssystem.' };
  return { usable: true, reason: 'CPU-Kandidat mit Speicherreserve; Geschwindigkeit und Tool Calling werden erst gemessen.' };
}
