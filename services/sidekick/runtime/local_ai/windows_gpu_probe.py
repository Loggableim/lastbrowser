"""Read-only Windows x64 GPU inventory and held-own-process budget queries.

The inventory CLI accepts no process identifiers or handles. Process handles
are used only by the trusted parent in its own address space, never by IPC.
No Vulkan device, command queue, model or allocation is created here.
"""
from __future__ import annotations

import ctypes as C
from datetime import datetime, timezone
import json
import os
import re
import struct
import sys
import uuid

U32 = C.c_uint32
U64 = C.c_uint64
I32 = C.c_int32
PTR = C.c_void_p


class Luid(C.Structure):
    _fields_ = [('low', U32), ('high', I32)]


class Guid(C.Structure):
    _fields_ = [('a', U32), ('b', C.c_uint16), ('c', C.c_uint16), ('d', C.c_ubyte * 8)]


class AdapterDesc(C.Structure):
    _fields_ = [('name', C.c_wchar * 128), ('vendor', U32), ('device', U32),
                ('subsystem', U32), ('revision', U32), ('dedicated', C.c_size_t),
                ('system', C.c_size_t), ('shared', C.c_size_t), ('luid', Luid), ('flags', U32)]


class OpenAdapter(C.Structure):
    _fields_ = [('luid', Luid), ('adapter', U32)]


class VideoMemory(C.Structure):
    _fields_ = [('process', PTR), ('adapter', U32), ('segment', U32),
                ('budget', U64), ('usage', U64), ('reservation', U64),
                ('available', U64), ('physical_index', U32)]


class VkApplication(C.Structure):
    _fields_ = [('type', U32), ('next', PTR), ('name', C.c_char_p), ('version', U32),
                ('engine', C.c_char_p), ('engine_version', U32), ('api_version', U32)]


class VkInstanceCreate(C.Structure):
    _fields_ = [('type', U32), ('next', PTR), ('flags', U32), ('application', C.POINTER(VkApplication)),
                ('layer_count', U32), ('layers', PTR), ('extension_count', U32), ('extensions', PTR)]


class VkId(C.Structure):
    _fields_ = [('type', U32), ('next', PTR), ('uuid', C.c_ubyte * 16),
                ('driver_uuid', C.c_ubyte * 16), ('luid', C.c_ubyte * 8), ('node_mask', U32), ('valid', U32)]


class VkPci(C.Structure):
    _fields_ = [('type', U32), ('next', PTR), ('domain', U32), ('bus', U32), ('device', U32), ('function', U32)]


class VkProperties(C.Structure):
    # Oversized, 8-byte-aligned opaque storage for VkPhysicalDeviceProperties.
    # Only its specified scalar prefix is decoded, never driver-dependent limits.
    _fields_ = [('type', U32), ('next', PTR), ('storage', U64 * 512)]


class VkExtension(C.Structure):
    _fields_ = [('name', C.c_char * 256), ('version', U32)]


def _now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _measurement(value, source, at):
    return {'value': value, 'status': 'measured' if value is not None else 'unknown',
            'source': source, 'observedAt': at}


def _x64():
    if os.name != 'nt' or C.sizeof(PTR) != 8 or C.sizeof(C.c_wchar) != 2:
        raise OSError('windows_x64_gpu_probe_required')
    expected = [(Luid, 8), (AdapterDesc, 312), (OpenAdapter, 12), (VideoMemory, 56),
                (VkApplication, 48), (VkInstanceCreate, 64), (VkId, 64), (VkPci, 32)]
    if any(C.sizeof(kind) != size for kind, size in expected):
        raise OSError('windows_gpu_abi_layout_mismatch')
    if VideoMemory.budget.offset != 16 or VkProperties.storage.offset != 16:
        raise OSError('windows_gpu_abi_offset_mismatch')


def _dll(name):
    return C.WinDLL(name, winmode=0x800)  # LOAD_LIBRARY_SEARCH_SYSTEM32


