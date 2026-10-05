import React from 'react';
import { useDesktopI18n } from '../i18n.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import { backendProfileCopy } from '../i18n/backend-profile-copy.js';
import type { ProfileBindingEntry } from '../independent-contracts.js';
import { Cpu, ArrowRight } from 'lucide-react';
import './backend-profile.css';

export interface AmbiguousBackendProfileModalProps {
  isOpen: boolean;
  spaceName?: string;
  browserProfileId?: string;
  workspacePath?: string | null;
  matchingBindings?: readonly ProfileBindingEntry[];
  availableProfiles?: readonly string[];
  onSelectProfile: (backendProfileName: string) => void;
  onClose?: () => void;
  locale?: DesktopLocaleId;
}

export function AmbiguousBackendProfileModal({
  isOpen,
  spaceName,
  browserProfileId,
  workspacePath = null,
  matchingBindings = [],
  availableProfiles,
  onSelectProfile,
  onClose,
  locale: propLocale,
}: AmbiguousBackendProfileModalProps): React.JSX.Element | null {
  const { locale: i18nLocale } = useDesktopI18n();
  const currentLocale = (propLocale || i18nLocale || 'en') as DesktopLocaleId;
  const copy = backendProfileCopy(currentLocale);
  const [fetchedProfiles, setFetchedProfiles] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!isOpen || (matchingBindings && matchingBindings.length > 0) || (availableProfiles && availableProfiles.length > 0)) return;
    let active = true;
    if (window?.lastbrowser?.independent?.request) {
      window.lastbrowser.independent.request({ schemaVersion: 1, operation: 'backendProfiles', payload: {} })
        .then((res: any) => {
          if (!active) return;
          const val = (res && typeof res === 'object' && 'ok' in res && res.ok) ? res.value : res;
          if (Array.isArray(val?.profiles)) {
            setFetchedProfiles(val.profiles.map((p: any) => p.name).filter(Boolean));
          }
        }).catch(() => {});
    }
    return () => { active = false; };
  }, [isOpen, matchingBindings, availableProfiles]);

  if (!isOpen) return null;

  const displayName = spaceName || (workspacePath ? (workspacePath.split('/').pop() || 'Space') : 'Space');

  const choices: string[] = matchingBindings && matchingBindings.length > 0
    ? [...new Set(matchingBindings.map(b => b.backendProfileName))]
    : (availableProfiles && availableProfiles.length > 0
        ? [...availableProfiles]
        : (fetchedProfiles.length > 0 ? fetchedProfiles : ['default']));

  return (
    <div className="ambiguous-profile-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ambiguous-profile-title">
      <div className="ambiguous-profile-modal">
        <h3 id="ambiguous-profile-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Cpu size={18} />
          {copy.ambiguousTitle}
        </h3>
        <p>
          {copy.ambiguousPrompt}
        </p>
        <div style={{ fontSize: '0.8rem', opacity: 0.7, padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }}>
          <strong>{displayName}</strong> ({workspacePath || 'Home'})
        </div>
        <div className="ambiguous-profile-options" role="listbox">
          {choices.map(name => (
            <button
              key={name}
              type="button"
              className="ambiguous-profile-button"
              onClick={() => onSelectProfile(name)}
              role="option"
              aria-selected={false}
            >
              <span style={{ fontWeight: 600 }}>{name}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', opacity: 0.8 }}>
                {copy.selectProfile}
                <ArrowRight size={14} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
