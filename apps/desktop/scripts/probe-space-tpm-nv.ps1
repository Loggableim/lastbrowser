# Read-only TPM 2.0 capability query. This does not allocate, read, or
# modify existing NV indices, keys, or hardware state.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class LastbrowserTpmCapabilities {
    [StructLayout(LayoutKind.Sequential)]
    public struct ContextParams {
        public UInt32 Version;
        public UInt32 Flags;
    }

    [DllImport("tbs.dll")]
    public static extern UInt32 Tbsi_Context_Create(ref ContextParams parameters, out IntPtr handle);

    [DllImport("tbs.dll")]
    public static extern UInt32 Tbsip_Context_Close(IntPtr handle);

    [DllImport("tbs.dll")]
    public static extern UInt32 Tbsip_Submit_Command(IntPtr handle, UInt32 locality, UInt32 priority,
        byte[] command, UInt32 commandLength, [Out] byte[] response, ref UInt32 responseLength);

    private static UInt32 ReadBE(byte[] buffer, int offset) {
        return ((UInt32)buffer[offset] << 24) | ((UInt32)buffer[offset + 1] << 16)
            | ((UInt32)buffer[offset + 2] << 8) | buffer[offset + 3];
    }

    public static bool Advertises(IntPtr handle, UInt32 ordinal) {
        // TPM_ST_NO_SESSIONS, TPM_CC_GetCapability, TPM_CAP_COMMANDS, one item.
        byte[] command = { 0x80, 0x01, 0, 0, 0, 22, 0, 0, 1, 0x7a,
            0, 0, 0, 2, (byte)(ordinal >> 24), (byte)(ordinal >> 16),
            (byte)(ordinal >> 8), (byte)ordinal, 0, 0, 0, 1 };
        byte[] response = new byte[256];
        UInt32 length = (UInt32)response.Length;
        UInt32 status = Tbsip_Submit_Command(handle, 0, 200, command, (UInt32)command.Length, response, ref length);
        if (status != 0) throw new InvalidOperationException(String.Format("TBS status: 0x{0:X8}", status));
        if (length < 10 || ReadBE(response, 2) != length || ReadBE(response, 6) != 0) {
            throw new InvalidOperationException("TPM capability request failed");
        }
        if (length < 19 || ReadBE(response, 11) != 2) throw new InvalidOperationException("Invalid TPM capability response");
        UInt32 count = ReadBE(response, 15);
        if (count == 0 && length == 19) return false;
        if (count != 1 || length != 23) throw new InvalidOperationException("Invalid TPM command descriptor");
        // TPMA_CC commandIndex uses the lower sixteen bits. Check the vendor bit too.
        return (ReadBE(response, 19) & 0x2000ffffU) == ordinal;
    }
}
'@

$parameters = [LastbrowserTpmCapabilities+ContextParams]::new()
$parameters.Version = 2
$parameters.Flags = 4 # includeTpm20
$handle = [IntPtr]::Zero
$status = [LastbrowserTpmCapabilities]::Tbsi_Context_Create([ref]$parameters, [ref]$handle)
if ($status -ne 0) {
    Write-Error ('A TPM 2.0 context could not be opened. TBS status: 0x{0:X8}' -f $status)
    exit 1
}
try {
    [ordered]@{
        tpm2NvDefineSpace = [LastbrowserTpmCapabilities]::Advertises($handle, 0x12a)
        tpm2NvIncrement = [LastbrowserTpmCapabilities]::Advertises($handle, 0x134)
        tpm2PolicyNv = [LastbrowserTpmCapabilities]::Advertises($handle, 0x149)
        tpm2Unseal = [LastbrowserTpmCapabilities]::Advertises($handle, 0x15e)
    } | ConvertTo-Json -Compress
} finally {
    $null = [LastbrowserTpmCapabilities]::Tbsip_Context_Close($handle)
}
