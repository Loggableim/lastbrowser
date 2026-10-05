"""Pinned in-tree runtime preflight. Version/help never certify model operations."""
from __future__ import annotations
import hashlib
import os
import signal
import subprocess
import threading
import time
from contextlib import ExitStack
from pathlib import Path
from typing import Annotated, Literal
from pydantic import Field, model_validator
from runtime.independent.contracts import Contract, Ref, Scope, Utc, digest_json
from .contracts import Sha256, BackendObservation, RuntimeSnapshot, Role
from .installer import _pin_directory


class RuntimeBuildFile(Contract):
    relative_path: Ref
    bytes: Annotated[int, Field(gt=0, le=2147483648)]
    sha256: Sha256
    kind: Literal['binary', 'library', 'license']

    @model_validator(mode='after')
    def contained(self):
        parts = self.relative_path.replace('\\', '/').split('/')
        if any(part in ('', '.', '..') for part in parts) or ':' in self.relative_path:
            raise ValueError('runtime_manifest_path_rejected')
        return self


class RuntimeRoleAdapter(Contract):
    adapter_ref: Ref
    role: Role
    pooling: Literal['cls', 'mean', 'last', 'none'] | None = None
    query_prefix: Annotated[str, Field(max_length=128)] = ''
    document_prefix: Annotated[str, Field(max_length=128)] = ''
    evidence_ref: Ref
    artifact_id: Ref | None = None
    artifact_revision: Ref | None = None
    endpoint: Literal['/v1/chat/completions', '/v1/embeddings', '/embedding'] | None = None
    max_input_tokens: Annotated[int, Field(gt=0, le=131072)] | None = None


class RuntimeBuildManifest(Contract):
    schema_version: Literal[1] = 1
    build_ref: Ref
    source_revision: Annotated[str, Field(pattern=r'^[0-9a-f]{40}$')]
    package_relative_dir: Ref
    os: Literal['win32', 'linux', 'darwin']
    arch: Literal['x64', 'arm64']
    declared_backends: tuple[Literal['cpu', 'vulkan', 'cuda'], ...]
    required_cpu_features: tuple[Ref, ...] = ()
    role_adapters: tuple[RuntimeRoleAdapter, ...] = ()
    files: tuple[RuntimeBuildFile, ...]
    version_output_marker: Ref
    help_output_marker: Ref
    license_source: Ref
    redistribution_review_ref: Ref

    @model_validator(mode='after')
    def pinned(self):
        prefix = 'apps/desktop/runtime/'
        if not self.package_relative_dir.startswith(prefix + 'local-ai/') and not self.package_relative_dir.startswith(prefix + 'llama-cpp/'):
            raise ValueError('runtime_package_directory_rejected')
        parts = self.package_relative_dir.split('/')
        if any(part in ('', '.', '..') or ':' in part or '\\' in part for part in parts):
            raise ValueError('runtime_package_directory_rejected')
        if len({file.relative_path for file in self.files}) != len(self.files) or sum(file.kind == 'binary' for file in self.files) != 1:
            raise ValueError('runtime_binary_manifest_ambiguous')
        if not any(file.kind == 'license' for file in self.files) or not self.declared_backends or sum(file.bytes for file in self.files) > 4294967296:
            raise ValueError('runtime_manifest_incomplete')
        if len({item.role for item in self.role_adapters}) != len(self.role_adapters): raise ValueError('runtime_role_adapter_ambiguous')
        return self


class RuntimeFileFact(Contract):
    relative_path: Ref
    observed_bytes: Annotated[int, Field(ge=0)] | None = None
    observed_sha256: Sha256 | None = None
    status: Literal['verified', 'missing', 'changed', 'unsafe', 'unreadable']


class RuntimePreflight(Contract):
    scope: Scope
    observed_at: Utc
    manifest_digest: Sha256
    build_ref: Ref
    state: Literal['unavailable', 'blocked', 'integrity_verified', 'preflight_verified']
    files: tuple[RuntimeFileFact, ...]
    version_output_digest: Sha256 | None = None
    help_output_digest: Sha256 | None = None
    reason_codes: tuple[Ref, ...] = ()
    operation_verified: Literal[False] = False


