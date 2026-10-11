# Third-Party Software & Dependency Licenses

This document details the licenses of third-party software libraries, runtimes, assets, and dependencies used in or distributed with LastBrowser.

---

## 1. Summary by License Type

| License Identifier | Component Category | Permissible with GPL-3.0? |
| :--- | :--- | :---: |
| **MIT** | Node.js ecosystem, Python ecosystem, llama.cpp, Electron shell | ✅ Yes |
| **ISC** | UI Icons (`lucide-react`) | ✅ Yes |
| **BSD-2-Clause / BSD-3-Clause** | Prompt toolkit, uvicorn, httpx, numpy, cryptography | ✅ Yes |
| **Apache-2.0** | TypeScript, OpenAI client, ChromaDB, Sentence-Transformers, Playwright | ✅ Yes |
| **MPL-2.0** | Ghostery Adblocker engine (`@ghostery/adblocker-electron`) | ✅ Yes (via MPL-2.0 §3.3 Larger Work exception) |
| **LGPLv3** | `python-telegram-bot` (optional plugin) | ✅ Yes (LGPLv3 compatible with GPLv3) |
| **SIL OFL 1.1** | Bundled fonts (Atkinson Hyperlegible, Lexend, OpenDyslexic, Inter, Outfit, KaTeX) | ✅ Yes |
| **BlueOak-1.0.0** | Build utilities | ✅ Yes |
| **HPND** | Pillow imaging library | ✅ Yes |
| **Python-2.0** | `argparse` runtime support | ✅ Yes |

---

## 2. Desktop Shell & Frontend Dependencies (NPM Ecosystem)

### 2.1 Direct Dependencies (`apps/desktop/package.json`)
- **`@ghostery/adblocker-electron`** (2.18.2): **MPL-2.0** (Mozilla Public License 2.0). Pursuant to Section 3.3 of the MPL-2.0, the larger work is distributed under the GNU General Public License v3.0, while original Ghostery source files remain governed by MPL-2.0.
- **`dompurify`** (3.4.16): **MPL-2.0 OR Apache-2.0** (Dual-licensed).
- **`electron-is-dev`** (3.0.1): **MIT**.
- **`electron-updater`** (6.8.3): **MIT**.
- **`lucide-react`** (0.468.0): **ISC** (Copyright (c) Lucide Contributors).
- **`marked`** (18.0.14): **MIT** (Copyright (c) 2018+, Marked Contributors).
- **`node-pty`** (1.1.0): **MIT** (Copyright (c) Microsoft Corporation).
- **`react`** (19.0.0): **MIT** (Copyright (c) Meta Platforms, Inc. and affiliates).
- **`react-dom`** (19.0.0): **MIT** (Copyright (c) Meta Platforms, Inc. and affiliates).
- **`vite`** (7.0.0): **MIT** (Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors).
- **`zustand`** (5.0.15): **MIT** (Copyright (c) 2019 Paul Henschel).

### 2.2 Direct Dev Dependencies (`apps/desktop/package.json`)
- **`electron`** (castlabs/electron-releases 37.10.3+wvcus): **MIT** (Copyright (c) Electron contributors / CastLabs).
- **`electron-builder`** (26.0.0): **MIT**.
- **`esbuild`** (0.27.7): **MIT**.
- **`typescript`** (5.7.0): **Apache-2.0** (Copyright (c) Microsoft Corporation).
- **`vitest`** (3.0.0): **MIT** (Copyright (c) 2021-Present Anthony Fu and Vitest contributors).

### 2.3 Transitive NPM Dependencies Breakdown
A total of 345 packages are scanned across the production and development graphs:
- 270 packages under MIT
- 28 packages under ISC
- 12 packages under MPL-2.0
- 9 packages under Apache-2.0
- 7 packages under BSD-2-Clause
- 6 packages under BlueOak-1.0.0
- 5 packages under BSD-3-Clause
- 5 packages under Public Domain / WTFPL / CC0
- 1 package under CC-BY-4.0 (`caniuse-lite`)
- 1 package under Python-2.0 (`argparse`)

---

## 3. Python Backend Engine (`services/sidekick/pyproject.toml`)

