using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Microsoft.Win32;
using Tpm2Lib;

internal static class SpaceTpmNvSecret
{
    internal const int Size = 32;
    internal const NvAttr Attributes = NvAttr.Authread | NvAttr.Authwrite | NvAttr.Writeall;
    internal const NvAttr PasswordBoundAttributes = NvAttr.Authread | NvAttr.Ownerwrite | NvAttr.Policywrite | NvAttr.Writeall;
    private const uint FirstApplicationIndex = 0x01500000;
    private const uint LastApplicationIndex = 0x0150ffff;

    private static TpmHandle IndexHandle(uint index, byte[] auth)
    {
        if (index < FirstApplicationIndex || index > LastApplicationIndex || auth.Length != Size)
            throw new ArgumentException("Invalid application NV slot");
        var handle = TpmHandle.NV((int)(index & 0xffffff));
        handle.Auth = new AuthValue(auth);
        return handle;
    }

    private static TpmHandle Open(Tpm2 tpm, uint index, byte[] auth, bool passwordBound = false)
    {
        var handle = IndexHandle(index, auth);
        byte[] name;
        var descriptor = tpm.NvReadPublic(handle, out name);
        var attributes = passwordBound ? PasswordBoundAttributes : Attributes;
        if (descriptor.dataSize != Size || descriptor.nameAlg != TpmAlgId.Sha256
            || descriptor.attributes != (attributes | NvAttr.Written)
            || (passwordBound && !descriptor.authPolicy.SequenceEqual(GetWritePolicy(tpm))))
            throw new InvalidOperationException("The NV slot does not match its provisioned attributes");
        return handle;
    }

    internal static bool Provision(Tpm2 tpm, uint index, byte[] auth, byte[] ownerAuth)
    {
        return Provision(tpm, index, auth, ownerAuth, false);
    }

    internal static bool ProvisionPasswordBound(Tpm2 tpm, uint index, byte[] auth, byte[] ownerAuth)
    {
        return Provision(tpm, index, auth, ownerAuth, true);
    }

    private static bool Provision(Tpm2 tpm, uint index, byte[] auth, byte[] ownerAuth, bool passwordBound)
    {
        var handle = IndexHandle(index, auth);
        var owner = new TpmHandle(TpmRh.Owner) { Auth = new AuthValue(ownerAuth) };
        var secret = new byte[Size];
        try
        {
            using (var random = RandomNumberGenerator.Create())
            {
                do { random.GetBytes(secret); }
                while (secret.All(value => value == 0));
            }
            var descriptor = new NvPublic(handle, TpmAlgId.Sha256, passwordBound ? PasswordBoundAttributes : Attributes,
                passwordBound ? GetWritePolicy(tpm) : null, Size);
            tpm._ExpectResponses(TpmRc.Success, TpmRc.NvDefined)
                .NvDefineSpace(owner, new AuthValue(auth), descriptor);
            if (tpm._GetLastResponseCode() == TpmRc.NvDefined) return false;
            try
            {
                tpm.NvWrite(passwordBound ? owner : handle, handle, secret, 0);
                var written = passwordBound ? ReadPasswordBound(tpm, index, auth) : Read(tpm, index, auth);
                try
                {
                    if (written == null || !secret.SequenceEqual(written))
                        throw new InvalidOperationException("The TPM did not confirm provisioning");
                }
                finally { if (written != null) Array.Clear(written, 0, written.Length); }
            }
            catch
            {
                tpm.NvUndefineSpace(owner, handle);
                throw;
            }
            return true;
        }
        finally { Array.Clear(secret, 0, secret.Length); }
    }

    internal static byte[] Read(Tpm2 tpm, uint index, byte[] auth)
    {
        return Read(tpm, Open(tpm, index, auth));
    }

    private static byte[] Read(Tpm2 tpm, TpmHandle handle)
    {
        var bytes = tpm.NvRead(handle, handle, Size, 0);
        if (bytes.Length != Size) throw new InvalidOperationException("Malformed NV secret response");
        if (bytes.Any(value => value != 0)) return bytes;
        Array.Clear(bytes, 0, bytes.Length);
        return null;
    }

    internal static byte[] ReadPasswordBound(Tpm2 tpm, uint index, byte[] auth)
    {
        var handle = Open(tpm, index, auth, true);
        try { return Read(tpm, handle); }
        catch (TpmException error)
        {
            // Format-one response codes include a session number above the base code.
            var reason = (TpmRc)((uint)error.RawResponse & 0xBF);
            if (reason == TpmRc.BadAuth || reason == TpmRc.AuthFail || error.RawResponse == TpmRc.Lockout) return null;
            throw;
        }
    }

    private static byte[] GetWritePolicy(Tpm2 tpm)
    {
        var session = tpm.StartAuthSessionEx(TpmSe.Trial, TpmAlgId.Sha256, SessionAttr.ContinueSession, Size);
        try
        {
            tpm.PolicyCommandCode(session.Handle, TpmCc.NvWrite);
            return tpm.PolicyGetDigest(session.Handle);
        }
        finally { tpm.FlushContext(session.Handle); }
    }

