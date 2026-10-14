# Versioned dependency license inventory

Generated: 2026-10-14T05:11:53.626Z

Regenerate with `node scripts/legal-inventory.mjs` from the repository root.
npm rows are every non-link `node_modules` entry in `package-lock.json`, including nested `node_modules`. The count is lockfile entries, not unique names. Workspace links are listed as skipped and are not third-party packages. Python rows are the pinned Windows runtime in `apps/desktop/scripts/requirements-runtime.txt`, with the license string read from PyPI for that exact version. A missing license is unknown, not compatible.

npm lockfile entries: 486. Nested entries: 79. Unique names: 407. Missing license field: 0. Skipped workspace links: 1.

| SPDX or lockfile license | Count |
| :--- | ---: |
| MIT | 391 |
| ISC | 47 |
| MPL-2.0 | 12 |
| Apache-2.0 | 9 |
| BlueOak-1.0.0 | 8 |
| BSD-2-Clause | 7 |
| BSD-3-Clause | 6 |
| (MIT OR CC0-1.0) | 1 |
| (WTFPL OR MIT) | 1 |
| CC-BY-4.0 | 1 |
| Python-2.0 | 1 |
| WTFPL | 1 |
| WTFPL OR ISC | 1 |

Pinned Python runtime packages: 66. Missing PyPI license: 0.

| Package | Version | License evidence |
| :--- | :--- | :--- |
| annotated-doc | 0.0.5 | MIT |
| annotated-types | 0.8.0 | MIT |
| anthropic | 1.10.0 | MIT |
| anyio | 4.15.1 | MIT |
| attrs | 26.1.0 | MIT |
| certifi | 2026.7.22 | MPL-2.0 |
| cffi | 2.1.1 | MIT-0 |
| charset-normalizer | 3.5.2 | MIT |
| click | 8.5.0 | BSD-3-Clause |
| colorama | 0.4.6 | License :: OSI Approved :: BSD License (classifier only) |
| croniter | 6.2.4 | MIT |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause |
| distro | 1.9.0 | Apache License, Version 2.0 |
| docstring_parser | 0.18.0 | MIT |
| fastapi | 0.142.2 | MIT |
| fire | 0.7.1 | Apache-2.0 |
| h11 | 0.16.0 | MIT |
| httpcore | 1.0.9 | BSD-3-Clause |
| httpcore2 | 2.13.1 | BSD-3-Clause |
| httptools | 0.8.0 | MIT |
| httpx | 0.28.1 | BSD-3-Clause |
| httpx-sse | 0.4.3 | MIT |
| httpx2 | 2.13.1 | BSD-3-Clause |
| idna | 3.20 | BSD-3-Clause |
| jiter | 0.17.0 | MIT |
| jsonschema | 4.26.0 | MIT |
| jsonschema-specifications | 2025.9.1 | MIT |
| markdown-it-py | 4.2.0 | License :: OSI Approved :: MIT License (classifier only) |
| mcp | 1.26.0 | MIT |
| mdurl | 0.1.2 | License :: OSI Approved :: MIT License (classifier only) |
| openai | 2.54.0 | Apache-2.0 |
| opentelemetry-api | 1.45.0 | Apache-2.0 |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| prompt_toolkit | 3.0.53 | License :: OSI Approved :: BSD License (classifier only) |
| pycparser | 3.0 | BSD-3-Clause |
| pydantic | 2.13.5 | MIT |
| pydantic-settings | 2.15.0 | MIT |
| pydantic_core | 2.46.5 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| PyJWT | 2.15.1 | MIT |
| python-dateutil | 2.9.0.post0 | Dual License |
| python-dotenv | 1.2.4 | BSD-3-Clause |
| python-multipart | 0.0.32 | Apache-2.0 |
| pywin32 | 312 | PSF |
| PyYAML | 6.0.3 | MIT |
| referencing | 0.37.0 | MIT |
| requests | 2.34.2 | Apache-2.0 |
| rich | 15.0.0 | MIT |
| rpds-py | 2026.6.3 | MIT |
| setuptools | 84.0.0 | MIT |
| six | 1.17.0 | MIT |
| sniffio | 1.3.1 | MIT OR Apache-2.0 |
| sse-starlette | 3.5.0 | BSD-3-Clause |
| starlette | 1.7.0 | BSD-3-Clause |
| termcolor | 3.3.0 | MIT |
| tqdm | 4.70.1 | MPL-2.0 AND MIT |
| truststore | 0.10.4 | MIT |
| typing-inspection | 0.4.4 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 |
| tzdata | 2026.4 | Apache-2.0 |
| urllib3 | 2.8.0 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |
| watchfiles | 1.3.0 | MIT |
| wcwidth | 0.9.1 | License :: OSI Approved :: MIT License (classifier only) |
| websockets | 17.1 | BSD-3-Clause |
| wheel | 0.48.0 | MIT |

Named in `services/sidekick/pyproject.toml` dependency strings but absent from the pinned runtime file. No version and no license is asserted for these names:

- numpy
- chromadb
- sentence-transformers
- python-telegram-bot
- aiohttp
- playwright
- pillow
- tiktoken
- beautifulsoup4
- pytest
- ruff
- build
- coverage

jo.wav sha256 `f789bc3799e64675a6324a978a3fffb0dd7850739d232cbe3d4bbbbc9973a314` (575990 bytes). License: unknown.

