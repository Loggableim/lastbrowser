// Runs only against a disposable Microsoft TPM simulator on loopback.
using System;
using System.Linq;
using System.Security.Cryptography;
using Tpm2Lib;

internal static class ProbeTpmNvRevocation
{
    private static int Main(string[] args)
    {
        int port;
        if (args.Length != 1 || !Int32.TryParse(args[0], out port) || port < 1024 || port >= 65535)
        {
            Console.Error.WriteLine("Supply the port of a disposable local TPM simulator.");
            return 2;
        }

        try
        {
            RunProbe(port);
            RunPasswordBoundProbe(port);
            Console.WriteLine("Both NV formats retained irreversible revocation. The password-bound write policy could not read the original secret.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Synthetic TPM NV probe failed: " + error.GetType().Name);
            return 1;
        }
    }

    private static void RunPasswordBoundProbe(int port)
    {
        var device = new TcpTpmDevice("127.0.0.1", port);
        device.Connect();
        using (var tpm = new Tpm2(device))
        {
            device.PowerCycle();
            tpm.Startup(Su.Clear);
            const uint index = 0x01504143;
            var authorization = new byte[SpaceTpmNvSecret.Size];
            using (var random = RandomNumberGenerator.Create()) random.GetBytes(authorization);
            try
            {
                if (!SpaceTpmNvSecret.ProvisionPasswordBound(tpm, index, authorization, new byte[0]))
                    throw new InvalidOperationException("Could not allocate the password-bound NV slot");
                try
                {
                    var original = SpaceTpmNvSecret.ReadPasswordBound(tpm, index, authorization);
                    if (original == null) throw new InvalidOperationException("Correct read authorization failed");
                    Array.Clear(original, 0, original.Length);
                    if (SpaceTpmNvSecret.ReadPasswordBound(tpm, index, new byte[SpaceTpmNvSecret.Size]) != null)
                        throw new InvalidOperationException("A missing read authorization disclosed the secret");
                    var nvHandle = TpmHandle.NV((int)(index & 0xffffff));
                    AssertReadDenied(() => tpm.NvRead(TpmRh.Owner, nvHandle, SpaceTpmNvSecret.Size, 0));
                    var policy = tpm.StartAuthSessionEx(TpmSe.Policy, TpmAlgId.Sha256, SessionAttr.ContinueSession, SpaceTpmNvSecret.Size);
                    try
                    {
                        tpm.PolicyCommandCode(policy.Handle, TpmCc.NvWrite);
                        AssertReadDenied(() => tpm[policy].NvRead(nvHandle, nvHandle, SpaceTpmNvSecret.Size, 0));
                    }
                    finally { tpm.FlushContext(policy.Handle); }
                    SpaceTpmNvSecret.RevokePasswordBound(tpm, index);
                    SpaceTpmNvSecret.RevokePasswordBound(tpm, index);
                    tpm.Shutdown(Su.Clear);
                    device.PowerCycle();
                    tpm.Startup(Su.Clear);
                    if (SpaceTpmNvSecret.ReadPasswordBound(tpm, index, authorization) != null)
                        throw new InvalidOperationException("The old authorization recovered revoked data");
                }
                finally { tpm.NvUndefineSpace(TpmRh.Owner, TpmHandle.NV((int)(index & 0xffffff))); }
            }
            finally { Array.Clear(authorization, 0, authorization.Length); }
        }
    }

    private static void AssertReadDenied(Func<byte[]> read)
    {
        byte[] secret;
        try { secret = read(); }
        catch (TpmException) { return; }
        Array.Clear(secret, 0, secret.Length);
        throw new InvalidOperationException("The TPM authorized a read without the password-bound value");
    }

    private static void RunProbe(int port)
    {
        var device = new TcpTpmDevice("127.0.0.1", port);
        device.Connect();
        using (var tpm = new Tpm2(device))
        {
            device.PowerCycle();
            tpm.Startup(Su.Clear);
            const uint index = 0x01504142;
            var handle = TpmHandle.NV(0x00504142);
            var authBytes = new byte[SpaceTpmNvSecret.Size];
            var otherAuth = new byte[SpaceTpmNvSecret.Size];
            using (var random = RandomNumberGenerator.Create())
            {
                random.GetBytes(authBytes);
                random.GetBytes(otherAuth);
            }
            try
            {
                if (!SpaceTpmNvSecret.Provision(tpm, index, authBytes, new byte[0]))
                    throw new InvalidOperationException("Could not provision a free NV slot");
                try
                {
                    var original = SpaceTpmNvSecret.Read(tpm, index, authBytes);
                    if (original == null) throw new InvalidOperationException("Provisioning did not write a secret");
                    try
                    {
                        if (SpaceTpmNvSecret.Provision(tpm, index, otherAuth, new byte[0]))
                            throw new InvalidOperationException("Provisioning replaced an occupied NV slot");
                        var read = SpaceTpmNvSecret.Read(tpm, index, authBytes);
                        try
                        {
                            if (read == null || !original.SequenceEqual(read))
                                throw new InvalidOperationException("Collision changed the existing secret");
                        }
                        finally { if (read != null) Array.Clear(read, 0, read.Length); }
                    }
                    finally { Array.Clear(original, 0, original.Length); }

                    // Revocation replaces the full device secret in the TPM.
                    // The previous public descriptor and auth are still usable
                    // after rollback but can no longer recover the old bytes.
                    SpaceTpmNvSecret.Revoke(tpm, index, authBytes);
                    tpm.Shutdown(Su.Clear);
                    device.PowerCycle();
                    tpm.Startup(Su.Clear);
                    if (SpaceTpmNvSecret.Provision(tpm, index, otherAuth, new byte[0]))
                        throw new InvalidOperationException("Provisioning reused a revoked NV slot");
                    var restored = SpaceTpmNvSecret.Read(tpm, index, authBytes);
                    if (restored != null)
                    {
                        Array.Clear(restored, 0, restored.Length);
                        throw new InvalidOperationException("The original secret is still readable");
                    }
                }
                finally { tpm.NvUndefineSpace(TpmRh.Owner, handle); }
            }
            finally
            {
                Array.Clear(authBytes, 0, authBytes.Length);
                Array.Clear(otherAuth, 0, otherAuth.Length);
            }
        }
    }
}
