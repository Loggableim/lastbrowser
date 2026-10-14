import { describe, expect, it } from 'vitest';
import { parseWindowsGpuInventory } from '../src/main/windows-gpu-probe';
import { scanLocalAiHardwareInventory, type HardwareProbeDependencies } from '../src/main/local-ai-hardware';

const at = '2026-10-14T04:00:00Z';
const measured = (value: number | null) => ({ value, status: value === null ? 'unknown' : 'measured', source: 'test-inventory', observedAt: at });
function inventory() {
  return { schemaVersion: 1, probeIssues: ['software_adapter_excluded'], adapters: [{
    adapterId: 'dxgi-0100000000000000', adapterLuid: '0100000000000000', name: 'Physical GPU', vendor: 'pci:8086',
    memoryPoolId: 'dxgi-local-0100000000000000', dedicatedBytes: measured(16 * 2 ** 30),
    sharedSystemMemory: false, processBudgetBytes: measured(null), processUsageBytes: measured(null), budgetOwnerRef: null,
    softwareAdapter: false, backends: [{ name: 'vulkan', status: 'detected' }],
    vulkanDeviceUuid: 'a'.repeat(32), vulkanPhysicalDeviceIndex: 1, vulkanPciBusId: null, vulkanDeviceNodeMask: 1 }] };
}
describe('Windows GPU inventory boundary', () => {
  it('preserves physical identity and measured capacity without claiming a process budget or inference proof', () => {
    const value = parseWindowsGpuInventory(JSON.stringify(inventory()));
    expect(value.adapters[0].dedicatedBytes.value).toBe(16 * 2 ** 30);
    expect(value.adapters[0].vulkanPhysicalDeviceIndex).toBe(1);
    expect(value.adapters[0].processBudgetBytes.value).toBeNull();
    expect(value.adapters[0].backends[0].status).toBe('detected');
  });
  it.each(['software', 'process-budget', 'owner', 'identity', 'duplicate', 'verified', 'extra'])('rejects untrusted or mis-scoped %s facts', kind => {
    const value = inventory();
    if (kind === 'software') value.adapters[0].softwareAdapter = true;
    if (kind === 'process-budget') value.adapters[0].processBudgetBytes = measured(10 * 2 ** 30);
    if (kind === 'owner') Object.assign(value.adapters[0], { budgetOwnerRef: 'helper-process' });
    if (kind === 'identity') value.adapters[0].adapterId = 'adapter-0';
    if (kind === 'duplicate') value.adapters.push(value.adapters[0]);
    if (kind === 'verified') value.adapters[0].backends[0].status = 'verified';
    if (kind === 'extra') Object.assign(value, { executable: 'untrusted' });
    expect(() => parseWindowsGpuInventory(JSON.stringify(value))).toThrow();
  });
  it('uses native measured inventory instead of Electron GPU array order', async () => {
    const deps: HardwareProbeDependencies = {
      getGpuInfo: async () => { throw new Error('Electron inventory must not run'); },
      getWindowsGpuInventory: async () => parseWindowsGpuInventory(JSON.stringify(inventory())), getGpuFeatureStatus: () => ({}),
      memory: () => ({ total: 32 * 2 ** 30, available: 8 * 2 ** 30 }), cpus: () => [{ model: 'CPU' }],
      platform: () => 'win32', arch: () => 'x64', disk: async () => ({ bsize: 4096n, bavail: 1024n }),
      now: () => new Date(at), id: () => 'scan-native' };
    const value = await scanLocalAiHardwareInventory({ cacheDirectory: 'C:/cache' }, deps);
    expect(value.hardware.adapters[0].adapterId).toBe('dxgi-0100000000000000');
    expect(value.probeIssues).toContain('software_adapter_excluded');
    expect(Object.isFrozen(value.hardware.adapters[0])).toBe(true);
  });
});
