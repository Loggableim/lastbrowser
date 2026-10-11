# Startup sidekick artwork provenance

All six source files are the original transparent A-031 sidekick PNG images supplied in `C:\Users\logga\.codex\generated_images\01a12a00-16de-7170-98b1-8a66929d84ff`. They were copied byte-for-byte; no image was regenerated or cropped. The equally sized transparent canvases (1298×1212) preserve matching proportions when rendered with `object-fit: contain`.

| App-launch choice | Original source | SHA-256 |
| --- | --- | --- |
| `sidekick-01.png` | `exec-042321fd-8b5a-468b-8dc3-eb61782eb316.png` | `052B5C99A7F78F52B7D14C9A973F90E28A5799581186F1D564405D000F270A5A` |
| `sidekick-02.png` | `exec-3371d998-d433-4baf-ade1-09f89646af13.png` | `D9030084DF647C275B2F7AC17E86A7C08722E7FD021528DE15C78D33924D4A11` |
| `sidekick-03.png` | `exec-43c12db2-7c0a-43ab-82a2-e86873625827.png` | `1C87E8226B6E1B71329B98DD124D1EDD53569D9F5B25C7D5C00BA90857DE3CBC` |
| `sidekick-04.png` | `exec-4ab612fc-d5d5-49f7-b403-84113af13c99.png` | `0056E6E2C7E3451BF3E423BFA299FE8F28F10AC559CACCAA307D1152252963E1` |
| `sidekick-05.png` | `exec-9f808b7f-3d2c-4456-b48d-20ca57afc209.png` | `11C2538C7C7C410FEF7EE75FF4E08CAEF6C938E7F10172C3EF56F7C58D1EF0BA` |
| `sidekick-06.png` | `exec-eca82f95-87fc-4d3c-80a2-f94826c90dc1.png` | `A0460E59C333438F15A30DF4A94357322699796D28BC78B0EE678EEF627BCC25` |

The three six-character composite sheets in the source directory are not used as launch icons. The icon choice is intentionally not tied to a persona, browser profile, or Space.

## Decoder check

Tested each shipped PNG and a lossless JXL conversion in an isolated hidden Electron renderer using the lockfile version `37.10.3+wvcus` (Chromium `138.0.7204.251`) with `sandbox: true`. All six PNGs decoded at 1298×1212. All six JXL files failed `HTMLImageElement.decode()` with `EncodingError: The source image cannot be decoded.` The application therefore uses the six original PNGs; JXL is not included.
