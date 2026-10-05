import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Lock, Layers, Cpu, CheckCircle } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import { backendProfileCopy } from '../i18n/backend-profile-copy.js';
import type { BackendProfileEntry, ProfileBindingEntry, BackendProfilesResponse, ProfileBindingsResponse } from '../independent-contracts.js';
import { isBackendProfilesResponse, isProfileBindingsResponse } from '../independent-assistant-client.js';
import './backend-profile.css';

export interface BackendProfileControlsProps {
  activeBrowserProfileId: string;
  activeSpacePath?: string | null;
  locale?: DesktopLocaleId;
  compact?: boolean;
  onSelectBackendProfile?: (profileName: string) => void;
}

export function BackendProfileControls({
  activeBrowserProfileId,
  activeSpacePath = null,
  locale: propLocale,
  compact = false,
  onSelectBackendProfile,
}: BackendProfileControlsProps): React.JSX.Element {
  const { locale: i18nLocale } = useDesktopI18n();
  const currentLocale = (propLocale || i18nLocale || 'en') as DesktopLocaleId;
  const copy = backendProfileCopy(currentLocale);

  const [backendProfiles, setBackendProfiles] = useState<readonly BackendProfileEntry[]>([]);
  const [bindings, setBindings] = useState<readonly ProfileBindingEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedUnbound, setSelectedUnbound] = useState<string>('default');

  const fetchProfileData = useCallback(async () => {
    if (!window?.lastbrowser?.independent?.request) return;
    setLoading(true);
    try {
      const [profilesRes, bindingsRes] = await Promise.all([
        window.lastbrowser.independent.request({
          schemaVersion: 1,
          operation: 'backendProfiles',
          payload: {},
        }).catch(() => null),
        window.lastbrowser.independent.request({
          schemaVersion: 1,
          operation: 'profileBindings',
          payload: { browserProfileId: activeBrowserProfileId },
        }).catch(() => null),
      ]);

      const pVal = (profilesRes && typeof profilesRes === 'object' && 'ok' in profilesRes && (profilesRes as any).ok) ? (profilesRes as any).value : profilesRes;
      if (isBackendProfilesResponse(pVal)) {
        setBackendProfiles(pVal.profiles);
      }

      const bVal = (bindingsRes && typeof bindingsRes === 'object' && 'ok' in bindingsRes && (bindingsRes as any).ok) ? (bindingsRes as any).value : bindingsRes;
      if (isProfileBindingsResponse(bVal)) {
        setBindings(bVal.bindings);
      }
    } finally {
      setLoading(false);
    }
  }, [activeBrowserProfileId]);

  useEffect(() => {
    void fetchProfileData();
  }, [fetchProfileData]);

  const currentSpaceBinding = bindings.find(b => {
    if (!activeSpacePath) return b.workspacePath === null;
    return b.workspacePath === activeSpacePath;
  });

  const handleUnboundChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedUnbound(val);
    onSelectBackendProfile?.(val);
  };

  return (
    <div className="backend-profile-container" data-testid="backend-profile-controls">
      {!compact && (
        <div className="backend-profile-contrast-grid">
          <div className="backend-profile-card">
            <div className="backend-profile-card-header">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={16} />
                {copy.browserProfile}
              </span>
              <span className="backend-profile-badge">{activeBrowserProfileId}</span>
            </div>
            <div className="backend-profile-card-desc">{copy.browserProfileDesc}</div>
          </div>

          <div className="backend-profile-card">
            <div className="backend-profile-card-header">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Cpu size={16} />
                {copy.backendProfile}
              </span>
              {currentSpaceBinding ? (
                <span className="backend-profile-badge locked">
                  <Lock size={12} />
                  {currentSpaceBinding.backendProfileName}
                </span>
              ) : (
                <span className="backend-profile-badge unbound">
                  {copy.unbound}
                </span>
              )}
            </div>
            <div className="backend-profile-card-desc">{copy.backendProfileDesc}</div>
          </div>
        </div>
      )}

      {/* Current Space Status & Assignment */}
      <div className="backend-profile-card" data-testid="current-space-profile-card">
        <div className="backend-profile-card-header">
          <span>{copy.savedBinding}: {activeSpacePath || 'Home'}</span>
          {currentSpaceBinding ? (
            <span className="backend-profile-badge locked" title={copy.bindingProtected}>
              <Shield size={12} />
              {currentSpaceBinding.backendProfileName}
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select
                className="backend-profile-select"
                value={selectedUnbound}
                onChange={handleUnboundChange}
                aria-label={copy.chooseProfile}
              >
                {backendProfiles.length > 0 ? (
                  backendProfiles.map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name}{p.isDefault ? ` (${copy.defaultTag})` : ''}
                    </option>
                  ))
                ) : (
                  <option value="default">default ({copy.defaultTag})</option>
                )}
              </select>
            </div>
          )}
        </div>
        {currentSpaceBinding && (
          <div className="backend-profile-card-desc" style={{ color: '#34d399' }}>
            <CheckCircle size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            {copy.bindingProtected}
          </div>
        )}
      </div>

      {/* Space Bindings list */}
      {bindings.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.85rem' }}>
            {copy.activeBindings}
          </div>
          <div className="backend-profile-bindings-list">
            {bindings.map(b => (
              <div key={b.scope.spaceId} className="backend-profile-binding-item">
                <div>
                  <div className="backend-profile-binding-name">{b.spaceName}</div>
                  <div className="backend-profile-binding-path">{b.workspacePath || 'Home'}</div>
                </div>
                <span className="backend-profile-badge locked">
                  <Lock size={12} />
                  {b.backendProfileName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