def hash_contained_file(root: Path, relative: str, expected_bytes: int) -> tuple[int, str]:
    """Read-only, pinned ancestors and file identity; never silently follows a link."""
    root = Path(root)
    target = root / relative
    if not root.is_absolute() or any(part in ('', '.', '..') for part in relative.replace('\\', '/').split('/')) or ':' in relative:
        raise ValueError('runtime_file_path_rejected')
    with ExitStack() as stack:
        for directory in reversed((target.parent, *target.parent.parents)):
            stack.enter_context(_pin_directory(directory))
        if root.resolve() != root or not target.resolve().is_relative_to(root):
            raise ValueError('runtime_file_escapes_root')
        info = target.lstat()
        import stat
        if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('runtime_file_link_rejected')
        if info.st_size != expected_bytes:
            return info.st_size, ''
        fd = os.open(target, os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0))
        with os.fdopen(fd, 'rb') as stream:
            actual = os.fstat(stream.fileno()); current = target.lstat()
            if (info.st_ino, info.st_dev) != (actual.st_ino, actual.st_dev) or (current.st_ino, current.st_dev) != (actual.st_ino, actual.st_dev) or getattr(current, 'st_file_attributes', 0) & 0x400:
                raise ValueError('runtime_file_replaced')
            digest = hashlib.sha256(); size = 0
            while chunk := stream.read(262144):
                size += len(chunk)
                if size > expected_bytes: return size, ''
                digest.update(chunk)
            end = os.fstat(stream.fileno())
            if end.st_mtime_ns != actual.st_mtime_ns or end.st_size != actual.st_size:
                raise ValueError('runtime_file_changed_during_read')
            return size, digest.hexdigest()


class _WindowsProbeJob:
    def __init__(self, *, memory_limit_bytes=None):
        import ctypes
        from ctypes import wintypes as w
        class Basic(ctypes.Structure):
            _fields_ = [('processTime', ctypes.c_int64), ('jobTime', ctypes.c_int64), ('flags', w.DWORD),
                ('minWorking', ctypes.c_size_t), ('maxWorking', ctypes.c_size_t), ('active', w.DWORD),
                ('affinity', ctypes.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]
        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in ('reads', 'writes', 'others', 'readBytes', 'writeBytes', 'otherBytes')]
        class Extended(ctypes.Structure):
            _fields_ = [('basic', Basic), ('io', IO), ('processMemory', ctypes.c_size_t), ('jobMemory', ctypes.c_size_t),
                ('peakProcessMemory', ctypes.c_size_t), ('peakJobMemory', ctypes.c_size_t)]
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]; self.kernel.CreateJobObjectW.restype = w.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.kernel.CloseHandle.argtypes = [w.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        if not self.handle:
            raise OSError('runtime_probe_job_create_failed')
        info = Extended(); info.basic.flags = 0x2000  # KILL_ON_JOB_CLOSE, only own probe descendants
        if memory_limit_bytes is not None:
            if type(memory_limit_bytes) is not int or not 16777216 <= memory_limit_bytes <= 17179869184:
                self.close(); raise ValueError('runtime_job_memory_budget_invalid')
            info.basic.flags |= 0x100 | 0x200  # Own process and aggregate Job commit ceilings.
            info.processMemory = memory_limit_bytes; info.jobMemory = memory_limit_bytes
        if not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(info), ctypes.sizeof(info)):
            self.close(); raise OSError('runtime_probe_job_policy_rejected')

    def assign(self, process):
        if not self.kernel.AssignProcessToJobObject(self.handle, int(process._handle)):
            error = self.kernel and __import__('ctypes').get_last_error()
            suffix = f'_win_{error}' if type(error) is int and 0 < error <= 65535 else ''
            raise OSError(f'runtime_probe_job_assignment_failed{suffix}')

    def close(self):
        if self.handle: self.kernel.CloseHandle(self.handle); self.handle = None