def _method(pointer, slot, result, *arguments):
    table = C.cast(pointer, C.POINTER(C.POINTER(PTR))).contents
    return C.WINFUNCTYPE(result, PTR, *arguments)(table[slot])


def _dxgi():
    dxgi = _dll('dxgi.dll')
    create = dxgi.CreateDXGIFactory1
    create.argtypes = [C.POINTER(Guid), C.POINTER(PTR)]
    create.restype = I32
    iid = Guid.from_buffer_copy(uuid.UUID('770aae78-f26f-4dba-a829-253c83d1b387').bytes_le)
    factory = PTR()
    if create(C.byref(iid), C.byref(factory)) != 0 or not factory:
        raise OSError('dxgi_factory_unavailable')
    found = []
    try:
        for index in range(32):
            adapter = PTR()
            status = _method(factory, 12, I32, U32, C.POINTER(PTR))(factory, index, C.byref(adapter))
            if status == -2005270526:  # DXGI_ERROR_NOT_FOUND
                break
            if status != 0 or not adapter:
                raise OSError('dxgi_adapter_enumeration_failed')
            try:
                desc = AdapterDesc()
                if _method(adapter, 10, I32, C.POINTER(AdapterDesc))(adapter, C.byref(desc)) != 0:
                    raise OSError('dxgi_adapter_description_failed')
                found.append({'luid': bytes(desc.luid).hex(), 'name': desc.name.strip(),
                              'vendor': int(desc.vendor), 'device': int(desc.device),
                              'dedicated': int(desc.dedicated), 'software': bool(desc.flags & 2)})
            finally:
                _method(adapter, 2, U32)(adapter)
        else:
            raise OSError('dxgi_adapter_capacity_exceeded')
    finally:
        _method(factory, 2, U32)(factory)
    return found


def _vulkan():
    vk = _dll('vulkan-1.dll')
    create = vk.vkCreateInstance
    create.argtypes = [C.POINTER(VkInstanceCreate), PTR, C.POINTER(PTR)]
    create.restype = I32
    application = VkApplication(type=0, name=b'Lastbrowser hardware inventory', api_version=(1 << 22) | (1 << 12))
    info = VkInstanceCreate(type=1, application=C.pointer(application))
    instance = PTR()
    if create(C.byref(info), None, C.byref(instance)) != 0 or not instance:
        raise OSError('vulkan_1_1_inventory_unavailable')
    vk.vkDestroyInstance.argtypes = [PTR, PTR]
    vk.vkDestroyInstance.restype = None
    enumerate_devices = vk.vkEnumeratePhysicalDevices
    enumerate_devices.argtypes = [PTR, C.POINTER(U32), C.POINTER(PTR)]
    enumerate_devices.restype = I32
    properties = vk.vkGetPhysicalDeviceProperties2
    properties.argtypes = [PTR, C.POINTER(VkProperties)]
    properties.restype = None
    extensions = vk.vkEnumerateDeviceExtensionProperties
    extensions.argtypes = [PTR, C.c_char_p, C.POINTER(U32), C.POINTER(VkExtension)]
    extensions.restype = I32
    try:
        count = U32()
        if enumerate_devices(instance, C.byref(count), None) != 0 or count.value > 32:
            raise OSError('vulkan_device_enumeration_failed')
        devices = (PTR * count.value)()
        if enumerate_devices(instance, C.byref(count), devices) != 0:
            raise OSError('vulkan_device_enumeration_changed')
        found = []
        for index, device in enumerate(devices):
            identity = VkId(type=1000071004)
            props = VkProperties(type=1000059001, next=C.cast(C.pointer(identity), PTR))
            properties(device, C.byref(props))
            prefix = bytes(props.storage)
            vendor, device_id, kind = struct.unpack_from('<III', prefix, 8)
            if kind not in (1, 2):  # INTEGRATED_GPU or DISCRETE_GPU; CPU/software excluded
                continue
            pci = None
            ext_count = U32()
            if extensions(device, None, C.byref(ext_count), None) == 0 and ext_count.value <= 4096:
                names = (VkExtension * ext_count.value)()
                if extensions(device, None, C.byref(ext_count), names) == 0:
                    if any(bytes(item.name) == b'VK_EXT_pci_bus_info' for item in names):
                        bus = VkPci(type=1000212000)
                        props.next = C.cast(C.pointer(bus), PTR)
                        properties(device, C.byref(props))
                        pci = f'{bus.domain:04x}:{bus.bus:02x}:{bus.device:02x}.{bus.function:x}'
            found.append({'luid': bytes(identity.luid).hex() if identity.valid == 1 else None,
                          'uuid': bytes(identity.uuid).hex(), 'index': index, 'pci': pci,
                          'nodeMask': int(identity.node_mask) if identity.valid == 1 else None,
                          'vendor': vendor, 'device': device_id, 'kind': kind})
        return found
    finally:
        vk.vkDestroyInstance(instance, None)


