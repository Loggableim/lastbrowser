import { describe, expect, it } from 'vitest';
import { appendNavigationStep, navigationStep, serializeNavigationDemo } from '../src/renderer/navigation-demo';

describe('deliberate navigation demonstrations', () => {
  it('retains event kinds only and ignores subframes and internal pages', () => {
    const first = navigationStep({ type: 'did-navigate', url: 'https://sample.example/path?session=placeholder#fragment' });
    const second = navigationStep({ type: 'did-navigate-in-page', url: 'https://sample.example/#section', isMainFrame: true });
    expect(first).toBe('navigate');
    expect(second).toBe('in-page');
    expect(navigationStep({ type: 'did-navigate-in-page', url: 'https://sample.example/', isMainFrame: false })).toBeNull();
    expect(navigationStep({ type: 'did-navigate-in-page', url: 'https://sample.example/' })).toBeNull();
    expect(navigationStep({ type: 'did-navigate', url: 'file:///example.txt' })).toBeNull();
    expect(navigationStep({ type: 'did-navigate', url: 'http://127.0.0.1:8123/lastbrowser/v1/' })).toBeNull();
    expect(serializeNavigationDemo([first!, second!])).toBe('{"format":"lastbrowser-navigation-demo","version":1,"steps":["navigate","in-page"]}');
  });

  it('records only into an active tab capture and caps the sequence', () => {
    expect(appendNavigationStep(null, 'tab-A', 'navigate')).toBeNull();
    const active = { scope: 'tab-A', steps: [] };
    expect(appendNavigationStep(active, 'tab-B', 'navigate')).toBe(active);
    let recording = active as NonNullable<ReturnType<typeof appendNavigationStep>>;
    for (let i = 0; i < 32; i++) recording = appendNavigationStep(recording, 'tab-A', 'navigate')!;
    expect(recording.steps).toHaveLength(30);
    expect(active.steps).toEqual([]);
  });
});
