import { useCallback, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DragDropOptions<T> {
  /** Called when a drag starts. */
  onDragStart?: (item: T, event: DragEvent) => void;
  /** Called on every drag-over. Return `true` to allow the drop. */
  onDragOver?: (item: T, target: T, event: DragEvent) => boolean;
  /** Called when the item is dropped onto a drop zone. */
  onDrop?: (item: T, target: T | null, event: DragEvent) => void;
  /** Called when the drag ends (drop or cancel). */
  onDragEnd?: (item: T, event: DragEvent) => void;
  /**
   * Optional dataTransfer key for serialising the dragged item.
   * Defaults to `"application/x-hermes-dnd-item"`.
   */
  dataKey?: string;
  /**
   * Optional serializer for storing the item in dataTransfer.
   * Defaults to `JSON.stringify`.
   */
  serialize?: (item: T) => string;
  /**
   * Optional deserializer for reading the item from dataTransfer.
   * Defaults to `JSON.parse`.
   */
  deserialize?: (raw: string) => T;
}

export interface DraggableProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

export interface DropZoneProps {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface UseDragDropReturn<T> {
  /** Spread these props onto any draggable element. */
  draggableProps: (item: T) => DraggableProps;
  /** Spread these props onto any drop-zone element. */
  dropZoneProps: (target: T) => DropZoneProps;
  /** `true` while any item is being dragged. */
  isDragging: boolean;
  /** The drop-zone item currently being hovered, or `null`. */
  dragOverItem: T | null;
  /** The item currently being dragged, or `null`. */
  draggingItem: T | null;
}

/* ------------------------------------------------------------------ */
/*  Default helpers                                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_DATA_KEY = "application/x-hermes-dnd-item";

function defaultSerialize<T>(item: T): string {
  return JSON.stringify(item);
}

function defaultDeserialize<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * `useDragDrop<T>` — Generic HTML5 Drag & Drop hook.
 *
 * Works with any item type `<T>` (Channel, Member, File, etc.).
 * Tracks `isDragging` and `dragOverItem` state automatically.
 *
 * ```tsx
 * const { draggableProps, dropZoneProps, isDragging } = useDragDrop<MyItem>({
 *   onDrop: (item, target) => console.log(item, "dropped on", target),
 * });
 *
 * return (
 *   <div {...dropZoneProps(someTarget)}>
 *     <div {...draggableProps(item)}>Drag me</div>
 *   </div>
 * );
 * ```
 */
export function useDragDrop<T>(
  options: DragDropOptions<T> = {},
): UseDragDropReturn<T> {
  const {
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    dataKey = DEFAULT_DATA_KEY,
    serialize = defaultSerialize,
    deserialize = defaultDeserialize,
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [dragOverItem, setDragOverItem] = useState<T | null>(null);

  // We keep the current drag item in a ref so the native DnD callbacks
  // (which receive a React.DragEvent wrapper around DragEvent) can read
  // it without stale closures.
  const draggingItemRef = useRef<T | null>(null);
  const [draggingItem, setDraggingItem] = useState<T | null>(null);

  /* ------- draggableProps ---------------------------------------- */

  const draggableProps = useCallback(
    (item: T): DraggableProps => ({
      draggable: true as const,

      onDragStart: (e: React.DragEvent) => {
        // Store serialised item so drop zones can retrieve it.
        e.dataTransfer.setData(dataKey, serialize(item));

        // Optionally set a drag-image hint.
        e.dataTransfer.effectAllowed = "move";

        // Update state.
        draggingItemRef.current = item;
        setDraggingItem(item);
        setIsDragging(true);

        onDragStart?.(item, e.nativeEvent);
      },

      onDragEnd: (e: React.DragEvent) => {
        draggingItemRef.current = null;
        setDraggingItem(null);
        setIsDragging(false);
        setDragOverItem(null);

        onDragEnd?.(item, e.nativeEvent);
      },
    }),
    [dataKey, serialize, onDragStart, onDragEnd],
  );

  /* ------- dropZoneProps ----------------------------------------- */

  const dropZoneProps = useCallback(
    (target: T): DropZoneProps => ({
      onDragOver: (e: React.DragEvent) => {
        // Default is not-allowed; caller must return true from onDragOver to allow.
        e.preventDefault();

        // Accept or reject via user callback.
        const item = draggingItemRef.current;
        if (item != null && onDragOver) {
          if (!onDragOver(item, target, e.nativeEvent)) {
            e.dataTransfer.dropEffect = "none";
            return;
          }
        }

        e.dataTransfer.dropEffect = "move";
        setDragOverItem(target);
      },

      onDragLeave: (_e: React.DragEvent) => {
        // Only clear if this is THE active target (not a child entering/leaving).
        // We use a lightweight heuristic: clear on every leave; the next
        // dragover on a child will re-set it immediately.
        setDragOverItem((current) => (current === target ? null : current));
      },

      onDrop: (e: React.DragEvent) => {
        e.preventDefault();

        const raw = e.dataTransfer.getData(dataKey);
        if (!raw) return;

        let item: T;
        try {
          item = deserialize(raw);
        } catch {
          // If deserialisation fails, silently bail.
          return;
        }

        const currentTarget = target;

        // Clear drag state immediately so the UI feels responsive.
        draggingItemRef.current = null;
        setDraggingItem(null);
        setIsDragging(false);
        setDragOverItem(null);

        onDrop?.(item, currentTarget, e.nativeEvent);
      },
    }),
    [dataKey, deserialize, onDragOver, onDrop],
  );

  return {
    draggableProps,
    dropZoneProps,
    isDragging,
    dragOverItem,
    draggingItem,
  };
}
