import { useEffect, useRef, type RefObject } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TouchDragPolyfillOptions {
  /**
   * Optional CSS selector for elements that should be draggable.
   * Defaults to `"[draggable=\"true\"]"`.
   */
  selector?: string;
  /**
   * Minimum finger movement (px) before a touch is promoted to a drag.
   * Prevents accidental drags on tap. Default: `8`.
   */
  threshold?: number;
  /**
   * Number of pixels from the viewport edge that triggers auto-scroll.
   * Set `0` to disable. Default: `40`.
   */
  scrollEdgeMargin?: number;
  /**
   * Auto-scroll speed in px per animation frame. Default: `8`.
   */
  scrollSpeed?: number;
}

/* ------------------------------------------------------------------ */
/*  Touch → Drag event synthesizer                                    */
/* ------------------------------------------------------------------ */

/**
 * `useTouchDragPolyfill` — Synthesises HTML5 Drag & Drop events from
 * touch events on draggable elements inside a container ref.
 *
 * Browsers that natively support DnD on touch (recent Chrome Android,
 * Safari) are often inconsistent. This polyfill gives reliable behaviour
 * by translating:
 *   - `touchstart`   → `dragstart`
 *   - `touchmove`    → `dragover`
 *   - `touchend`     → `drop` / `dragend`
 *
 * Usage:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * useTouchDragPolyfill(containerRef);
 *
 * return (
 *   <div ref={containerRef}>
 *     <div draggable="true" onDragStart={handleStart}>Item</div>
 *   </div>
 * );
 * ```
 */
