/** Fixed bundled helper only. No renderer-provided executable, argv or environment. */
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { LocalAiHardwareSnapshot } from './local-ai-hardware.js';

export type WindowsGpuInventory = { schemaVersion: 1; adapters: LocalAiHardwareSnapshot['adapters']; probeIssues: string[] };
const keys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\u0000-\u001f\u007f]/.test(value);
const hex = (value: unknown, length: number) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
function measurement(value: unknown, unknownOnly = false): boolean {
  if (!object(value) || !keys(value, ['value', 'status', 'source', 'observedAt']) || !label(value.source)
    || typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt))) return false;
  return value.status === 'unknown' && value.value === null || !unknownOnly && value.status === 'measured'
    && typeof value.value === 'number' && Number.isSafeInteger(value.value) && value.value >= 0;
}
export function parseWindowsGpuInventory(raw: string): WindowsGpuInventory {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || !keys(value, ['schemaVersion', 'adapters', 'probeIssues']) || value.schemaVersion !== 1
    || !Array.isArray(value.adapters) || value.adapters.length > 32 || !Array.isArray(value.probeIssues)
    || value.probeIssues.length > 32 || value.probeIssues.some(issue => typeof issue !== 'string' || !/^[a-z_]{1,96}$/.test(issue))) throw new Error('windows_gpu_result_invalid');
  const ids = new Set<string>();
  for (const row of value.adapters) {
    if (!object(row) || !keys(row, ['adapterId', 'name', 'vendor', 'sharedSystemMemory', 'memoryPoolId',
      'dedicatedBytes', 'processBudgetBytes', 'processUsageBytes', 'budgetOwnerRef', 'backends',
      'adapterLuid', 'softwareAdapter', 'vulkanDeviceUuid', 'vulkanPhysicalDeviceIndex', 'vulkanPciBusId', 'vulkanDeviceNodeMask'])
      || !hex(row.adapterLuid, 16) || row.adapterId !== `dxgi-${row.adapterLuid}` || ids.has(row.adapterId as string)
      || row.memoryPoolId !== `dxgi-local-${row.adapterLuid}` || !label(row.name)
      || typeof row.vendor !== 'string' || !/^pci:[0-9a-f]{1,8}$/.test(row.vendor)
      || ![null, true, false].includes(row.sharedSystemMemory as null | boolean) || row.softwareAdapter !== false
      || !measurement(row.dedicatedBytes) || !measurement(row.processBudgetBytes, true) || !measurement(row.processUsageBytes, true)
      || row.budgetOwnerRef !== null || !Array.isArray(row.backends) || row.backends.length > 1) throw new Error('windows_gpu_adapter_invalid');
    ids.add(row.adapterId as string);
    const mapped = row.vulkanDeviceUuid !== null;
    if (mapped ? !hex(row.vulkanDeviceUuid, 32) || !Number.isInteger(row.vulkanPhysicalDeviceIndex)
        || (row.vulkanPhysicalDeviceIndex as number) < 0 || (row.vulkanPhysicalDeviceIndex as number) > 31
        || !Number.isInteger(row.vulkanDeviceNodeMask) || (row.vulkanDeviceNodeMask as number) < 1
        || (row.vulkanDeviceNodeMask as number) > 0xffffffff
        || row.backends.length !== 1 || !object(row.backends[0]) || !keys(row.backends[0], ['name', 'status'])
        || row.backends[0].name !== 'vulkan' || row.backends[0].status !== 'detected'
      : row.vulkanPhysicalDeviceIndex !== null || row.vulkanDeviceNodeMask !== null || row.vulkanPciBusId !== null || row.backends.length !== 0) throw new Error('windows_gpu_mapping_invalid');
    if (row.vulkanPciBusId !== null && (typeof row.vulkanPciBusId !== 'string' || !/^[0-9a-f]{4}:[0-9a-f]{2}:[0-9a-f]{2}\.[0-7]$/.test(row.vulkanPciBusId))) throw new Error('windows_gpu_pci_invalid');
  }
  return value as unknown as WindowsGpuInventory;
}

export async function probeWindowsGpuInventory(resourcesDirectory: string, timeoutMs = 3000): Promise<WindowsGpuInventory> {
  if (!isAbsolute(resourcesDirectory) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('windows_gpu_probe_options_invalid');
  const helper = join(resourcesDirectory, 'services', 'sidekick', 'runtime', 'local_ai', 'windows_gpu_probe.py');
  let python = join(resourcesDirectory, 'runtime', 'python', 'python.exe');
  try { if (!(await stat(python)).isFile()) throw new Error(); }
  catch { python = join(resourcesDirectory, 'apps', 'desktop', 'runtime', 'python', 'python.exe'); }
  if (!(await stat(python)).isFile() || !(await stat(helper)).isFile()) throw new Error('windows_gpu_bundled_probe_missing');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].includes(key.toUpperCase())));
  const output = await new Promise<string>((resolve, reject) => {
    execFile(python, ['-I', '-B', helper, 'inventory'], { cwd: resourcesDirectory, env,
      windowsHide: true, shell: false, timeout: timeoutMs, maxBuffer: 65536, encoding: 'utf8' },
    (error, stdout) => error ? reject(new Error('windows_gpu_probe_failed')) : resolve(stdout));
  });
  return parseWindowsGpuInventory(output);
}
