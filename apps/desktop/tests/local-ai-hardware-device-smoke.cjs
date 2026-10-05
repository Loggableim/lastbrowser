#!/usr/bin/env node
// Read-only installed-host inventory through Electron's production probe. Uses only a temporary app userData path.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-hardware-inventory-'));
  const userData = path.join(temp, 'user-data'); fs.mkdirSync(userData);
  const source = `import { app } from 'electron';
import { scanLocalAiHardwareInventory } from './src/main/local-ai-hardware.js';
(async()=>{app.setPath('userData',process.argv[2]);await app.whenReady();
 const value=await scanLocalAiHardwareInventory({cacheDirectory:app.getPath('userData'),timeoutMs:3000});
 const summary={observedAt:value.hardware.observedAt,os:value.hardware.os,arch:value.hardware.arch,cpu:value.hardware.cpuName,
  logicalCores:value.hardware.logicalCores,ramTotalBytes:value.hardware.ramTotalBytes.value,ramAvailableBytes:value.hardware.ramAvailableBytes.value,
  diskFreeBytes:value.hardware.diskFreeBytes.value,adapters:value.hardware.adapters.map(x=>({name:x.name,vendor:x.vendor,
   dedicatedBytes:x.dedicatedBytes.value,processBudgetBytes:x.processBudgetBytes.value,processUsageBytes:x.processUsageBytes.value})),
  probeIssues:value.probeIssues};
 console.log(JSON.stringify(summary));app.exit(0);
})().catch(error=>{console.error(error);app.exit(1);});`;
  try {
    const bundle = path.join(temp, 'probe.cjs');
    require('esbuild').buildSync({ stdin:{contents:source,loader:'ts',resolveDir:path.join(root,'apps/desktop')},
      bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron'],outfile:bundle });
    const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('electron'),[bundle,userData],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr=''; child.stdout.on('data',value=>stdout+=value.toString()); child.stderr.on('data',value=>stderr+=value.toString());
    const timer=setTimeout(()=>child.kill(),30000);
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));}); clearTimeout(timer);
    assert.deepEqual(result,{code:0,signal:null},`Electron hardware inventory failed: ${stderr.slice(-3000)}`);
    const summary=JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
    assert(summary.observedAt && summary.os && summary.arch);
    assert(summary.ramTotalBytes>0 && summary.ramAvailableBytes>=0);
    process.stdout.write(JSON.stringify({phase:'installed-host-hardware-inventory:passed',result:summary})+'\n');
  } finally {
    const target=path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('lastbrowser-hardware-inventory-'));
    fs.rmSync(target,{recursive:true,force:true});
  }
}

void main().catch(error=>{console.error(error);process.exitCode=1;});
