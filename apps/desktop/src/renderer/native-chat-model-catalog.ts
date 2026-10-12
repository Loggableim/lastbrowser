export type NativeChatModelScopeSelection = Readonly<{
  browserProfileId: string;
  workspacePath: string | null;
  backendProfileName?: string;
}>;

export type NativeChatModelCatalogRequest = Readonly<{
  method: 'GET';
  path: '/api/models';
  scopeSelection: NativeChatModelScopeSelection;
}>;

export function requestNativeChatModelCatalog<T>(
  requestWebui: (request: NativeChatModelCatalogRequest) => Promise<T>,
  scopeSelection: NativeChatModelScopeSelection
): Promise<T> {
  return requestWebui({ method: 'GET', path: '/api/models', scopeSelection });
}
