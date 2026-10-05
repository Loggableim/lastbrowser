"""Opt-in bounded operation timing, not synthetic quality/recommendation proof."""
from __future__ import annotations
import math
import os
import time
from .role_adapters import RoleRequest


def process_resident_bytes(pid):
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes as w
        class Counters(ctypes.Structure):
            _fields_ = [('cb', w.DWORD), ('faults', w.DWORD)] + [(name, ctypes.c_size_t) for name in
                ('peakWorking', 'working', 'quotaPeakPaged', 'quotaPaged', 'quotaPeakNonPaged', 'quotaNonPaged', 'pagefile', 'peakPagefile')]
        kernel = ctypes.WinDLL('kernel32', use_last_error=True); psapi = ctypes.WinDLL('psapi', use_last_error=True)
        kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]; kernel.OpenProcess.restype = w.HANDLE
        kernel.CloseHandle.argtypes = [w.HANDLE]
        psapi.GetProcessMemoryInfo.argtypes = [w.HANDLE, ctypes.POINTER(Counters), w.DWORD]
        handle = kernel.OpenProcess(0x410, False, pid)
        if not handle: return None
        try:
            values = Counters(); values.cb = ctypes.sizeof(values)
            return int(values.working) if psapi.GetProcessMemoryInfo(handle, ctypes.byref(values), values.cb) else None
        finally: kernel.CloseHandle(handle)
    try:
        from pathlib import Path
        return int(Path(f'/proc/{pid}/statm').read_text().split()[1]) * os.sysconf('SC_PAGE_SIZE')
    except (OSError, ValueError, IndexError): return None


def benchmark_operation(manager, handle_id, scope, request: RoleRequest, *, opt_in=False, samples=3, warmups=1):
    if opt_in is not True: raise PermissionError('local_benchmark_requires_opt_in')
    if type(samples) is not int or not 1 <= samples <= 8 or type(warmups) is not int or not 0 <= warmups <= 2:
        raise ValueError('local_benchmark_budget_invalid')
    item = manager._get(handle_id, scope); view = item['view']
    if view.state != 'ready': raise ValueError('local_benchmark_model_not_ready')
    values = []; memory = []
    for index in range(warmups + samples):
        before = time.monotonic(); manager.execute(handle_id, scope, request); elapsed = (time.monotonic() - before) * 1000
        measured = process_resident_bytes(view.process_pid)
        if measured is not None: memory.append(measured)
        if index >= warmups: values.append(elapsed)
    ordered = sorted(values)
    return {'handleId': handle_id, 'scope': scope.model_dump(mode='json', by_alias=True), 'artifactId': view.request.artifact_id,
        'artifactRevision': view.request.artifact_revision, 'runtimeBuildRef': view.request.runtime_build_ref,
        'runtimeSha256': view.request.runtime_sha256, 'role': request.role, 'coldStartMs': view.cold_start_ms,
        'samples': samples, 'p95Ms': ordered[math.ceil(.95 * len(ordered)) - 1], 'sampleMs': values,
        'peakObservedResidentBytes': max(memory) if memory else None, 'gpuProcessBudgetBytes': None,
        'memorySource': 'own-process-working-set' if memory else 'unknown', 'synthetic': view.synthetic,
        'qualityPassed': None, 'sloPassed': None, 'recommendationEligible': False}