    // Only the NV_Write command may use this policy. It gives no permission
    // to read the existing bytes, even with the TPM owner authorization.
    internal static void RevokePasswordBound(Tpm2 tpm, uint index)
    {
        var handle = Open(tpm, index, new byte[Size], true);
        var session = tpm.StartAuthSessionEx(TpmSe.Policy, TpmAlgId.Sha256, SessionAttr.ContinueSession, Size);
        try
        {
            tpm.PolicyCommandCode(session.Handle, TpmCc.NvWrite);
            tpm[session].NvWrite(handle, handle, new byte[Size], 0);
        }
        finally { tpm.FlushContext(session.Handle); }
    }

    internal static void Revoke(Tpm2 tpm, uint index, byte[] auth)
    {
        var current = Read(tpm, index, auth);
        if (current == null) return;
        Array.Clear(current, 0, current.Length);
        var handle = Open(tpm, index, auth);
        tpm.NvWrite(handle, handle, new byte[Size], 0);
        current = Read(tpm, index, auth);
        if (current != null)
        {
            Array.Clear(current, 0, current.Length);
            throw new InvalidOperationException("The TPM did not confirm revocation");
        }
    }

    private static int ProbeSetup()
    {
        try
        {
            using (var registry = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry32))
            using (var installed = registry.OpenSubKey(@"SOFTWARE\WinFsp"))
            {
                var directory = installed == null ? null : installed.GetValue("InstallDir") as string;
                if (String.IsNullOrEmpty(directory) || !Path.IsPathRooted(directory)
                    || !File.Exists(Path.Combine(directory, "bin", "winfsp-x64.dll"))) return 5;
                var serviceName = "WinFsp";
                var sxs = installed.GetValue("SxsDir") as string;
                if (!String.IsNullOrEmpty(sxs))
                {
                    var leaf = Path.GetFileName(sxs.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                    if (!System.Text.RegularExpressions.Regex.IsMatch(leaf, @"\Asxs\.[0-9]{8}T[0-9]{6}Z\z")) return 5;
                    serviceName += "+" + leaf.Substring(4);
                }
                using (var driver = registry.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\" + serviceName))
                {
                    if (driver == null || Object.Equals(driver.GetValue("Start"), 4)) return 5;
                }
            }
        }
        catch (Exception) { return 5; }
        try
        {
            var device = new TbsDevice();
            device.Connect();
            using (var tpm = new Tpm2(device))
            {
                byte[] ownerAuth = null;
                try
                {
                    ownerAuth = device.GetOwnerAuth();
                    return ownerAuth == null ? 7 : 0;
                }
                catch (Exception) { return 7; }
                finally { if (ownerAuth != null) Array.Clear(ownerAuth, 0, ownerAuth.Length); }
            }
        }
        catch (Exception) { return 6; }
    }

    private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "probe-setup") return ProbeSetup();
        if (args.Length == 2 && args[0].StartsWith("platform-", StringComparison.Ordinal))
        {
            return SpacePlatformKey.Run(args[0], args[1], new CngProvider("Microsoft Platform Crypto Provider"),
                Console.OpenStandardInput(), Console.OpenStandardOutput());
        }
        return RunCommand(args, () => new TbsDevice(), device => ((TbsDevice)device).GetOwnerAuth());
    }

    internal static int RunCommand(string[] args, Func<Tpm2Device> makeDevice, Func<Tpm2Device, byte[]> getOwnerAuth)
    {
        uint index;
        if (args.Length != 2
            || !UInt32.TryParse(args[1], NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out index))
            return 2;
        const string boundSuffix = "-password-bound";
        bool passwordBound = args[0].EndsWith(boundSuffix, StringComparison.Ordinal);
        string operation = passwordBound ? args[0].Substring(0, args[0].Length - boundSuffix.Length) : args[0];
        if (operation != "read" && operation != "revoke" && operation != "provision") return 2;
        var auth = new byte[Size];
        try
        {
            using (var input = Console.OpenStandardInput())
            {
                int offset = 0;
                int expected = passwordBound && operation == "revoke" ? 0 : Size;
                while (offset < expected)
                {
                    int length = input.Read(auth, offset, expected - offset);
                    if (length == 0) return 2;
                    offset += length;
                }
                if (input.ReadByte() != -1) return 2;
            }
            var device = makeDevice();
            device.Connect();
            using (var tpm = new Tpm2(device))
            {
                if (operation == "provision")
                {
                    var ownerAuth = getOwnerAuth(device);
                    if (ownerAuth == null) throw new InvalidOperationException("TPM owner authorization is unavailable");
                    try { return Provision(tpm, index, auth, ownerAuth, passwordBound) ? 0 : 4; }
                    finally { Array.Clear(ownerAuth, 0, ownerAuth.Length); }
                }
                if (operation == "revoke")
                {
                    if (passwordBound) RevokePasswordBound(tpm, index);
                    else Revoke(tpm, index, auth);
                }
                else
                {
                    var secret = passwordBound ? ReadPasswordBound(tpm, index, auth) : Read(tpm, index, auth);
                    if (secret == null) return 3;
                    try { Console.OpenStandardOutput().Write(secret, 0, secret.Length); }
                    finally { Array.Clear(secret, 0, secret.Length); }
                }
            }
            return 0;
        }
        catch (Exception)
        {
            Console.Error.WriteLine("The Windows TPM NV operation failed.");
            return 1;
        }
        finally { Array.Clear(auth, 0, auth.Length); }
    }
}