def _run_probe_process(binary: Path, arguments: tuple[str, ...], *, timeout=3, output_limit=65536) -> tuple[str, bytes, int | None]:
    """Private own-process primitive; public preflight uses version/help ONLY."""
    if not binary.is_absolute() or not binary.is_file() or binary.resolve() != binary:
        raise ValueError('runtime_probe_binary_not_canonical')
    if not 0 < timeout <= 10 or not 1 <= output_limit <= 65536:
        raise ValueError('runtime_probe_budget_invalid')
    environment = {key: value for key, value in os.environ.items() if key.upper() in ('SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP')}
    job = _WindowsProbeJob() if os.name == 'nt' else None
    process = None; reader = None; output = bytearray(); exceeded = threading.Event(); stage = 'spawn'
    try:
        process = subprocess.Popen([str(binary), *arguments], cwd=binary.parent, env=environment,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            # The Job Object is the Windows containment boundary. CREATE_NEW_PROCESS_GROUP
            # can be rejected by Electron's inherited Job Object and is not needed here.
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            start_new_session=os.name != 'nt', shell=False)
        stage = 'assign'
        if job: job.assign(process)
        def read():
            while chunk := process.stdout.read(4096):
                remaining = output_limit - len(output)
                output.extend(chunk[:remaining])
                if len(chunk) > remaining:
                    exceeded.set(); break
        stage = 'read'; reader = threading.Thread(target=read, daemon=True); reader.start()
        deadline = time.monotonic() + timeout
        state = 'exited'
        stage = 'poll'
        while process.poll() is None:
            if exceeded.is_set(): state = 'output_limit'; break
            if time.monotonic() >= deadline: state = 'timeout'; break
            time.sleep(.01)
        if state != 'exited':
            if job: job.close()
            else: os.killpg(process.pid, signal.SIGKILL)
        stage = 'wait'; process.wait(timeout=2)
        if job: job.close()  # also closes own lingering descendants/pipes
        elif os.name != 'nt':
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        stage = 'join'; reader.join(2)
        if reader.is_alive(): raise RuntimeError('runtime_probe_io_exit_unacknowledged')
        if exceeded.is_set(): state = 'output_limit'
        return state, bytes(output), process.returncode
    except OSError as error:
        if str(error).startswith('runtime_probe_job_'):
            raise
        win_code = getattr(error, 'winerror', None)
        errno_code = getattr(error, 'errno', None)
        suffix = f'_win_{win_code}' if type(win_code) is int and 0 < win_code <= 65535 else f'_errno_{errno_code}' if type(errno_code) is int and 0 < errno_code <= 65535 else ''
        raise OSError(f'runtime_probe_{stage}_os_error{suffix}') from error
    finally:
        if job: job.close()
        if process:
            if process.poll() is None:
                if os.name != 'nt': os.killpg(process.pid, signal.SIGKILL)
                else: process.kill()
                process.wait(timeout=2)
            if reader: reader.join(2)
            if process.stdout: process.stdout.close()


