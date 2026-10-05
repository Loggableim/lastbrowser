import { useLayoutEffect,useRef,type RefObject } from 'react';
export function transcriptSelectionActive(container:HTMLElement,selection:Selection|null):boolean {
  return Boolean(selection&&!selection.isCollapsed&&(container.contains(selection.anchorNode)||container.contains(selection.focusNode)));
}
export function transcriptMayFollow(container:HTMLElement,pinned:boolean,selection:Selection|null,focused:Element|null):boolean {
  return pinned&&!transcriptSelectionActive(container,selection)&&!(focused&&container.contains(focused)&&focused.closest('details'));
}
/** Follow genuine output only while the reader remains at the end; disclosure and selection never move it. */
export function useChatTranscriptScroll(identity:string,content:unknown):RefObject<HTMLDivElement|null>{
  const container=useRef<HTMLDivElement>(null),pinned=useRef(true),lastIdentity=useRef(identity);
  useLayoutEffect(()=>{
    const element=container.current;if(!element)return;
    if(lastIdentity.current!==identity){lastIdentity.current=identity;pinned.current=true;}
    const follow=()=>{if(transcriptMayFollow(element,pinned.current,document.getSelection(),document.activeElement))element.scrollTop=element.scrollHeight;};
    const scroll=()=>{pinned.current=element.scrollHeight-element.clientHeight-element.scrollTop<80;};
    const resize=new ResizeObserver(follow);resize.observe(element);for(const child of element.children)resize.observe(child);
    element.addEventListener('scroll',scroll);document.addEventListener('selectionchange',follow);follow();
    return()=>{resize.disconnect();element.removeEventListener('scroll',scroll);document.removeEventListener('selectionchange',follow);};
  },[identity,content]);
  return container;
}
