"""Pure hardware contract checks; actual device probes have separate receipts."""
import ctypes as C
import pytest
from runtime.local_ai import windows_gpu_probe as probe
from runtime.local_ai.contracts import AdapterSnapshot


def test_x64_native_struct_layouts():
    probe._x64()
    assert C.sizeof(probe.AdapterDesc) == 312
    assert C.sizeof(probe.VideoMemory) == 56
    assert probe.VideoMemory.budget.offset == 16
    assert probe.VideoMemory.physical_index.offset == 48


def test_inventory_excludes_software_and_never_relabels_helper_budget(monkeypatch):
    monkeypatch.setattr(probe, '_dxgi', lambda: [
        {'luid': '0100000000000000', 'name': 'GPU', 'vendor': 0x8086, 'device': 1, 'dedicated': 16 * 2**30, 'software': False},
        {'luid': '0200000000000000', 'name': 'Software', 'vendor': 0x1414, 'device': 2, 'dedicated': 0, 'software': True}])
    monkeypatch.setattr(probe, '_vulkan', lambda: [
        {'luid': '0100000000000000', 'uuid': 'a' * 32, 'index': 1, 'pci': None, 'nodeMask': 1, 'vendor': 0x8086, 'device': 1, 'kind': 2}])
    result = probe.inventory()
    assert len(result['adapters']) == 1 and result['probeIssues'] == ['software_adapter_excluded']
    adapter = AdapterSnapshot.model_validate(result['adapters'][0])
    assert adapter.adapter_luid == '0100000000000000' and adapter.vulkan_physical_device_index == 1
    assert adapter.dedicated_bytes.value == 16 * 2**30
    assert adapter.process_budget_bytes.value is None and adapter.budget_owner_ref is None
    assert adapter.backends[0].status == 'detected'


def test_unmapped_or_duplicate_vulkan_identity_is_unverified(monkeypatch):
    monkeypatch.setattr(probe, '_dxgi', lambda: [{'luid': '0' * 16, 'name': 'GPU', 'vendor': 1, 'device': 1, 'dedicated': 8 * 2**30, 'software': False}])
    monkeypatch.setattr(probe, '_vulkan', lambda: [])
    result = probe.inventory()
    assert result['adapters'][0]['backends'] == []
    assert result['adapters'][0]['vulkanPhysicalDeviceIndex'] is None
    with pytest.raises(OSError, match='mapping_unverified'):
        probe.query_vulkan_identity('0' * 16)


@pytest.mark.parametrize('luid', ['GPU0', '', 'A' * 16, '0' * 15])
def test_budget_rejects_noncanonical_identity_before_any_process_query(luid):
    with pytest.raises(ValueError, match='luid_invalid'):
        probe.query_owned_process_budget(1, luid, expected_pid=1)


@pytest.mark.parametrize('handle,pid,index', [(0, 1, 0), (True, 1, 0), (1, True, 0), (1, 1, 1), (1, 1, False)])
def test_budget_rejects_invalid_handles_or_unqualified_linked_nodes(handle, pid, index):
    with pytest.raises(ValueError, match='identity_invalid'):
        probe.query_owned_process_budget(handle, '0' * 16, expected_pid=pid, physical_adapter_index=index)


@pytest.mark.parametrize('mode', ['success', 'wrong-pid', 'dead', 'ntstatus', 'zero-budget'])
def test_held_process_budget_identity_failure_and_adapter_cleanup(monkeypatch, mode):
    from types import SimpleNamespace
    class Fn:
        def __init__(self, callback): self.callback = callback
        def __call__(self, *args): return self.callback(*args)
    closed = []
    def creation(handle, first, *others):
        C.cast(first, C.POINTER(probe.U64)).contents.value = 123
        return 1
    def alive(handle, code):
        C.cast(code, C.POINTER(probe.U32)).contents.value = 1 if mode == 'dead' else 259
        return 1
    def opening(pointer):
        C.cast(pointer, C.POINTER(probe.OpenAdapter)).contents.adapter = 42
        return 0
    def budget(pointer):
        value = C.cast(pointer, C.POINTER(probe.VideoMemory)).contents
        assert value.process == 101 and value.adapter == 42 and value.segment == 0
        value.budget = 0 if mode == 'zero-budget' else 12 * 2**30
        value.usage = 2**30
        return -1073741811 if mode == 'ntstatus' else 0
    kernel = SimpleNamespace(GetProcessId=Fn(lambda handle: 2 if mode == 'wrong-pid' else 1),
                             GetExitCodeProcess=Fn(alive), GetProcessTimes=Fn(creation))
    gdi = SimpleNamespace(D3DKMTOpenAdapterFromLuid=Fn(opening), D3DKMTQueryVideoMemoryInfo=Fn(budget),
                          D3DKMTCloseAdapter=Fn(lambda pointer: closed.append(True) or 0))
    monkeypatch.setattr(probe, '_dll', lambda name: kernel if name == 'kernel32.dll' else gdi)
    if mode == 'success':
        result = probe.query_owned_process_budget(101, '0' * 16, expected_pid=1)
        assert result['budgetOwnerRef'] == 'process:1:123'
        assert result['processBudgetBytes']['value'] == 12 * 2**30
        assert result['processUsageBytes']['value'] == 2**30
    else:
        with pytest.raises(OSError):
            probe.query_owned_process_budget(101, '0' * 16, expected_pid=1)
    assert bool(closed) == (mode not in ('wrong-pid', 'dead'))