export function useTouchDragPolyfill(
  containerRef: RefObject<HTMLElement | null>,
  options: TouchDragPolyfillOptions = {},
): void {
  const {
    selector = '[draggable="true"]',
    threshold = 8,
    scrollEdgeMargin = 40,
    scrollSpeed = 8,
  } = options;

  // Keep mutable state in a ref so we don't re-attach listeners on change.
  const stateRef = useRef({
    dragActive: false,
    dragElement: null as HTMLElement | null,
    touchStartX: 0,
    touchStartY: 0,
    dragGhost: null as HTMLElement | null,
    ghostOffsetX: 0,
    ghostOffsetY: 0,
    animFrameId: 0,
    initialDataTransfer: null as DataTransfer | null,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ------ helpers -------------------------------------------- */

    /** Synthesise a DragEvent from a TouchEvent. */
    function synthEvent(
      type: "dragstart" | "dragover" | "drop" | "dragend" | "dragleave",
      touch: Touch,
      original?: TouchEvent,
      relatedTarget?: HTMLElement,
    ): DragEvent {
      const init: DragEventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: touch.clientX,
        clientY: touch.clientY,
        screenX: touch.screenX,
        screenY: touch.screenY,
        relatedTarget: relatedTarget ?? null,
      };

      const event = new DragEvent(type, init);
      Object.defineProperty(event, "dataTransfer", {
        value: stateRef.current.initialDataTransfer ?? new DataTransfer(),
        writable: false,
      });
      return event;
    }

    /** Find the nearest draggable ancestor (or self) of an element. */
    function closestDraggable(el: EventTarget | null): HTMLElement | null {
      if (!(el instanceof HTMLElement)) return null;
      // Don't go past the container boundary.
      if (el === container) return null;
      return el.closest(selector) as HTMLElement | null;
    }

    /** Create a ghost element that follows the finger. */
    function createGhost(el: HTMLElement, touch: Touch): HTMLElement {
      const ghost = el.cloneNode(true) as HTMLElement;
      const rect = el.getBoundingClientRect();

      ghost.style.position = "fixed";
      ghost.style.left = `${touch.clientX - (touch.clientX - rect.left)}px`;
      ghost.style.top = `${touch.clientY - (touch.clientY - rect.top)}px`;
      ghost.style.width = `${rect.width}px`;
      ghost.style.pointerEvents = "none";
      ghost.style.opacity = "0.7";
      ghost.style.zIndex = "99999";
      ghost.style.transform = "rotate(2deg) scale(1.05)";
      ghost.style.transition = "transform 0.1s ease";
      ghost.classList.add("drag-ghost");
      document.body.appendChild(ghost);

      stateRef.current.ghostOffsetX = rect.left - touch.clientX;
      stateRef.current.ghostOffsetY = rect.top - touch.clientY;

      return ghost;
    }

    /** Auto-scroll when finger is near the viewport edge. */
    function startAutoScroll() {
      const state = stateRef.current;
      if (state.animFrameId) return;

      function tick() {
        const s = stateRef.current;
        if (!s.dragActive) return;

        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = scrollEdgeMargin;
        let dx = 0;
        let dy = 0;

        // We don't have the current touch position here directly;
        // synthesise via a stored last-touch position.
        if (s.touchStartX !== 0) {
          // This is driven by touchmove which stores last coords.
        }

        // Instead, we rely on touchmove to re-trigger scroll frame.
        s.animFrameId = requestAnimationFrame(tick);
      }

      state.animFrameId = requestAnimationFrame(tick);
    }

    function stopAutoScroll() {
      const state = stateRef.current;
      if (state.animFrameId) {
        cancelAnimationFrame(state.animFrameId);
        state.animFrameId = 0;
      }
    }

    /* ------ touch event handlers -------------------------------- */

    function onTouchStart(e: TouchEvent) {
      // Ignore multi-touch.
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const element = closestDraggable(touch.target);
      if (!element) return;

      const state = stateRef.current;
      state.dragElement = element;
      state.touchStartX = touch.clientX;
      state.touchStartY = touch.clientY;
      state.dragActive = false;

      // Initialise a DataTransfer-like bag.
      state.initialDataTransfer = new DataTransfer();
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const state = stateRef.current;
      const el = state.dragElement;
      if (!el) return;

      const dx = touch.clientX - state.touchStartX;
      const dy = touch.clientY - state.touchStartY;

      // Check if threshold is crossed to start the drag.
      if (!state.dragActive) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < threshold) return;

        // ---- PROMOTE TO DRAG (fire dragstart) ---- //
        state.dragActive = true;

        // Prevent default to block scrolling / native touch behaviour.
        e.preventDefault();

        // Synthesise dragstart on the element.
        const startEvent = synthEvent("dragstart", touch, e, el);
        el.dispatchEvent(startEvent);

        // If default was prevented (caller called e.preventDefault() in
        // their onDragStart handler), we proceed with the drag.
        if (startEvent.defaultPrevented) {
          // Create a visual ghost.
          state.dragGhost = createGhost(el, touch);
          startAutoScroll();
        }
        return;
      }

      // ---- ACTIVE DRAG — fire dragover ---- //
      e.preventDefault();

      // Move the ghost.
      if (state.dragGhost) {
        state.dragGhost.style.left = `${touch.clientX + state.ghostOffsetX}px`;
        state.dragGhost.style.top = `${touch.clientY + state.ghostOffsetY}px`;
      }

      // Find the element under the finger (ignore the ghost).
      const target = document.elementFromPoint(touch.clientX, touch.clientY);

      // Fire dragover.
      const overEvent = synthEvent("dragover", touch, e, target as HTMLElement);
      container.dispatchEvent(overEvent);

      // Auto-scroll near edge.
      if (scrollEdgeMargin > 0) {
        const vh = window.innerHeight;
        let scrollDelta = 0;
        if (touch.clientY < scrollEdgeMargin) {
          scrollDelta = -scrollSpeed;
        } else if (touch.clientY > vh - scrollEdgeMargin) {
          scrollDelta = scrollSpeed;
        }
        if (scrollDelta !== 0) {
          window.scrollBy({ top: scrollDelta, behavior: "auto" });
        }
      }
    }

    function onTouchEnd(e: TouchEvent) {
      const state = stateRef.current;
      if (!state.dragActive) {
        // Not a drag — clean up partial state.
        state.dragElement = null;
        return;
      }

      const touch = e.changedTouches[0];
      const el = state.dragElement;

      // Fire drop on the element under the finger.
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropEvent = synthEvent("drop", touch, e, target as HTMLElement);
      container.dispatchEvent(dropEvent);

      // Fire dragend on the source element.
      const endEvent = synthEvent("dragend", touch, e, target as HTMLElement);
      el?.dispatchEvent(endEvent);

      // Clean up.
      if (state.dragGhost) {
        document.body.removeChild(state.dragGhost);
      }
      stopAutoScroll();

      state.dragActive = false;
      state.dragElement = null;
      state.dragGhost = null;
      state.initialDataTransfer = null;
    }

    /* ------ attach ---------------------------------------------- */

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      stopAutoScroll();
    };
  }, [containerRef, selector, threshold, scrollEdgeMargin, scrollSpeed]);
}
