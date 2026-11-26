import { verifyOptionalOpenCodeBinary } from './opencode-windows-integrity.mjs';

if (!process.argv[2]) throw new Error('Provide the staged OpenCode binary path.');
const present = await verifyOptionalOpenCodeBinary(process.argv[2]);
console.log(present ? '[opencode] Verified staged Windows client.' : '[opencode] No Windows client staged.');
