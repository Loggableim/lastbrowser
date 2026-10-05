import { useEffect,useRef,type RefObject } from 'react';

const EDGE_PX=26;
export type DrawerEdgeDirection=-1|0|1;

export function drawerEdgeDirection(input:Readonly<{clientX:number;left:number;right:number;scrollWidth:number;clientWidth:number;reducedMotion?:boolean}>):DrawerEdgeDirection{
  if(input.reducedMotion||input.scrollWidth-input.clientWidth<=1)return 0;
  if(input.clientX<=input.left+EDGE_PX)return -1;
  if(input.clientX>=input.right-EDGE_PX)return 1;
  return 0;
}

export function useSidebarDrawerEdgeScroll<T extends HTMLElement=HTMLDivElement>():RefObject<T|null>{
  const ref=useRef<T|null>(null);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const hoverSurface=element.parentElement??element;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let direction:DrawerEdgeDirection=0,frame=0,lastTime=0;
    const stop=()=>{direction=0;lastTime=0;if(frame){window.cancelAnimationFrame(frame);frame=0;}};
    const tick=(time:number)=>{
      frame=0;if(!direction||motion.matches)return;
      const elapsed=lastTime?Math.min(40,time-lastTime):16;lastTime=time;
      const before=element.scrollLeft;element.scrollLeft+=direction*elapsed*0.42;
      if(element.scrollLeft===before){stop();return;}
      frame=window.requestAnimationFrame(tick);
    };
    const move=(event:PointerEvent)=>{
      if(event.pointerType!=='mouse'){stop();return;}
      const bounds=hoverSurface.getBoundingClientRect();
      const next=drawerEdgeDirection({clientX:event.clientX,left:bounds.left,right:bounds.right,
        scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,reducedMotion:motion.matches});
      if(next!==direction){direction=next;lastTime=0;if(frame){window.cancelAnimationFrame(frame);frame=0;}}
      if(direction&&!frame)frame=window.requestAnimationFrame(tick);
    };
    const reduceMotion=()=>{if(motion.matches)stop();};
    hoverSurface.addEventListener('pointermove',move,{passive:true});
    hoverSurface.addEventListener('pointerleave',stop,{passive:true});
    hoverSurface.addEventListener('mouseleave',stop,{passive:true});
    element.addEventListener('focusout',stop);
    window.addEventListener('blur',stop);
    motion.addEventListener?.('change',reduceMotion);
    return()=>{
      stop();hoverSurface.removeEventListener('pointermove',move);hoverSurface.removeEventListener('pointerleave',stop);
      hoverSurface.removeEventListener('mouseleave',stop);element.removeEventListener('focusout',stop);
      window.removeEventListener('blur',stop);motion.removeEventListener?.('change',reduceMotion);
    };
  },[]);
  return ref;
}
