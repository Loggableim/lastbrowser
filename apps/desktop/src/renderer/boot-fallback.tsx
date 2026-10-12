import { useEffect, useRef } from 'react';

export function BootCommitted(): null {
  const loggedRef = useRef(false);
  useEffect(() => {
    if (!loggedRef.current) {
      loggedRef.current = true;
      console.info('[lastbrowser react-root-committed]');
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('boot-fallback')?.remove();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return null;
}
