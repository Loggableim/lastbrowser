export type FirstRunWizardPage = 'search' | 'migration' | 'browser' | 'apps' | 'ai' | 'provider' | 'space';
export function firstRunWizardPages(aiChoice: 'enabled' | 'disabled' | null, existingSidekick: boolean): FirstRunWizardPage[] {
  return ['search', ...(existingSidekick ? ['migration' as const] : []), 'browser', 'apps', 'ai', ...(aiChoice === 'enabled' ? ['provider' as const] : []), 'space'];
}
