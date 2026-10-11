import { isModelActive } from './active-model-selection.js';
import { isMultiAgentModelSelection } from './provider-model-selection.js';
import { saveSpaceModel } from './space-models.js';

export type QuickChatModelChoiceInput = Readonly<{
  storage: Storage;
  browserProfileId: string;
  backendProfileName: string;
  spacePath: string;
  model: string;
  provider?: string;
  allowMultiAgent: boolean;
  setSelectedModel: (model: string) => void;
  setSelectedModelProvider: (provider: string) => void;
}>;

/** Keep the Space override and chat preference aligned after a picker choice or fallback. */
export function acceptQuickChatModelChoice(input: QuickChatModelChoiceInput): boolean {
  const provider = input.provider || '';
  if (!(input.allowMultiAgent && isMultiAgentModelSelection({ model: input.model, provider }))
    && (!provider || !isModelActive(input.storage, {
      browserProfileId: input.browserProfileId, backendProfileName: input.backendProfileName
    }, provider, input.model))) return false;
  if (input.spacePath) saveSpaceModel(input.spacePath, input.model, input.storage, provider);
  input.setSelectedModel(input.model);
  input.setSelectedModelProvider(provider);
  return true;
}
