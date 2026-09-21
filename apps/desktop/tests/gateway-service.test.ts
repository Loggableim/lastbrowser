import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  SidecarServices,
  resolveServiceLayout,
  type ServiceLayout
} from '../src/main/services.js';

describe('messaging gateway daemon service', () => {
  it('starts the messaging gateway daemon with sidekick CLI gateway run', async () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');
    const spawned: Array<{ command: string; args: string[]; options: any }> = [];
    const fakeGatewayProcess = new EventEmitter() as EventEmitter & { pid: number; kill: () => void };
    fakeGatewayProcess.pid = 4321;
    fakeGatewayProcess.kill = vi.fn();

    const service = new SidecarServices(
      layout,
      8787,
      ((command: string, args: string[], options: any) => {
        spawned.push({ command, args, options });
        return fakeGatewayProcess as never;
      }) as never,
      async () => 8787
    );

    expect(service.getGatewayStatus().running).toBe(false);

    const status = await service.startGateway();
    expect(status.running).toBe(true);
    expect(status.pid).toBe(4321);

    expect(spawned).toHaveLength(1);
    expect(spawned[0].command).toBe(layout.pythonExe);
    expect(spawned[0].args).toEqual(['-m', 'sidekick_cli.main', 'gateway', 'run']);
    expect(spawned[0].options.cwd).toBe(layout.sidekickDir);
    expect(spawned[0].options.env.SIDEKICK_NONINTERACTIVE).toBe('1');
  });

  it('stops running gateway daemon process cleanly', async () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');
    const fakeGatewayProcess = new EventEmitter() as EventEmitter & { pid: number; kill: () => void };
    fakeGatewayProcess.pid = 5555;
    fakeGatewayProcess.kill = vi.fn();

    const service = new SidecarServices(
      layout,
      8787,
      (() => fakeGatewayProcess) as never,
      async () => 8787
    );

    await service.startGateway();
    expect(service.getGatewayStatus().running).toBe(true);

    const stopStatus = await service.stopGateway();
    expect(stopStatus.running).toBe(false);
    expect(stopStatus.pid).toBeNull();
    expect(fakeGatewayProcess.kill).toHaveBeenCalled();
  });

  it('restarts running gateway daemon', async () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');
    let callCount = 0;
    const fakeProcesses: Array<EventEmitter & { pid: number; kill: () => void }> = [];

    const service = new SidecarServices(
      layout,
      8787,
      (() => {
        callCount++;
        const proc = new EventEmitter() as EventEmitter & { pid: number; kill: () => void };
        proc.pid = 1000 + callCount;
        proc.kill = vi.fn();
        fakeProcesses.push(proc);
        return proc;
      }) as never,
      async () => 8787
    );

    await service.startGateway();
    expect(service.getGatewayStatus().pid).toBe(1001);

    const restartStatus = await service.restartGateway();
    expect(fakeProcesses[0].kill).toHaveBeenCalled();
    expect(restartStatus.running).toBe(true);
    expect(restartStatus.pid).toBe(1002);
  });

  it('terminates gateway process when main service stop() is called', async () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');
    const fakeGatewayProcess = new EventEmitter() as EventEmitter & { pid: number; kill: () => void };
    fakeGatewayProcess.pid = 9999;
    fakeGatewayProcess.kill = vi.fn();

    const service = new SidecarServices(
      layout,
      8787,
      (() => fakeGatewayProcess) as never,
      async () => 8787
    );

    await service.startGateway();
    expect(service.getGatewayStatus().running).toBe(true);

    service.stop();
    expect(fakeGatewayProcess.kill).toHaveBeenCalled();
    expect(service.getGatewayStatus().running).toBe(false);
  });
});
