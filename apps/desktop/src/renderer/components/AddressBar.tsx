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
  searchEngineById
} from '../tabs.js';
import { useDesktopI18n } from '../i18n.js';

export type { OmniboxSuggestion } from '../omnibox-suggestions.js';
import { buildOmniboxSuggestions, type OmniboxPrivacyContext } from '../omnibox-suggestions.js';
import './address-autocomplete.css';

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
  inputRef?: React.RefObject<HTMLInputElement | null>;
  privacyContext?: OmniboxPrivacyContext;
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
  inputRef,
  privacyContext = {}
}: AddressBarProps): JSX.Element {
  const { t } = useDesktopI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [selection, setSelection] = useState<{ query: string; id: string | null } | null>(null);
  const listboxId = React.useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const effectiveInputRef = inputRef ?? fallbackRef;

  const rawQuery = value.trim();

  const suggestions = useMemo(() => buildOmniboxSuggestions(rawQuery, bookmarks, visits, searchEngineId, privacyContext), [rawQuery, bookmarks, visits, searchEngineId, privacyContext.profileId, privacyContext.incognito, privacyContext.allowLegacyHistory]);
  const selectedIndex = selection?.query === rawQuery
    ? suggestions.findIndex(item => item.id === selection.id)
    : suggestions[0]?.autoSelect ? 0 : -1;
  const setSelectedIndex = (index: number): void => setSelection({ query: rawQuery, id: suggestions[index]?.id ?? null });
  const selectedSuggestion = isOpen && selectedIndex >= 0 ? suggestions[selectedIndex] : undefined;

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
    [onSubmit, rawQuery, suggestions]
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
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Tab' && isOpen && suggestions.length > 0) {
        e.preventDefault();
        setSelectedIndex(selectedIndex < 0 ? (e.shiftKey ? suggestions.length - 1 : 0) : (selectedIndex + (e.shiftKey ? -1 : 1) + suggestions.length) % suggestions.length);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen && suggestions.length > 0) {
          setIsOpen(true);
          setSelectedIndex(0);
        } else if (suggestions.length > 0) {
          setSelectedIndex((selectedIndex + 1) % suggestions.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen && suggestions.length > 0) {
          setIsOpen(true);
          setSelectedIndex(suggestions.length - 1);
        } else if (suggestions.length > 0) {
          setSelectedIndex(selectedIndex < 0 ? suggestions.length - 1 : (selectedIndex - 1 + suggestions.length) % suggestions.length);
        }
      } else if (e.key === 'Escape') {
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          setSelectedIndex(-1);
        }
      }
    },
    [isOpen, suggestions, selectedIndex, rawQuery]
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
            setSelection(null);
            setIsOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={selectedSuggestion ? `${listboxId}-${selectedIndex}` : undefined}
          aria-label={t('browser.omnibox.addressLabel')}
          placeholder={t('browser.chrome.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
        />
        <AdblockShield />
        <button
          type="button"
          className={`bookmark-star ${activeBookmarked ? 'active' : ''}`}
          aria-label={activeBookmarked ? t('browser.omnibox.removeBookmark') : t('browser.omnibox.addBookmark')}
          aria-pressed={activeBookmarked}
          disabled={!activeBookmarkable}
          onClick={onToggleBookmark}
        >
          <Star size={15} fill={activeBookmarked ? 'currentColor' : 'none'} />
        </button>
        <button type="submit" aria-label={t('browser.omnibox.navigate')}>
          <Search size={16} />
        </button>
      </form>

      {isOpen && suggestions.length > 0 && (
        <div className="omnibox-dropdown" role="listbox" id={listboxId}>
          {suggestions.map((suggestion, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={suggestion.id}
                role="option"
                id={`${listboxId}-${index}`}
                aria-selected={isSelected}
                className={`omnibox-item ${isSelected ? 'is-selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur before click finishes
                  handleSelect(suggestion.url);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="omnibox-item-icon">
                  {(suggestion.type === 'search' || suggestion.type === 'query') && <Search size={14} />}
                  {suggestion.type === 'url' && <Globe2 size={14} />}
                  {suggestion.type === 'bookmark' && <Star size={14} />}
                  {suggestion.type === 'history' && <Clock size={14} />}
                </div>
                <div className="omnibox-item-content">
                  <span className="omnibox-item-title">{suggestion.query ? t('browser.omnibox.searchSuggestion', { engine: searchEngineById(searchEngineId).label, query: suggestion.query }) : suggestion.title}</span>
                  {!suggestion.query && (
                    <span className="omnibox-item-url">{suggestion.url}</span>
                  )}
                </div>
                <span className={`omnibox-badge ${suggestion.type}`}>
                  {suggestion.type === 'search' ? searchEngineById(searchEngineId).label : suggestion.type === 'url' ? t('browser.omnibox.openUrl') : suggestion.type === 'bookmark' ? t('browser.omnibox.bookmarkBadge') : t('browser.omnibox.historyBadge')}
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
