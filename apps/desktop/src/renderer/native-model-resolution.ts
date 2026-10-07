import { isNativeModelResolution, isIndependentRecord, isIndependentScope } from './independent-assistant-client.js';
import { sameAssistantScope, type IndependentScope, type NativeModelResolution } from './independent-contracts.js';
import type { NativeChatBinding } from './native-chat-control.js';

export function readNativeModelResolutionEvent(
  payload: unknown,
  binding: NativeChatBinding,
  expectedWriterGeneration?: string
): NativeModelResolution | null {
  if (!isIndependentRecord(payload) || payload.event !== 'nativeModelResolution' || payload.streamId !== binding.streamId
    || !isIndependentRecord(payload.nativeContext) || !isNativeModelResolution(payload.data)) return null;
  const context = payload.nativeContext;
  const resolution = payload.data;
  if (payload.sessionId !== undefined && payload.sessionId !== binding.sessionId) return null;
  if (context.schemaVersion !== 1 || context.sessionId !== binding.sessionId || context.streamId !== binding.streamId
    || typeof context.writerGeneration !== 'string' || !context.writerGeneration.trim()
    || expectedWriterGeneration !== undefined && context.writerGeneration !== expectedWriterGeneration
    || !isIndependentScope(context.scope) || !sameAssistantScope(context.scope as IndependentScope, binding.scope)
    || resolution.streamId !== binding.streamId || !sameAssistantScope(resolution.scope, binding.scope)) return null;
  return resolution;
}
