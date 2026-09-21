import React, {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Globe2, Search, Star, Clock, ArrowRight } from 'lucide-react';
import { AdblockShield } from './AdblockShield.js';
import type { BrowserBookmark } from '../bookmarks.js';
import type { BrowserVisit } from '../history.js';
import {
  normalizeNavigationInput,
  searchEngineById,
  searchUrlFor
} from '../tabs.js';

export type OmniboxSuggestion = {
  id: string;
  type: 'search' | 'url' | 'bookmark' | 'history';
  title: string;
  url: string;
  badge: string;
};

export interface AddressBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (url: string) => void;
  bookmarks: BrowserBookmark[];
  visits: BrowserVisit[];
  searchEngineId: string;
  activeBookmarkable: boolean;
  activeBookmarked: boolean;
  onToggleBookmark: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export function AddressBar({
  value,
  onChange,
  onSubmit,
  bookmarks,
  visits,
  searchEngineId,
  activeBookmarkable,
  activeBookmarked,
  onToggleBookmark,
  inputRef
}: AddressBarProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const effectiveInputRef = inputRef ?? fallbackRef;

  const rawQuery = value.trim();

  // Compute live autocomplete suggestions based on query
  const suggestions = useMemo<OmniboxSuggestion[]>(() => {
    if (!rawQuery || rawQuery.startsWith('lastbrowser://')) {
      return [];
    }

    const items: OmniboxSuggestion[] = [];
    const engine = searchEngineById(searchEngineId);
    const searchUrl = searchUrlFor(rawQuery, searchEngineId);

    // 1. Search engine action
    items.push({
      id: `search-${rawQuery}`,
      type: 'search',
      title: `Search ${engine.label} for "${rawQuery}"`,
      url: searchUrl,
      badge: engine.label
    });

    // 2. Direct URL navigation if input looks like a host/path
    const isDomainLike =
      !rawQuery.includes(' ') &&
      (/^[\w.-]+\.[a-z]{2,}/i.test(rawQuery) ||
        rawQuery.startsWith('http://') ||
        rawQuery.startsWith('https://') ||
        rawQuery.startsWith('localhost'));

    if (isDomainLike) {
      const directUrl = normalizeNavigationInput(rawQuery, searchEngineId);
      if (directUrl !== searchUrl) {
        items.push({
          id: `url-${rawQuery}`,
          type: 'url',
          title: directUrl,
          url: directUrl,
          badge: 'Open URL'
        });
      }
    }

    // 3. Matching bookmarks
    const qLower = rawQuery.toLowerCase();
    const matchedBookmarks = bookmarks
      .filter(
        (b) =>
          b.title.toLowerCase().includes(qLower) ||
          b.url.toLowerCase().includes(qLower)
      )
      .slice(0, 4);

    for (const bm of matchedBookmarks) {
      if (!items.some((item) => item.url === bm.url)) {
        items.push({
          id: `bm-${bm.id}`,
          type: 'bookmark',
          title: bm.title,
          url: bm.url,
          badge: 'Bookmark'
        });
      }
    }

    // 4. Matching visited sites / history
    const matchedVisits = visits
      .filter(
        (v) =>
          v.title.toLowerCase().includes(qLower) ||
          v.url.toLowerCase().includes(qLower)
      )
      .slice(0, 4);

    for (const v of matchedVisits) {
      if (!items.some((item) => item.url === v.url)) {
        items.push({
          id: `hist-${v.url}`,
          type: 'history',
          title: v.title,
          url: v.url,
          badge: 'History'
        });
      }
    }

    return items.slice(0, 7);
  }, [rawQuery, searchEngineId, bookmarks, visits]);

  // Reset selectedIndex whenever query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [rawQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const handleSelect = useCallback(
    (targetUrl: string) => {
      setIsOpen(false);
      setSelectedIndex(-1);
      onSubmit(targetUrl);
    },
    [onSubmit]
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (isOpen && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelect(suggestions[selectedIndex].url);
      } else {
        handleSelect(normalizeNavigationInput(value, searchEngineId));
      }
    },
    [isOpen, selectedIndex, suggestions, value, searchEngineId, handleSelect]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen && suggestions.length > 0) {
          setIsOpen(true);
          setSelectedIndex(0);
        } else if (suggestions.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen && suggestions.length > 0) {
          setIsOpen(true);
          setSelectedIndex(suggestions.length - 1);
        } else if (suggestions.length > 0) {
          setSelectedIndex(
            (prev) => (prev - 1 + suggestions.length) % suggestions.length
          );
        }
      } else if (e.key === 'Escape') {
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          setSelectedIndex(-1);
        }
      }
    },
    [isOpen, suggestions]
  );

  const handleFocus = useCallback(() => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  }, [suggestions.length]);

  return (
    <div className="addressbar-container" ref={containerRef}>
      <form className="addressbar" onSubmit={handleSubmit}>
        <Globe2 size={16} />
        <input
          ref={effectiveInputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          aria-label="Address or search"
          placeholder="Search the web or enter address"
          autoComplete="off"
          spellCheck={false}
        />
        <AdblockShield />
        <button
          type="button"
          className={`bookmark-star ${activeBookmarked ? 'active' : ''}`}
          aria-label={activeBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          aria-pressed={activeBookmarked}
          disabled={!activeBookmarkable}
          onClick={onToggleBookmark}
        >
          <Star size={15} fill={activeBookmarked ? 'currentColor' : 'none'} />
        </button>
        <button type="submit" aria-label="Navigate">
          <Search size={16} />
        </button>
      </form>

      {isOpen && suggestions.length > 0 && (
        <div className="omnibox-dropdown" role="listbox">
          {suggestions.map((suggestion, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={suggestion.id}
                role="option"
                aria-selected={isSelected}
                className={`omnibox-item ${isSelected ? 'is-selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur before click finishes
                  handleSelect(suggestion.url);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="omnibox-item-icon">
                  {suggestion.type === 'search' && <Search size={14} />}
                  {suggestion.type === 'url' && <Globe2 size={14} />}
                  {suggestion.type === 'bookmark' && <Star size={14} />}
                  {suggestion.type === 'history' && <Clock size={14} />}
                </div>
                <div className="omnibox-item-content">
                  <span className="omnibox-item-title">{suggestion.title}</span>
                  {suggestion.type !== 'search' && (
                    <span className="omnibox-item-url">{suggestion.url}</span>
                  )}
                </div>
                <span className={`omnibox-badge ${suggestion.type}`}>
                  {suggestion.badge}
                </span>
                <ArrowRight size={13} className="omnibox-item-arrow" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
