/** Read-only Main probe. GPU rendering capabilities never prove inference support. */
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import { statfs } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export type LocalAiScope = Readonly<{ backendProfileId: string; spaceId: string; browserProfileId: string }>;
type Measurement = Readonly<{ value: number | null; status: 'measured' | 'unknown'; source: string; observedAt: string }>;
export interface LocalAiHardwareSnapshot {
  readonly schemaVersion: 1; readonly scanId: string; readonly observedAt: string;
  readonly os: string; readonly arch: string; readonly cpuName: string | null;
  readonly physicalCores: null; readonly logicalCores: number | null;
  readonly cpuFeatures: readonly string[]; readonly cpuFeaturesVerified: false;
  readonly ramTotalBytes: Measurement; readonly ramAvailableBytes: Measurement; readonly diskFreeBytes: Measurement;
  readonly adapters: readonly Readonly<{ adapterId: string; name: string; vendor: string | null;
    sharedSystemMemory: boolean | null; memoryPoolId: string; dedicatedBytes: Measurement;
    processBudgetBytes: Measurement; processUsageBytes: Measurement; budgetOwnerRef: null;
    backends: readonly never[] }>[];
}
export interface BoundHardwareScan {
  readonly schemaVersion: 1; readonly scope: LocalAiScope; readonly hardware: LocalAiHardwareSnapshot;
  readonly gpuFeatureStatus: Readonly<Record<string, string>>; readonly probeIssues: readonly string[];
}
export interface LocalAiHardwareInventory {
  readonly schemaVersion: 1; readonly hardware: LocalAiHardwareSnapshot;
  readonly gpuFeatureStatus: Readonly<Record<string, string>>; readonly probeIssues: readonly string[];
}
export interface HardwareProbeDependencies {
  getGpuInfo(): Promise<unknown>; getGpuFeatureStatus(): Record<string, string>;
  memory(): { total: number; available: number }; // bytes; production Electron KiB converted below
  cpus(): readonly { model: string }[]; platform(): string; arch(): string;
  disk(path: string): Promise<{ bsize: bigint; bavail: bigint }>;
  now(): Date; id(): string;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
async function bounded<T>(operation: () => Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('probe_timeout')), milliseconds);
  })]); } finally { if (timer) clearTimeout(timer); }
}
export async function defaultHardwareProbeDependencies(): Promise<HardwareProbeDependencies> {
  const { app } = await import('electron');
  return { getGpuInfo: () => app.getGPUInfo('basic'), getGpuFeatureStatus: () => ({ ...app.getGPUFeatureStatus() }),
    memory: () => { const memory = process.getSystemMemoryInfo(); return { total: memory.total * 1024, available: memory.free * 1024 }; },
    cpus: os.cpus, platform: os.platform, arch: os.arch,
    disk: path => statfs(path, { bigint: true }), now: () => new Date(), id: randomUUID };
}
export async function scanLocalAiHardwareInventory(input: { cacheDirectory: string; timeoutMs?: number },
  supplied?: HardwareProbeDependencies): Promise<LocalAiHardwareInventory> {
  if (!isAbsolute(input.cacheDirectory)) throw new Error('cache_directory_must_be_absolute');
  const deps = supplied ?? await defaultHardwareProbeDependencies();
  const timeout = input.timeoutMs ?? 3000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 10000) throw new Error('invalid_probe_timeout');
  const observedAt = deps.now().toISOString(); const issues: string[] = [];
  const measurement = (value: unknown, source: string): Measurement => ({ value: typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null,
    status: typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? 'measured' : 'unknown', source, observedAt });
  let total: unknown; let available: unknown; let cpuName: string | null = null; let logicalCores: number | null = null;
  try { const memory = deps.memory(); total = memory.total; available = memory.available; } catch { issues.push('memory_probe_failed'); }
  const label = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 240).trim();
  try { const cpus = deps.cpus(); logicalCores = cpus.length || null; cpuName = cpus[0]?.model ? label(cpus[0].model) || null : null; } catch { issues.push('cpu_probe_failed'); }
  const [gpu, disk] = await Promise.allSettled([bounded(deps.getGpuInfo, timeout), bounded(() => deps.disk(input.cacheDirectory), timeout)]);
  if (gpu.status === 'rejected') issues.push(gpu.reason?.message === 'probe_timeout' ? 'gpu_probe_timeout' : 'gpu_probe_failed');
  if (disk.status === 'rejected') issues.push(disk.reason?.message === 'probe_timeout' ? 'disk_probe_timeout' : 'disk_probe_failed');
  let diskBytes: number | null = null;
  if (disk.status === 'fulfilled') {
    const bytes = disk.value.bsize * disk.value.bavail;
    if (bytes >= 0n && bytes <= BigInt(Number.MAX_SAFE_INTEGER)) diskBytes = Number(bytes);
    else issues.push('disk_measurement_out_of_range');
  }
  let gpuFeatureStatus: Record<string, string> = {};
  try { gpuFeatureStatus = Object.fromEntries(Object.entries(deps.getGpuFeatureStatus()).filter(([key, value]) => key.length < 128 && typeof value === 'string' && value.length < 128)); } catch { issues.push('gpu_features_probe_failed'); }
  const raw = gpu.status === 'fulfilled' && gpu.value && typeof gpu.value === 'object' ? gpu.value as { gpuDevice?: unknown } : {};
  const devices = Array.isArray(raw.gpuDevice) ? raw.gpuDevice.slice(0, 16) : [];
  const adapters = devices.map((device, index) => {
    const item = device && typeof device === 'object' ? device as Record<string, unknown> : {};
    const vendor = typeof item.vendorId === 'number' && Number.isSafeInteger(item.vendorId) ? 'pci:' + item.vendorId.toString(16) : null;
    return { adapterId: 'adapter-' + index, name: typeof item.deviceString === 'string' ? label(item.deviceString) || 'GPU ' + (index + 1) : 'GPU ' + (index + 1),
      vendor, sharedSystemMemory: null, memoryPoolId: 'unknown-memory-topology',
      dedicatedBytes: measurement(null, 'electron-gpu-basic-no-memory-proof'), processBudgetBytes: measurement(null, 'inference-process-budget-unavailable'),
      processUsageBytes: measurement(null, 'inference-process-usage-unavailable'), budgetOwnerRef: null, backends: [] as never[] };
  });
  return freeze({ schemaVersion: 1, hardware: { schemaVersion: 1, scanId: deps.id(), observedAt,
    os: deps.platform(), arch: deps.arch(), cpuName, physicalCores: null, logicalCores, cpuFeatures: [], cpuFeaturesVerified: false,
    ramTotalBytes: measurement(total, 'electron-system-memory'), ramAvailableBytes: measurement(available, 'electron-system-memory-free'),
    diskFreeBytes: measurement(diskBytes, 'node-statfs-selected-volume'), adapters }, gpuFeatureStatus, probeIssues: issues });
}

export async function scanLocalAiHardware(input: { scope: LocalAiScope; cacheDirectory: string; timeoutMs?: number },
  supplied?: HardwareProbeDependencies): Promise<BoundHardwareScan> {
  if (!input.scope || Object.keys(input.scope).length !== 3 || !['backendProfileId', 'spaceId', 'browserProfileId'].every(key => Object.hasOwn(input.scope, key)) || Object.values(input.scope).some(v => typeof v !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(v))) throw new Error('invalid_scope');
  const inventory = await scanLocalAiHardwareInventory(input, supplied);
  return freeze({ ...inventory, scope: { ...input.scope } });
}
