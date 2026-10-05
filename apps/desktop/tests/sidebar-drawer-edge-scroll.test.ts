import { describe,expect,it } from 'vitest';
import { drawerEdgeDirection } from '../src/renderer/components/useSidebarDrawerEdgeScroll.js';

describe('sidebar drawer hover scrolling',()=>{
  const bounds={left:0,right:280,scrollWidth:420,clientWidth:280};
  it('scrolls only toward an overflowing horizontal edge',()=>{
    expect(drawerEdgeDirection({...bounds,clientX:8})).toBe(-1);
    expect(drawerEdgeDirection({...bounds,clientX:272})).toBe(1);
    expect(drawerEdgeDirection({...bounds,clientX:140})).toBe(0);
    expect(drawerEdgeDirection({...bounds,scrollWidth:280,clientX:272})).toBe(0);
  });
  it('keeps ordinary movement when reduced motion is requested',()=>{
    expect(drawerEdgeDirection({...bounds,clientX:272,reducedMotion:true})).toBe(0);
  });
});
