import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// electron-builder can omit the hoisted `ms` package. `debug`, which
// electron-updater loads while this process starts, requires it. Resolve
// that copy from the staged vendor directory before the app entry imports it.
const vendor = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendor');
type NodeModulePaths = (this: unknown, from: string) => string[];
const nodeModule = Module as unknown as { _nodeModulePaths: NodeModulePaths };
const original = nodeModule._nodeModulePaths;
nodeModule._nodeModulePaths = function (this: unknown, from: string) {
  const paths = original.call(this, from);
  if (!paths.includes(vendor)) paths.unshift(vendor);
  return paths;
};

await import('./main.js');
