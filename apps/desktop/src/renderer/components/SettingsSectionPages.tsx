import { Children, Fragment, cloneElement, isValidElement, type ReactNode } from 'react';
import { SettingsPageDeck } from './SettingsPageDeck.js';
import './settings-section-pages.css';

function flatten(nodes: ReactNode, prefix = 'section'): ReactNode[] {
  return Children.toArray(nodes).flatMap((node, index) => {
    if (!isValidElement<{ children?: ReactNode }>(node)) return [node];
    const key = `${prefix}:${node.key ?? index}`;
    return node.type === Fragment ? flatten(node.props.children, key) : [cloneElement(node, { key })];
  });
}

/** Keep each subsection mounted, including component-owned drafts. */
export function SettingsSectionPages({ children, section, scopeKey, locale }: {
  children: ReactNode; section: string; scopeKey: string; locale: string;
}): JSX.Element {
  if (section === 'providers' || section === 'advanced') return <>{children}</>;
  return <SettingsPageDeck key={scopeKey} resetKey={`${scopeKey}:${section}`}
    label={locale === 'de' ? 'Seite' : 'Page'} subsectionLabel={locale === 'de' ? 'Unterbereich' : 'Subsection'}>
    {flatten(children)}
  </SettingsPageDeck>;
}