def query_vulkan_identity(luid):
    """Fresh identity only; raw physical index is never a ggml device index."""
    _x64()
    _validate_luid(luid)
    matches = [item for item in _vulkan() if item['luid'] == luid]
    if len(matches) != 1:
        raise OSError('vulkan_adapter_mapping_unverified')
    item = matches[0]
    return {'adapterLuid': luid, 'vulkanDeviceUuid': item['uuid'],
            'vulkanPhysicalDeviceIndex': item['index'], 'vulkanPciBusId': item['pci'],
            'vulkanDeviceNodeMask': item['nodeMask']}


def inventory():
    _x64()
    at = _now()
    issues = []
    adapters = _dxgi()
    try:
        devices = _vulkan()
    except (OSError, AttributeError):
        devices = []
        issues.append('vulkan_inventory_unavailable')
    result = []
    for adapter in adapters:
        if adapter['software']:
            issues.append('software_adapter_excluded')
            continue
        matches = [item for item in devices if item['luid'] == adapter['luid']
                   and item['vendor'] == adapter['vendor'] and item['device'] == adapter['device']]
        mapped = matches[0] if len(matches) == 1 else None
        if mapped is None:
            issues.append('vulkan_adapter_mapping_unverified')
        identity = adapter['luid']
        result.append({'adapterId': 'dxgi-' + identity, 'name': adapter['name'] or 'Windows graphics adapter',
            'vendor': f"pci:{adapter['vendor']:x}", 'sharedSystemMemory': mapped['kind'] == 1 if mapped else None,
            'memoryPoolId': 'dxgi-local-' + identity,
            'dedicatedBytes': _measurement(adapter['dedicated'], 'dxgi-adapter-desc1-capacity', at),
            'processBudgetBytes': _measurement(None, 'inference-process-not-bound', at),
            'processUsageBytes': _measurement(None, 'inference-process-not-bound', at), 'budgetOwnerRef': None,
            'backends': [{'name': 'vulkan', 'status': 'detected'}] if mapped else [],
            'adapterLuid': identity, 'softwareAdapter': False,
            'vulkanDeviceUuid': mapped['uuid'] if mapped else None,
            'vulkanPhysicalDeviceIndex': mapped['index'] if mapped else None,
            'vulkanPciBusId': mapped['pci'] if mapped else None,
            'vulkanDeviceNodeMask': mapped['nodeMask'] if mapped else None})
    return {'schemaVersion': 1, 'adapters': result, 'probeIssues': sorted(set(issues))}


def _validate_luid(luid):
    if not isinstance(luid, str) or not re.fullmatch('[0-9a-f]{16}', luid):
        raise ValueError('adapter_luid_invalid')


