import java.io.IOException;
import java.net.URI;
import java.nio.CharBuffer;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.UUID;

import org.cryptomator.cryptofs.CryptoFileSystemProperties;
import org.cryptomator.cryptofs.CryptoFileSystemProvider;
import org.cryptomator.cryptolib.api.Masterkey;
import org.cryptomator.cryptolib.common.MasterkeyFileAccess;
import org.cryptomator.frontend.fuse.mount.WinFspMountProvider;

public final class InitializeSpaceVault {
    private InitializeSpaceVault() {}

    public static void main(String[] args) {
        try {
            if (args.length == 3 && args[0].equals("mount")) {
                mount(Path.of(args[1]), Path.of(args[2]));
                return;
            }
            if (args.length != 2) {
                throw new IllegalArgumentException("Expected an empty vault path and a vault ID");
            }
            Path vault = Path.of(args[0]);
            UUID id = UUID.fromString(args[1]);
            initialize(vault, id);
        } catch (Exception failure) {
            System.err.println("Cryptomator vault operation failed.");
            System.exit(1);
        }
    }

    private static void mount(Path vault, Path mountPoint) throws Exception {
        byte[] input = System.in.readNBytes(32);
        char[] passphrase = new char[64];
        try {
            if (input.length != 32) {
                throw new IOException("A 256-bit volume key is required");
            }
            HexFormat.of().formatHex(CharBuffer.wrap(passphrase), input);
            var access = new MasterkeyFileAccess(new byte[0], new SecureRandom());
            var properties = CryptoFileSystemProperties.cryptoFileSystemProperties()
                    .withKeyLoader(ignored -> access.load(vault.resolve("masterkey.cryptomator"), CharBuffer.wrap(passphrase)))
                    .build();
            try (var filesystem = CryptoFileSystemProvider.newFileSystem(vault, properties)) {
                Arrays.fill(input, (byte) 0);
                Arrays.fill(passphrase, '\0');
                var service = new WinFspMountProvider();
                try (var mounted = service.forFileSystem(filesystem.getPath("/"))
                        .setFileSystemName("cryptoFs")
                        .setMountFlags(service.getDefaultMountFlags())
                        .setMountpoint(mountPoint)
                        .mount()) {
                    System.out.println("LASTBROWSER_VAULT_READY");
                    System.out.flush();
                    // The broker closes the input pipe after all profile writers exit.
                    if (System.in.read() != -1) throw new IOException("Unexpected mount input");
                }
            }
        } finally {
            Arrays.fill(input, (byte) 0);
            Arrays.fill(passphrase, '\0');
        }
    }

    private static void initialize(Path vault, UUID id) throws IOException {
        if (!vault.isAbsolute() || !Files.isDirectory(vault, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("The vault directory is unavailable");
        }
        try (var entries = Files.list(vault)) {
            if (entries.findAny().isPresent()) {
                throw new IOException("The vault directory must be empty");
            }
        }

        byte[] input = System.in.readNBytes(33);
        char[] passphrase = new char[64];
        try {
            if (input.length != 32) {
                throw new IOException("A 256-bit volume key is required");
            }
            HexFormat.of().formatHex(CharBuffer.wrap(passphrase), input);
            var random = new SecureRandom();
            var masterkeyAccess = new MasterkeyFileAccess(new byte[0], random);
            var masterkeyPath = vault.resolve("masterkey.cryptomator");
            var keyId = URI.create("masterkeyfile:masterkey.cryptomator");
            try (var masterkey = Masterkey.generate(random)) {
                var properties = CryptoFileSystemProperties.cryptoFileSystemProperties()
                        .withKeyLoader(ignored -> masterkey.copy())
                        .build();
                masterkeyAccess.persist(masterkey, masterkeyPath, CharBuffer.wrap(passphrase));
                CryptoFileSystemProvider.initialize(vault, properties, keyId);
            }

            // Verify that the wrapped key, rather than the in-memory key, can
            // reopen the vault. The identity is stored inside the ciphertext tree.
            var reopen = CryptoFileSystemProperties.cryptoFileSystemProperties()
                    .withKeyLoader(ignored -> masterkeyAccess.load(masterkeyPath, CharBuffer.wrap(passphrase)))
                    .build();
            try (var filesystem = CryptoFileSystemProvider.newFileSystem(vault, reopen)) {
                Files.writeString(filesystem.getPath("/lastbrowser-vault-id"), id.toString());
            }
        } finally {
            Arrays.fill(input, (byte) 0);
            Arrays.fill(passphrase, '\0');
        }
    }
}