- **`PyYAML`**: MIT (Copyright (c) 2017-2020 Ingy döt Net, 2006-2016 Kirill Simonov)
- **`rich`**: MIT (Copyright (c) 2020 Will McGugan)
- **`prompt_toolkit`**: BSD-3-Clause (Copyright (c) Jonathan Slenders)
- **`fire`**: Apache-2.0 (Copyright 2018 Google LLC)
- **`wcwidth`**: MIT (Copyright (c) 2014 Jeff Quast)
- **`tzdata`**: Apache-2.0 (Copyright 2020 IANA / Paul Eggert)
- **`anthropic`**: MIT (Copyright (c) 2023 Anthropic, PBC)
- **`openai`**: Apache-2.0 (Copyright 2023 OpenAI)
- **`fastapi`**: MIT (Copyright (c) 2018 Sebastián Ramírez)
- **`uvicorn`**: BSD-3-Clause (Copyright (c) Encode OSS Ltd.)
- **`httpx`**: BSD-3-Clause (Copyright (c) Encode OSS Ltd.)
- **`python-dotenv`**: BSD-3-Clause (Copyright (c) 2014 Saurabh Kumar)
- **`cryptography`**: Apache-2.0 OR BSD-3-Clause (Copyright (c) Individual Contributors)
- **`numpy`**: BSD-3-Clause (Copyright (c) 2005-2024 NumPy Developers)
- **`chromadb`**: Apache-2.0 (Copyright 2023 Chroma)
- **`sentence-transformers`**: Apache-2.0 (Copyright 2019 UKP Lab)
- **`python-telegram-bot`**: LGPLv3 (Copyright (c) 2015-2024 Leandro Toledo and python-telegram-bot contributors)
- **`aiohttp`**: Apache-2.0 & MIT (Copyright 2013-2024 aiohttp contributors)
- **`playwright`**: Apache-2.0 (Copyright 2020 Microsoft Corporation)
- **`requests`**: Apache-2.0 (Copyright 2019 Kenneth Reitz)
- **`packaging`**: Apache-2.0 OR BSD-2-Clause (Copyright (c) Donald Stufft and individual contributors)
- **`pillow`**: HPND (Historical Permission Notice and Disclaimer, Copyright (c) 2010-2024 Jeffrey A. Clark)
- **`tiktoken`**: MIT (Copyright (c) 2022 OpenAI, Shantanu Jain)
- **`croniter`**: MIT (Copyright (c) 2010-2022 Matsumoto Taichi)
- **`beautifulsoup4`**: MIT (Copyright (c) Leonard Richardson)

---

## 4. Bundled Binaries & Local AI Model Runtimes

### 4.1 llama.cpp
- **Files**: `apps/desktop/vendor/local-ai/llama-b11377-bin-win-*.zip` (llama.exe, llama-server.exe, ggml.dll, etc.)
- **License**: **MIT License**
- **Copyright**: (c) 2023-2025 Georgi Gerganov and llama.cpp contributors
- **Text**: Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files...

### 4.2 LLVM OpenMP Runtime
- **File**: `libomp.dll`
- **License**: **Apache-2.0 with LLVM Exception**
- **Copyright**: (c) 1997-2025 LLVM Team and Intel Corporation

---

## 5. Typefaces & Fonts

- **Atkinson Hyperlegible Font Family**
  - Path: `apps/desktop/src/renderer/assets/fonts/Atkinson-*`
  - License: SIL Open Font License, Version 1.1 (OFL-1.1)
  - Copyright: (c) 2020-2021 Braille Institute of America, Inc.
- **Lexend Font Family**
  - Path: `apps/desktop/src/renderer/assets/fonts/Lexend-*`
  - License: SIL Open Font License, Version 1.1 (OFL-1.1)
  - Copyright: (c) 2019-2021 Thomas Jockin and Lexend Authors
- **OpenDyslexic Font Family**
  - Path: `apps/desktop/src/renderer/assets/fonts/OpenDyslexic-*`
  - License: SIL Open Font License, Version 1.1 / Bitstream Vera
  - Copyright: (c) 2011-2025 Abbie Gonzalez
- **Inter Font**
  - Path: `lastbrowser.com/assets/fonts/inter-var.woff2`
  - License: SIL Open Font License, Version 1.1 (OFL-1.1)
  - Copyright: (c) 2016-2024 Rasmus Andersson
- **Outfit Font**
  - Path: `lastbrowser.com/assets/fonts/outfit-var.woff2`
  - License: SIL Open Font License, Version 1.1 (OFL-1.1)
  - Copyright: (c) 2021 Onsen, Rodrigo Fuenzalida
- **KaTeX Fonts**
  - Path: `services/sidekick/web/static/vendor/katex/fonts/*`
  - License: SIL Open Font License, Version 1.1 (OFL-1.1)
  - Copyright: (c) 2013-2020 Khan Academy and other contributors
