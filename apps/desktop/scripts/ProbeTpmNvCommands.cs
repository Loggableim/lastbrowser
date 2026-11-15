// Test-only adapter for the disposable Microsoft reference simulator.
using System;
using System.Security.Cryptography;
using Tpm2Lib;

internal static class ProbeTpmNvCommands
{
    private static int Main(string[] args)
    {
        int port;
        if (!Int32.TryParse(Environment.GetEnvironmentVariable("LASTBROWSER_TEST_TPM_PORT"), out port)
            || port < 1024 || port >= 65535) return 2;
        if (args.Length == 2 && args[0].StartsWith("platform-", StringComparison.Ordinal))
        {
            return SpacePlatformKey.Run(args[0], args[1], CngProvider.MicrosoftSoftwareKeyStorageProvider,
                Console.OpenStandardInput(), Console.OpenStandardOutput());
        }
        if (args.Length == 1 && (args[0] == "startup" || args[0] == "power-cycle"))
        {
            var device = new TcpTpmDevice("127.0.0.1", port);
            device.Connect();
            using (var tpm = new Tpm2(device))
            {
                if (args[0] == "power-cycle") tpm.Shutdown(Su.Clear);
                device.PowerCycle();
                tpm.Startup(Su.Clear);
            }
            return 0;
        }
        return SpaceTpmNvSecret.RunCommand(args, () => new TcpTpmDevice("127.0.0.1", port), _ => new byte[0]);
    }
}
