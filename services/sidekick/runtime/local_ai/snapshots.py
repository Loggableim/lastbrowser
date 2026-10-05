"""Read-only in-tree inventory and private, scoped scan binding. No environment switch."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Literal
from pydantic import Field
from runtime.independent.contracts import Contract, Scope
from .contracts import HardwareSnapshot, RuntimeSnapshot, BackendObservation


class BoundHardwareScan(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    hardware: HardwareSnapshot
    gpu_feature_status: dict[str, str] = Field(default_factory=dict)
    probe_issues: tuple[str, ...] = ()


def runtime_inventory(root: Path, hardware: HardwareSnapshot) -> tuple[RuntimeSnapshot, ...]:
    """Presence is only detected, never verified execution/architecture support.

    Only fixed in-tree locations are inspected. No PATH, discovery subprocess,
    network calls, import of inference libraries, account/config reads or writes.
    """
    root = root.resolve()
    names = ('llama-server.exe', 'llama-server', 'ollama.exe', 'ollama')
    directories = (root / 'apps/desktop/runtime/local-ai', root / 'apps/desktop/runtime/llama-cpp')
    found = []
    for directory in directories:
        for name in names:
            candidate = directory / name
            try:
                resolved = candidate.resolve()
                if not resolved.is_relative_to(root) or not candidate.is_file():
                    continue
            except OSError:
                continue
            found.append(RuntimeSnapshot(build_ref='in-tree:' + candidate.relative_to(root).as_posix(),
                binary_sha256=None, state='detected', managed='in_tree', os=hardware.os, arch=hardware.arch,
                backend=BackendObservation(name='cpu', status='unknown')))
    if not found:
        found.append(RuntimeSnapshot(build_ref='in-tree:inference-unavailable', binary_sha256=None,
            state='unavailable', managed='in_tree', os=hardware.os, arch=hardware.arch,
            backend=BackendObservation(name='cpu', status='unknown')))
    return tuple(found)


def available_compute_slots(scope: Scope) -> int:
    # Use the actual shared admission lock/owners; do not instantiate a scheduler.
    from runtime.independent.manager import ComputeAdmission
    with ComputeAdmission._lock:
        if any(scope.key in claims for claims in ComputeAdmission._scope_claims.values()):
            return 0
        return max(0, 2 - len(ComputeAdmission._owners))


class ScanBindingError(ValueError):
    pass


class HardwareScanStore:
    """Short-lived immutable proof storage; callers authenticate Main before bind.

    Full GPU diagnostics are not proofs and are never consumed by the core.
    Scope resolution belongs to the existing trusted request context.
    """
    def __init__(self, *, clock=None, max_scans=64):
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.max_scans = max_scans
        self._lock = RLock()
        self._scans: dict[str, BoundHardwareScan] = {}

    def bind(self, scope: Scope, payload: dict) -> BoundHardwareScan:
        scan = BoundHardwareScan.model_validate(payload)
        if scan.scope != scope:
            raise ScanBindingError('scan_scope_mismatch')
        self._fresh(scan)
        with self._lock:
            if scan.hardware.scan_id in self._scans:
                raise ScanBindingError('scan_id_already_bound')
            if len(self._scans) >= self.max_scans:
                oldest = next(iter(self._scans))
                self._scans.pop(oldest)
            self._scans[scan.hardware.scan_id] = scan
        return scan.model_copy(deep=True)

    def read(self, scope: Scope, scan_id: str) -> BoundHardwareScan:
        with self._lock:
            scan = self._scans.get(scan_id)
            if scan is None or scan.scope != scope:
                raise ScanBindingError('scan_not_bound_to_scope')
            self._fresh(scan)
            return scan.model_copy(deep=True)

    def _fresh(self, scan: BoundHardwareScan):
        observed = datetime.fromisoformat(scan.hardware.observed_at.replace('Z', '+00:00'))
        age = (self.clock() - observed).total_seconds()
        if age < -2 or age > 30:
            raise ScanBindingError('scan_stale_or_future')
