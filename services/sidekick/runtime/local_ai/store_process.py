"""Resume only the primary thread of our own budgeted suspended child."""
import os


CREATE_SUSPENDED = 0x00000004


def resume_owned_suspended(process):
    if os.name!='nt' or process.poll() is not None:raise OSError('owned_suspended_process_unavailable')
    import ctypes
    from ctypes import wintypes as w
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.CloseHandle.argtypes=[w.HANDLE]
    kernel.GetProcessId.argtypes=[w.HANDLE];kernel.GetProcessId.restype=w.DWORD
    if kernel.GetProcessId(int(process._handle))!=process.pid:raise OSError('owned_process_handle_mismatch')
    class ThreadEntry(ctypes.Structure):
        _fields_=[('size',w.DWORD),('usage',w.DWORD),('id',w.DWORD),('owner',w.DWORD),('base',w.LONG),('delta',w.LONG),('flags',w.DWORD)]
    kernel.CreateToolhelp32Snapshot.argtypes=[w.DWORD,w.DWORD];kernel.CreateToolhelp32Snapshot.restype=w.HANDLE
    kernel.Thread32First.argtypes=[w.HANDLE,ctypes.POINTER(ThreadEntry)];kernel.Thread32Next.argtypes=[w.HANDLE,ctypes.POINTER(ThreadEntry)]
    kernel.OpenThread.argtypes=[w.DWORD,w.BOOL,w.DWORD];kernel.OpenThread.restype=w.HANDLE
    kernel.GetProcessIdOfThread.argtypes=[w.HANDLE];kernel.GetProcessIdOfThread.restype=w.DWORD
    kernel.ResumeThread.argtypes=[w.HANDLE];kernel.ResumeThread.restype=w.DWORD
    snapshot=kernel.CreateToolhelp32Snapshot(4,0)
    if snapshot==ctypes.c_void_p(-1).value:raise OSError('owned_thread_snapshot_unavailable')
    found=[]
    try:
        entry=ThreadEntry();entry.size=ctypes.sizeof(entry);ok=kernel.Thread32First(snapshot,ctypes.byref(entry))
        while ok:
            if entry.owner==process.pid:found.append(entry.id)
            ok=kernel.Thread32Next(snapshot,ctypes.byref(entry))
    finally:kernel.CloseHandle(snapshot)
    if len(found)!=1:raise OSError('owned_primary_thread_ambiguous')
    thread=kernel.OpenThread(0x0802,False,found[0])
    if not thread:raise OSError('owned_primary_thread_unavailable')
    try:
        if kernel.GetProcessIdOfThread(thread)!=process.pid:raise OSError('owned_thread_process_mismatch')
        if kernel.ResumeThread(thread)!=1:raise OSError('owned_primary_suspend_count_invalid')
    finally:kernel.CloseHandle(thread)