def inspect_runtime_build(root: Path, manifest: RuntimeBuildManifest, scope: Scope, observed_at: str, *, run_preflight=False, timeout=3) -> RuntimePreflight:
    facts = []
    for item in manifest.files:
        try:
            size, sha = hash_contained_file(root, manifest.package_relative_dir + '/' + item.relative_path, item.bytes)
            status = 'verified' if size == item.bytes and sha == item.sha256 else 'changed'
            facts.append(RuntimeFileFact(relative_path=item.relative_path, observed_bytes=size, observed_sha256=sha or None, status=status))
        except FileNotFoundError: facts.append(RuntimeFileFact(relative_path=item.relative_path, status='missing'))
        except ValueError: facts.append(RuntimeFileFact(relative_path=item.relative_path, status='unsafe'))
        except OSError: facts.append(RuntimeFileFact(relative_path=item.relative_path, status='unreadable'))
    state = 'integrity_verified' if all(item.status == 'verified' for item in facts) else 'unavailable' if any(item.status == 'missing' for item in facts) else 'blocked'
    result = RuntimePreflight(scope=scope, observed_at=observed_at, manifest_digest=digest_json(manifest), build_ref=manifest.build_ref,
        state=state, files=tuple(facts), reason_codes=() if state == 'integrity_verified' else ('runtime_manifest_files_not_verified',))
    if run_preflight and state == 'integrity_verified':
        import sys
        if manifest.os != sys.platform:
            return result.model_copy(update={'state': 'blocked', 'reason_codes': ('runtime_platform_mismatch',)})
        import platform
        actual_arch = 'arm64' if platform.machine().lower() in ('arm64', 'aarch64') else 'x64' if platform.machine().lower() in ('amd64', 'x86_64') else 'unknown'
        if manifest.arch != actual_arch: return result.model_copy(update={'state': 'blocked', 'reason_codes': ('runtime_architecture_mismatch',)})
        binary = next(item for item in manifest.files if item.kind == 'binary')
        path = root / manifest.package_relative_dir / binary.relative_path
        outputs = []
        for argument, marker in (('--version', manifest.version_output_marker), ('--help', manifest.help_output_marker)):
            # Rehash the exact binary immediately before each private execution.
            if hash_contained_file(root, manifest.package_relative_dir + '/' + binary.relative_path, binary.bytes) != (binary.bytes, binary.sha256):
                return result.model_copy(update={'state': 'blocked', 'reason_codes': ('runtime_binary_drift',)})
            try:
                status, output, code = _run_probe_process(path, (argument,), timeout=timeout)
            except (OSError, RuntimeError) as error:
                safe_reason = str(error) if str(error) in {'runtime_probe_job_create_failed', 'runtime_probe_job_policy_rejected',
                    'runtime_probe_job_assignment_failed', 'runtime_probe_io_exit_unacknowledged'} else None
                if safe_reason is None and __import__('re').fullmatch(r'runtime_probe_job_assignment_failed(?:_win_[1-9][0-9]{0,4})?', str(error)):
                    safe_reason = str(error)
                if safe_reason is None and __import__('re').fullmatch(r'runtime_probe_(?:spawn|assign|read|poll|wait|join)_os_error(?:_(?:win|errno)_[1-9][0-9]{0,4})?', str(error)):
                    safe_reason = str(error)
                if safe_reason is None and isinstance(error, OSError):
                    # Windows exposes a numeric system error for safe diagnosis; never return paths or OS text.
                    code = getattr(error, 'winerror', None) or getattr(error, 'errno', None)
                    if type(code) is int and 0 < code <= 65535:
                        safe_reason = f'runtime_probe_os_error_{code}'
                    else:
                        safe_reason = 'runtime_probe_os_error_unknown'
                if safe_reason is None and isinstance(error, RuntimeError):
                    safe_reason = 'runtime_probe_runtime_error'
                safe_reason = safe_reason or 'runtime_preflight_unavailable'
                return result.model_copy(update={'state': 'blocked', 'reason_codes': (safe_reason,)})
            if status != 'exited' or code != 0 or marker.encode() not in output:
                return result.model_copy(update={'state': 'blocked', 'reason_codes': ('runtime_preflight_' + status,)})
            outputs.append(hashlib.sha256(output).hexdigest())
        result = result.model_copy(update={'state': 'preflight_verified', 'version_output_digest': outputs[0], 'help_output_digest': outputs[1]})
        for item in manifest.files:
            if hash_contained_file(root, manifest.package_relative_dir + '/' + item.relative_path, item.bytes) != (item.bytes, item.sha256):
                return result.model_copy(update={'state': 'blocked', 'reason_codes': ('runtime_package_drift',)})
    return result


def runtime_snapshot_from_preflight(manifest: RuntimeBuildManifest, preflight: RuntimePreflight) -> RuntimeSnapshot:
    if preflight.manifest_digest != digest_json(manifest) or preflight.build_ref != manifest.build_ref:
        raise ValueError('runtime_preflight_manifest_mismatch')
    binary = next(item for item in manifest.files if item.kind == 'binary')
    return RuntimeSnapshot(build_ref=manifest.build_ref, binary_sha256=binary.sha256 if preflight.state in ('integrity_verified', 'preflight_verified') else None,
        state='detected' if preflight.state in ('integrity_verified', 'preflight_verified') else 'unavailable', managed='in_tree',
        os=manifest.os, arch=manifest.arch, backend=BackendObservation(name='cpu', status='unknown'), required_cpu_features=manifest.required_cpu_features, operations=())
