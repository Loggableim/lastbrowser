import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface UseComposerMoreMenuResult {
  moreOpen: boolean;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showManualModels: boolean;
  setShowManualModels: React.Dispatch<React.SetStateAction<boolean>>;
  manualModelSearch: string;
  setManualModelSearch: React.Dispatch<React.SetStateAction<string>>;
  moreContainerRef: React.RefObject<HTMLDetailsElement | null>;
  moreSummaryRef: React.RefObject<HTMLElement | null>;
  manualModelTriggerRef: React.RefObject<HTMLButtonElement | null>;
  manualModelSearchInputRef: React.RefObject<HTMLInputElement | null>;
  openManualModels: () => void;
  closeManualModels: (restoreFocus?: boolean) => void;
  closeMoreMenu: (restoreFocus?: boolean) => void;
  handleMoreKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  handleManualModelsKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export function useComposerMoreMenu(): UseComposerMoreMenuResult {
  const [moreOpen, setMoreOpen] = useState(false);
  const [showManualModels, setShowManualModels] = useState(false);
  const [manualModelSearch, setManualModelSearch] = useState('');

  const moreContainerRef = useRef<HTMLDetailsElement>(null);
  const moreSummaryRef = useRef<HTMLElement>(null);
  const manualModelTriggerRef = useRef<HTMLButtonElement>(null);
  const manualModelSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showManualModels) {
      manualModelSearchInputRef.current?.focus();
    }
  }, [showManualModels]);

  const closeManualModels = useCallback((restoreFocus = true) => {
    setShowManualModels(false);
    setManualModelSearch('');
    if (restoreFocus) {
      queueMicrotask(() => {
        if (moreContainerRef.current?.open) {
          manualModelTriggerRef.current?.focus();
        } else {
          moreSummaryRef.current?.focus();
        }
      });
    }
  }, []);

  const closeMoreMenu = useCallback((restoreFocus = true) => {
    setMoreOpen(false);
    if (moreContainerRef.current) {
      moreContainerRef.current.open = false;
    }
    if (restoreFocus) {
      queueMicrotask(() => moreSummaryRef.current?.focus());
    }
  }, []);

  const openManualModels = useCallback(() => {
    setShowManualModels((current) => !current);
  }, []);

  // Outside click handler for the More popover
  useEffect(() => {
    if (!moreOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (moreContainerRef.current && !moreContainerRef.current.contains(target)) {
        setMoreOpen(false);
        moreContainerRef.current.open = false;
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [moreOpen]);

  const handleMoreKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMoreMenu(true);
        return;
      }

      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Home' ||
        event.key === 'End'
      ) {
        const container = moreContainerRef.current;
        if (!container || !container.open) return;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            '.composer-more-content button:not(:disabled), .composer-more-content select:not(:disabled), .composer-more-content input:not(:disabled)'
          )
        );
        if (focusables.length === 0) return;

        const activeIndex = focusables.indexOf(document.activeElement as HTMLElement);
        if (event.key === 'Home') {
          event.preventDefault();
          focusables[0]?.focus();
        } else if (event.key === 'End') {
          event.preventDefault();
          focusables[focusables.length - 1]?.focus();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          const next = activeIndex < 0 ? 0 : (activeIndex + 1) % focusables.length;
          focusables[next]?.focus();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          const prev =
            activeIndex <= 0 ? focusables.length - 1 : (activeIndex - 1 + focusables.length) % focusables.length;
          focusables[prev]?.focus();
        }
      }
    },
    [closeMoreMenu]
  );

  const handleManualModelsKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeManualModels(true);
      }
    },
    [closeManualModels]
  );

  return {
    moreOpen,
    setMoreOpen,
    showManualModels,
    setShowManualModels,
    manualModelSearch,
    setManualModelSearch,
    moreContainerRef,
    moreSummaryRef,
    manualModelTriggerRef,
    manualModelSearchInputRef,
    openManualModels,
    closeManualModels,
    closeMoreMenu,
    handleMoreKeyDown,
    handleManualModelsKeyDown,
  };
}
