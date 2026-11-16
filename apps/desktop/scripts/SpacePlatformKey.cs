using System;
using System.IO;
using System.Security.Cryptography;

internal static class SpacePlatformKey
{
    private const int SecretSize = 32;
    private const int WrappedSize = 256;

    internal static int Run(string operation, string id, CngProvider provider, Stream input, Stream output)
    {
        Guid parsed;
        if (!Guid.TryParseExact(id, "D", out parsed) || parsed.ToString("D") != id) return 2;
        if (operation != "platform-create" && operation != "platform-read" && operation != "platform-revoke") return 2;
        var wrapped = new byte[WrappedSize];
        var name = "Lastbrowser-ProtectedSpace-v1-" + id;
        try
        {
            if (operation == "platform-read")
            {
                int offset = 0;
                while (offset < wrapped.Length)
                {
                    int count = input.Read(wrapped, offset, wrapped.Length - offset);
                    if (count == 0) return 2;
                    offset += count;
                }
            }
            if (input.ReadByte() != -1) return 2;

            if (operation == "platform-create")
            {
                Create(name, provider, output);
                return 0;
            }
            if (!CngKey.Exists(name, provider)) return 3;
            using (var key = CngKey.Open(name, provider))
            {
                if (operation == "platform-revoke") key.Delete();
                else
                {
                    using (var rsa = new RSACng(key))
                    {
                        var secret = rsa.Decrypt(wrapped, RSAEncryptionPadding.OaepSHA256);
                        try
                        {
                            if (secret.Length != SecretSize) throw new InvalidOperationException("Invalid platform secret");
                            output.Write(secret, 0, secret.Length);
                        }
                        finally { Array.Clear(secret, 0, secret.Length); }
                    }
                }
            }
            return 0;
        }
        catch (Exception)
        {
            Console.Error.WriteLine("The Windows platform key operation failed.");
            return 1;
        }
        finally { Array.Clear(wrapped, 0, wrapped.Length); }
    }

    private static void Create(string name, CngProvider provider, Stream output)
    {
        var parameters = new CngKeyCreationParameters
        {
            Provider = provider,
            KeyUsage = CngKeyUsages.Decryption,
            ExportPolicy = CngExportPolicies.None
        };
        parameters.Parameters.Add(new CngProperty("Length", BitConverter.GetBytes(WrappedSize * 8), CngPropertyOptions.None));
        var secret = new byte[SecretSize];
        using (var key = CngKey.Create(CngAlgorithm.Rsa, name, parameters))
        {
            bool complete = false;
            try
            {
                if (key.ExportPolicy != CngExportPolicies.None) throw new InvalidOperationException("The platform key permits export");
                using (var random = RandomNumberGenerator.Create()) random.GetBytes(secret);
                using (var rsa = new RSACng(key))
                {
                    var wrapped = rsa.Encrypt(secret, RSAEncryptionPadding.OaepSHA256);
                    if (wrapped.Length != WrappedSize) throw new InvalidOperationException("Invalid wrapped platform secret");
                    output.Write(wrapped, 0, wrapped.Length);
                }
                complete = true;
            }
            finally
            {
                Array.Clear(secret, 0, secret.Length);
                if (!complete) key.Delete();
            }
        }
    }
}
