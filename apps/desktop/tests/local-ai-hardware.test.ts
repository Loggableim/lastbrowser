import { describe, it, expect } from 'vitest';
import { scanLocalAiHardware, scanLocalAiHardwareInventory, type HardwareProbeDependencies } from '../src/main/local-ai-hardware';

const scope = { backendProfileId: 'backend', spaceId: 'space', browserProfileId: 'browser' };
function dependencies(): HardwareProbeDependencies {
  return { getGpuInfo: async () => ({ gpuDevice: [{ deviceString: 'GPU', vendorId: 4318, serialNumber: 'private' }] }),
    getGpuFeatureStatus: () => ({ webgpu: 'enabled' }), memory: () => ({ total: 16 * 2 ** 30, available: 8 * 2 ** 30 }),
    cpus: () => [{ model: 'CPU' }, { model: 'CPU' }], platform: () => 'win32', arch: () => 'x64',
    disk: async () => ({ bsize: 4096n, bavail: 100000n }), now: () => new Date('2026-10-04T01:00:00Z'), id: () => 'scan-1' };
}
describe('scoped local AI hardware probe', () => {
  it('returns a scope-free CPU/RAM inventory when GPU discovery is unavailable', async () => {
    const deps = dependencies(); deps.getGpuInfo = async () => { throw new Error('controlled_gpu_unavailable'); };
    const inventory = await scanLocalAiHardwareInventory({ cacheDirectory: 'C:\\trusted-user-data' }, deps);
    expect(inventory).not.toHaveProperty('scope');
    expect(inventory.hardware.cpuName).toBe('CPU');
    expect(inventory.hardware.ramAvailableBytes).toMatchObject({ value: 8 * 2 ** 30, status: 'measured' });
    expect(inventory.hardware.adapters).toEqual([]);
    expect(inventory.probeIssues).toContain('gpu_probe_failed');
  });

  it('measures bytes at actual cache path, drops serials and freezes all DTOs', async () => {
    const deps = dependencies(); let cache = '';
    deps.disk = async path => { cache = path; return { bsize: 4096n, bavail: 100000n }; };
    const value = await scanLocalAiHardware({ scope, cacheDirectory: 'C:\\cache' }, deps);
    expect(cache).toBe('C:\\cache'); expect(value.hardware.diskFreeBytes.value).toBe(409600000);
    expect(value.hardware.logicalCores).toBe(2); expect(value.hardware.physicalCores).toBeNull();
    expect(value.hardware.cpuFeaturesVerified).toBe(false);
    expect(JSON.stringify(value)).not.toContain('private');
    expect(Object.isFrozen(value.hardware.adapters[0].backends)).toBe(true);
    expect(Object.isFrozen(value.scope)).toBe(true);
  });
  it('never upgrades WebGPU rendering or nominal device metadata into inference proof', async () => {
    const value = await scanLocalAiHardware({ scope, cacheDirectory: 'C:\\cache' }, dependencies());
    expect(value.gpuFeatureStatus.webgpu).toBe('enabled');
    expect(value.hardware.adapters[0].backends).toEqual([]);
    expect(value.hardware.adapters[0].sharedSystemMemory).toBeNull();
    expect(value.hardware.adapters[0].memoryPoolId).toBe('unknown-memory-topology');
    expect(value.hardware.adapters[0].processBudgetBytes.value).toBeNull();
    expect(value.hardware.adapters[0].budgetOwnerRef).toBeNull();
  });
  it('normalizes real CPU labels with trailing padding for strict backend DTOs', async () => {
    const deps = dependencies(); deps.cpus = () => [{ model: 'AMD Ryzen CPU            ' }];
    const value = await scanLocalAiHardware({ scope, cacheDirectory: 'C:\\cache' }, deps);
    expect(value.hardware.cpuName).toBe('AMD Ryzen CPU');
  });
  it('bounds hung GPU and filesystem probes', async () => {
    const deps = dependencies(); deps.getGpuInfo = () => new Promise(() => {}); deps.disk = () => new Promise(() => {});
    const value = await scanLocalAiHardware({ scope, cacheDirectory: 'C:\\cache', timeoutMs: 5 }, deps);
    expect(value.probeIssues).toEqual(['gpu_probe_timeout', 'disk_probe_timeout']);
    expect(value.hardware.adapters).toEqual([]); expect(value.hardware.diskFreeBytes.status).toBe('unknown');
  });
  it('isolates failures and rejects inaccurate byte numbers', async () => {
    const deps = dependencies(); deps.memory = () => { throw new Error(); }; deps.getGpuInfo = async () => { throw new Error(); };
    deps.disk = async () => ({ bsize: 2n ** 60n, bavail: 100n });
    const value = await scanLocalAiHardware({ scope, cacheDirectory: 'C:\\cache' }, deps);
    expect(value.hardware.ramAvailableBytes.value).toBeNull(); expect(value.hardware.diskFreeBytes.value).toBeNull();
    expect(value.probeIssues).toContain('disk_measurement_out_of_range');
  });
  it('rejects relative cache path and malformed scope before probes', async () => {
    await expect(scanLocalAiHardware({ scope, cacheDirectory: '../cache' }, dependencies())).rejects.toThrow('absolute');
    await expect(scanLocalAiHardware({ scope: { ...scope, spaceId: '../space' }, cacheDirectory: 'C:\\cache' }, dependencies())).rejects.toThrow('scope');
  });
});
