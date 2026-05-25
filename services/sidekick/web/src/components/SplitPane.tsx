/**
 * SplitPane — a resizable split-pane container that supports both
 * horizontal (side-by-side) and vertical (stacked) orientations.
 *
 * Features:
 *   • Drag-to-resize with a visible divider handle
 *   • Orientation toggle (horizontal ↔ vertical)
 *   • localStorage persistence (size & orientation)
 *   • Min-size enforcement per pane
 *   • Double-click divider to restore default sizes
 */
import { GripVertical, LayoutPanelTop, Columns2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type PaneOrientation = "horizontal" | "vertical";

export interface SplitPaneProps {
  /** Unique storage key. Persisted as `${STORAGE_PREFIX}${id}`. */
  id: string;
  /** Initial orientation for first-visit users. */
  defaultOrientation?: PaneOrientation;
  /** Default split fraction (0–1); each entry is the fractional size for
   *  that pane.  Sizes are recomputed on mount so they're always valid. */
  defaultSizes?: number[];
  /** Minimum pane sizes in pixels. */
  minSizes?: number[];
  /** Two or more children — each becomes a pane. */
  children: React.ReactNode[];
  className?: string;
}

const STORAGE_PREFIX = "hermes-split-pane-";
const MIN_PANE_PX = 80;
const DIVIDER_SIZE = 8; // px — the drag handle region

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------
function loadPersisted(
  id: string,
): { sizes: number[]; orientation: PaneOrientation } | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as { sizes: number[]; orientation: PaneOrientation };
  } catch {
    return null;
  }
}