def query_owned_process_budget(process_handle, luid, *, expected_pid, physical_adapter_index=0):
    """Trusted parent's held own-child handle only. No PID lookup or IPC surface.

    The caller owns the Popen/Job and must compare creation time across samples.
    Unsupported/zero budget is a denial, never replaced by nominal capacity.
    """
    _x64()
    _validate_luid(luid)
    if (type(process_handle) is not int or not 0 < process_handle < 2**64
            or type(expected_pid) is not int or not 0 < expected_pid < 2**32
            or type(physical_adapter_index) is not int or physical_adapter_index != 0):
        raise ValueError('owned_process_budget_identity_invalid')
    kernel = _dll('kernel32.dll')
    kernel.GetProcessId.argtypes = [PTR]
    kernel.GetProcessId.restype = U32
    if kernel.GetProcessId(process_handle) != expected_pid:
        raise OSError('owned_process_handle_mismatch')
    kernel.GetExitCodeProcess.argtypes = [PTR, C.POINTER(U32)]
    kernel.GetExitCodeProcess.restype = I32
    def require_live():
        exit_code = U32()
        if not kernel.GetExitCodeProcess(process_handle, C.byref(exit_code)) or exit_code.value != 259:
            raise OSError('owned_process_not_alive')
    require_live()
    kernel.GetProcessTimes.argtypes = [PTR, C.POINTER(U64), C.POINTER(U64), C.POINTER(U64), C.POINTER(U64)]
    kernel.GetProcessTimes.restype = I32
    times = [U64() for _ in range(4)]
    if not kernel.GetProcessTimes(process_handle, *[C.byref(value) for value in times]):
        raise OSError('owned_process_creation_time_unavailable')
    gdi = _dll('gdi32.dll')
    opening = OpenAdapter(luid=Luid.from_buffer_copy(bytes.fromhex(luid)))
    gdi.D3DKMTOpenAdapterFromLuid.argtypes = [C.POINTER(OpenAdapter)]
    gdi.D3DKMTOpenAdapterFromLuid.restype = I32
    if gdi.D3DKMTOpenAdapterFromLuid(C.byref(opening)) != 0 or not opening.adapter:
        raise OSError('owned_process_adapter_unavailable')
    try:
        info = VideoMemory(process=process_handle, adapter=opening.adapter, segment=0, physical_index=0)
        gdi.D3DKMTQueryVideoMemoryInfo.argtypes = [C.POINTER(VideoMemory)]
        gdi.D3DKMTQueryVideoMemoryInfo.restype = I32
        status = gdi.D3DKMTQueryVideoMemoryInfo(C.byref(info))
        if status != 0:
            raise OSError(f'owned_process_video_budget_unavailable_{status & 0xffffffff:08x}')
        if info.budget <= 0 or info.budget > 2**53 - 1 or info.usage > 2**53 - 1:
            raise OSError('owned_process_video_budget_unknown')
        require_live()
        at = _now()
        return {'adapterLuid': luid, 'processId': expected_pid, 'processCreationTime': str(times[0].value),
                'budgetOwnerRef': f'process:{expected_pid}:{times[0].value}',
                'processBudgetBytes': _measurement(int(info.budget), 'd3dkmt-owned-process-local-budget', at),
                'processUsageBytes': _measurement(int(info.usage), 'd3dkmt-owned-process-local-usage', at),
                'observedAt': at, 'source': 'D3DKMTQueryVideoMemoryInfo'}
    finally:
        gdi.D3DKMTCloseAdapter.argtypes = [C.POINTER(U32)]
        gdi.D3DKMTCloseAdapter.restype = I32
        closing = U32(opening.adapter)
        gdi.D3DKMTCloseAdapter(C.byref(closing))


def main():
    if sys.argv[1:] != ['inventory']:
        raise ValueError('gpu_probe_cli_inventory_only')
    print(json.dumps(inventory(), separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'schemaVersion': 1, 'adapters': [], 'probeIssues': ['windows_gpu_probe_unavailable']}))
        raise SystemExit(1)