function persist(
  id: string,
  sizes: number[],
  orientation: PaneOrientation,
) {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${id}`,
      JSON.stringify({ sizes, orientation }),
    );
  } catch {
    // Storage full or disabled — silently degrade.
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SplitPane({
  id,
  defaultOrientation = "horizontal",
  defaultSizes = [0.5, 0.5],
  minSizes = [MIN_PANE_PX, MIN_PANE_PX],
  children,
  className,
}: SplitPaneProps) {
  const paneCount = React.Children.count(children);
  const safeCount = Math.max(paneCount, 2);

  // Normalise defaultSizes so they sum to 1.
  const normDefaults = normaliseSizes(defaultSizes, safeCount);
  const normMins = padMins(minSizes, safeCount);

  // Restore persisted state or fall back to defaults.
  const persisted = useRef(loadPersisted(id));
  const [orientation, setOrientation] = useState<PaneOrientation>(
    persisted.current?.orientation ?? defaultOrientation,
  );
  const [sizes, setSizes] = useState<number[]>(
    () => persisted.current?.sizes ?? normDefaults,
  );

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Mutable ref for sizes to avoid stale closures in pointer handlers.
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;

  // Persist state changes (debounced).
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePersist = useCallback(
    (ori: PaneOrientation, sz: number[]) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        persist(id, sz, ori);
        persistTimer.current = null;
      }, 300);
    },
    [id],
  );

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  // --- Orientation toggle -------------------------------------------------
  const handleOrientationToggle = useCallback(() => {
    setOrientation((prev) => {
      const next: PaneOrientation =
        prev === "horizontal" ? "vertical" : "horizontal";
      const reset = normaliseSizes(defaultSizes, safeCount);
      setSizes(reset);
      schedulePersist(next, reset);
      return next;
    });
  }, [defaultSizes, safeCount, schedulePersist]);

  // --- Drag -----------------------------------------------------------------
  // Using a ref instead of state to avoid re-renders on every pixel.
  const dragRef = useRef<{
    index: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);

  const handlePointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;

      const el = e.target as HTMLElement;
      el.setPointerCapture(e.pointerId);

      dragRef.current = {
        index,
        startPos:
          orientationRef.current === "horizontal" ? e.clientX : e.clientY,
        startSizes: [...sizesRef.current],
      };
    },
    [],
  );

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const isHoriz = orientationRef.current === "horizontal";
      const totalSize = isHoriz ? rect.width : rect.height;

      if (totalSize <= 0) return;

      const currentPos = isHoriz ? e.clientX : e.clientY;
      const offset = currentPos - drag.startPos;
      const ratioDelta = offset / totalSize;

      const newSizes = [...drag.startSizes];
      const idx = drag.index;

      const minFrac0 = normMins[idx] / totalSize;
      const minFrac1 = normMins[idx + 1] / totalSize;

      let newLeft = drag.startSizes[idx] + ratioDelta;
      let newRight = drag.startSizes[idx + 1] - ratioDelta;

      // Clamp
      if (newLeft < minFrac0) {
        newLeft = minFrac0;
        newRight = 1 - newLeft;
      } else if (newRight < minFrac1) {
        newRight = minFrac1;
        newLeft = 1 - newRight;
      }

      newSizes[idx] = newLeft;
      newSizes[idx + 1] = newRight;

      setSizes(newSizes);
    };

    const handlePointerUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      schedulePersist(orientationRef.current, sizesRef.current);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [schedulePersist, normMins]);

  // --- Double-click divider to reset ---------------------------------------
  const handleDividerDoubleClick = useCallback(() => {
    const reset = normaliseSizes(defaultSizes, safeCount);
    setSizes(reset);
    schedulePersist(orientation, reset);
  }, [defaultSizes, safeCount, orientation, schedulePersist]);

  // --- Render children as array -------------------------------------------
  const childArray = React.Children.toArray(children).slice(0, safeCount);
  const isHorizontal = orientation === "horizontal";

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/splitpane relative flex min-h-0 min-w-0 select-none overflow-hidden",
        isHorizontal ? "flex-row" : "flex-col",
        className,
      )}
    >
      {childArray.map((child, idx) => (
        <React.Fragment key={idx}>
          {/* Pane */}
          <div
            className={cn(
              "min-h-0 min-w-0 overflow-hidden",
              idx < safeCount - 1 && "shrink-0",
              idx === safeCount - 1 && "flex-1",
            )}
            style={
              idx < safeCount - 1 && sizes[idx] !== undefined
                ? {
                    [isHorizontal ? "width" : "height"]: `${
                      sizes[idx] * 100
                    }%`,
                  }
                : idx === safeCount - 1
                  ? { flex: 1 }
                  : undefined
            }
          >
            {child}
          </div>

          {/* Divider */}
          {idx < safeCount - 1 && (
            <div
              className={cn(
                "relative shrink-0",
                isHorizontal ? "cursor-col-resize" : "cursor-row-resize",
              )}
              style={
                isHorizontal
                  ? { width: DIVIDER_SIZE }
                  : { height: DIVIDER_SIZE }
              }
              onPointerDown={(e) => handlePointerDown(idx, e)}
              onDoubleClick={handleDividerDoubleClick}
            >
              {/* Invisible wider hit area */}
              <div
                className={cn(
                  "absolute z-20",
                  isHorizontal
                    ? "-left-3 -right-3 inset-y-0"
                    : "-top-3 -bottom-3 inset-x-0",
                )}
              />

              {/* Visual divider — subtle line */}
              <div
                className={cn(
                  "absolute inset-0 z-10",
                  "transition-colors duration-150",
                  isHorizontal
                    ? "border-x border-transparent group-hover/splitpane:border-border/30"
                    : "border-y border-transparent group-hover/splitpane:border-border/30",
                )}
              />

              {/* Grip handle (appears on hover) */}
              <div
                className={cn(
                  "absolute z-10",
                  "flex items-center justify-center",
                  "opacity-0 group-hover/splitpane:opacity-100 transition-opacity duration-200",
                  isHorizontal
                    ? "inset-y-0 left-1/2 -translate-x-1/2 w-4"
                    : "inset-x-0 top-1/2 -translate-y-1/2 h-4",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-sm",
                    "bg-midground/10 hover:bg-midground/20",
                    isHorizontal ? "h-8 w-1 flex-col" : "w-8 h-1 flex-row",
                  )}
                >
                  <GripVertical
                    className={cn(
                      "text-midground/40",
                      isHorizontal ? "h-4 w-3" : "h-3 w-4 rotate-90",
                    )}
                  />
                </div>
              </div>
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Orientation toggle — floating button bottom-right */}
      <button
        type="button"
        onClick={handleOrientationToggle}
        className={cn(
          "absolute z-30",
          "flex items-center justify-center",
          "rounded border border-border/30",
          "bg-background-base/70 backdrop-blur-sm",
          "text-midground/50 hover:text-midground hover:bg-background-base/90",
          "transition-all duration-150",
          "opacity-0 group-hover/splitpane:opacity-100",
          "h-6 w-6",
          "bottom-2 right-2",
        )}
        aria-label={`Switch to ${orientation === "horizontal" ? "vertical" : "horizontal"} layout`}
        title={
          orientation === "horizontal"
            ? "Vertical split"
            : "Horizontal split"
        }
      >
        {orientation === "horizontal" ? (
          <LayoutPanelTop className="h-3 w-3" />
        ) : (
          <Columns2 className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normaliseSizes(sizes: number[], count: number): number[] {
  if (sizes.length < count) {
    const sum = sizes.reduce((a, b) => a + b, 0);
    const remaining = 1 - sum;
    const fill = remaining / (count - sizes.length);
    return [...sizes, ...Array(count - sizes.length).fill(fill)];
  }
  if (sizes.length > count) {
    return sizes.slice(0, count);
  }
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (sum <= 0) return Array(count).fill(1 / count);
  return sizes.map((s) => s / sum);
}

function padMins(mins: number[], count: number): number[] {
  if (mins.length >= count) return mins.slice(0, count);
  return [...mins, ...Array(count - mins.length).fill(MIN_PANE_PX)];
}
