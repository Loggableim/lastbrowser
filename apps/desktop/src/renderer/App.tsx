import React, { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Code2,
  Columns2,
  Columns3,
  Cpu,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Globe2,
  HardDrive,
  Eye,
  EyeOff,
  LayoutGrid,
  ListChecks,
  Loader2,
  LogIn,
  Mail,
  MessageSquare,
  Minus,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  StopCircle,
  Terminal,
  Trash2,
  UserCircle,
  Users,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { hideWebviewScrollbars } from './browser-view.js';
import { subscribeDevToolsState, toggleWebviewDevTools } from './devtools-state.js';
import { bindWebviewReadiness, isWebviewReady } from './webview-readiness.js';
import { canRenderBrowserForAccessAuth } from './access-auth.js';
import { createOnceChatCompletionNotifier, isChatCompletionConfirmed } from './chat-completion.js';
import { applyLiveChatDelta, applyLiveChatProgress, claimRestoredChatStream, finishLiveChatMessage, finishLiveChatMessageWithError, finishOrphanedChatTurn, isLocalChatTurnForSession, isMatchingLocalChatStreamSnapshot, preserveInFlightChatMessages, readLiveChatDelta, readNativeChatStreamError, readRestoredChatStream, readRestoredChatTurnState, restorePendingChatTurn } from './chat-live-stream.js';
import { applyLiveTeamworkUpdate, beginLiveTeamworkTurn, bindLiveChatAssistantStream, readTeamworkStreamUpdate } from './teamwork-live-stream.js';
import { ChatUiOwnership } from './chat-ui-ownership.js';
import { playChatCompletionSound } from './notification-sound.js';
import { normalizeNativeChatTurnUsage, type NativeChatTurnUsage } from './chat-usage.js';
import { describeOrchestrationProgress } from './orchestration-progress.js';
import { isNativeChatProgressEvent, isNativeChatStreamWaitExpired } from './chat-stream-timeout.js';
import { nativeChatProcessExitConfirmed,requestNativeChatControl,useNativeChatControls,type NativeChatBinding } from './native-chat-control.js';
import { adoptCreatedTurnSession, claimRestorableGoalContinuation, continuationAfterTerminalEvent, isActiveTurnContextCurrent, isGoalContinuationContextCurrent, readGoalContinuationPrompt, readGoalEvaluationError, readGoalEvaluationMessageKey, readRestorableGoalContinuation, releaseRestorableGoalContinuationClaim, startGoalContinuation } from './goal-continuation.js';
import { parsePersistentGoalCommand, requestNativePersistentGoalCommand, requestNativePersistentGoalControlWhileBusy, shouldDispatchPersistentGoalControlWhileBusy } from './persistent-goal-command.js';
import { isCommandContextCurrent,type CommandAction } from './CommandActionContracts.js';
import { requestChatMode } from './chat-mode-client.js';
import { readPersistentGoalStateError } from './persistent-goal-state.js';
import { nativeGoalErrorCopy,nativeGoalHumanAuthorizationErrorCopy } from './native-goal-errors.js';
import { executeBrowserAction, parseNaturalLanguageBrowserCommand } from './browser-agent-tools.js';
import {
  bookmarkFromTab,
  isBookmarkableUrl,
  isBookmarked,
  loadBookmarks,
  removeBookmark,
  saveBookmarks,
  upsertBookmark
} from './bookmarks.js';
import type { BrowserBookmark } from './bookmarks.js';
import { mergeBookmarks } from './bookmark-io.js';
import {
  BrowserTab,
  browserStartUrl,
  createInitialTab,
  isAiBrowserHomeUrl,
  loadSearchEngineId,
  rememberClosedTab,
  reorderTabs,
  saveSearchEngineId,
  searchEngines,
  takeLastClosedTab,
  normalizeNavigationInput,
  updateTabTitle,
  updateTabUrl,
  updateTabFavicon,
  updateTabLoading,
  updateTabMediaPlaying,
  updateTabMuted,
  togglePinnedTab,
  wakeTabById,
  getSavedMemoryEstimateMb,
  type ClosedTab
} from './tabs.js';
import { brandAssets, sidebarIconForPanel } from './brand.js';
import { categoryLabels, modelNote, providerPresentation, tierLabels } from './provider-presentation.js';
import {
  addProfile,
  loadActiveProfileId,
  loadProfiles,
  profileById,
  profilePartition,
  removeProfile,
  renameProfile,
  saveActiveProfileId,
  saveProfiles,
  type BrowserProfile
} from './profiles.js';
import {
  computeSpacePartition,
  loadProfileTabs,
  loadSessionSnapshot,
  loadSpaceTabs,
  removeProfileTabs,
  saveProfileTabs,
  saveSessionSnapshot,
  saveSpaceTabs,
  loadSpaceSnapGroup,
  saveSpaceSnapGroup,
  type PersistedSnapGroup
} from './tab-sessions.js';
import { loadDetachedWindowSession, saveDetachedWindowSession } from './detached-window-session.js';
import {
  loadVisitedSites,
  recordVisit,
  removeVisit,
  saveVisitedSites,
  startPageVisitLimit,
  type BrowserVisit
} from './history.js';
import {
  SidekickActionId,
  buildSidekickPrompt,
  collectBrowserContext,
  collectTeamworkGroundingContext,
  dispatchSidekickAction,
  lastAssistantText,
  resolveConfiguredModel,
  resolveConfiguredModelSelection
} from './bridge.js';
import {
  OnboardingStatus,
  SetupState,
  canSubmitCloudSetup,
  canShowWhatsNewModal,
  cloudProviderOptions,
  firstRunAiChoiceForSetup,
  defaultSetupState,
  firstRunStatus,
  shouldShowFirstRunSetup,
  modelsForProvider,
  normalizeSetupState
} from './setup-state.js';
import {
  ChatRunState,
  DesktopChatMessage,
  DesktopSessionDetail,
  DesktopSessionSummary,
  LastbrowserPanelId,
  ProjectSummary,
  sessionTitle,
  shortSessionId,
  SpaceSummary,
  spaceDisplayName,
  WorkspaceFilePreview,
  WorkspaceTreeEntry,
  lastbrowserPanels,
  panelLabelTranslationKey,
  leftSidebarCollapsedStorageKey,
  loadInstalledSidebarApps,
  loadBooleanPreference,
  loadNumericPreference,
  loadInitialPanel,
  saveActivePanel,
  saveBooleanPreference,
  saveNumericPreference,
  saveInstalledSidebarApps,
  contextSidebarWidthStorageKey,
  workspacePanelWidthStorageKey,
  workspacePanelCollapsedStorageKey
} from './shell-state.js';
import { canCallSidekickApi } from './runtime-readiness.js';
import { describeChatContent, partitionChatMessages } from './chat-display.js';
import { AdvancedWebUiTools } from './panels/AdvancedWebUiTools.js';
import { NativeBrowserStartPage } from './panels/NativeBrowserStartPage.js';
import { NativeAiBrowserMain } from './panels/NativeAiBrowserMain.js';
import {
  NativeAgentsMain,
  NativeAppstoreMain,
  NativeDiscordMain,
  NativeGmailMain,
  NativeInsightsMain,
  NativeLogsMain,
  NativeMemoryMain,
  NativeProfilesMain,
  NativeSettingsMain,
  NativeSkillsMain,
  jsonPreview
} from './panels/NativeRestPanels.js';
import { NativeTasksMain, NativeKanbanMain, NativeTodosMain } from './panels/TaskPanels.js';
import { NativeTerminalMain } from './panels/NativeTerminalMain.js';
import { ControlCenter } from './NativeControlCenter.js';
import { ApprovalPollManager, ApprovalCard } from './NativeApproval.js';
import { DownloadsPanel } from './NativeDownloads.js';
import { HistoryPanel } from './NativeHistory.js';
import { PermissionsPanel, SitePermissionButton } from './NativePermissions.js';
import { ContextUsageIndicator } from './NativeContextUsage.js';
import { QueueIndicator, CompressButton, useChatQueue } from './NativeCompressQueue.js';
import { RichTextRenderer } from './NativeRichText.js';
import { DesktopI18nProvider, useDesktopI18n, desktopLocaleIds, desktopLocaleNames } from './i18n.js';
import type { DesktopLocaleId } from './i18n/keys.js';
import { FirstRunSetupPane, type SetupForm } from './components/FirstRunSetupPane.js';
import { NativeChatMain, type ComposerMode } from './panels/NativeChatMain.js';
import {
  BookmarkBar,
  UpdatePill,
  SpaceSelector,
  WindowTitlebar,
  ModernTitlebar,
  WindowControls,
  useWindowDrag
} from './components/HeaderComponents.js';
import { SidekickSidebar } from './components/SidekickSidebar.js';
import { NovaDock } from './components/NovaDock.js';
import { InPageActionBar } from './components/InPageActionBar.js';
import { PinnedAppModal } from './components/PinnedAppModal.js';
import { SpaceSetupModal, type SpaceSetupData } from './components/SpaceSetupModal.js';
import { AmbiguousBackendProfileModal } from './components/AmbiguousBackendProfileModal.js';
import { WhatsNewModal } from './components/WhatsNewModal.js';
import { releaseNotesBetween, type UpdateNoticeCandidate } from './release-notes.js';
import { UnifiedExtensionHub } from './components/UnifiedExtensionHub.js';
import { CursorLoupeHUD } from './components/CursorLoupeHUD.js';
import { SplitScreenMagnifier } from './components/SplitScreenMagnifier.js';
import { SuperSizedTabStrip } from './components/SuperSizedTabStrip.js';
import { applySmartInvertToWebview, refreshSmartInvertForWebview, removeSmartInvertFromWebview } from './utils/smart-invert.js';
import { CVD_FILTER_MATRIXES } from './utils/cvd-filters.js';
import { playCopilotSuccessChime } from './utils/audio-chimes.js';
import { toggleVisionImpairedFeature } from './stores/a11y-config.js';

import { usePinnedAppStore } from './stores/usePinnedAppStore.js';
import type { PinnedApp } from './components/PinnedAppGrid.js';

import { SpaceAssistantPanel } from './components/SpaceAssistantPanel.js';
import { CopilotSplitView } from './components/CopilotSplitView.js';
import { IndependentActivityOverview } from './components/IndependentActivityOverview.js';
import { isIndependentOwnedSession, isIndependentWriterProtected, readIndependentSessionRun } from './independent-work-chat.js';
import { IndependentAssistantClient,isIndependentScope } from './independent-assistant-client.js';
import { IndependentAssistantController } from './independent-assistant-controller.js';
import { newIndependentRequestId, sameAssistantScope, type IndependentScope, type ProfilePatch, type ResolvedAssistantScope, type NativeModelResolution } from './independent-contracts.js';
import { readNativeModelResolutionEvent } from './native-model-resolution.js';
import { openPluginBrowserCapability, type PluginBrowserContext } from './plugin-browser-navigation.js';
import { WorkspacePanel } from './panels/WorkspacePanel.js';
import { ShellRail } from './components/ShellRail.js';
import { ContextSidebar, panelContextItems, type SidekickMessage } from './components/ContextSidebar.js';
import { AddressBar } from './components/AddressBar.js';
import { useTabStore, type SplitLayoutMode } from './stores/useTabStore.js';
import { mergeSpaceAudioTabs, subscribeToWebviewMediaState, type SpaceAudioKeepaliveEntry } from './space-audio-keepalive.js';
import { isCurrentSpaceDirectorySnapshot, resolveCanonicalSpacePath, resolveExistingSpaceBackendProfile, resolveRefreshedActiveSpacePath } from './space-paths.js';
import { mergeSessionListSnapshot, resolveSessionBackendProfile, resolveSessionListSelection, sessionListResponseMatchesScope, sameSessionListScope, type SessionListScope } from './session-list-scope.js';
import { createAndLoadScopedSession } from './scoped-session-creation.js';
import { usePanelStore, type SidebarMode } from './stores/usePanelStore.js';
import { useChatStore } from './stores/useChatStore.js';
import { recordCompletedChatEvidence, setProviderChatEvidenceRuntime } from './provider-chat-evidence.js';
import { saveChatReasoningEffort } from './chat-reasoning-effort.js';
import { isQuickChatAction, type QuickActionChip } from './quick-actions.js';
import { loadSpaceModelSelection, removeSpaceModel, saveSpaceModel } from './space-models.js';
import { isMultiAgentModelSelection, resolvePreferredChatModel, resolvePreferredChatModelSelection } from './provider-model-selection.js';
import { readShowUntestedProviderBetas } from './provider-beta-preferences.js';
import { isProviderModelQualified } from './provider-chat-evidence.js';
import { isQuickChatScopeVisible, updateScopedQuickChatState } from './quick-chat-view-state.js';
import { CommandPalette } from './components/CommandPalette.js';
import { LiveAutomationBanner } from './components/LiveAutomationBanner.js';
import { detectPageCategory, executeQuickAction, getQuickActionChips } from './quick-actions.js';
import { SnapGhostOverlay } from './components/SnapGhostOverlay.js';
import { SnapBarFlyout } from './components/SnapBarFlyout.js';
import { MultiviewGridContainer } from './components/MultiviewGridContainer.js';
import { buildSnapGroupAfterDrop, isPointInsideSnapFlyout } from './snap-drop.js';
import { snapLayoutLabelKey, snapSlotNameKey } from './snap-i18n.js';
import { resolveAutoUpdateCheckPreference } from './update-preference.js';
import {
  SNAP_LAYOUT_DEFINITIONS,
  type SnapLayoutType,
  type GhostTarget,
  getSnapTargetForPointer,
  getDefaultSnapLayoutRatios,
  getSnapSlotBounds,
  type SnapLayoutRatios
} from './types/snap-layouts.js';
import './styles.css';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
type UpdateStatus = Awaited<ReturnType<typeof window.lastbrowser.updates.status>>;
type CronJobSummary = Awaited<ReturnType<typeof window.lastbrowser.sidekick.listCrons>>['jobs'][number];
type KanbanBoardResponse = Awaited<ReturnType<typeof window.lastbrowser.sidekick.getKanbanBoard>>;
type KanbanColumnSummary = NonNullable<KanbanBoardResponse['columns']>[number];
type KanbanTaskSummary = NonNullable<KanbanColumnSummary['tasks']>[number];
type DesktopSettingsRecord = Record<string, unknown>;
const desktopSettingsStorageKey = 'lastbrowser.desktopSettings.v1';

type QuickChatResetAck = Readonly<{ ok?: boolean }>;
type QuickChatBinding = Readonly<{
  quickChatId: string;
  streamId: string;
  scope: import('../main/independent-browser-host.js').BrowserScope;
}>;

export async function confirmQuickChatReset<TBinding>(
  binding: TBinding | null,
  cancel: (binding: TBinding) => Promise<QuickChatResetAck>,
  commit: () => void | boolean,
  reject: () => void
): Promise<boolean> {
  try {
    if (binding !== null) {
      const ack = await cancel(binding);
      if (ack?.ok !== true) throw new Error('Quickchat cleanup was not acknowledged');
    }
  } catch {
    reject();
    return false;
  }
  if (commit() === false) {
    reject();
    return false;
  }
  return true;
}

export function runQuickChatResetOnce(
  pending: { current: Promise<boolean> | null },
  run: () => Promise<boolean>
): Promise<boolean> {
  if (pending.current) return pending.current;
  let operation: Promise<boolean>;
  operation = Promise.resolve().then(run).finally(() => {
    if (pending.current === operation) pending.current = null;
  });
  pending.current = operation;
  return operation;
}

export function isCurrentQuickChatGeneration(current: number, expected: number): boolean {
  return current === expected;
}

const quickChatResetFailureCopy: Record<DesktopLocaleId, string> = {
  en: 'The previous Quickchat could not be safely cleared. It is being kept; click New Chat to retry cleanup.',
  de: 'Der vorherige Schnellchat konnte nicht sicher zurückgesetzt werden und bleibt erhalten. Klicke auf „Neuer Chat“, um das Bereinigen erneut zu versuchen.',
  it: 'La chat rapida precedente non può essere cancellata in sicurezza e viene conservata. Seleziona Nuova chat per riprovare la pulizia.',
  es: 'No se pudo borrar de forma segura el chat rápido anterior; se conserva. Pulsa Nuevo chat para volver a intentarlo.',
  fr: 'Le précédent Quickchat n’a pas pu être effacé en toute sécurité et est conservé. Cliquez sur Nouvelle discussion pour réessayer.',
  'pt-BR': 'Não foi possível limpar o Quickchat anterior com segurança; ele foi mantido. Clique em Novo chat para tentar novamente.',
  ru: 'Предыдущий быстрый чат не удалось безопасно очистить, поэтому он сохранён. Нажмите «Новый чат», чтобы повторить очистку.',
  ja: '前のクイックチャットを安全に消去できなかったため保持しています。「新しいチャット」を押して再試行してください。'
};
const quickChatResetSuccessCopy: Record<DesktopLocaleId, string> = {
  en: 'Quickchat was safely reset.', de: 'Der Schnellchat wurde sicher zurückgesetzt.', it: 'La chat rapida è stata reimpostata in sicurezza.',
  es: 'El chat rápido se restableció de forma segura.', fr: 'Le Quickchat a été réinitialisé en toute sécurité.',
  'pt-BR': 'O Quickchat foi redefinido com segurança.', ru: 'Быстрый чат безопасно сброшен.', ja: 'クイックチャットを安全にリセットしました。'
};

export { computeSpacePartition } from './tab-sessions.js';

function persistableSnapGroup(
  layout: SplitLayoutMode,
  tabIds: string[],
  slotIndexes: number[],
  tabs: BrowserTab[],
  ratios: SnapLayoutRatios
): PersistedSnapGroup | null {
  if (!Object.hasOwn(SNAP_LAYOUT_DEFINITIONS, layout) || layout === 'single') return null;
  const available = new Set(tabs.filter((tab) => !tab.incognito).map((tab) => tab.id));
  const seenTabs = new Set<string>();
  const seenSlots = new Set<number>();
  const pairs = tabIds.map((id, index) => ({ id, slot: slotIndexes[index] ?? index }))
    .filter(({ id, slot }) => {
      if (!available.has(id) || seenTabs.has(id) || !Number.isInteger(slot) || slot < 0
        || slot >= SNAP_LAYOUT_DEFINITIONS[layout as SnapLayoutType].slots.length || seenSlots.has(slot)) return false;
      seenTabs.add(id);
      seenSlots.add(slot);
      return true;
    });
  if (pairs.length < 2) return null;
  return {
    layout: layout as SnapLayoutType,
    tabIds: pairs.map(({ id }) => id),
    slotIndexes: pairs.map(({ slot }) => slot),
    ratios
  };
}

function loadPersistedSnapGroup(profileId: string, spacePath: string, tabs: BrowserTab[], knownSpacePaths?: string[]): PersistedSnapGroup | null {
  const available = tabs.filter((tab) => !tab.incognito).map((tab) => tab.id);
  const group = loadSpaceSnapGroup(profileId, spacePath, available, window.localStorage, knownSpacePaths);
  return group && group.tabIds.length > 1 ? group : null;
}

function savePersistedSnapGroup(
  profileId: string,
  spacePath: string,
  tabs: BrowserTab[],
  layout: SplitLayoutMode,
  tabIds: string[],
  slotIndexes: number[],
  ratios: SnapLayoutRatios,
  knownSpacePaths?: string[]
): void {
  const available = tabs.filter((tab) => !tab.incognito).map((tab) => tab.id);
  saveSpaceSnapGroup(
    profileId,
    spacePath,
    persistableSnapGroup(layout, tabIds, slotIndexes, tabs, ratios),
    available,
    window.localStorage,
    knownSpacePaths
  );
}

function isRecord(value: unknown): value is DesktopSettingsRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractDesktopSettings(payload: unknown): DesktopSettingsRecord {
  if (!isRecord(payload)) return {};
  if (isRecord(payload.settings)) return payload.settings;
  return payload;
}

export function mergeDesktopSettings(
  serverSettings: unknown,
  storedSettings: unknown,
  currentSettings: unknown
): DesktopSettingsRecord {
  const cachedSettings = isRecord(storedSettings)
    ? storedSettings
    : isRecord(currentSettings) ? currentSettings : {};
  return {
    ...cachedSettings,
    ...extractDesktopSettings(serverSettings)
  };
}

export async function fetchDesktopSettingsWithRetry(
  fetchSettings: () => Promise<unknown>,
  maxAttempts = 8,
  retryDelayMs = 750,
  signal?: AbortSignal
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) throw signal.reason ?? new Error('Settings load cancelled');
    try {
      return await fetchSettings();
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw signal.reason ?? error;
      // Authentication failures require the user to unlock Sidekick; repeating
      // the same protected request cannot make credentials appear.
      if (/authentication required|unauthorized|\b401\b/i.test(String(error))) break;
      if (attempt === maxAttempts) break;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', cancelWait);
          resolve();
        }, retryDelayMs);
        const cancelWait = () => {
          clearTimeout(timer);
          reject(signal?.reason ?? new Error('Settings load cancelled'));
        };
        signal?.addEventListener('abort', cancelWait, { once: true });
      });
    }
  }
  throw lastError;
}

function loadDesktopSettingsFromStorage(): DesktopSettingsRecord | null {
  try {
    const raw = window.localStorage.getItem(desktopSettingsStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveDesktopSettingsToStorage(settings: DesktopSettingsRecord | null): void {
  try {
    if (!settings || !Object.keys(settings).length) {
      window.localStorage.removeItem(desktopSettingsStorageKey);
      return;
    }
    window.localStorage.setItem(desktopSettingsStorageKey, JSON.stringify(settings));
  } catch {
    // Ignore persistence failures in restricted renderer contexts.
  }
}

export function getDomainFromUrl(rawUrl: string): string {
  try {
    if (!rawUrl || rawUrl.startsWith('app://') || rawUrl.startsWith('lastbrowser://') || rawUrl.startsWith('about:')) {
      return '';
    }
    const parsed = new URL(rawUrl);
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

export const DOMAIN_ZOOM_STORAGE_KEY = 'lastbrowser.domainZoomMap.v1';

export function loadDomainZoomMap(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(DOMAIN_ZOOM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveDomainZoom(domain: string, factor: number): void {
  if (!domain) return;
  try {
    const map = loadDomainZoomMap();
    map[domain] = factor;
    window.localStorage.setItem(DOMAIN_ZOOM_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function getEffectiveZoomForUrl(url: string, defaultZoomPercent: number = 100): number {
  const domain = getDomainFromUrl(url);
  if (domain) {
    const map = loadDomainZoomMap();
    if (typeof map[domain] === 'number' && Number.isFinite(map[domain]) && map[domain] > 0) {
      return map[domain];
    }
  }
  const base = (typeof defaultZoomPercent === 'number' && defaultZoomPercent > 0 ? defaultZoomPercent : 100) / 100;
  return base;
}

export function normalizeAppearanceTheme(value: string): 'light' | 'dark' | 'system' | 'oled' | 'vision-impaired' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'light' || normalized === 'system' || normalized === 'oled' || normalized === 'vision-impaired') return normalized;
  return 'dark';
}

export function normalizeAppearanceSkin(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized || 'default';
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, '');
  if (!/^(?:[\da-f]{3}|[\da-f]{6}(?:[\da-f]{2})?)$/i.test(clean)) return null;
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  if (clean.length === 6 || clean.length === 8) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  return null;
}

export function computeAccentTokens(hexColor: string) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const contrastText = (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
  const glow = `rgba(${r}, ${g}, ${b}, 0.45)`;
  const hoverR = Math.min(255, Math.round(r + (255 - r) * 0.18));
  const hoverG = Math.min(255, Math.round(g + (255 - g) * 0.18));
  const hoverB = Math.min(255, Math.round(b + (255 - b) * 0.18));
  const hover = `#${hoverR.toString(16).padStart(2, '0')}${hoverG.toString(16).padStart(2, '0')}${hoverB.toString(16).padStart(2, '0')}`;
  return {
    primary: hexColor,
    glow,
    hover,
    text: contrastText,
    rgbStr: `${r}, ${g}, ${b}`
  };
}

export function applyDesktopAppearance(settings: DesktopSettingsRecord | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = normalizeAppearanceTheme(String(settings?.theme || 'dark'));
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  const skin = normalizeAppearanceSkin(String(settings?.skin || 'default'));
  const accentColor = String(settings?.accent_color || '').trim().toLowerCase();
  const fontSize = String(settings?.font_size || 'default').trim().toLowerCase() || 'default';
  const messageLayout = String(settings?.message_layout || 'bubbles').trim().toLowerCase() || 'bubbles';
  const syntaxTheme = String(settings?.syntax_theme || '').trim();

  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = theme;
  root.dataset.skin = skin;
  root.dataset.fontSize = fontSize;
  root.dataset.messageLayout = messageLayout;
  root.dataset.syntaxTheme = syntaxTheme;

  root.classList.toggle('theme-light', resolvedTheme === 'light');
  root.classList.toggle('theme-dark', resolvedTheme === 'dark');
  root.classList.toggle('theme-oled', resolvedTheme === 'oled');
  root.classList.toggle('theme-vision-impaired', resolvedTheme === 'vision-impaired');
  root.classList.toggle('theme-system', theme === 'system');
  root.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark';

  if ((skin === 'custom' || accentColor) && accentColor.startsWith('#')) {
    const tokens = computeAccentTokens(accentColor);
    if (tokens) {
      root.style.setProperty('--user-accent-primary', tokens.primary);
      root.style.setProperty('--user-accent-glow', tokens.glow);
      root.style.setProperty('--user-accent-hover', tokens.hover);
      root.style.setProperty('--user-accent-text', tokens.text);
      root.style.setProperty('--accent-primary', tokens.primary);
      root.style.setProperty('--accent-glow', tokens.glow);
      root.style.setProperty('--accent-hover', tokens.hover);
      root.style.setProperty('--accent-rgb', tokens.rgbStr);
    } else {
      root.style.removeProperty('--user-accent-primary');
      root.style.removeProperty('--user-accent-glow');
      root.style.removeProperty('--user-accent-hover');
      root.style.removeProperty('--user-accent-text');
      root.style.removeProperty('--accent-primary');
      root.style.removeProperty('--accent-glow');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--accent-rgb');
    }
  } else {
    root.style.removeProperty('--user-accent-primary');
    root.style.removeProperty('--user-accent-glow');
    root.style.removeProperty('--user-accent-hover');
    root.style.removeProperty('--user-accent-text');
    root.style.removeProperty('--accent-primary');
    root.style.removeProperty('--accent-glow');
    root.style.removeProperty('--accent-hover');
    root.style.removeProperty('--accent-rgb');
  }
}

export function watchSystemThemeChanges(settings: DesktopSettingsRecord | null): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const preference = window.matchMedia('(prefers-color-scheme: light)');
  // Keep this listener active while the user previews themes too. The App
  // settings snapshot can still say "dark" while the Settings panel has
  // switched its live draft to "system" and is saving it asynchronously.
  const update = () => {
    const root = document.documentElement;
    if (root.dataset.themeMode !== 'system') return;
    const resolvedTheme = preference.matches ? 'light' : 'dark';
    root.dataset.theme = resolvedTheme;
    root.classList.toggle('theme-light', resolvedTheme === 'light');
    root.classList.toggle('theme-dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
  };
  preference.addEventListener?.('change', update);
  return () => preference.removeEventListener?.('change', update);
}

type TodoItem = {
  id?: string;
  content?: string;
  title?: string;
  status?: string;
};

type SidebarResizeTarget = 'context' | 'workspace';

type SidebarResizeState = {
  target: SidebarResizeTarget;
  startX: number;
  startWidth: number;
};

const DEFAULT_LEFT_RAIL_WIDTH = 168;
const COLLAPSED_LEFT_RAIL_WIDTH = 48;
const DEFAULT_CONTEXT_SIDEBAR_WIDTH = 280;
const MIN_CONTEXT_SIDEBAR_WIDTH = 220;
const MAX_CONTEXT_SIDEBAR_WIDTH = 420;
const DEFAULT_WORKSPACE_PANEL_WIDTH = 320;
const MIN_WORKSPACE_PANEL_WIDTH = 260;
const MAX_WORKSPACE_PANEL_WIDTH = 520;
const MIN_BROWSER_WIDTH = 640;
const COLLAPSED_PANEL_WIDTH = 44;



class PanelErrorBoundary extends React.Component<
  { panel: LastbrowserPanelId; children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { panel: LastbrowserPanelId; children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message };
  }

  componentDidCatch(error: Error): void {
    console.error('Panel render failed', this.props.panel, error);
  }

  render(): JSX.Element {
    if (this.state.error) {
      return (
        <section className="browser-main native-rest-main panel-error-main">
          <header className="native-rest-header">
            <div className="native-rest-title">
              <div className="native-rest-icon"><AlertTriangle size={21} /></div>
              <div>
                <span className="eyebrow">Panel error</span>
                <h1>{this.props.panel}</h1>
                <p>{this.state.error}</p>
              </div>
            </div>
          </header>
        </section>
      );
    }

    return <>{this.props.children}</>;
  }
}

const panelIcons: Record<LastbrowserPanelId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  chat: MessageSquare,
  tasks: CalendarDays,
  kanban: Columns3,
  skills: Sparkles,
  agents: Bot,
  memory: Brain,
  workspaces: Folder,
  profiles: UserCircle,
  todos: ListChecks,
  insights: BarChart3,
  logs: FileText,
  gmail: Mail,
  browser: Globe2,
  discord: Users,
  appstore: LayoutGrid,
  settings: Settings,
  terminal: Terminal
};

type RendererChatTraceEntry = Record<string, string | number | boolean | null>;

/** Opt-in renderer diagnostics for isolated smoke profiles. Never record prompt, answer, or identifiers. */
function traceRendererChat(phase: string, fields: RendererChatTraceEntry = {}): void {
  try {
    if (window.localStorage.getItem('__lastbrowser_chat_stream_debug') !== '1') return;
    const target = window as Window & { __lastbrowserChatStreamDebug?: RendererChatTraceEntry[] };
    const entries = target.__lastbrowserChatStreamDebug ?? (target.__lastbrowserChatStreamDebug = []);
    entries.push({ phase, at: performance.now(), ...fields });
    if (entries.length > 256) entries.splice(0, entries.length - 256);
  } catch {
    // Diagnostics must never affect chat behavior (for example, when storage is unavailable).
  }
}

function getRendererChatSnapshotTrace(
  streamStatus: { active?: boolean } | null,
  session: DesktopSessionDetail | null,
  expectedStreamId: string
): RendererChatTraceEntry {
  const activeStreamId = session?.active_stream_id;
  return {
    streamActive: typeof streamStatus?.active === 'boolean' ? streamStatus.active : null,
    snapshotPresent: session !== null,
    pending: Boolean(session?.pending_user_message),
    messageCount: Array.isArray(session?.messages) ? session.messages.length : null,
    streamMatches: typeof activeStreamId === 'string' && activeStreamId === expectedStreamId
  };
}

function classifyRendererChatError(message: string): string {
  const lower = message.toLowerCase();
  if (/auth|credential|unauthor/.test(lower)) return 'authentication';
  if (/quota|rate.?limit|capacity/.test(lower)) return 'capacity';
  if (/timeout|timed out|deadline/.test(lower)) return 'timeout';
  if (/cancel|abort/.test(lower)) return 'cancelled';
  return 'provider';
}

export function App(): JSX.Element {
  return (
    <DesktopI18nProvider>
      <AppContent />
    </DesktopI18nProvider>
  );
}

function AppContent(): JSX.Element {
  const { t,locale } = useDesktopI18n();
  const [pendingStartSearchFocus, setPendingStartSearchFocus] = useState<{ tabId: string; expiresAt: number } | null>(null);
  const selectedChatModel = useChatStore((state) => state.selectedModel);
  const selectedChatModelProvider = useChatStore((state) => state.selectedModelProvider);
  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    closedTabs,
    setClosedTabs,
    searchEngineId,
    setSearchEngineId,
    draggedTabId,
    setDraggedTabId,
    addressValue,
    setAddressValue,
    browserMode,
    setBrowserMode,
    browserLoadError,
    setBrowserLoadError,
    splitTabIds,
    splitSlotIndexes,
    splitLayout,
    setSplitLayout,
    addSplitTab,
    removeSplitTab,
    clearSplitTabs,
    setSnapGroup
  } = useTabStore();

  const {
    activePanel,
    setActivePanel,
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    sidebarMode,
    setSidebarMode,
    downloadsOpen,
    setDownloadsOpen,
    permissionsOpen,
    setPermissionsOpen,
    cycleSidebarMode,
    copilotOpen,
    setCopilotOpen,
    toggleCopilot,
    contextSidebarCollapsed,
    setContextSidebarCollapsed,
    contextSidebarWidth,
    setContextSidebarWidth,
    workspacePanelCollapsed,
    setWorkspacePanelCollapsed,
    workspacePanelWidth,
    setWorkspacePanelWidth,
    activeContextItem,
    setActiveContextItem,
    installedSidebarApps,
    setInstalledSidebarApps,
    zenExitDefaultMode,
    setZenExitDefaultMode,
    sidebarDrawerTab,
    setSidebarDrawerTab,
    actionBarDock,
    setActionBarDock,
    dockSettings,
    visionImpaired
  } = usePanelStore();

  const openExtensionHub = useCallback(() => {
    setActivePanel('browser');
    usePanelStore.getState().setExtensionHubOpen(true);
  }, [setActivePanel]);
  const toggleExtensionHub = useCallback(() => {
    const store = usePanelStore.getState();
    if (store.extensionHubOpen) {
      store.setExtensionHubOpen(false);
      return;
    }
    setActivePanel('browser');
    store.setExtensionHubOpen(true);
  }, [setActivePanel]);

  const [layoutMode, setLayoutMode] = useState<'modern' | 'classic'>(() => {
    try {
      const val = window.localStorage.getItem('lastbrowser.layoutMode.v1');
      if (val === 'classic' || val === 'modern') return val;
    } catch {}
    return 'modern';
  });

  useEffect(() => {
    const handleLayoutModeChanged = () => {
      try {
        const val = window.localStorage.getItem('lastbrowser.layoutMode.v1');
        if (val === 'classic' || val === 'modern') setLayoutMode(val);
      } catch {}
    };
    window.addEventListener('lastbrowser:layout-mode-changed', handleLayoutModeChanged);
    window.addEventListener('storage', handleLayoutModeChanged);
    return () => {
      window.removeEventListener('lastbrowser:layout-mode-changed', handleLayoutModeChanged);
      window.removeEventListener('storage', handleLayoutModeChanged);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        if (usePanelStore.getState().sidebarMode === 'hidden') {
          setZenSidebarRevealed((prev) => !prev);
        } else {
          cycleSidebarMode();
        }
      }
      if (event.key === 'Escape' && usePanelStore.getState().sidebarMode === 'hidden') {
        setZenSidebarRevealed(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        toggleCopilot();
      }
      // Vision-Impaired 2.0: Ctrl+Shift+L toggles the cursor companion loupe.
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        const store = usePanelStore.getState();
        store.setVisionImpaired(toggleVisionImpairedFeature(store.visionImpaired, 'cursorLoupeEnabled'));
      }
      // Vision-Impaired 2.0: Alt+M toggles the split-screen magnifier.
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        const store = usePanelStore.getState();
        store.setVisionImpaired(toggleVisionImpairedFeature(store.visionImpaired, 'splitScreenMagnifier'));
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        usePanelStore.getState().toggleCommandPalette();
      }
      // Ctrl+1..8: jump to pinned app (singleton routing)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        const digit = parseInt(event.key, 10);
        if (digit >= 1 && digit <= 8) {
          event.preventDefault();
          const pinned = usePinnedAppStore.getState().apps;
          const app = pinned[digit - 1];
          if (app) {
            if (app.panel) {
              setActivePanel(app.panel);
            } else if (app.url) {
              const existingTabs = useTabStore.getState().tabs;
              const appHost = (() => { try { return new URL(app.url).hostname.replace(/^www\\./, ''); } catch { return ''; } })();
              const match = existingTabs.find(t => { if (!t.url) return false; try { const h = new URL(t.url).hostname.replace(/^www\\./, ''); return h === appHost || h.endsWith(`.${appHost}`); } catch { return false; } });
              if (match) { if (match.isDiscarded) wakeTab(match.id); setActiveTabId(match.id); setActivePanel('browser'); }
              else { addTab(app.url); }
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleSidebarMode, toggleCopilot, toggleExtensionHub]);

  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>(() => loadBookmarks(window.localStorage));
  const [profiles, setProfiles] = useState<BrowserProfile[]>(() => loadProfiles(window.localStorage));
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId(window.localStorage));
  const [visitedSites, setVisitedSites] = useState<BrowserVisit[]>(() => loadVisitedSites(window.localStorage));
  const [desktopSettings, setDesktopSettings] = useState<Record<string, unknown> | null>(() => loadDesktopSettingsFromStorage());
  const [desktopSettingsHydrated, setDesktopSettingsHydrated] = useState(() => loadDesktopSettingsFromStorage() !== null);
  const desktopSettingsRevisionRef = useRef(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const { isMaximized: windowMaximized, handleDoubleClick: handleTopbarDoubleClick, handleMouseDown: handleTopbarMouseDown } = useWindowDrag();
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  setProviderChatEvidenceRuntime(status?.runtimeGeneration, __LASTBROWSER_BUILD_ID__);
  const [accessAuthChecked, setAccessAuthChecked] = useState(false);
  const [accessAuthRequired, setAccessAuthRequired] = useState(false);
  const [accessPassword, setAccessPassword] = useState('');
  const [accessAuthError, setAccessAuthError] = useState('');
  const [accessAuthBusy, setAccessAuthBusy] = useState(false);
  const [setupState, setSetupState] = useState<SetupState>(defaultSetupState);
  // The wizard covers the whole window, so it must always be dismissible —
  // otherwise a user who cannot finish setup is locked out of the browser.
  const [setupDismissed, setSetupDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('lastbrowser.setupDismissed') === '1';
    } catch {
      return false;
    }
  });
  const [setupReopenRequested, setSetupReopenRequested] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [onboardingStatusChecked, setOnboardingStatusChecked] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [whatsNewCandidate, setWhatsNewCandidate] = useState<UpdateNoticeCandidate | null>(null);
  const whatsNewRequestRef = useRef<Promise<UpdateNoticeCandidate | null> | null>(null);
  const [zenTitlebarRevealed, setZenTitlebarRevealed] = useState(false);
  const [blockedAdsCount, setBlockedAdsCount] = useState(0);
  const [zenSidebarRevealed, setZenSidebarRevealed] = useState(false);
  const zenSidebarTimerRef = useRef<number | null>(null);
  const [zenFloatingMode, setZenFloatingMode] = useState<SidebarMode>('expanded');
  const [spaceSetupModalOpen, setSpaceSetupModalOpen] = useState(false);
  const [assistantController] = useState(() => new IndependentAssistantController(new IndependentAssistantClient({
    request: request => window.lastbrowser.independent.request(request),
    onEvent: callback => window.lastbrowser.independent.onEvent?.(callback) ?? (() => {})
  })));
  const [assistantSelection, setAssistantSelection] = useState<ResolvedAssistantScope | null>(null);
  const [assistantSelectionRequestScope, setAssistantSelectionRequestScope] = useState<SessionListScope | null>(null);
  const [assistantSelectionError, setAssistantSelectionError] = useState('');
  const [ambiguousSpace, setAmbiguousSpace] = useState<{ browserProfileId: string; workspacePath: string | null } | null>(null);
  const [explicitBackendProfileBySpace, setExplicitBackendProfileBySpace] = useState<Record<string, string>>({});
  const [assistantOverviewScope, setAssistantOverviewScope] = useState<IndependentScope | null>(null);
  const pendingIndependentChatRef = useRef<{ scope: IndependentScope; path: string; sessionId: string } | null>(null);
  const newAssistantSpacePathRef = useRef<string | null>(null);
  const newAssistantSeedRef = useRef<ProfilePatch | undefined>(undefined);
  // Keep the original WebView guest in BrowserMain while its Space is inactive.
  const [audioKeepalive, setAudioKeepalive] = useState<SpaceAudioKeepaliveEntry[]>([]);

  const handleZenSidebarEnter = useCallback(() => {
    if (zenSidebarTimerRef.current) {
      window.clearTimeout(zenSidebarTimerRef.current);
      zenSidebarTimerRef.current = null;
    }
    setZenSidebarRevealed(true);
  }, []);

  const handleZenSidebarLeave = useCallback(() => {
    if (zenSidebarTimerRef.current) {
      window.clearTimeout(zenSidebarTimerRef.current);
    }
    zenSidebarTimerRef.current = window.setTimeout(() => {
      setZenSidebarRevealed(false);
    }, 350);
  }, []);
  const [sessions, setSessions] = useState<DesktopSessionSummary[]>([]);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<DesktopSessionDetail | null>(null);
  const [activeSessionLoading, setActiveSessionLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<DesktopChatMessage[]>([]);
  const [quickChatId, setQuickChatId] = useState(() => newIndependentRequestId().replaceAll('-', '').toLowerCase());
  const quickChatIdRef = useRef(quickChatId);
  const [quickChatMessages, setQuickChatMessages] = useState<DesktopChatMessage[]>([]);
  const quickChatMessagesRef = useRef(quickChatMessages);
  const quickChatMessagesByScopeRef = useRef(new Map<string, DesktopChatMessage[]>());
  const [quickChatBusy, setQuickChatBusy] = useState(false);
  const quickChatBusyRef = useRef(false);
  const [quickChatError, setQuickChatError] = useState('');
  const quickChatErrorScopeKeyRef = useRef<string | null>(null);
  const quickChatErrorsByScopeRef = useRef(new Map<string, string>());
  const [quickChatStatus, setQuickChatStatus] = useState('');
  const quickChatStatusScopeKeyRef = useRef<string | null>(null);
  const quickChatStatusesByScopeRef = useRef(new Map<string, string>());
  const [quickChatBinding, setQuickChatBinding] = useState<QuickChatBinding | null>(null);
  const quickChatBindingRef = useRef(quickChatBinding);
  const quickChatBindingScopeKeyRef = useRef<string | null>(null);
  const quickChatTranscriptScopeKeyRef = useRef<string | null>(null);
  const quickChatStartPromiseRef = useRef<{ quickChatId: string; scopeKey: string; promise: Promise<QuickChatBinding> } | null>(null);
  const quickChatStopPromiseRef = useRef<Promise<unknown> | null>(null);
  const quickChatResetPromiseRef = useRef<Promise<boolean> | null>(null);
  const quickChatResetPendingRef = useRef(false);
  const quickChatAwaitingStartRef = useRef(false);
  const quickChatStoppedStreamIdRef = useRef<string | null>(null);
  const quickChatStopPendingRef = useRef(false);
  const quickChatGenerationRef = useRef(0);
  const quickChatBufferedEventsRef = useRef<import('../main/quick-chat-controller.js').QuickChatStreamEvent[]>([]);
  const quickChatScopeKeyRef = useRef<string | null>(null);
  const [quickChatMode, setQuickChatMode] = useState(false);
  const [lastChatTurnUsage, setLastChatTurnUsage] = useState<{ sessionId: string; usage: NativeChatTurnUsage } | null>(null);
  const [nativeModelResolutionNotice, setNativeModelResolutionNotice] = useState<{ sessionId: string; profileId: string; spacePath: string; backendProfileName: string | null; resolution: NativeModelResolution } | null>(null);
  const [chatError, setChatError] = useState('');
  const [chatRunState, setChatRunState] = useState<ChatRunState>('idle');
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const activeStreamIdRef = useRef(activeStreamId);
  const updateActiveStreamId = (streamId: string | null): void => {
    activeStreamIdRef.current = streamId;
    setActiveStreamId(streamId);
  };
  const [composerText, setComposerText] = useState('');
  const [composerMode, setComposerMode] = useState<ComposerMode>('action');
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const spaceDirectoryRevisionRef = useRef(0);
  const activeSpaceSelectionRevisionRef = useRef(0);
  const [activeSpacePath, setActiveSpacePath] = useState<string>(() => {
    try {
      return window.localStorage.getItem('lastbrowser.activeSpacePath.v1') || '';
    } catch {
      return '';
    }
  });
  const knownSpacePaths = useMemo(
    () => [...new Set([activeSpacePath, ...spaces.map((space) => space.path)].filter(Boolean))],
    [activeSpacePath, spaces]
  );
  const activeBackendProfileName = useMemo(() => resolveSessionBackendProfile(
    assistantSelectionRequestScope, assistantSelection?.backendProfileName,
    { profile: activeProfileId, workspacePath: activeSpacePath,
      backendProfileName: explicitBackendProfileBySpace[`${activeProfileId}::${activeSpacePath || ''}`] }
  ), [assistantSelectionRequestScope, assistantSelection?.backendProfileName, explicitBackendProfileBySpace, activeProfileId, activeSpacePath]);
  const [isDetachedWindow, setIsDetachedWindow] = useState(false);
  useEffect(() => {
    if (isDetachedWindow || !window.lastbrowser?.adblock) return;
    let disposed = false;
    const refreshBlockedCount = async () => {
      try {
        const status = await window.lastbrowser.adblock?.status();
        if (!disposed && status) setBlockedAdsCount(status.blockedCount);
      } catch {
        if (!disposed) setBlockedAdsCount(0);
      }
    };
    void refreshBlockedCount();
    const timer = window.setInterval(() => void refreshBlockedCount(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [isDetachedWindow]);
  const [windowStartupReady, setWindowStartupReady] = useState(false);
  const [pendingDetachedTransfer, setPendingDetachedTransfer] = useState<{ transferId: string; tabId: string } | null>(null);
  const windowStartupInitializedRef = useRef(false);
  const acknowledgingTransferRef = useRef<string | null>(null);
  const [snapRatios, setSnapRatios] = useState<SnapLayoutRatios>(() => getDefaultSnapLayoutRatios('dual-50-50'));

  useEffect(() => {
    if (isDetachedWindow || !windowStartupReady) return;
    try {
      window.localStorage.setItem('lastbrowser.activeSpacePath.v1', activeSpacePath);
    } catch {}
  }, [activeSpacePath, isDetachedWindow, windowStartupReady]);
  const [spacesError, setSpacesError] = useState('');
  const [workspacePath, setWorkspacePath] = useState('.');
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceTreeEntry[]>([]);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspacePreview, setWorkspacePreview] = useState<WorkspaceFilePreview | null>(null);
  const [workspacePreviewDraft, setWorkspacePreviewDraft] = useState('');
  const [workspaceEditing, setWorkspaceEditing] = useState(false);
  const [workspaceShowHidden, setWorkspaceShowHidden] = useState(false);
  const [workspaceRefreshNonce, setWorkspaceRefreshNonce] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [hasActiveDownloads, setHasActiveDownloads] = useState(false);
  const [sidekickBusy, setSidekickBusy] = useState(false);
  const chatUiOwnershipRef = useRef(new ChatUiOwnership());
  const beginChatUiTurn = (sessionId?: string | null): number => {
    const ownerId = chatUiOwnershipRef.current.begin(sessionId);
    setSidekickBusy(true);
    return ownerId;
  };
  const bindChatUiTurnSession = (ownerId: number, sessionId: string): void => {
    chatUiOwnershipRef.current.bindSession(ownerId, sessionId);
  };
  const registerChatUiStream = (ownerId: number, streamId: string, sessionId: string): void => {
    chatUiOwnershipRef.current.registerStream(ownerId, streamId, sessionId);
  };
  const finishChatUiTurn = (ownerId: number): void => {
    if (chatUiOwnershipRef.current.finish(ownerId)) setSidekickBusy(false);
  };
  const [pinnedModalOpen, setPinnedModalOpen] = useState(false);
  const [pinnedEditApp, setPinnedEditApp] = useState<PinnedApp | null>(null);
  const [messages, setMessages] = useState<SidekickMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Sidekick is ready for page summaries, selection explanations, and research tasks.'
    }
  ]);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || tabs[0], [activeTabId, tabs]);
  const activeProfile = useMemo(() => profileById(profiles, activeProfileId), [profiles, activeProfileId]);
  const handleSetSnapRatio = useCallback((axis: 'x' | 'y', index: number, ratio: number) => {
    setSnapRatios((current) => {
      const next = { x: [...current.x], y: [...current.y] };
      next[axis][index] = ratio;
      return next;
    });
  }, []);
  const handleSetSnapGroup = useCallback((layout: SnapLayoutType, tabIds: string[], slotIndexes?: number[]) => {
    if (layout !== splitLayout) setSnapRatios(getDefaultSnapLayoutRatios(layout));
    setSnapGroup(layout, tabIds, slotIndexes);
  }, [setSnapGroup, splitLayout]);

  // Keep the active profile's tab session, active space tabs, and auto-recovery snapshot up to date.
  useEffect(() => {
    if (isDetachedWindow || !windowStartupReady) return;
    saveProfileTabs(activeProfileId, { tabs, activeTabId }, window.localStorage);
    saveSpaceTabs(activeProfileId, activeSpacePath, { tabs, activeTabId }, window.localStorage, knownSpacePaths);
    savePersistedSnapGroup(activeProfileId, activeSpacePath, tabs, splitLayout, splitTabIds, splitSlotIndexes, snapRatios, knownSpacePaths);
    saveSessionSnapshot(activeProfileId, { tabs, activeTabId }, window.localStorage, activeSpacePath);
  }, [activeProfileId, activeSpacePath, tabs, activeTabId, splitLayout, splitTabIds, splitSlotIndexes, snapRatios, isDetachedWindow, windowStartupReady, knownSpacePaths]);

  // Detached BrowserWindows have their own sessionStorage, so their tab state
  // survives reloads without ever reading or overwriting the source window's
  // shared profile/Space tab records.
  useEffect(() => {
    if (!isDetachedWindow || !windowStartupReady) return;
    saveDetachedWindowSession(window.sessionStorage, {
      profileId: activeProfileId,
      spacePath: activeSpacePath,
      tabs,
      activeTabId,
      splitLayout,
      splitTabIds,
      splitSlotIndexes,
      snapRatios
    });
  }, [activeProfileId, activeSpacePath, tabs, activeTabId, splitLayout, splitTabIds, splitSlotIndexes, snapRatios, isDetachedWindow, windowStartupReady]);

  const activeBookmarkable = isBookmarkableUrl(activeTab.url);
  const activeBookmarked = useMemo(() => isBookmarked(bookmarks, activeTab.url), [activeTab.url, bookmarks]);
  const activeTabIdRef = useRef(activeTabId);
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  const activeProfileIdRef = useRef(activeProfileId);
  const activeSpacePathRef = useRef(activeSpacePath);
  const activeBackendProfileNameRef = useRef(activeBackendProfileName);
  const assistantSelectionRef = useRef<ResolvedAssistantScope | null>(assistantSelection);
  const assistantSelectionRequestScopeRef = useRef<SessionListScope | null>(assistantSelectionRequestScope);
  const activeSessionListScopeRef = useRef<SessionListScope>({ profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName });
  const appliedSessionListScopeRef = useRef<SessionListScope | null>(null);
  const restoredGoalContinuationClaimsRef = useRef(new Set<string>());
  const restoredChatStreamClaimsRef = useRef(new Set<string>());
  activeProfileIdRef.current = activeProfileId;
  activeSpacePathRef.current = activeSpacePath;
  activeBackendProfileNameRef.current = activeBackendProfileName;
  quickChatMessagesRef.current = quickChatMessages;
  assistantSelectionRef.current = assistantSelection;
  assistantSelectionRequestScopeRef.current = assistantSelectionRequestScope;
  quickChatIdRef.current = quickChatId;
  quickChatBindingRef.current = quickChatBinding;
  const currentQuickChatScopeKey = (): string => `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`;
  const updateQuickChatMessagesForScope = (scopeKey: string, update: React.SetStateAction<DesktopChatMessage[]>): void => {
    const next = updateScopedQuickChatState(quickChatMessagesByScopeRef.current, scopeKey, stored => {
      const current = stored ?? (quickChatTranscriptScopeKeyRef.current === scopeKey ? quickChatMessagesRef.current : []);
      return typeof update === 'function' ? update(current) : update;
    });
    if (currentQuickChatScopeKey() === scopeKey) {
      quickChatMessagesRef.current = next;
      setQuickChatMessages(next);
    }
  };
  const setQuickChatErrorForScope = (scopeKey: string, message: string): void => {
    quickChatErrorsByScopeRef.current.set(scopeKey, message);
    quickChatErrorScopeKeyRef.current = scopeKey;
    if (currentQuickChatScopeKey() === scopeKey) setQuickChatError(message);
  };
  const setQuickChatStatusForScope = (scopeKey: string, message: string): void => {
    quickChatStatusesByScopeRef.current.set(scopeKey, message);
    quickChatStatusScopeKeyRef.current = scopeKey;
    if (currentQuickChatScopeKey() === scopeKey) setQuickChatStatus(message);
  };
  const processQuickChatEvent = useCallback((event: import('../main/quick-chat-controller.js').QuickChatStreamEvent, generation: number): void => {
    if (!isCurrentQuickChatGeneration(quickChatGenerationRef.current, generation)) return;
    const binding = quickChatBindingRef.current;
    const currentScopeKey = `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`;
    if (!binding || event.quickChatId !== quickChatIdRef.current || event.quickChatId !== binding.quickChatId
      || quickChatBindingScopeKeyRef.current !== currentScopeKey
      || event.streamId === quickChatStoppedStreamIdRef.current
      || event.streamId !== binding.streamId || event.scope.spaceId !== binding.scope.spaceId
      || event.scope.backendProfileId !== binding.scope.backendProfileId
      || event.scope.browserProfileId !== binding.scope.browserProfileId) return;
    if (event.event === 'token' || event.event === 'delta' || event.event === 'reasoning') {
      const delta = readLiveChatDelta(event.event, event.data);
      if (delta && quickChatBindingScopeKeyRef.current) updateQuickChatMessagesForScope(quickChatBindingScopeKeyRef.current, current => applyLiveChatDelta(current, delta.kind, delta.text));
      return;
    }
    if (event.event === 'stream_end' || event.event === 'done' || event.event === 'cancel') {
      if (quickChatBindingScopeKeyRef.current) updateQuickChatMessagesForScope(quickChatBindingScopeKeyRef.current, current => finishLiveChatMessage(current));
      quickChatBusyRef.current = false;
      setQuickChatBusy(false);
      return;
    }
    if (event.event === 'error' || event.event === 'apperror') {
      const message = readNativeChatStreamError(event.data);
      const scopeKey = quickChatBindingScopeKeyRef.current ?? quickChatTranscriptScopeKeyRef.current;
      if (scopeKey) {
        setQuickChatErrorForScope(scopeKey, message);
        updateQuickChatMessagesForScope(scopeKey, current => finishLiveChatMessageWithError(current, message));
      }
      quickChatBusyRef.current = false;
      setQuickChatBusy(false);
    }
  }, []);
  useEffect(() => window.lastbrowser.quickChat.onEvent(event => {
    if (event.quickChatId !== quickChatIdRef.current) return;
    if (!quickChatBindingRef.current || quickChatAwaitingStartRef.current) {
      quickChatBufferedEventsRef.current.push(event);
      if (quickChatBufferedEventsRef.current.length > 100) quickChatBufferedEventsRef.current.shift();
      return;
    }
    processQuickChatEvent(event, quickChatGenerationRef.current);
  }), [processQuickChatEvent]);
  useEffect(() => {
    const nextKey = `${activeProfileId}::${activeSpacePath}::${activeBackendProfileName || ''}`;
    if (quickChatScopeKeyRef.current === null) {
      quickChatScopeKeyRef.current = nextKey;
      return;
    }
    if (quickChatScopeKeyRef.current === nextKey) return;
    const previousKey = quickChatScopeKeyRef.current;
    const previousMessages = (previousKey ? quickChatMessagesByScopeRef.current.get(previousKey) : undefined) ?? quickChatMessagesRef.current;
    if (previousKey) quickChatMessagesByScopeRef.current.set(previousKey, previousMessages);
    quickChatScopeKeyRef.current = nextKey;
    quickChatTranscriptScopeKeyRef.current = nextKey;
    const nextMessages = quickChatMessagesByScopeRef.current.get(nextKey) ?? [];
    quickChatMessagesRef.current = nextMessages;
    setQuickChatMessages(nextMessages);
    setQuickChatError(quickChatErrorsByScopeRef.current.get(nextKey) ?? '');
    quickChatErrorScopeKeyRef.current = nextKey;
    quickChatStatusScopeKeyRef.current = nextKey;
    setQuickChatStatus(quickChatStatusesByScopeRef.current.get(nextKey) ?? '');
    resetQuickChat(false);
  }, [activeProfileId, activeSpacePath, activeBackendProfileName]);
  const isCreatingSessionRef = useRef(false);
  const createSessionRequestRef = useRef(0);
  const browserFrameRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const toggleDevTools = useCallback(() => {
    const view = webviewRef.current;
    if (!isWebviewReady(view)) return;
    toggleWebviewDevTools(view, setDevToolsOpen);
  }, []);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const resizeStateRef = useRef<SidebarResizeState | null>(null);
  const contextSidebarWidthRef = useRef(contextSidebarWidth);
  const workspacePanelWidthRef = useRef(workspacePanelWidth);
  const contextSidebarCollapsedRef = useRef(contextSidebarCollapsed);
  const workspacePanelCollapsedRef = useRef(workspacePanelCollapsed);
  const leftSidebarCollapsedRef = useRef(leftSidebarCollapsed);
  const setupRequired = shouldShowFirstRunSetup(setupState, onboardingStatus, {
    dismissed: setupDismissed,
    reopenRequested: setupReopenRequested
  });
  const canPresentWhatsNew = canShowWhatsNewModal({
    setupLoading,
    setupRequired,
    onboardingStatusChecked,
    accessAuthChecked,
    accessAuthRequired
  });
  useEffect(() => {
    if (!canPresentWhatsNew || !window.lastbrowser?.updates?.whatsNewCandidate) return undefined;
    let active = true;
    if (!whatsNewRequestRef.current) {
      whatsNewRequestRef.current = (async () => {
        const candidate = await window.lastbrowser.updates.whatsNewCandidate();
        if (!candidate || releaseNotesBetween(candidate, locale).length === 0) return null;
        return candidate;
      })().catch((error: unknown) => {
        console.warn('[updates] Could not prepare release notes:', error);
        return null;
      });
    }
    void whatsNewRequestRef.current.then((candidate) => {
      if (active && candidate) setWhatsNewCandidate(candidate);
    });
    return () => { active = false; };
  }, [canPresentWhatsNew, locale]);
  const sidekickTransportReady = canCallSidekickApi(status);
  const sidekickApiReady = sidekickTransportReady && accessAuthChecked && !accessAuthRequired;
  useEffect(() => {
    let current = true;
    setAssistantSelection(null); setAssistantSelectionError('');
    setAssistantSelectionRequestScope(null);
    if (!sidekickApiReady) return undefined;
    const resolution = new AbortController();
    void assistantController.resolveScope({ browserProfileId: activeProfileId, workspacePath: activeSpacePath || null }, explicitBackendProfileBySpace[`${activeProfileId}::${activeSpacePath || ''}`], { signal: resolution.signal }).then(result => {
      if (!current) return;
      if (result.ok) {
        setAssistantSelectionRequestScope({ profile: activeProfileId, workspacePath: activeSpacePath,
          backendProfileName: explicitBackendProfileBySpace[`${activeProfileId}::${activeSpacePath || ''}`] });
        setAssistantSelection(result.value);
        setAmbiguousSpace(null);
      } else {
        setAssistantSelectionError(result.error.message);
        if (result.error.message.includes('Choose the backend profile for this browser Space')) {
          setAmbiguousSpace({ browserProfileId: activeProfileId, workspacePath: activeSpacePath || null });
        }
      }
    });
    return () => { current = false; resolution.abort(); };
  }, [sidekickApiReady, activeSpacePath, activeProfileId, assistantController, explicitBackendProfileBySpace]);

  useEffect(() => {
    if (!sidekickTransportReady) return;
    let alive = true;
    const checkAccessStatus = async (): Promise<void> => {
      try {
        const auth = await window.lastbrowser.sidekick.getAccessAuthStatus();
        if (!alive) return;
        setAccessAuthRequired(Boolean(auth.auth_enabled && !auth.logged_in));
        setAccessAuthChecked(true);
        setAccessAuthError('');
      } catch (error) {
        if (!alive) return;
        setAccessAuthError(error instanceof Error ? error.message : String(error));
        // A failed auth-status check (including a 401 after the sidecar
        // session token changes) must never leave an already-unlocked shell
        // visible. Keep the retry screen up until status can be verified.
        setAccessAuthChecked(false);
      }
    };
    void checkAccessStatus();
    const timer = window.setInterval(() => void checkAccessStatus(), 10_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkAccessStatus();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sidekickTransportReady]);

  useEffect(() => {
    const lockBrowser = () => {
      setAccessPassword('');
      setAccessAuthError('');
      setAccessAuthRequired(true);
      setAccessAuthChecked(true);
    };
    return window.lastbrowser.sidekick.onAccessAuthLocked(lockBrowser);
  }, []);

  async function unlockBrowser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!accessPassword || accessAuthBusy) return;
    setAccessAuthBusy(true);
    setAccessAuthError('');
    try {
      await window.lastbrowser.sidekick.loginAccessPassword({ password: accessPassword });
      const auth = await window.lastbrowser.sidekick.getAccessAuthStatus();
      if (!auth.logged_in) throw new Error('Login did not create an authenticated session.');
      setAccessAuthRequired(false);
      setAccessAuthChecked(true);
      setAccessPassword('');
    } catch (error) {
      setAccessAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAccessAuthBusy(false);
    }
  }

  useEffect(() => {
    if (!sidekickApiReady) return undefined;
    let alive = true;
    const controller = new AbortController();
    const revisionAtStart = desktopSettingsRevisionRef.current;
    void fetchDesktopSettingsWithRetry(() => window.lastbrowser.sidekick.getSettings(), 8, 750, controller.signal)
      .then((payload) => {
        if (!alive || desktopSettingsRevisionRef.current !== revisionAtStart) return;
        setDesktopSettings((current) => {
          if (desktopSettingsRevisionRef.current !== revisionAtStart) {
            return current || loadDesktopSettingsFromStorage();
          }
          const storedSettings = loadDesktopSettingsFromStorage();
          const nextSettings = mergeDesktopSettings(payload, storedSettings, current);
          saveDesktopSettingsToStorage(nextSettings);
          return nextSettings;
        });
        setDesktopSettingsHydrated(true);
      })
      .catch(() => {
        if (!alive || controller.signal.aborted || desktopSettingsRevisionRef.current !== revisionAtStart) return;
        setDesktopSettings((current) => current || loadDesktopSettingsFromStorage());
        setDesktopSettingsHydrated(true);
      });
    const handleSettingsDraftChanged = () => {
      desktopSettingsRevisionRef.current += 1;
    };
    const handleSettingsChanged = (event: Event) => {
      desktopSettingsRevisionRef.current += 1;
      const custom = event as CustomEvent<{ settings?: Record<string, unknown> } | Record<string, unknown>>;
      const nextSettings = isRecord(custom.detail) && isRecord((custom.detail as Record<string, unknown>).settings)
        ? (custom.detail as Record<string, unknown>).settings
        : isRecord(custom.detail) ? custom.detail as Record<string, unknown> : null;
      if (nextSettings && Object.keys(nextSettings).some((key) => !key.startsWith('_'))) {
        setDesktopSettingsHydrated(true);
        setDesktopSettings((current) => {
          const merged = {
            ...(current || {}),
            ...nextSettings
          };
          saveDesktopSettingsToStorage(merged);
          return merged;
        });
      }
    };
    window.addEventListener('lastbrowser:settings-draft-changed', handleSettingsDraftChanged);
    window.addEventListener('lastbrowser:settings-changed', handleSettingsChanged);
    return () => {
      alive = false;
      controller.abort();
      window.removeEventListener('lastbrowser:settings-draft-changed', handleSettingsDraftChanged);
      window.removeEventListener('lastbrowser:settings-changed', handleSettingsChanged);
    };
  }, [sidekickApiReady]);

  useEffect(() => {
    applyDesktopAppearance(desktopSettings);
  }, [desktopSettings]);

  useEffect(() => {
    const enabled = resolveAutoUpdateCheckPreference(desktopSettings, desktopSettingsHydrated);
    if (enabled === null) return;
    void window.lastbrowser.updates.setAutoCheckEnabled(enabled).catch((error) => {
      console.warn('[App] Could not apply automatic update-check preference:', error);
    });
  }, [desktopSettingsHydrated, desktopSettings !== null, desktopSettings?.check_for_updates]);

  useEffect(() => watchSystemThemeChanges(desktopSettings), [desktopSettings]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    setAddressValue(isAiBrowserHomeUrl(activeTab.url) ? '' : activeTab.url);
  }, [activeTab.id, activeTab.url]);

  useEffect(() => {
    if (activePanel !== 'browser') return;
    setBrowserMode(isAiBrowserHomeUrl(activeTab.url) ? 'home' : 'web');
  }, [activePanel, activeTab.id, activeTab.url]);

  useEffect(() => {
    saveBookmarks(window.localStorage, bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    saveVisitedSites(window.localStorage, visitedSites);
  }, [visitedSites]);

  useEffect(() => {
    saveSearchEngineId(window.localStorage, searchEngineId);
    void window.lastbrowser?.browser?.setSearchEngine?.(searchEngineId);
  }, [searchEngineId]);

  /** Drop a single entry from the history panel. */
  function removeHistoryEntry(url: string): void {
    setVisitedSites((current) => removeVisit(current, url));
  }

  /** Wipe the whole history log. */
  function clearHistory(): void {
    setVisitedSites([]);
  }

  useEffect(() => {
    const unbindTab = window.lastbrowser?.browser?.onOpenTab?.((url) => addTab(url));
    const unbindIncognito = window.lastbrowser?.browser?.onOpenIncognitoTab?.((url) => addTab(url, { incognito: true }));
    const unbindResearch = window.lastbrowser?.browser?.onDeepResearch?.(async (payload) => {
      setActivePanel('chat');
      if (payload.selectionText) {
        await startNativeChat(
          `Erstelle eine tiefe, fundierte Recherche zu folgendem ausgewählten Text:\n\n„${payload.selectionText}“\n\nQuelle: ${payload.pageUrl || 'Browser'}`,
          `Deep Research: ${payload.selectionText.slice(0, 30)}…`
        );
      } else if (payload.pageUrl) {
        await runSidekickAction('research-page');
      }
    });
    return () => {
      unbindTab?.();
      unbindIncognito?.();
      unbindResearch?.();
    };
  }, [addTab]);

  useEffect(() => {
    if (!window.lastbrowser?.downloads?.onChanged) return;
    return window.lastbrowser.downloads.onChanged((entries) => {
      setHasActiveDownloads(entries.some((e) => e.state === 'progressing'));
    });
  }, []);

  useEffect(() => {
    const handleToggleDevtools = () => {
      toggleDevTools();
    };
    const handlePrint = () => {
      try {
        webviewRef.current?.print?.();
      } catch {
        // ignore
      }
    };
    window.addEventListener('lastbrowser:toggle-devtools', handleToggleDevtools);
    window.addEventListener('lastbrowser:print-page', handlePrint);
    return () => {
      window.removeEventListener('lastbrowser:toggle-devtools', handleToggleDevtools);
      window.removeEventListener('lastbrowser:print-page', handlePrint);
    };
  }, [toggleDevTools]);

  useEffect(() => {
    if (!window.lastbrowser?.browser?.onShortcut) return;
    return window.lastbrowser.browser.onShortcut((event: { action: string; payload?: { index?: number } }) => {
      switch (event.action) {
        case 'new-tab':
          addTabAndFocusStartSearch();
          setActivePanel('browser');
          break;
        case 'new-incognito-tab':
          addTab(browserStartUrl, { incognito: true });
          setActivePanel('browser');
          break;
        case 'history-back':
          try {
            webviewRef.current?.goBack();
          } catch {
            // ignore
          }
          break;
        case 'history-forward':
          try {
            webviewRef.current?.goForward();
          } catch {
            // ignore
          }
          break;
        case 'toggle-fullscreen':
          void window.lastbrowser.window?.toggleFullScreen?.();
          break;
        case 'print-page':
          try {
            webviewRef.current?.print?.();
          } catch {
            // ignore
          }
          break;
        case 'close-tab': {
          const curId = activeTabIdRef.current;
          if (curId) closeTab(curId);
          break;
        }
        case 'reopen-tab':
          reopenClosedTab();
          setActivePanel('browser');
          break;
        case 'focus-address':
          setZenTitlebarRevealed(true);
          addressInputRef.current?.focus();
          addressInputRef.current?.select();
          break;
        case 'reload':
          try {
            webviewRef.current?.reload();
          } catch {
            // ignore
          }
          break;
        case 'reload-hard':
          try {
            (webviewRef.current as any)?.reloadIgnoringCache?.() ?? webviewRef.current?.reload();
          } catch {
            // ignore
          }
          break;
        case 'next-tab': {
          const allTabs = useTabStore.getState().tabs;
          const curId = activeTabIdRef.current;
          const idx = allTabs.findIndex((t) => t.id === curId);
          if (allTabs.length > 1 && idx >= 0) {
            const nextIdx = (idx + 1) % allTabs.length;
            setActiveTabId(allTabs[nextIdx].id);
            setActivePanel('browser');
          }
          break;
        }
        case 'prev-tab': {
          const allTabs = useTabStore.getState().tabs;
          const curId = activeTabIdRef.current;
          const idx = allTabs.findIndex((t) => t.id === curId);
          if (allTabs.length > 1 && idx >= 0) {
            const prevIdx = (idx - 1 + allTabs.length) % allTabs.length;
            setActiveTabId(allTabs[prevIdx].id);
            setActivePanel('browser');
          }
          break;
        }
        case 'jump-tab': {
          const allTabs = useTabStore.getState().tabs;
          const target = event.payload?.index ?? 0;
          if (target >= 0 && target < allTabs.length) {
            setActiveTabId(allTabs[target].id);
            setActivePanel('browser');
          }
          break;
        }
        case 'jump-last-tab': {
          const allTabs = useTabStore.getState().tabs;
          if (allTabs.length > 0) {
            setActiveTabId(allTabs[allTabs.length - 1].id);
            setActivePanel('browser');
          }
          break;
        }
        case 'find-in-page':
          usePanelStore.getState().setFindOpen(true);
          break;
        case 'open-history':
          usePanelStore.getState().setHistoryOpen(!usePanelStore.getState().historyOpen);
          break;
        case 'open-downloads':
          usePanelStore.getState().setDownloadsOpen(!usePanelStore.getState().downloadsOpen);
          break;
        case 'open-settings':
          setActivePanel('settings');
          break;
        case 'open-extensions':
          toggleExtensionHub();
          break;
        case 'toggle-sidebar':
          cycleSidebarMode();
          setContextSidebarCollapsed((prev) => !prev);
          break;
        case 'toggle-command-palette':
          usePanelStore.getState().toggleCommandPalette();
          break;
        case 'toggle-copilot':
          toggleCopilot();
          break;
        case 'toggle-devtools':
          toggleDevTools();
          break;
        case 'zoom-in': {
          const view = webviewRef.current;
          if (view && typeof view.getZoomFactor === 'function' && typeof view.setZoomFactor === 'function') {
            view.setZoomFactor(Math.min(3, view.getZoomFactor() + 0.1));
          }
          break;
        }
        case 'zoom-out': {
          const view = webviewRef.current;
          if (view && typeof view.getZoomFactor === 'function' && typeof view.setZoomFactor === 'function') {
            view.setZoomFactor(Math.max(0.25, view.getZoomFactor() - 0.1));
          }
          break;
        }
        case 'zoom-reset': {
          const view = webviewRef.current;
          if (view && typeof view.setZoomFactor === 'function') {
            view.setZoomFactor(1);
          }
          break;
        }
      }
    });
  }, [addTab, closeTab, reopenClosedTab, setActiveTabId, setActivePanel, setContextSidebarCollapsed, toggleDevTools]);

  useEffect(() => {
    saveActivePanel(undefined, activePanel);
  }, [activePanel]);

  useEffect(() => {
    saveInstalledSidebarApps(undefined, installedSidebarApps);
  }, [installedSidebarApps]);

  useEffect(() => {
    setActiveContextItem(panelContextItems[activePanel]?.[0] || '');
  }, [activePanel]);

  useEffect(() => {
    saveBooleanPreference(undefined, leftSidebarCollapsedStorageKey, leftSidebarCollapsed);
  }, [leftSidebarCollapsed]);

  useEffect(() => {
    saveBooleanPreference(undefined, workspacePanelCollapsedStorageKey, workspacePanelCollapsed);
  }, [workspacePanelCollapsed]);

  useEffect(() => {
    saveNumericPreference(undefined, contextSidebarWidthStorageKey, contextSidebarWidth);
  }, [contextSidebarWidth]);

  useEffect(() => {
    saveNumericPreference(undefined, workspacePanelWidthStorageKey, workspacePanelWidth);
  }, [workspacePanelWidth]);

  useEffect(() => {
    contextSidebarWidthRef.current = contextSidebarWidth;
  }, [contextSidebarWidth]);

  useEffect(() => {
    workspacePanelWidthRef.current = workspacePanelWidth;
  }, [workspacePanelWidth]);

  useEffect(() => {
    contextSidebarCollapsedRef.current = contextSidebarCollapsed;
  }, [contextSidebarCollapsed]);

  useEffect(() => {
    workspacePanelCollapsedRef.current = workspacePanelCollapsed;
  }, [workspacePanelCollapsed]);

  useEffect(() => {
    leftSidebarCollapsedRef.current = leftSidebarCollapsed;
  }, [leftSidebarCollapsed]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const next = await window.lastbrowser.services.status();
      if (alive) setStatus(next);
    };
    void refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadSetup(): Promise<void> {
      setSetupLoading(true);
      try {
        const stored = await window.lastbrowser.setup.load();
        if (!alive) return;
        setSetupState(normalizeSetupState(stored));
      } finally {
        if (alive) setSetupLoading(false);
      }
    }
    void loadSetup();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const onboarding = await window.lastbrowser.sidekick.onboardingStatus().catch(() => null);
      if (!alive) return;
      if (onboarding) setOnboardingStatus(onboarding as OnboardingStatus);
      // A failed first probe must not block browser use or release notes forever;
      // a later chat_ready=false response will close the same presentation gate.
      setOnboardingStatusChecked(true);
    };
    void refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [status?.webuiUrl]);

  useEffect(() => {
    let alive = true;
    void window.lastbrowser.updates.status().then((next) => {
      if (alive) setUpdateStatus(next);
    }).catch(() => null);
    const dispose = window.lastbrowser.updates.onStatus((next) => setUpdateStatus(next));
    return () => {
      alive = false;
      dispose();
    };
  }, []);

  const refreshOnboardingStatus = useCallback(async (): Promise<void> => {
    const onboarding = await window.lastbrowser.sidekick.onboardingStatus().catch(() => null);
    if (onboarding) setOnboardingStatus(onboarding as OnboardingStatus);
  }, []);

  const refreshSessions = useCallback(async (): Promise<void> => {
    if (!sidekickApiReady) return;
    const requestedScope: SessionListScope = { profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName };
    const isRequestScopeCurrent = (): boolean => sessionListResponseMatchesScope(requestedScope, {
      profile: activeProfileIdRef.current,
      workspacePath: activeSpacePathRef.current,
      backendProfileName: activeBackendProfileName
    });
    try {
      const result = await window.lastbrowser.sidekick.listSessions(requestedScope);
      const nextSessions = Array.isArray(result.sessions) ? result.sessions : [];
      if (!isRequestScopeCurrent()) return;
      const snapshot = mergeSessionListSnapshot(
        appliedSessionListScopeRef.current,
        requestedScope,
        sessionsRef.current,
        nextSessions,
        activeSessionIdRef.current
      );
      appliedSessionListScopeRef.current = requestedScope;
      setSessions(snapshot.sessions);
      setSessionError('');
      setActiveSessionId((current) => isRequestScopeCurrent()
        ? resolveSessionListSelection(current, nextSessions, snapshot.scopeChanged, isCreatingSessionRef.current)
        : current);
      // Fetch projects
      try {
        const projData = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/projects' });
        if (Array.isArray(projData?.projects)) setProjects(projData.projects);
      } catch { /* ignore */ }
    } catch (error) {
      if (!isRequestScopeCurrent()) return;
      const message = error instanceof Error ? error.message : String(error);
      setSessionError(isTransientSidekickFetchError(message) ? '' : message);
    }
  }, [activeProfileId, activeSpacePath, activeBackendProfileName, sidekickApiReady]);

  const refreshSpaces = useCallback(async (): Promise<void> => {
    if (!sidekickApiReady) return;
    const directoryRevisionAtRequest = spaceDirectoryRevisionRef.current;
    const selectionRevisionAtRequest = activeSpaceSelectionRevisionRef.current;
    try {
      const result = await window.lastbrowser.sidekick.listSpaces();
      const nextSpaces = Array.isArray(result.workspaces) ? result.workspaces : [];
      if (!isCurrentSpaceDirectorySnapshot(directoryRevisionAtRequest, spaceDirectoryRevisionRef.current)) return;
      setSpaces(nextSpaces);
      setSpacesError('');
      setActiveSpacePath((current) => resolveRefreshedActiveSpacePath({
        currentPath: current,
        availablePaths: nextSpaces.map((space) => space.path),
        lastPath: result.last,
        selectionRevisionAtRequest,
        currentSelectionRevision: activeSpaceSelectionRevisionRef.current
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSpacesError(isTransientSidekickFetchError(message) ? '' : message);
    }
  }, [sidekickApiReady]);

  const loadActiveSession = useCallback(async (
    sessionId: string,
    options: { loadDraft?: boolean; showLoading?: boolean } = {}
  ): Promise<DesktopSessionDetail | null> => {
    if (!sidekickApiReady || !sessionId || activeSessionIdRef.current !== sessionId) return null;
    const sessionScope: SessionListScope = {
      profile: activeProfileIdRef.current,
      workspacePath: activeSpacePathRef.current,
      backendProfileName: activeBackendProfileNameRef.current
    };
    const isSessionScopeCurrent = (): boolean => sessionListResponseMatchesScope(sessionScope, {
      profile: activeProfileIdRef.current,
      workspacePath: activeSpacePathRef.current,
      backendProfileName: activeBackendProfileNameRef.current
    });
    if (options.showLoading !== false) setActiveSessionLoading(true);
    try {
      const [sessionResult, draftResult] = await Promise.all([
        window.lastbrowser.sidekick.getSession({
          sessionId,
          messages: true,
          msgLimit: 80,
          ...sessionScope
        }),
        options.loadDraft === false
          ? Promise.resolve(null)
          : window.lastbrowser.sidekick.getDraft({ sessionId, ...sessionScope }).catch(() => null)
      ]);
      const session = sessionResult.session || null;
      if (!session) throw new Error('Sidekick session was not found.');
      // Session fetches can resolve after the user has selected another chat.
      // Never let a stale response replace the currently visible transcript.
      if (activeSessionIdRef.current !== sessionId || !isSessionScopeCurrent()) return session;
      if (isIndependentOwnedSession(session)) {
        setActiveSession(session); setChatMessages(normalizeChatMessages(session.messages));
        updateActiveStreamId(null); setChatRunState('idle'); setChatError(readIndependentSessionRun(session) ? '' : t('spaceAssistant.stale'));
        if (draftResult?.draft && options.loadDraft !== false) setComposerText(String(draftResult.draft.text || ''));
        return session;
      }
      const localTurnForThisSession = isLocalChatTurnForSession(
        sessionId,
        sessionId,
        chatUiOwnershipRef.current.isLocalTurn(sessionId),
      );
      const restoredTurn = readRestoredChatTurnState(session, localTurnForThisSession);
      // A session snapshot can predate a just-started local turn. Keep that
      // turn intact until its accepted stream ID is visible in a fresh snapshot.
      if (restoredTurn.preserveLocalTurn) return session;
      setActiveSession(session);
      const snapshotMessages = normalizeChatMessages(session.messages);
      const interruptedTurnMessage = t('chat.interruptedPendingTurn');
      if (restoredTurn.orphanedPendingTurn) {
        setChatMessages(finishOrphanedChatTurn(snapshotMessages, restoredTurn.pendingUserMessage, interruptedTurnMessage));
        const legacySnapshotMessages: SidekickMessage[] = snapshotMessages.flatMap((message) => {
          if (message.role !== 'assistant' && message.role !== 'user' && message.role !== 'system') return [];
          return [{ ...message, role: message.role, content: message.content || '', id: crypto.randomUUID() }];
        });
        setMessages(finishOrphanedChatTurn(legacySnapshotMessages, restoredTurn.pendingUserMessage, interruptedTurnMessage));
      } else {
        const preserveMatchingLocalStream = isMatchingLocalChatStreamSnapshot(
          sessionId,
          sessionId,
          chatUiOwnershipRef.current.isLocalTurn(sessionId),
          restoredTurn.activeStreamId,
          activeStreamIdRef.current,
        );
        setChatMessages((current) => preserveInFlightChatMessages(
          snapshotMessages,
          current,
          preserveMatchingLocalStream,
        ));
      }
      updateActiveStreamId(restoredTurn.activeStreamId);
      setChatRunState(restoredTurn.runState);
      setChatError(readPersistentGoalStateError(session) || (restoredTurn.orphanedPendingTurn ? interruptedTurnMessage : ''));
      if (draftResult?.draft && options.loadDraft !== false) {
        setComposerText(String(draftResult.draft.text || ''));
      }
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (activeSessionIdRef.current === sessionId && isSessionScopeCurrent()) {
        setChatError(isTransientSidekickFetchError(message) ? '' : message);
      }
      return null;
    } finally {
      if (options.showLoading !== false && activeSessionIdRef.current === sessionId && isSessionScopeCurrent()) setActiveSessionLoading(false);
    }
  }, [sidekickApiReady, t]);

  const independentSessionRun = readIndependentSessionRun(activeSession);
  const independentSessionRunKey = independentSessionRun && isIndependentOwnedSession(activeSession) ? `${independentSessionRun.runId}:${independentSessionRun.scope.backendProfileId}:${independentSessionRun.scope.spaceId}:${independentSessionRun.scope.browserProfileId}` : '';
  useEffect(() => {
    if (!sidekickApiReady || !independentSessionRunKey || !independentSessionRun || independentSessionRun.scope.browserProfileId !== activeProfileId) return undefined;
    const sessionId = activeSessionId;
    if (!sessionId) return undefined;
    const release = assistantController.observe(independentSessionRun.scope);
    const timer = window.setInterval(() => { void loadActiveSession(sessionId, { loadDraft: false, showLoading: false }); }, 1000);
    return () => { window.clearInterval(timer); release(); };
  }, [sidekickApiReady, independentSessionRunKey, activeSessionId, activeProfileId, activeBackendProfileName, assistantController, loadActiveSession]);

  useEffect(() => {
    const nextScope: SessionListScope = { profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName };
    if (sameSessionListScope(activeSessionListScopeRef.current, nextScope)) return;
    activeSessionListScopeRef.current = nextScope;
    // A session from another profile/Space must not remain selected while the
    // scoped list is loading. Keep an already-running backend turn alive; its
    // owner checks will ignore late UI updates until that session is selected again.
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    setActiveSession(null);
    setSessions([]);
    setChatMessages([]);
    setMessages([]);
    setActiveSessionLoading(false);
    chatUiOwnershipRef.current.releaseUiOwner();
    setSidekickBusy(false);
    updateActiveStreamId(null);
    setChatRunState('idle');
    setChatError('');
    const requestedChat = pendingIndependentChatRef.current;
    pendingIndependentChatRef.current = null;
    if (requestedChat && requestedChat.scope.browserProfileId === activeProfileId && requestedChat.path === activeSpacePath) {
      activeSessionIdRef.current = requestedChat.sessionId;
      setActiveSessionId(requestedChat.sessionId); setActivePanel('chat');
    }
  }, [activeProfileId, activeSpacePath, activeBackendProfileName]);

  useEffect(() => {
    if (!sidekickApiReady) return undefined;
    void refreshSessions();
    void refreshSpaces();
    const timer = window.setInterval(() => void refreshSessions(), 5000);
    const spaceTimer = window.setInterval(() => void refreshSpaces(), 10000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(spaceTimer);
    };
  }, [refreshSessions, refreshSpaces, sidekickApiReady]);

  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      setChatMessages([]);
      setComposerText('');
      updateActiveStreamId(null);
      setChatRunState('idle');
      return undefined;
    }

    void loadActiveSession(activeSessionId, { loadDraft: true, showLoading: true });
    return undefined;
  }, [activeSessionId, activeBackendProfileName, loadActiveSession]);

  // The renderer can restart while the Sidekick worker keeps streaming. Reattach
  // once to the persisted stream instead of leaving the restored chat stuck in
  // its loading state. The claim also makes this safe under React StrictMode.
  useEffect(() => {
    if (
      !sidekickApiReady
      || !activeSession
      || isIndependentOwnedSession(activeSession)
      || activeSessionLoading
      || activeSession.session_id !== activeSessionId
    ) return;
    const restored = readRestoredChatStream(activeSession);
    if (!restored) return;
    const turnContext = {
      sessionId: restored.sessionId,
      profileId: activeProfileId,
      spacePath: activeSpacePath
    };
    const current = {
      sessionId: activeSessionIdRef.current,
      profileId: activeProfileIdRef.current,
      spacePath: activeSpacePathRef.current
    };
    if (!isActiveTurnContextCurrent(turnContext, current)) return;
    const localOwnerId = chatUiOwnershipRef.current.ownerForStream(restored.streamId);
    if (localOwnerId !== null) {
      if (sidekickBusy && chatUiOwnershipRef.current.activeSessionId !== restored.sessionId) return;
      if (chatUiOwnershipRef.current.reactivate(localOwnerId, restored.sessionId)) {
        setActivePanel('chat');
        setChatMessages((messages) => restorePendingChatTurn(messages, restored.pendingUserMessage));
        setMessages((messages) => restorePendingChatTurn(messages, restored.pendingUserMessage));
        updateActiveStreamId(restored.streamId);
        setSidekickBusy(true);
        setChatRunState('streaming');
      }
      return;
    }
    if (sidekickBusy) return;
    if (!claimRestoredChatStream(restored.sessionId, restored.streamId, restoredChatStreamClaimsRef.current)) return;

    setActivePanel('chat');
    setChatMessages((messages) => {
      const bound = bindLiveChatAssistantStream(restorePendingChatTurn(messages, restored.pendingUserMessage), restored.sessionId, restored.streamId, restored.pendingUserMessage);
      return activeSession?.model === 'teamwork' ? beginLiveTeamworkTurn(bound, restored.streamId) : bound;
    });
    setMessages((messages) => {
      const bound = bindLiveChatAssistantStream(restorePendingChatTurn(messages, restored.pendingUserMessage), restored.sessionId, restored.streamId, restored.pendingUserMessage);
      return activeSession?.model === 'teamwork' ? beginLiveTeamworkTurn(bound, restored.streamId) : bound;
    });
    updateActiveStreamId(restored.streamId);
    const uiTurnOwner = beginChatUiTurn(restored.sessionId);
    registerChatUiStream(uiTurnOwner, restored.streamId, restored.sessionId);
    setChatRunState('streaming');
    let failed = false;
    const isOwningContextCurrent = (): boolean => chatUiOwnershipRef.current.isActive(uiTurnOwner)
      && chatUiOwnershipRef.current.ownsStream(uiTurnOwner, restored.streamId)
      && isActiveTurnContextCurrent(turnContext, {
      sessionId: activeSessionIdRef.current,
      profileId: activeProfileIdRef.current,
      spacePath: activeSpacePathRef.current
    });

    void (async () => {
      try {
        const streamResult = await pollNativeChat(
          restored.streamId,
          restored.sessionId,
          [],
          undefined,
          isOwningContextCurrent,
          isIndependentScope(activeSession?.space_scope)?{scope:activeSession.space_scope,sessionId:restored.sessionId,streamId:restored.streamId,
            workspacePath:turnContext.spacePath,browserProfileId:turnContext.profileId}:undefined,
          activeSession?.model === 'teamwork'
        );
        const updated = await loadActiveSession(restored.sessionId, { loadDraft: false, showLoading: false });
        if (!isOwningContextCurrent()) return;
        const answer = lastAssistantText(updated);
        if (streamResult.streamError) {
          failed = true;
          setChatError(streamResult.streamError);
          setChatMessages((messages) => finishLiveChatMessageWithError(messages, streamResult.streamError!, restored.streamId));
          setMessages((messages) => finishLiveChatMessageWithError(messages, streamResult.streamError!, restored.streamId));
        } else if (streamResult.cancelled) {
          setChatMessages((messages) => finishLiveChatMessage(messages, restored.streamId));
          setMessages((messages) => finishLiveChatMessage(messages, restored.streamId));
        } else {
          setChatMessages((messages) => messages.map((message) => (message.pending || message.streaming || message.content === 'Working on it...')
            && message.chatStreamId === restored.streamId
            ? { ...message, content: answer || (message.content === 'Working on it...' ? 'Sidekick finished.' : message.content || 'Sidekick finished.'), pending: false, streaming: false, progress: undefined }
            : message));
          setMessages((messages) => messages.map((message) => (message.pending || message.streaming || message.content === 'Working on it...')
            && message.chatStreamId === restored.streamId
            ? { ...message, content: answer || (message.content === 'Working on it...' ? 'Sidekick finished.' : message.content || 'Sidekick finished.'), pending: false, streaming: false, progress: undefined }
            : message));
        }
        if (streamResult.goalError) setChatError(streamResult.goalError);
        void refreshSessions();
        if (streamResult.continuationPrompt && !streamResult.streamError) {
          await startGoalContinuation(streamResult.continuationPrompt, turnContext, {
            sessionId: activeSessionIdRef.current,
            profileId: activeProfileIdRef.current,
            spacePath: activeSpacePathRef.current
          }, (prompt) => startNativeChat(prompt, prompt, turnContext));
        }
      } catch (error) {
        failed = true;
        if (isOwningContextCurrent()) {
          const message = error instanceof Error ? error.message : String(error);
          setChatError(message);
          setChatMessages((messages) => finishLiveChatMessageWithError(messages, message));
          setMessages((messages) => finishLiveChatMessageWithError(messages, message));
        }
      } finally {
        finishChatUiTurn(uiTurnOwner);
        if (isOwningContextCurrent()) {
          updateActiveStreamId(null);
          setChatRunState(failed ? 'error' : 'idle');
        }
      }
    })();
  }, [activeSession, activeSessionId, activeSessionLoading, activeProfileId, activeSpacePath, sidekickApiReady, sidekickBusy, loadActiveSession, refreshSessions]);

  useEffect(() => {
    if (
      !sidekickApiReady
      || !activeSession
      || isIndependentOwnedSession(activeSession)
      || activeSessionLoading
      || sidekickBusy
      || chatRunState !== 'idle'
      || activeSession.session_id !== activeSessionId
    ) return;
    const prompt = readRestorableGoalContinuation(activeSession);
    if (!prompt) return;
    const expected = {
      sessionId: activeSession.session_id,
      profileId: activeProfileId,
      spacePath: activeSpacePath
    };
    const current = {
      sessionId: activeSessionIdRef.current,
      profileId: activeProfileIdRef.current,
      spacePath: activeSpacePathRef.current
    };
    if (!claimRestorableGoalContinuation(
      prompt,
      expected,
      current,
      restoredGoalContinuationClaimsRef.current
    )) return;

    setActivePanel('chat');
    void startGoalContinuation(
      prompt,
      expected,
      current,
      (continuationPrompt) => startNativeChat(continuationPrompt, continuationPrompt, expected)
    ).then((started) => {
      if (!started) {
        releaseRestorableGoalContinuationClaim(
          prompt,
          expected,
          restoredGoalContinuationClaimsRef.current
        );
      }
    });
  }, [activeSession, activeSessionId, activeSessionLoading, activeProfileId, activeSpacePath, sidekickApiReady, sidekickBusy, chatRunState]);

  useEffect(() => {
    if (!activeSessionId || !sidekickApiReady) return undefined;
    const timer = window.setTimeout(() => {
      void window.lastbrowser.sidekick.saveDraft({
        sessionId: activeSessionId,
        text: composerText,
        files: [],
        profile: activeProfileId,
        workspacePath: activeSpacePath
      }).catch(() => null);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeProfileId, activeSpacePath, activeSessionId, composerText, sidekickApiReady]);

  const refreshWorkspace = useCallback(async (pathOverride?: string): Promise<void> => {
    if (status?.sidekick !== 'ready' || !activeSessionId || workspacePanelCollapsed) return;
    try {
      const nextPath = pathOverride || workspacePath || '.';
      const result = await window.lastbrowser.sidekick.listWorkspace({
        sessionId: activeSessionId,
        path: nextPath
      });
      setWorkspaceEntries(Array.isArray(result.entries) ? result.entries : []);
      setWorkspacePath(result.path || nextPath || '.');
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }, [activeSessionId, status?.sidekick, workspacePanelCollapsed, workspacePath]);

  useEffect(() => {
    let alive = true;
    if (status?.sidekick !== 'ready' || !activeSessionId || workspacePanelCollapsed) return undefined;
    void refreshWorkspace().finally(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
  }, [activeSessionId, refreshWorkspace, status?.sidekick, workspacePanelCollapsed, workspacePath, workspaceRefreshNonce]);

  function navigate(url: string): void {
    const normalized = normalizeNavigationInput(url, searchEngineId);
    setTabs((current) => updateTabUrl(current, activeTab.id, normalized));
    setBrowserMode(isAiBrowserHomeUrl(normalized) ? 'home' : 'web');
    setBrowserLoadError('');
    setActivePanel('browser');
  }

  function submitNavigation(event: FormEvent): void {
    event.preventDefault();
    navigate(addressValue.trim() ? addressValue : browserStartUrl);
  }

  function addTab(url = browserStartUrl, options?: { incognito?: boolean; pinned?: boolean }): void {
    const next = createInitialTab(url, options);
    setPendingStartSearchFocus(null);
    setTabs((current) => [...current, next]);
    setBrowserMode(isAiBrowserHomeUrl(url) ? 'home' : 'web');
    setBrowserLoadError('');
    activeTabIdRef.current = next.id;
    setActiveTabId(next.id);
    setActivePanel('browser');
  }

  function addTabAndFocusStartSearch(url = browserStartUrl, options?: { incognito?: boolean; pinned?: boolean }): void {
    addTab(url, options);
    if (isAiBrowserHomeUrl(url)) setPendingStartSearchFocus({ tabId: activeTabIdRef.current, expiresAt: Date.now() + 5000 });
  }

  async function openPluginBrowserUrl(capabilityId: string, startUrl: string, scope: IndependentScope): Promise<boolean> {
    const getContext = (): PluginBrowserContext => {
      const selection = assistantSelectionRef.current;
      const activePath = activeSpacePathRef.current || null;
      const requestScope = assistantSelectionRequestScopeRef.current;
      const selectionPathMatchesActive = Boolean(selection && (selection.workspacePath === null
        ? !activePath
        : activePath && resolveCanonicalSpacePath(activePath, [{ path: selection.workspacePath }]) === selection.workspacePath));
      return {
        selection,
        selectionRevision: activeSpaceSelectionRevisionRef.current,
        activeBrowserProfileId: activeProfileIdRef.current,
        activeWorkspacePath: activePath,
        activeBackendProfileName: activeBackendProfileNameRef.current ?? null,
        selectionPathMatchesActive,
        requestScope: requestScope ? {
          profile: requestScope.profile,
          workspacePath: requestScope.workspacePath || null,
          backendProfileName: requestScope.backendProfileName
        } : null
      };
    };
    return openPluginBrowserCapability({
      scope,
      capabilityId,
      startUrl,
      getContext,
      refreshCatalog: requestedScope => assistantController.request({
        schemaVersion: 1, operation: 'capabilities', scope: requestedScope, payload: { refresh: true }
      }),
      openTab: url => addTab(url)
    });
  }

  function toggleActiveBookmark(): void {
    if (!activeBookmarkable) return;
    setBookmarks((current) => (
      activeBookmarked
        ? removeBookmark(current, activeTab.url)
        : upsertBookmark(current, bookmarkFromTab(activeTab))
    ));
  }

  function removeBookmarkItem(bookmark: BrowserBookmark): void {
    setBookmarks((current) => removeBookmark(current, bookmark.url));
  }

  function importBookmarkItems(incoming: BrowserBookmark[]): void {
    setBookmarks((current) => mergeBookmarks(current, incoming));
  }

  function switchProfile(profileId: string): void {
    if (profileId === activeProfileId) return;
    // Persist the outgoing profile's space and global tabs before swapping.
    if (!isDetachedWindow) {
      saveSpaceTabs(activeProfileId, activeSpacePath, { tabs, activeTabId }, window.localStorage, knownSpacePaths);
      savePersistedSnapGroup(activeProfileId, activeSpacePath, tabs, splitLayout, splitTabIds, splitSlotIndexes, snapRatios, knownSpacePaths);
      saveProfileTabs(activeProfileId, { tabs, activeTabId }, window.localStorage);
    }
    // Audio keepalive entries belong to the outgoing profile's sessions; a
    // different profile must not inherit (or keep hearing) them.
    setAudioKeepalive((current) => current.filter((entry) => entry.profileId === profileId));
    const stored = loadSpaceTabs(profileId, activeSpacePath, window.localStorage, knownSpacePaths);
    const nextTabs = stored.tabs.length ? stored.tabs : [createInitialTab(browserStartUrl)];
    const nextActiveId = stored.activeTabId && nextTabs.some((tab) => tab.id === stored.activeTabId)
      ? stored.activeTabId
      : nextTabs[0].id;
    const nextSnapGroup = loadPersistedSnapGroup(profileId, activeSpacePath, nextTabs, knownSpacePaths);
    setTabs(nextTabs);
    activeTabIdRef.current = nextActiveId;
    setActiveTabId(nextActiveId);
    if (nextSnapGroup) {
      setSnapGroup(nextSnapGroup.layout, nextSnapGroup.tabIds, nextSnapGroup.slotIndexes);
      setSnapRatios(nextSnapGroup.ratios ?? getDefaultSnapLayoutRatios(nextSnapGroup.layout));
    } else {
      clearSplitTabs();
      setSplitLayout('columns');
      setSnapRatios(getDefaultSnapLayoutRatios('dual-50-50'));
    }
    setActiveProfileId(profileId);
    if (!isDetachedWindow) saveActiveProfileId(window.localStorage, profileId);
  }

  const handleSpaceSelect = useCallback((newSpacePath: string) => {
    if (newSpacePath === activeSpacePath) return;
    activeSpaceSelectionRevisionRef.current += 1;

    // 1. Persist outgoing space tabs
    if (!isDetachedWindow) {
      saveSpaceTabs(activeProfileId, activeSpacePath, { tabs, activeTabId }, window.localStorage, knownSpacePaths);
      savePersistedSnapGroup(activeProfileId, activeSpacePath, tabs, splitLayout, splitTabIds, splitSlotIndexes, snapRatios, knownSpacePaths);
    }

    // 2. Mute background audio in existing webviews before leaving space.
    //    Pinned tabs that are playing audio (e.g. YouTube Music) are exempt so
    //    music keeps playing across space switches (goal.md Paket 3).
    //    The webviews live in the BrowserMain layer; reach them through the DOM
    //    and match each element to its tab via the data-tab-id attribute.
    //    Previously kept-alive pinned audio tabs also remain exempt when
    //    leaving additional spaces.
    try {
      const exemptTabIds = new Set([
        ...tabs.filter((tab) => tab.pinned && tab.isPlayingAudio).map((tab) => tab.id),
        ...audioKeepalive
          .filter((entry) => entry.profileId === activeProfileId && entry.tab.pinned && entry.tab.isPlayingAudio)
          .map((entry) => entry.tab.id)
      ]);
      document.querySelectorAll<HTMLElement>('webview[data-tab-id]').forEach((el) => {
        const tabId = el.getAttribute('data-tab-id') || '';
        if (exemptTabIds.has(tabId)) return;
        try {
          (el as Electron.WebviewTag).setAudioMuted(true);
        } catch {}
      });
    } catch {}

    // 2b. Keep the original tab record in BrowserMain so React retains its
    //     keyed WebView guest and media session while the tab's Space is away.
    //     Entries for the TARGET space are removed because its normal tab row
    //     takes over the same keyed WebView. Never create a second guest from
    //     the URL: that loses page state and can restart or block playback.
    if (!isDetachedWindow) {
      const keepaliveCandidates = tabs
        .filter((tab) => tab.pinned && tab.isPlayingAudio)
        .map((tab) => ({ tab, spacePath: activeSpacePath, profileId: activeProfileId }));
      setAudioKeepalive((current) => {
        const merged = current.filter((entry) => entry.spacePath !== newSpacePath);
        const existingIds = new Set(merged.map((entry) => entry.tab.id));
        for (const candidate of keepaliveCandidates) {
          if (!existingIds.has(candidate.tab.id)) merged.push(candidate);
        }
        return merged;
      });
    }

    // 3. Clear split tabs so previous space's split tab IDs do not leak
    clearSplitTabs();

    // 4. Load target space tabs
    const nextKnownSpacePaths = [...new Set([...knownSpacePaths, newSpacePath])];
    const stored = loadSpaceTabs(activeProfileId, newSpacePath, window.localStorage, nextKnownSpacePaths);
    const nextTabs = stored.tabs.length > 0
      ? stored.tabs
      : [createInitialTab(browserStartUrl)];
    const nextActiveId = stored.activeTabId && nextTabs.some((t) => t.id === stored.activeTabId)
      ? stored.activeTabId
      : nextTabs[0].id;
    const nextSnapGroup = loadPersistedSnapGroup(activeProfileId, newSpacePath, nextTabs, nextKnownSpacePaths);

    // 5. Update state
    setTabs(nextTabs);
    activeTabIdRef.current = nextActiveId;
    setActiveTabId(nextActiveId);
    if (nextSnapGroup) {
      setSnapGroup(nextSnapGroup.layout, nextSnapGroup.tabIds, nextSnapGroup.slotIndexes);
      setSnapRatios(nextSnapGroup.ratios ?? getDefaultSnapLayoutRatios(nextSnapGroup.layout));
    } else {
      setSnapRatios(getDefaultSnapLayoutRatios('dual-50-50'));
    }
    setActiveSpacePath(newSpacePath);
    const spaceModelSelection = loadSpaceModelSelection(newSpacePath, window.localStorage);
    if (spaceModelSelection) {
      useChatStore.getState().setSelectedModel(spaceModelSelection.model);
      useChatStore.getState().setSelectedModelProvider(spaceModelSelection.provider || '');
    }
    setBrowserMode(isAiBrowserHomeUrl(nextTabs.find((t) => t.id === nextActiveId)?.url || '') ? 'home' : 'web');
    setBrowserLoadError('');
  }, [activeProfileId, activeSpacePath, tabs, audioKeepalive, activeTabId, splitLayout, splitTabIds, splitSlotIndexes, snapRatios, isDetachedWindow, setTabs, setActiveTabId, clearSplitTabs, setSnapGroup, setSplitLayout, setBrowserMode, setBrowserLoadError, knownSpacePaths]);

  const handleDetachTab = useCallback(async (tabToDetach: BrowserTab, screenX?: number, screenY?: number, guestWebContentsId?: number) => {
    if (window.lastbrowser?.window?.detachTab) {
      if (!Number.isInteger(guestWebContentsId) || guestWebContentsId! <= 0) {
        console.error('[Lastbrowser] Could not detach tab: source webview is not ready.');
        return;
      }
      try {
        const result = await window.lastbrowser.window.detachTab({
          tab: tabToDetach,
          guestWebContentsId: guestWebContentsId!,
          screenX: screenX ?? (window.screenX + 100),
          screenY: screenY ?? (window.screenY + 100),
          spacePath: activeSpacePath
        });
        if (result?.success) useTabStore.getState().detachTab(tabToDetach.id);
        else console.error('[Lastbrowser] Tab transfer was not acknowledged:', result?.error || 'unknown error');
      } catch (error) {
        console.error('[Lastbrowser] Could not detach tab:', error);
      }
    }
  }, [activeSpacePath]);

  useEffect(() => {
    // This effect also observes tabs and activeSpacePath so it can initialize
    // from the correct persisted session. After it has completed, those state
    // updates must not make a detached window restore the source window's
    // shared profile tabs after its transfer has been acknowledged.
    if (windowStartupInitializedRef.current) return undefined;
    let cancelled = false;
    const initializeWindow = async () => {
      let startupInitialized = false;
      try {
        const startup = await window.lastbrowser?.window?.getStartupState?.();
        if (cancelled) return;
        setIsDetachedWindow(Boolean(startup?.isDetachedWindow));
        const transfer = startup?.transfer;
        if (transfer?.tab && transfer.transferId) {
          const incoming = transfer.tab as BrowserTab;
          setTabs([incoming]);
          setActiveTabId(incoming.id);
          setSplitLayout('single');
          clearSplitTabs();
          setSnapRatios(getDefaultSnapLayoutRatios('dual-50-50'));
          if (transfer.spacePath) setActiveSpacePath(transfer.spacePath);
          setPendingDetachedTransfer({ transferId: transfer.transferId, tabId: incoming.id });
        } else if (startup?.isDetachedWindow) {
          const detachedSession = loadDetachedWindowSession(window.sessionStorage);
          if (detachedSession) {
            setActiveProfileId(detachedSession.profileId);
            setActiveSpacePath(detachedSession.spacePath);
            setTabs(detachedSession.tabs);
            setActiveTabId(detachedSession.activeTabId);
            setSplitLayout(detachedSession.splitLayout);
            if (detachedSession.splitTabIds.length && detachedSession.splitLayout in SNAP_LAYOUT_DEFINITIONS) {
              setSnapGroup(
                detachedSession.splitLayout as SnapLayoutType,
                detachedSession.splitTabIds,
                detachedSession.splitSlotIndexes
              );
            } else if (detachedSession.splitTabIds.length) {
              useTabStore.setState({
                splitTabIds: detachedSession.splitTabIds,
                splitSlotIndexes: detachedSession.splitSlotIndexes
              });
            } else {
              clearSplitTabs();
            }
            setSnapRatios(detachedSession.snapRatios);
          } else {
            // Do not initialize a detached window from the source window's
            // shared profile tabs when its private recovery record is absent.
            const freshTab = createInitialTab(browserStartUrl);
            setTabs([freshTab]);
            setActiveTabId(freshTab.id);
            setSplitLayout('single');
            clearSplitTabs();
            setSnapRatios(getDefaultSnapLayoutRatios('dual-50-50'));
          }
        } else {
          const stored = loadSpaceTabs(activeProfileId, activeSpacePath, window.localStorage, knownSpacePaths);
          const restoredTabs = stored.tabs.length ? stored.tabs : tabs;
          if (stored.tabs.length) {
            const restoredActiveId = stored.activeTabId && restoredTabs.some((tab) => tab.id === stored.activeTabId)
              ? stored.activeTabId
              : restoredTabs[0].id;
            setTabs(restoredTabs);
            setActiveTabId(restoredActiveId);
          }
          const snapGroup = loadPersistedSnapGroup(activeProfileId, activeSpacePath, restoredTabs, knownSpacePaths);
          if (snapGroup) {
            setSnapGroup(snapGroup.layout, snapGroup.tabIds, snapGroup.slotIndexes);
            setSnapRatios(snapGroup.ratios ?? getDefaultSnapLayoutRatios(snapGroup.layout));
          } else {
            clearSplitTabs();
            setSnapRatios(getDefaultSnapLayoutRatios('dual-50-50'));
          }
        }
        startupInitialized = true;
      } catch (error) {
        console.error('[Lastbrowser] Window startup/transfer failed:', error);
      } finally {
        // Fail closed: a partially initialized window must not persist its
        // placeholder tabs over the source window's shared profile storage.
        if (!cancelled && startupInitialized) {
          windowStartupInitializedRef.current = true;
          setWindowStartupReady(true);
        }
      }
    };
    void initializeWindow();
    return () => { cancelled = true; };
  }, [activeProfileId, activeSpacePath, tabs, setTabs, setActiveTabId, setActiveSpacePath, setSnapGroup, clearSplitTabs, knownSpacePaths]);

  const handleTransferredWebviewReady = useCallback((tabId: string, guestWebContentsId: number) => {
    const transfer = pendingDetachedTransfer;
    if (!transfer || transfer.tabId !== tabId || acknowledgingTransferRef.current === transfer.transferId) return;
    acknowledgingTransferRef.current = transfer.transferId;
    // A mounted <webview> is not ready until Electron reports dom-ready. Only
    // then can the source safely release the original tab.
    void window.lastbrowser?.window?.ackDetachedTab?.(transfer.transferId, tabId, guestWebContentsId).then((acknowledged) => {
      if (!acknowledged) {
        acknowledgingTransferRef.current = null;
        console.error('[Lastbrowser] Main process rejected the completed tab transfer.');
        return;
      }
      setPendingDetachedTransfer((current) => current?.transferId === transfer.transferId ? null : current);
    }).catch((error) => {
      acknowledgingTransferRef.current = null;
      console.error('[Lastbrowser] Could not acknowledge the completed tab transfer:', error);
    });
  }, [pendingDetachedTransfer]);

  function createProfileEntry(name: string): void {
    setProfiles((current) => {
      const next = addProfile(current, name);
      saveProfiles(window.localStorage, next);
      return next;
    });
  }

  function renameProfileEntry(profileId: string, name: string): void {
    setProfiles((current) => {
      const next = renameProfile(current, profileId, name);
      saveProfiles(window.localStorage, next);
      return next;
    });
  }

  function deleteProfileEntry(profileId: string): void {
    // Switching away from the active profile persists its last session, so do
    // that first. The profile data is removed afterward to avoid recreating it.
    if (profileId === activeProfileId) switchProfile('default');
    setProfiles((current) => {
      const next = removeProfile(current, profileId);
      saveProfiles(window.localStorage, next);
      return next;
    });
    removeProfileTabs(profileId, window.localStorage);
    // Let React detach the deleted profile's webviews before clearing their
    // persistent Electron sessions. Only this profile's known Space partitions
    // are sent to the main process, which independently validates the profile.
    window.requestAnimationFrame(() => {
      void window.lastbrowser?.browser?.clearDeletedProfileData?.({ profileId, spacePaths: knownSpacePaths })
        .then((result) => {
          if (!result?.ok) console.error('[Lastbrowser] Could not clear deleted profile browser data:', result?.error || 'Unknown error');
        })
        .catch((error) => console.error('[Lastbrowser] Could not clear deleted profile browser data:', error));
    });
  }

  function closeTab(tabId: string): void {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const closing = tabs[index];
    if (closing && !closing.incognito) {
      // Remember it so Ctrl+Shift+T can bring it back.
      setClosedTabs((current) => rememberClosedTab(current, closing));
    }
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      const nextActiveId = nextTabs[Math.max(0, index - 1)].id;
      activeTabIdRef.current = nextActiveId;
      setActiveTabId(nextActiveId);
    }
  }

  /** Wake a sleeping (discarded) tab so it will be reloaded when focused. */
  function wakeTab(tabId: string): void {
    setTabs((current) => wakeTabById(current, tabId));
  }

  /** Estimated MB of RAM freed by currently sleeping (discarded) tabs. */
  const savedMemoryMb = getSavedMemoryEstimateMb(tabs);

  /** Reopen the most recently closed tab (Ctrl+Shift+T), or restore session snapshot if closedTabs is empty. */
  function reopenClosedTab(): void {
    const { tab, rest } = takeLastClosedTab(closedTabs);
    if (tab) {
      setClosedTabs(rest);
      const created = createInitialTab(tab.url);
      const restored = { ...created, title: tab.title || created.title };
      setTabs((current) => [...current, restored]);
      activeTabIdRef.current = restored.id;
      setActiveTabId(restored.id);
      setActivePanel('browser');
      setAddressValue(isAiBrowserHomeUrl(restored.url) ? '' : restored.url);
      return;
    }
    const snapshot = loadSessionSnapshot(activeProfileId, window.localStorage, activeSpacePath);
    if (snapshot && snapshot.state.tabs.length > tabs.length) {
      setTabs(snapshot.state.tabs);
      if (snapshot.state.activeTabId) {
        activeTabIdRef.current = snapshot.state.activeTabId;
        setActiveTabId(snapshot.state.activeTabId);
      }
      setActivePanel('browser');
    }
  }

  function updateTitle(tabId: string, title: string): void {
    setTabs((current) => updateTabTitle(current, tabId, title));
    const tab = tabs.find((item) => item.id === tabId);
    if (tab && !tab.incognito) {
      setVisitedSites((current) => recordVisit(current, tab.url, title, { increment: false }));
    }
  }

  function updateUrl(tabId: string, url: string): void {
    setTabs((current) => updateTabUrl(current, tabId, url));
    if (activeTabIdRef.current === tabId) {
      setAddressValue(isAiBrowserHomeUrl(url) ? '' : url);
      setBrowserLoadError('');
    }
    if (activePanel === 'browser' && activeTabIdRef.current === tabId) {
      setBrowserMode(isAiBrowserHomeUrl(url) ? 'home' : 'web');
    }
    const tab = tabs.find((item) => item.id === tabId);
    if (tab && !tab.incognito) {
      setVisitedSites((current) => recordVisit(current, url, tab?.title || ''));
    }
  }

  function updateFavicon(tabId: string, favicon: string): void {
    setTabs((current) => updateTabFavicon(current, tabId, favicon));
  }

  function updateLoading(tabId: string, isLoading: boolean): void {
    setTabs((current) => updateTabLoading(current, tabId, isLoading));
  }

  function updateMediaPlaying(tabId: string, isPlayingAudio: boolean): void {
    setTabs((current) => updateTabMediaPlaying(current, tabId, isPlayingAudio));
  }

  function toggleTabMute(tabId: string): void {
    const target = tabs.find((t) => t.id === tabId);
    const nextMuted = !target?.isMuted;
    setTabs((current) => updateTabMuted(current, tabId, nextMuted));
    if (tabId === activeTab.id) {
      try {
        webviewRef.current?.setAudioMuted(nextMuted);
      } catch {
        // ignore
      }
    }
  }

  function moveTab(tabId: string, targetTabId: string): void {
    setTabs((current) => reorderTabs(current, tabId, targetTabId));
  }

  function toggleTabPinned(tabId: string): void {
    setTabs((current) => togglePinnedTab(current, tabId));
  }

  async function completeSetup(form: SetupForm): Promise<void> {
    setSetupError('');
    if (firstRunAiChoiceForSetup(setupState) !== 'enabled') {
      setSetupError('Choose whether to use AI before configuring a provider.');
      return;
    }
    if (!form.provider || !form.model) {
      setSetupError('Choose a provider and model before continuing.');
      return;
    }
    setSetupSaving(true);
    try {
      if (form.provider === 'openai-codex') {
        await window.lastbrowser.sidekick.setDefaultModel({
          model: form.model.startsWith('@openai-codex:') ? form.model : `@openai-codex:${form.model}`
        });
      }
      const botName = form.botName?.trim() || 'Nova';
      const personality = form.personality?.trim() || 'nova';

      await window.lastbrowser.sidekick.saveSettings({
        settings: {
          bot_name: botName,
          personality: personality
        }
      }).catch(() => null);

      const nextStatus = await window.lastbrowser.sidekick.applyCloudSetup({
        provider: form.provider,
        model: form.model,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl
      });
      const completeStatus = await window.lastbrowser.sidekick.completeCloudSetup().catch(() => nextStatus);
      const nextState = await window.lastbrowser.setup.save({
        cloudSetupComplete: true,
        provider: form.provider,
        model: form.model,
        botName: botName,
        personality: personality
      });
      setSetupState(nextState);
      setSetupReopenRequested(false);
      setOnboardingStatus((completeStatus || nextStatus) as OnboardingStatus);
      void refreshSessions();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setSetupSaving(false);
    }
  }

  async function saveFirstRunAiChoice(choice: SetupState['aiChoice']): Promise<boolean> {
    if (choice !== 'enabled' && choice !== 'disabled') return false;
    setSetupError('');
    setSetupSaving(true);
    try {
      const nextState = await window.lastbrowser.setup.save({ aiChoice: choice });
      const normalized = normalizeSetupState(nextState);
      if (normalized.aiChoice !== choice) throw new Error('The AI preference was not saved.');
      setSetupState(normalized);
      return true;
    } catch {
      return false;
    } finally {
      setSetupSaving(false);
    }
  }

  async function completeBrowserOnlySetup(): Promise<boolean> {
    setSetupError('');
    setSetupSaving(true);
    try {
      const nextState = await window.lastbrowser.setup.save({
        aiChoice: 'disabled',
        browserSetupComplete: true
      });
      const normalized = normalizeSetupState(nextState);
      if (normalized.aiChoice !== 'disabled' || normalized.browserSetupComplete !== true) {
        throw new Error('The browser setup was not saved.');
      }
      setSetupState(normalized);
      setSetupReopenRequested(false);
      return true;
    } catch {
      return false;
    } finally {
      setSetupSaving(false);
    }
  }

  function reopenSetupFromSettings(): void {
    setSetupReopenRequested(true);
    setSetupDismissed(false);
    try {
      window.localStorage.removeItem('lastbrowser.setupDismissed');
    } catch {
      // The in-memory request still opens the setup for this session.
    }
  }

  async function readCapturedSpaceModelSelection(context: { profileId: string; spacePath: string }) {
    const resolved = await assistantController.resolveScope({ browserProfileId: context.profileId, workspacePath: context.spacePath || null });
    if (!resolved.ok) throw new Error(resolved.error.message);
    const selection = await assistantController.request({ schemaVersion: 1, operation: 'modelSelection', scope: resolved.value.scope,
      payload: { action: 'get', includeCatalog: false } });
    if (!selection.ok) throw new Error(selection.error.message);
    return { model: selection.value.model, provider: selection.value.provider,scope:resolved.value.scope };
  }

  async function createNativeSession(): Promise<void> {
    setQuickChatMode(false);
    const requestId = ++createSessionRequestRef.current;
    const requestedScope: SessionListScope = { profile: activeProfileIdRef.current, workspacePath: activeSpacePathRef.current, backendProfileName: activeBackendProfileNameRef.current };
    const selectionRevision = activeSpaceSelectionRevisionRef.current;
    let boundScope: SessionListScope | null = null;
    const isSelectionCurrent = (): boolean => requestId === createSessionRequestRef.current
      && selectionRevision === activeSpaceSelectionRevisionRef.current
      && activeProfileIdRef.current === requestedScope.profile
      && activeSpacePathRef.current === requestedScope.workspacePath;
    const isCurrent = (): boolean => isSelectionCurrent() && (boundScope === null || sessionListResponseMatchesScope(boundScope, {
      profile: activeProfileIdRef.current,
      workspacePath: activeSpacePathRef.current,
      backendProfileName: activeBackendProfileNameRef.current
    }));
    isCreatingSessionRef.current = true;
    if (status?.sidekick !== 'ready') {
      setSessionError('Sidekick is still starting.');
      isCreatingSessionRef.current = false;
      return;
    }

    try {
      const resolved = await assistantController.resolveScope({
        browserProfileId: requestedScope.profile,
        workspacePath: requestedScope.workspacePath || null
      }, requestedScope.backendProfileName);
      if (!resolved.ok) throw new Error(resolved.error.message);
      if (!isSelectionCurrent()) return;

      boundScope = { ...requestedScope, backendProfileName: resolved.value.backendProfileName ?? requestedScope.backendProfileName };
      activeBackendProfileNameRef.current = boundScope.backendProfileName;
      setAssistantSelectionRequestScope(boundScope);
      setAssistantSelection(resolved.value);

      const result = await createAndLoadScopedSession(
        boundScope,
        isCurrent,
        (scope) => window.lastbrowser.sidekick.createSession({
          ...(scope.workspacePath ? { workspace: scope.workspacePath, scopeGoalsToWorkspace: true } : {}),
          profile: scope.profile,
          ...(scope.backendProfileName ? { backendProfileName: scope.backendProfileName } : {})
        }),
        (sessionId, scope) => window.lastbrowser.sidekick.getSession({
          sessionId,
          messages: true,
          msgLimit: 80,
          ...scope
        })
      );
      const session = result?.loaded.session;
      if (session?.session_id && isCurrent()) {
        if (!isIndependentScope(session.space_scope) || !sameAssistantScope(session.space_scope, resolved.value.scope)) {
          throw new Error('The new chat belongs to a different Space and was not opened.');
        }
        activeSessionIdRef.current = session.session_id;
        setActiveSession(session);
        setChatMessages(normalizeChatMessages(session.messages));
        setSessions((current) => [
          session,
          ...current.filter((item) => item.session_id !== session.session_id)
        ]);
        setActiveSessionId(session.session_id);
        setActivePanel('chat');
        setSessionError('');
      }
    } catch (error) {
      if (isCurrent()) setSessionError(error instanceof Error ? error.message : String(error));
    } finally {
      if (requestId === createSessionRequestRef.current) isCreatingSessionRef.current = false;
    }
  }

  function handleNewChat(): void {
    isCreatingSessionRef.current = true;
    setChatMessages([]);
    setMessages([]);
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setComposerText('');
    setChatError('');
    void createNativeSession();
  }

  function pinNativeSession(session: DesktopSessionSummary): void {
    void window.lastbrowser.sidekick
      .requestWebui({
        method: 'POST',
        path: '/api/session/pin',
        body: { session_id: session.session_id, pinned: true }
      })
      .then(() => {
        setSessions((current) =>
          current.map((item) =>
            item.session_id === session.session_id ? { ...item, pinned: true } : item
          )
        );
      })
      .catch(() => {});
  }

  function unpinNativeSession(session: DesktopSessionSummary): void {
    void window.lastbrowser.sidekick
      .requestWebui({
        method: 'POST',
        path: '/api/session/pin',
        body: { session_id: session.session_id, pinned: false }
      })
      .then(() => {
        setSessions((current) =>
          current.map((item) =>
            item.session_id === session.session_id ? { ...item, pinned: false } : item
          )
        );
      })
      .catch(() => {});
  }

  function archiveNativeSession(session: DesktopSessionSummary): void {
    void window.lastbrowser.sidekick
      .requestWebui({
        method: 'POST',
        path: '/api/session/archive',
        body: { session_id: session.session_id, archived: true }
      })
      .then(() => {
        setSessions((current) =>
          current.map((item) =>
            item.session_id === session.session_id ? { ...item, archived: true } : item
          )
        );
      })
      .catch(() => {});
  }

  /**
   * Wait for a chat turn to finish.
   *
   * Prefers the SSE stream (each event arrives as the agent produces it) and
   * falls back to polling when the stream cannot be established — e.g. an older
   * sidecar without the SSE route, or a proxy that buffers event streams.
   */
  async function pollNativeChat(
    streamId: string,
    sessionId: string,
    earlyEvents: Array<{ streamId?: string; event?: string; data?: unknown }> = [],
    unsubscribeEarly?: () => void,
    isOwningContextCurrent: () => boolean = () => activeSessionIdRef.current === sessionId,
    nativeBinding?:NativeChatBinding,
    teamworkTurn = false
  ): Promise<{
    continuationPrompt: string | null;
    goalError: string | null;
    streamError: string | null;
    completed: boolean;
    cancelled: boolean;
    providerEvidence: { provider_id?: string; model_id?: string; successful_chat?: boolean; runtime_generation?: string; provider_config_generation?: string } | null;
  }> {
    const streamStartedAt = Date.now();
    let lastProgressAt = streamStartedAt;
    let sawStreamEnd = false;
    let streamFailed = false;
    let streamError: string | null = null;
    let cancelled = false;
    let providerEvidence: { provider_id?: string; model_id?: string; successful_chat?: boolean; runtime_generation?: string; provider_config_generation?: string } | null = null;
    let teamworkCompleteReceived = false;
    let hasLiveOutput = false;
    let modelResolutionReceived = false;
    let goalContinuationPrompt: string | null = null;
    let goalEvaluationError: string | null = null;
    if(nativeBinding)useNativeChatControls.getState().bind(nativeBinding);
    const messageStreamId = nativeBinding ? streamId : undefined;
    if (nativeBinding) {
      setChatMessages((current) => bindLiveChatAssistantStream(current, sessionId, streamId));
      setMessages((current) => bindLiveChatAssistantStream(current, sessionId, streamId));
    }
    const notifyCompletion = createOnceChatCompletionNotifier(
      desktopSettings?.sound_enabled === true,
      desktopSettings?.notifications_enabled === true,
      () => playChatCompletionSound(true),
      () => { void window.lastbrowser.sidekick.notifyChatCompleted(true).catch(() => false); }
    );

    const handleStreamEvent = (payload: unknown): void => {
      const event = payload as { streamId?: string; event?: string; data?: unknown; nativeContext?: unknown; sessionId?: string } | null;
      if (!event) return;
      const streamMatches = event.streamId === streamId;
      const ownsContext = isOwningContextCurrent();
      const eventError = event.event === 'error' || event.event === 'apperror'
        ? nativeGoalHumanAuthorizationErrorCopy(locale,event.data)??readNativeChatStreamError(event.data)
        : null;
      traceRendererChat('event', {
        event: event.event ?? 'unknown',
        streamMatches,
        ownsContext,
        ...(eventError ? { errorKind: classifyRendererChatError(eventError) } : {})
      });
      if (!streamMatches) return;
      if(nativeBinding)useNativeChatControls.getState().event(event);
      if (event.event === 'nativeModelResolution') {
        const controls = useNativeChatControls.getState();
        const row = controls.records[streamId];
        const resolution = !modelResolutionReceived && ownsContext && activeStreamIdRef.current === streamId && nativeBinding && row
          ? readNativeModelResolutionEvent(event, nativeBinding, row.writerGeneration) : null;
        if (resolution) {
          modelResolutionReceived = true;
          if (resolution.fallbackApplied && nativeBinding) setNativeModelResolutionNotice({ sessionId, profileId: nativeBinding.browserProfileId,
            spacePath: nativeBinding.workspacePath, backendProfileName: activeBackendProfileNameRef.current ?? null, resolution });
        }
        return;
      }
      if (teamworkTurn && nativeBinding && isOwningContextCurrent()) {
        const teamworkUpdate = readTeamworkStreamUpdate(event, nativeBinding, sessionId, streamId);
        if (teamworkUpdate) {
          if (teamworkUpdate.kind === 'complete') teamworkCompleteReceived = true;
          setChatMessages((current) => isOwningContextCurrent()
            ? applyLiveTeamworkUpdate(current, streamId, teamworkUpdate) : current);
          setMessages((current) => isOwningContextCurrent()
            ? applyLiveTeamworkUpdate(current, streamId, teamworkUpdate) : current);
        }
      }
      if(nativeBinding&&event.event==='worker_exit'){
        sawStreamEnd=true;
        const data=isRecord(event.data)?event.data:{};
        cancelled=data.status==='cancelled'||data.status==='paused';
        if(cancelled)goalContinuationPrompt=null;
        else if (teamworkTurn && !teamworkCompleteReceived) {
          streamFailed = true;
          streamError = 'The Teamwork response was not saved before its worker stopped.';
        }
        return;
      }
      if (isNativeChatProgressEvent(event.event)) lastProgressAt = Date.now();
      if (event.event === 'stream_end') {
        if(nativeBinding&&!nativeChatProcessExitConfirmed(event))return;
        if (teamworkTurn && !teamworkCompleteReceived && !cancelled) {
          streamFailed = true;
          streamError = 'The Teamwork response was not saved before its stream ended.';
        }
        if (!goalContinuationPrompt && isOwningContextCurrent()) notifyCompletion();
        sawStreamEnd = true;
        if (isOwningContextCurrent()) {
          setChatMessages((current) => finishLiveChatMessage(current, messageStreamId));
          setMessages((current) => finishLiveChatMessage(current, messageStreamId));
        }
        return;
      }
      if (event.event === 'done') {
        const payload = isRecord(event.data) ? event.data : {};
        const usage = normalizeNativeChatTurnUsage(payload.usage);
        const proof = isRecord(payload.provider_evidence) ? payload.provider_evidence : null;
        providerEvidence = proof ? {
          provider_id: typeof proof.provider_id === 'string' ? proof.provider_id : undefined,
          model_id: typeof proof.model_id === 'string' ? proof.model_id : undefined,
          successful_chat: proof.successful_chat === true,
        } : null;
        if (usage && isOwningContextCurrent()) setLastChatTurnUsage({ sessionId, usage });
        return;
      }
      if (event.event === 'cancel') {
        cancelled = true;
        goalContinuationPrompt = continuationAfterTerminalEvent(goalContinuationPrompt, 'cancel');
        sawStreamEnd = !nativeBinding||nativeChatProcessExitConfirmed(event);
        if (isOwningContextCurrent()) {
          setChatMessages((current) => finishLiveChatMessage(current, messageStreamId));
          setMessages((current) => finishLiveChatMessage(current, messageStreamId));
        }
        return;
      }
      if (event.event === 'error' || event.event === 'apperror') {
        goalContinuationPrompt = continuationAfterTerminalEvent(goalContinuationPrompt, 'error');
        streamError = eventError ?? readNativeChatStreamError(event.data);
        streamFailed = true;
        sawStreamEnd = !nativeBinding||nativeChatProcessExitConfirmed(event);
        if (isOwningContextCurrent()) {
          setChatMessages((current) => finishLiveChatMessageWithError(current, streamError!, messageStreamId));
          setMessages((current) => finishLiveChatMessageWithError(current, streamError!, messageStreamId));
        }
        return;
      }
      if (typeof event.event !== 'string') return;
      if (!goalContinuationPrompt) {
        goalContinuationPrompt = readGoalContinuationPrompt(event, streamId, sessionId);
      }
      if (!goalEvaluationError) {
        const goalMessageKey = readGoalEvaluationMessageKey(event, streamId, sessionId);
        goalEvaluationError = goalMessageKey === 'goal_judge_unavailable'
          ? t('goal.judgeUnavailable')
          : readGoalEvaluationError(event, streamId, sessionId);
      }
      if (event.event === 'token' || event.event === 'delta' || event.event === 'reasoning') {
        const delta = readLiveChatDelta(event.event, event.data);
        if (delta && isOwningContextCurrent()) {
          hasLiveOutput = true;
          setChatMessages((current) => {
            const updated = applyLiveChatDelta(current, delta.kind, delta.text, messageStreamId);
            const assistant = [...updated].reverse().find((item) => item.role === 'assistant');
            traceRendererChat('state-update', {
              source: 'delta',
              messageCount: updated.length,
              deltaLength: delta.text.length,
              contentLength: assistant?.content?.length ?? 0,
              pending: assistant?.pending === true,
              streaming: assistant?.streaming === true
            });
            return updated;
          });
          setMessages((current) => applyLiveChatDelta(current, delta.kind, delta.text, messageStreamId));
        }
        return;
      }
      const orchestrationProgress = describeOrchestrationProgress(event.event, event.data);
      if (orchestrationProgress) {
        if (isOwningContextCurrent()) {
          setChatMessages((current) => applyLiveChatProgress(current, orchestrationProgress.message, messageStreamId));
          setMessages((current) => applyLiveChatProgress(current, orchestrationProgress.message, messageStreamId));
        }
        return;
      }
      if (teamworkTurn && event.event.startsWith('teamwork_')) return;
      // Events without incremental text still need a session refresh to update
      // tool/activity state. Token and reasoning deltas are applied directly
      // above because the persisted session is finalized only after the turn.
      if (
        event.event === 'message' ||
        event.event === 'tool' ||
        event.event === 'tool_complete' ||
        event.event === 'interim_assistant'
      ) {
        if (!hasLiveOutput && isOwningContextCurrent()) void loadActiveSession(sessionId, { loadDraft: false, showLoading: false });
      }
    };
    const unsubscribe = window.lastbrowser.sidekick.onChatStreamEvent(handleStreamEvent);
    // The backend can start producing output before the startChat IPC promise
    // resolves. Replay any events caught by the temporary pre-start listener.
    unsubscribeEarly?.();
    for (const event of earlyEvents) handleStreamEvent(event);

    try {
      traceRendererChat('stream-subscribe-start', { ownsContext: isOwningContextCurrent() });
      await window.lastbrowser.sidekick.subscribeChatStream({ streamId }).then(() => {
        traceRendererChat('stream-subscribe-complete', { ownsContext: isOwningContextCurrent() });
      }).catch((error: unknown) => {
        streamFailed = true;
        const message = error instanceof Error ? error.message : String(error);
        traceRendererChat('stream-subscribe-failed', {
          errorKind: classifyRendererChatError(message),
          ownsContext: isOwningContextCurrent()
        });
      });

      while (!sawStreamEnd && (nativeBinding||!isNativeChatStreamWaitExpired(streamStartedAt, lastProgressAt, Date.now()))) {
        await delay(600);
        if (sawStreamEnd) {
          traceRendererChat('completion-return', { path: 'stream-event', ownsContext: isOwningContextCurrent() });
          return { continuationPrompt: goalContinuationPrompt, goalError: goalEvaluationError, streamError, completed: true, cancelled, providerEvidence };
        }
        if (streamFailed&&!nativeBinding) break;
        // The stream is the fast path, but a dropped connection must not hang
        // the turn: poll occasionally as a safety net.
        if (Date.now() % 6000 < 700) {
          const streamStatus = await window.lastbrowser.sidekick.getStreamStatus(streamId).catch(() => null);
          if (!hasLiveOutput || streamStatus?.active === false) {
            const latest = await loadActiveSession(sessionId, { loadDraft: false, showLoading: false });
            traceRendererChat('stream-status-poll', {
              stage: 'stream',
              ...getRendererChatSnapshotTrace(streamStatus, latest, streamId)
            });
            if (isChatCompletionConfirmed({ streamActive: streamStatus?.active, session: latest })) {
              if (!goalContinuationPrompt && isOwningContextCurrent()) notifyCompletion();
              traceRendererChat('completion-return', { path: 'stream-status', ownsContext: isOwningContextCurrent() });
              return { continuationPrompt: goalContinuationPrompt, goalError: goalEvaluationError, streamError, completed: true, cancelled, providerEvidence };
            }
          }
        }
      }
      if (sawStreamEnd) {
        traceRendererChat('completion-return', { path: 'stream-event', ownsContext: isOwningContextCurrent() });
        return { continuationPrompt: goalContinuationPrompt, goalError: goalEvaluationError, streamError, completed: !cancelled && !streamFailed, cancelled, providerEvidence };
      }
    } finally {
      traceRendererChat('stream-unsubscribe', {
        sawStreamEnd,
        streamFailed,
        ownsContext: isOwningContextCurrent()
      });
      unsubscribe();
      void window.lastbrowser.sidekick.unsubscribeChatStream({ streamId }).catch(() => null);
    }

    // Stream path ended without a terminal event — fall back to polling.
    while (nativeBinding||!isNativeChatStreamWaitExpired(streamStartedAt, lastProgressAt, Date.now())) {
      await delay(1200);
      const streamStatus = await window.lastbrowser.sidekick.getStreamStatus(streamId).catch(() => null);
      const latest = await loadActiveSession(sessionId, { loadDraft: false, showLoading: false });
      traceRendererChat('stream-status-poll', {
        stage: 'fallback',
        ...getRendererChatSnapshotTrace(streamStatus, latest, streamId)
      });
      if (isChatCompletionConfirmed({ streamActive: streamStatus?.active, session: latest })) {
        if (!goalContinuationPrompt && isOwningContextCurrent()) notifyCompletion();
        traceRendererChat('completion-return', { path: 'fallback-status', ownsContext: isOwningContextCurrent() });
        return { continuationPrompt: goalContinuationPrompt, goalError: goalEvaluationError, streamError, completed: true, cancelled, providerEvidence };
      }
    }
    throw new Error('Sidekick is still working. Try again in a moment.');
  }

  async function runPersistentGoalCommand(args: string, displayText: string, reasoningEffort?: string,
    capturedCommand?:Extract<CommandAction,{kind:'goal_command'}>): Promise<void> {
    let turnContext = {
      sessionId: capturedCommand?.context.sessionId ?? activeSessionIdRef.current ?? '',
      profileId: capturedCommand?.context.profileId ?? activeProfileIdRef.current,
      spacePath: capturedCommand?.context.spacePath ?? activeSpacePathRef.current
    };
    const isOwningContextCurrent = (): boolean => isActiveTurnContextCurrent(turnContext, {
      sessionId: activeSessionIdRef.current,
      profileId: activeProfileIdRef.current,
      spacePath: activeSpacePathRef.current
    });

    setLastChatTurnUsage(null);
    setChatMessages((current) => [...current, { role: 'user', content: displayText }, { role: 'assistant', content: 'Updating persistent goal…', pending: true }]);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: displayText }, { id: crypto.randomUUID(), role: 'assistant', content: 'Updating persistent goal…', pending: true }]);
    setComposerText('');
    const uiTurnOwner = beginChatUiTurn(turnContext.sessionId || null);
    if (turnContext.sessionId) bindChatUiTurnSession(uiTurnOwner, turnContext.sessionId);
    if (isOwningContextCurrent()) setChatRunState('starting');
    setChatError('');
    let failed = false;

    try {
      const modelSelection = await readCapturedSpaceModelSelection(turnContext);
      const selectedModel = capturedCommand?.context.model || modelSelection.model || undefined;
      const selectedProvider = capturedCommand?.context.modelProvider || modelSelection.provider || undefined;

      if (!turnContext.sessionId) {
        const created = await window.lastbrowser.sidekick.createSession({
          ...(turnContext.spacePath ? { workspace: turnContext.spacePath } : {}),
          ...(turnContext.spacePath ? { scopeGoalsToWorkspace: true } : {}),
          profile: turnContext.profileId,
          ...(selectedModel ? { model: selectedModel } : {}),
          ...(selectedProvider ? { modelProvider: selectedProvider } : {})
        });
        const sessionId = String(created.session?.session_id || '').trim();
        if (!sessionId) throw new Error('Sidekick could not create a session for this goal.');
        if (!isOwningContextCurrent()) return;
        turnContext = { ...turnContext, sessionId };
        bindChatUiTurnSession(uiTurnOwner, sessionId);
        activeSessionIdRef.current = sessionId;
        setActiveSessionId(sessionId);
        setSessions((current) => [created.session!, ...current.filter((item) => item.session_id !== sessionId)]);
      }
      void window.lastbrowser.sidekick.saveDraft({
        sessionId: turnContext.sessionId,
        text: '',
        files: [],
        profile: turnContext.profileId,
        workspacePath: turnContext.spacePath
      }).catch(() => null);

      const response = await requestNativePersistentGoalCommand(
        (request) => window.lastbrowser.sidekick.goalCommand(request),
        args,
        {
          sessionId: turnContext.sessionId,
          profileId: turnContext.profileId,
          browserProfileId:capturedCommand?.context.browserProfileId??turnContext.profileId,
          workspace: turnContext.spacePath,
          model: selectedModel,
          modelProvider: selectedProvider,
          reasoningEffort,
          expectedRevision:capturedCommand?.expectedRevision,
          clientRequestId:capturedCommand?.clientRequestId
        }
      );
      let reply = response.message_key === 'goal_judge_unavailable'
        ? t('goal.judgeUnavailable')
        : typeof response.message === 'string' ? response.message.trim() : '';
      const streamId = typeof response.stream_id === 'string' ? response.stream_id.trim() : '';
      const responseSessionId = typeof response.session_id === 'string' && response.session_id.trim()
        ? response.session_id.trim()
        : turnContext.sessionId;
      let streamResult: {
        continuationPrompt: string | null;
        goalError: string | null;
        streamError: string | null;
        completed: boolean;
        cancelled: boolean;
        providerEvidence: { provider_id?: string; model_id?: string; successful_chat?: boolean; runtime_generation?: string; provider_config_generation?: string } | null;
      } | null = null;

      if (streamId) {
        turnContext = { ...turnContext, sessionId: responseSessionId };
        bindChatUiTurnSession(uiTurnOwner, responseSessionId);
        registerChatUiStream(uiTurnOwner, streamId, responseSessionId);
        if (isOwningContextCurrent()) {
          updateActiveStreamId(streamId);
          setChatRunState('streaming');
        }
        streamResult = await pollNativeChat(streamId,responseSessionId,[],undefined,isOwningContextCurrent,{scope:modelSelection.scope,
          sessionId:responseSessionId,streamId,workspacePath:turnContext.spacePath,browserProfileId:turnContext.profileId});
        const updated = await loadActiveSession(responseSessionId, { loadDraft: false, showLoading: false });
        const answer = lastAssistantText(updated);
        if (streamResult.streamError) {
          failed = true;
          if (isOwningContextCurrent()) {
            setChatError(streamResult.streamError);
            setChatMessages((current) => finishLiveChatMessageWithError(current, streamResult!.streamError!));
            setMessages((current) => finishLiveChatMessageWithError(current, streamResult!.streamError!));
          }
        } else if (answer) reply = [reply, answer].filter(Boolean).join('\n\n');
        if (streamResult.goalError) setChatError(streamResult.goalError);
      }

      if (isOwningContextCurrent()) {
        if (!streamResult?.streamError) {
          const finalReply = reply || 'Persistent goal updated.';
          setChatMessages((current) => current.map((item) => (
            item.pending ? { ...item, content: finalReply, pending: false, progress: undefined } : item
          )));
          setMessages((current) => current.map((item) => (
            item.pending ? { ...item, content: reply || 'Persistent goal updated.', pending: false, progress: undefined } : item
          )));
        }
      }

      if (streamResult?.continuationPrompt && isOwningContextCurrent()) {
        await startGoalContinuation(streamResult.continuationPrompt, turnContext, {
          sessionId: activeSessionIdRef.current,
          profileId: activeProfileIdRef.current,
          spacePath: activeSpacePathRef.current
        }, (prompt) => startNativeChat(prompt, prompt, turnContext, reasoningEffort));
      }
      void refreshSessions();
      if(isOwningContextCurrent())await loadActiveSession(turnContext.sessionId,{loadDraft:false,showLoading:false});
    } catch (error) {
      failed = true;
      const message = nativeGoalErrorCopy(locale,error);
      if (isOwningContextCurrent()) {
        setChatError(message);
        setChatMessages((current) => current.map((item) => (
          item.pending ? { ...item, content: message, pending: false, progress: undefined } : item
        )));
        setMessages((current) => current.map((item) => (
          item.pending ? { ...item, content: message, pending: false, progress: undefined } : item
        )));
      }
    } finally {
      const turnReleasedUi = chatUiOwnershipRef.current.finish(uiTurnOwner);
      if (turnReleasedUi) setSidekickBusy(false);
      if (isOwningContextCurrent()) {
        updateActiveStreamId(null);
        setChatRunState(failed ? 'error' : 'idle');
      }
    }
  }

  /** Dispatch pause/status/clear controls without taking over an active chat stream. */
  async function runPersistentGoalControlDuringChat(args: string, displayText: string,
    capturedCommand?:Extract<CommandAction,{kind:'goal_command'}>): Promise<void> {
    const turnContext = {
      sessionId: capturedCommand?.context.sessionId ?? activeSessionIdRef.current ?? '',
      profileId: capturedCommand?.context.profileId ?? activeProfileIdRef.current,
      spacePath: capturedCommand?.context.spacePath ?? activeSpacePathRef.current
    };
    const isOwningContextCurrent = (): boolean => isActiveTurnContextCurrent(turnContext, {
      sessionId: activeSessionIdRef.current,
      profileId: activeProfileIdRef.current,
      spacePath: activeSpacePathRef.current
    });

    if (!turnContext.sessionId) return;
    setChatMessages((current) => [...current, { role: 'user', content: displayText }]);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: displayText }]);
    setComposerText('');

    try {
      const controlRequest = requestNativePersistentGoalControlWhileBusy(
        (request) => window.lastbrowser.sidekick.goalCommand(request),
        `/goal ${args}`,
        true,
        {
          sessionId: turnContext.sessionId,
          profileId: turnContext.profileId,
          browserProfileId:capturedCommand?.context.browserProfileId??turnContext.profileId,
          workspace: turnContext.spacePath,
          expectedRevision:capturedCommand?.expectedRevision,clientRequestId:capturedCommand?.clientRequestId
        }
      );
      if (!controlRequest) return;
      const response = await controlRequest;
      if (!isOwningContextCurrent()) return;
      const reply = response.message_key === 'goal_judge_unavailable'
        ? t('goal.judgeUnavailable')
        : typeof response.message === 'string' && response.message.trim()
          ? response.message.trim()
          : 'Persistent goal updated.';
      setChatMessages((current) => [...current, { role: 'assistant', content: reply }]);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: reply }]);
      void refreshSessions();
      if(isOwningContextCurrent())await loadActiveSession(turnContext.sessionId,{loadDraft:false,showLoading:false});
    } catch (error) {
      if (!isOwningContextCurrent()) return;
      const reply = nativeGoalErrorCopy(locale,error);
      setChatMessages((current) => [...current, { role: 'assistant', content: reply }]);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: reply }]);
    }
  }

  async function handleNativeCommandAction(action:CommandAction):Promise<void> {
    if(!isCommandContextCurrent(action.context,{sessionId:activeSessionIdRef.current,profileId:activeProfileIdRef.current,
      browserProfileId:activeProfileIdRef.current,spacePath:activeSpacePathRef.current}))return;
    if(action.kind!=='goal_command')return;
    const text=`/goal ${action.args}`;
    const chatBusy=sidekickBusy||chatRunState==='starting'||chatRunState==='streaming';
    if(chatBusy){
      if(shouldDispatchPersistentGoalControlWhileBusy(text,true))await runPersistentGoalControlDuringChat(action.args,text,action);
      else setChatError(t('spaceAssistant.writerProtected'));
      return;
    }
    await runPersistentGoalCommand(action.args,text,action.context.reasoningEffort,action);
  }

  async function startNativeChat(
    message: string,
    displayText = message,
    continuation?: { sessionId: string; profileId: string; spacePath: string },
    reasoningEffort?: string
  ): Promise<boolean> {
    const trimmed = message.trim();
    if (!trimmed) return false;
    setQuickChatMode(false);
    if (activeSession?.session_id === activeSessionIdRef.current && isIndependentWriterProtected(activeSession)) {
      setChatError(t('spaceAssistant.writerProtected')); return false;
    }
    let turnContext = continuation ?? {
      sessionId: activeSessionIdRef.current ?? '',
      profileId: activeProfileIdRef.current,
      spacePath: activeSpacePathRef.current
    };
    const turnBackendProfileName = activeBackendProfileNameRef.current;
    if (continuation) {
      if (!isGoalContinuationContextCurrent(continuation, {
        sessionId: activeSessionIdRef.current,
        profileId: activeProfileIdRef.current,
        spacePath: activeSpacePathRef.current
      })) return false;
    }

    const persistentGoalCommand = parsePersistentGoalCommand(trimmed);
    const chatIsBusy = sidekickBusy || chatRunState === 'starting' || chatRunState === 'streaming';
    if (!continuation && chatIsBusy) {
      if (persistentGoalCommand && shouldDispatchPersistentGoalControlWhileBusy(trimmed, true)) {
        await runPersistentGoalControlDuringChat(persistentGoalCommand.args, displayText);
      } else if (persistentGoalCommand) {
        setChatError('Wait for the current chat turn to finish, then resend this goal command.');
      }
      return false;
    }
    if (persistentGoalCommand) {
      await runPersistentGoalCommand(persistentGoalCommand.args, displayText, reasoningEffort);
      return false;
    }

    // Direct user browser controls must not bypass a captured native chat mode.
    // Goal continuations always use the governed backend path.
    let browserCommand = continuation ? null : parseNaturalLanguageBrowserCommand(trimmed);
    if (browserCommand && turnContext.sessionId) {
      const selectionRevision = activeSpaceSelectionRevisionRef.current;
      try {
        const selection = await readCapturedSpaceModelSelection(turnContext);
        const mode = await requestChatMode(request => window.lastbrowser.sidekick.chatMode(request), {
          action: 'get', sessionId: turnContext.sessionId, workspacePath: turnContext.spacePath, browserProfileId: turnContext.profileId
        }, selection.scope);
        if (selectionRevision !== activeSpaceSelectionRevisionRef.current || !isActiveTurnContextCurrent(turnContext, {
          sessionId: activeSessionIdRef.current, profileId: activeProfileIdRef.current, spacePath: activeSpacePathRef.current
        })) return false;
        if (mode.mode.mode !== 'action') browserCommand = null;
      } catch {
        // Missing or unverified mode data gives no shortcut authority.
        browserCommand = null;
      }
    }
    if (browserCommand) {
      const visibleUserMessage: DesktopChatMessage = { role: 'user', content: displayText };
      setChatMessages((current) => [...current, visibleUserMessage]);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: displayText }]);
      setComposerText('');

      const result = await executeBrowserAction(browserCommand);
      const assistantReply = `### 🛠️ ${result.title}\n\n${result.message}`;

      setChatMessages((current) => [...current, { role: 'assistant', content: assistantReply, pending: false }]);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: assistantReply, pending: false }]);
      return true;
    }

    let chatModelSelection: Awaited<ReturnType<typeof readCapturedSpaceModelSelection>>;
    try {
      chatModelSelection = await readCapturedSpaceModelSelection(turnContext);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
      return false;
    }
    if (isMultiAgentModelSelection(chatModelSelection) && !readShowUntestedProviderBetas()) {
      setChatError(t('settings.panels.providers.multiAgentBetaRequired'));
      return false;
    }
    if (!isMultiAgentModelSelection(chatModelSelection) && !readShowUntestedProviderBetas()
      && (!chatModelSelection.provider || !chatModelSelection.model
        || !isProviderModelQualified(chatModelSelection.provider, chatModelSelection.model, turnContext.profileId,
          turnBackendProfileName || activeSession?.profile || 'default', window.localStorage))) {
      setChatError(t('settings.panels.providers.betaCatalogEmpty'));
      return false;
    }

    const visibleUserMessage: DesktopChatMessage = { role: 'user', content: displayText };
    setLastChatTurnUsage(null);
    setChatMessages((current) => [
      ...current,
      visibleUserMessage,
      { role: 'assistant', content: 'Working on it...', pending: true }
    ]);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: displayText },
      { id: crypto.randomUUID(), role: 'assistant', content: 'Working on it...', pending: true }
    ]);
    const uiTurnOwner = beginChatUiTurn(turnContext.sessionId || null);
    if (turnContext.sessionId) bindChatUiTurnSession(uiTurnOwner, turnContext.sessionId);
    let acceptedStreamId: string | null = null;
    setChatRunState('starting');
    const activeTurnIsCurrent = (): boolean => {
      return chatUiOwnershipRef.current.isActive(uiTurnOwner)
        && (!acceptedStreamId || chatUiOwnershipRef.current.ownsStream(uiTurnOwner, acceptedStreamId))
        && activeBackendProfileNameRef.current === turnBackendProfileName
        && isActiveTurnContextCurrent(turnContext, {
        sessionId: activeSessionIdRef.current,
        profileId: activeProfileIdRef.current,
        spacePath: activeSpacePathRef.current
      });
    };
    let turnFailed = false;
    let chatStartAccepted = false;
    setChatError('');
    // Register before asking Sidekick to start. Fast providers can emit their
    // first token while startChat is still resolving through IPC.
    const earlyStreamEvents: Array<{ streamId?: string; event?: string; data?: unknown }> = [];
    let captureEarlyEvents = true;
    const unsubscribeEarly = window.lastbrowser.sidekick.onChatStreamEvent((payload) => {
      if (!captureEarlyEvents || !payload || typeof payload !== 'object') return;
      earlyStreamEvents.push(payload as { streamId?: string; event?: string; data?: unknown });
      if (earlyStreamEvents.length > 1000) earlyStreamEvents.shift();
    });
    try {
      const chatModelProvider = chatModelSelection.provider || undefined;
      const configuredChatModel = chatModelSelection.model || undefined;
      let teamworkGroundingContext;
      if (configuredChatModel === 'teamwork' && turnBackendProfileName && activeTurnIsCurrent()) {
        try {
          const teamworkConfig = await window.lastbrowser.sidekick.requestWebui({
            method: 'GET',
            path: '/api/teamwork/config',
            scopeSelection: {
              browserProfileId: turnContext.profileId,
              workspacePath: turnContext.spacePath || null,
              backendProfileName: turnBackendProfileName,
            },
          });
          if (!activeTurnIsCurrent()) return false;
          if (teamworkConfig && typeof teamworkConfig === 'object' && (teamworkConfig as any).shared_grounding === true) {
            teamworkGroundingContext = await collectTeamworkGroundingContext(webviewRef.current, activeTab);
            if (!activeTurnIsCurrent()) return false;
          }
        } catch {
          if (!activeTurnIsCurrent()) return false;
          // The chat still works when settings are unavailable; do not send
          // browser context unless the user-visible setting was confirmed on.
        }
      }

      setNativeModelResolutionNotice(null);
      const response = await window.lastbrowser.sidekick.startChat({
        sessionId: turnContext.sessionId || null,
        message: trimmed,
        // Resolve the model explicitly. The setup state is often empty (the
        // wizard may have been skipped), and sending nothing made the backend
        // pick a stale catalog entry — observed as
        // "Ring-2.6-1T is no longer available as a free model".
        model: configuredChatModel,
        modelProvider: chatModelProvider,
        groundingContext: teamworkGroundingContext,
        profile: turnContext.profileId,
        workspace: turnContext.spacePath,
        backendProfileName: activeBackendProfileName,
        ...(reasoningEffort ? { reasoningEffort } : {})
      });
      if (!response?.streamId) throw new Error('Sidekick did not return a chat stream ID.');
      chatStartAccepted = true;
      if (reasoningEffort) saveChatReasoningEffort(response.sessionId, reasoningEffort, window.localStorage);
      const currentTurnContext = adoptCreatedTurnSession(turnContext, {
        sessionId: activeSessionIdRef.current,
        profileId: activeProfileIdRef.current,
        spacePath: activeSpacePathRef.current
      }, response.sessionId);
      const turnContextStillCurrentAfterStream = currentTurnContext !== null;
      traceRendererChat('chat-started', {
        hasStreamId: true,
        ownsContext: turnContextStillCurrentAfterStream
      });
      // When a fresh conversation is created implicitly by startChat, the
      // selected account could not be bound before the backend returned its
      // session ID. Bind it now so follow-up messages stay on this account in
      // per-session round-robin mode.
      if (currentTurnContext) {
        turnContext = currentTurnContext;
        bindChatUiTurnSession(uiTurnOwner, turnContext.sessionId);
        setActiveSessionId(response.sessionId);
        activeSessionIdRef.current = response.sessionId;
      }
      bindChatUiTurnSession(uiTurnOwner, response.sessionId);
      registerChatUiStream(uiTurnOwner, response.streamId, response.sessionId);
      acceptedStreamId = response.streamId;
      setChatMessages((current) => {
        const bound = bindLiveChatAssistantStream(current, response.sessionId, response.streamId, displayText);
        return configuredChatModel === 'teamwork' ? beginLiveTeamworkTurn(bound, response.streamId) : bound;
      });
      setMessages((current) => {
        const bound = bindLiveChatAssistantStream(current, response.sessionId, response.streamId, displayText);
        return configuredChatModel === 'teamwork' ? beginLiveTeamworkTurn(bound, response.streamId) : bound;
      });
      if (turnContextStillCurrentAfterStream) {
        updateActiveStreamId(response.streamId);
        setComposerText('');
        setChatRunState('streaming');
      }
      // Do not delay the SSE subscription on draft persistence. The draft is
      // already captured by startChat; clearing it can finish in the background.
      void window.lastbrowser.sidekick.saveDraft({
        sessionId: response.sessionId,
        text: '',
        files: [],
        profile: turnContext.profileId,
        workspacePath: turnContext.spacePath
      }).catch(() => null);
      captureEarlyEvents = false;
      const streamResult = await pollNativeChat(
        response.streamId,
        response.sessionId,
        earlyStreamEvents,
        unsubscribeEarly,
        activeTurnIsCurrent,
        {scope:chatModelSelection.scope,sessionId:response.sessionId,streamId:response.streamId,workspacePath:turnContext.spacePath,browserProfileId:turnContext.profileId},
        configuredChatModel === 'teamwork'
      );
      const turnContextStillCurrent = activeTurnIsCurrent();
      // Show the ACTUAL answer. The pending placeholder used to be replaced with
      // the literal string "Sidekick finished.", so every reply — including
      // errors and full summaries — was hidden behind that text.
      const finished = await loadActiveSession(response.sessionId, { loadDraft: false, showLoading: false });
      const answer = lastAssistantText(finished);
      recordCompletedChatEvidence({
        startAccepted: chatStartAccepted,
        completed: streamResult.completed,
        cancelled: streamResult.cancelled,
        streamError: streamResult.streamError,
        browserProfileId: turnContext.profileId,
        backendProfileName: turnBackendProfileName || activeSession?.profile || 'default',
        runtimeGeneration: status?.runtimeGeneration,
        appBuildId: __LASTBROWSER_BUILD_ID__,
        providerEvidence: streamResult.providerEvidence,
      }, window.localStorage);
      if (turnContextStillCurrent) {
        if (streamResult.streamError) {
          turnFailed = true;
          setChatError(streamResult.streamError);
          setChatMessages((current) => finishLiveChatMessageWithError(current, streamResult.streamError!));
          setMessages((current) => finishLiveChatMessageWithError(current, streamResult.streamError!));
        } else if (streamResult.cancelled) {
          setChatMessages((current) => finishLiveChatMessage(current, response.streamId));
          setMessages((current) => finishLiveChatMessage(current, response.streamId));
        } else {
          setChatMessages((current) => current.map((item) => (
            item.pending && item.chatStreamId === response.streamId
              ? { ...item, content: answer || 'Sidekick finished.', pending: false, progress: undefined }
              : item
          )));
          setMessages((current) => current.map((item) => (
            item.pending && item.chatStreamId === response.streamId
              ? { ...item, content: answer || 'Sidekick finished.', pending: false, progress: undefined }
              : item
          )));
        }
        if (streamResult.goalError) setChatError(streamResult.goalError);
      }

      // Auto-generate a concise session title from first user prompt if untitled or generic
      const currentSessionSummary = sessions.find((s) => s.session_id === response.sessionId);
      const isUntitled = !currentSessionSummary?.title ||
        currentSessionSummary.title === 'New chat' ||
        currentSessionSummary.title.startsWith('Chat 20') ||
        currentSessionSummary.title === 'Sidekick';

      if (isUntitled && trimmed) {
        const cleanPrompt = trimmed.replace(/\n+/g, ' ').trim();
        const autoTitle = cleanPrompt.length > 36 ? `${cleanPrompt.slice(0, 36)}…` : cleanPrompt;
        void window.lastbrowser.sidekick.renameSession({
          sessionId: response.sessionId,
          title: autoTitle,
          profile: turnContext.profileId,
          workspacePath: turnContext.spacePath
        }).then(() => {
          if (!sessionListResponseMatchesScope({ profile: turnContext.profileId, workspacePath: turnContext.spacePath }, {
            profile: activeProfileIdRef.current,
            workspacePath: activeSpacePathRef.current
          })) return;
          setSessions((current) =>
            current.map((s) => (s.session_id === response.sessionId ? { ...s, title: autoTitle } : s))
          );
        }).catch(() => null);
      }

      void refreshSessions();
      if (streamResult.continuationPrompt && turnContextStillCurrentAfterStream) {
        const continuationContext = { ...turnContext, sessionId: response.sessionId };
        await startGoalContinuation(streamResult.continuationPrompt, continuationContext, {
          sessionId: activeSessionIdRef.current,
          profileId: activeProfileIdRef.current,
          spacePath: activeSpacePathRef.current
        }, (prompt) => startNativeChat(prompt, prompt, continuationContext));
      }
    } catch (error) {
      captureEarlyEvents = false;
      unsubscribeEarly();
      const messageText = error instanceof Error ? error.message : String(error);
      turnFailed = true;
      traceRendererChat('chat-failed', {
        errorKind: classifyRendererChatError(messageText),
        ownsContext: activeTurnIsCurrent()
      });
      if (activeTurnIsCurrent()) {
        setChatError(messageText);
        setChatMessages((current) => current.map((item) => (
          item.pending ? { ...item, content: `Sidekick could not respond: ${messageText}`, pending: false, progress: undefined } : item
        )));
        setMessages((current) => current.map((item) => (
          item.pending ? { ...item, content: `Sidekick could not respond: ${messageText}`, pending: false, progress: undefined } : item
        )));
        setChatRunState('error');
      }
    } finally {
      const turnIsCurrentAfterCompletion = activeTurnIsCurrent();
      traceRendererChat('chat-finished', { ownsContext: turnIsCurrentAfterCompletion, failed: turnFailed });
      if (chatUiOwnershipRef.current.finish(uiTurnOwner)) setSidekickBusy(false);
      if (turnIsCurrentAfterCompletion) {
        updateActiveStreamId(null);
        setChatRunState((current) => {
          // Vision-Impaired Feature 36: soft audio gong when Nova finishes.
          const vision = usePanelStore.getState().visionImpaired;
          if (!turnFailed && vision.enabled && vision.copilotAudioChime) {
            playCopilotSuccessChime();
          }
          return turnFailed ? 'error' : 'idle';
        });
      }
    }
    return chatStartAccepted;
  }

  async function stopNativeChat(): Promise<void> {
    if (isIndependentOwnedSession(activeSession)) {
      const marker = readIndependentSessionRun(activeSession);
      if (!marker || marker.scope.browserProfileId !== activeProfileIdRef.current) { setChatError(t('spaceAssistant.stale')); return; }
      const sessionId = activeSessionId;
      const result = await assistantController.request({ schemaVersion: 1, operation: 'activity', scope: marker.scope, payload: {} });
      const run = result.ok ? result.value.runs.find(item => item.runId === marker.runId && item.targetSessionId === sessionId) : null;
      if (!run) { setChatError(t('spaceAssistant.stale')); return; }
      const stopped = await assistantController.control(marker.scope, run, 'cancel');
      if (!stopped.ok) setChatError(stopped.error.message);
      if (sessionId) await loadActiveSession(sessionId, { loadDraft: false, showLoading: false });
      return;
    }
    if (!activeStreamId) return;
    const streamId = activeStreamId;
    const sessionId = activeSessionId;
    const sessionScope: SessionListScope = { profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName };
    const uiTurnOwner = chatUiOwnershipRef.current.ownerForStream(streamId);
    setChatRunState('cancelling');
    const savedScope=activeSession?.space_scope;
    const acceptedBinding=useNativeChatControls.getState().records[streamId]?.binding;
    if(isIndependentScope(savedScope)||acceptedBinding){
      const scope=acceptedBinding?.scope??savedScope;
      if(!sessionId||!isIndependentScope(scope)||scope.browserProfileId!==activeProfileIdRef.current
        ||acceptedBinding&&acceptedBinding.sessionId!==sessionId){setChatError(t('spaceAssistant.stale'));return;}
      try{
        const ack=await requestNativeChatControl(window.lastbrowser.sidekick.controlChat,{sessionId,streamId,command:'cancel',
          workspacePath:acceptedBinding?.workspacePath??activeSpacePath,browserProfileId:scope.browserProfileId},scope);
        if(!ack.accepted&&activeSessionIdRef.current===sessionId)setChatError(t('spaceAssistant.stale'));
      }catch(error){if(activeSessionIdRef.current===sessionId&&activeProfileIdRef.current===scope.browserProfileId)setChatError(error instanceof Error?error.message:String(error));}
      // Only the original stream waiter can release this writer after actual
      // process exit. A dispatch ACK is not completion or a UI detach.
      return;
    }
    try {
      await window.lastbrowser.sidekick.cancelStream(streamId);
      if (sessionId) await loadActiveSession(sessionId, { loadDraft: false, showLoading: false });
    } catch (error) {
      if (sessionListResponseMatchesScope(sessionScope, {
        profile: activeProfileIdRef.current,
        workspacePath: activeSpacePathRef.current,
        backendProfileName: activeBackendProfileName
      })) setChatError(error instanceof Error ? error.message : String(error));
    } finally {
      if (uiTurnOwner !== null && chatUiOwnershipRef.current.finish(uiTurnOwner)) setSidekickBusy(false);
      if (activeSessionIdRef.current === sessionId && sessionListResponseMatchesScope(sessionScope, {
        profile: activeProfileIdRef.current,
        workspacePath: activeSpacePathRef.current,
        backendProfileName: activeBackendProfileName
      })) {
        updateActiveStreamId(null);
        setChatRunState('idle');
      }
    }
  }

  useEffect(() => {
    const handleWorkflowSend = (event: Event) => {
      const custom = event as CustomEvent<{ prompt?: string }>;
      if (custom.detail?.prompt) {
        setCopilotOpen(true);
        void startNativeChat(custom.detail.prompt);
      }
    };
    window.addEventListener('lastbrowser:workflow:send', handleWorkflowSend);
    return () => {
      window.removeEventListener('lastbrowser:workflow:send', handleWorkflowSend);
    };
  }, [setCopilotOpen]);

  async function renameNativeSession(session: DesktopSessionSummary): Promise<void> {
    const nextTitle = window.prompt('Rename chat', sessionTitle(session));
    if (!nextTitle?.trim()) return;
    const sessionScope: SessionListScope = { profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName };
    try {
      const result = await window.lastbrowser.sidekick.renameSession({
        sessionId: session.session_id,
        title: nextTitle.trim(),
        ...sessionScope
      });
      if (!sessionListResponseMatchesScope(sessionScope, {
        profile: activeProfileIdRef.current,
        workspacePath: activeSpacePathRef.current,
        backendProfileName: activeBackendProfileName
      })) return;
      const updated = result.session || { ...session, title: nextTitle.trim() };
      setSessions((current) => current.map((item) => (item.session_id === session.session_id ? { ...item, ...updated } : item)));
      if (activeSessionId === session.session_id) {
        setActiveSession((current) => (current ? { ...current, ...updated } : current));
      }
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteNativeSession(session: DesktopSessionSummary): Promise<void> {
    if (!window.confirm(`Delete "${sessionTitle(session)}"?`)) return;
    const sessionScope: SessionListScope = { profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName };
    try {
      await window.lastbrowser.sidekick.deleteSession({ sessionId: session.session_id, ...sessionScope });
      if (!sessionListResponseMatchesScope(sessionScope, {
        profile: activeProfileIdRef.current,
        workspacePath: activeSpacePathRef.current,
        backendProfileName: activeBackendProfileName
      })) return;
      setSessions((current) => {
        const next = current.filter((item) => item.session_id !== session.session_id);
        if (activeSessionId === session.session_id) {
          const nextActiveId = next[0]?.session_id || null;
          activeSessionIdRef.current = nextActiveId;
          setActiveSessionId(nextActiveId);
        }
        return next;
      });
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function duplicateNativeSession(session: DesktopSessionSummary): Promise<void> {
    const sessionScope: SessionListScope = { profile: activeProfileId, workspacePath: activeSpacePath, backendProfileName: activeBackendProfileName };
    try {
      const result = await window.lastbrowser.sidekick.duplicateSession({ sessionId: session.session_id, ...sessionScope });
      if (!sessionListResponseMatchesScope(sessionScope, {
        profile: activeProfileIdRef.current,
        workspacePath: activeSpacePathRef.current,
        backendProfileName: activeBackendProfileName
      })) return;
      const duplicated = result.session;
      if (duplicated?.session_id) {
        setSessions((current) => [
          duplicated,
          ...current.filter((item) => item.session_id !== duplicated.session_id)
        ]);
        setActiveSessionId(duplicated.session_id);
        setActivePanel('chat');
      }
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function cancelQuickChatBinding(binding: QuickChatBinding): Promise<QuickChatResetAck> {
    const result = await window.lastbrowser.quickChat.cancel({
      quickChatId: binding.quickChatId, streamId: binding.streamId, scope: binding.scope
    });
    if (!result || result.ok !== true) throw new Error('Quickchat cleanup was not acknowledged');
    return result;
  }

  function resetQuickChat(clearMessages: boolean): Promise<boolean> {
    return runQuickChatResetOnce(quickChatResetPromiseRef, async () => {
      const resetGeneration = quickChatGenerationRef.current;
      const resetChatId = quickChatIdRef.current;
      const stopWasPending = quickChatStopPendingRef.current;
      let resetScopeKey = quickChatBindingScopeKeyRef.current
        ?? quickChatStartPromiseRef.current?.scopeKey
        ?? quickChatTranscriptScopeKeyRef.current
        ?? currentQuickChatScopeKey();
      let resetCommitted = false;
      quickChatResetPendingRef.current = true;
      quickChatStopPendingRef.current = true;
      setQuickChatErrorForScope(resetScopeKey, '');
      quickChatStatusesByScopeRef.current.set(resetScopeKey, '');
      quickChatStatusScopeKeyRef.current = resetScopeKey;
      if (currentQuickChatScopeKey() === resetScopeKey) setQuickChatStatus('');

      let binding = quickChatBindingRef.current;
      let pendingStart = quickChatStartPromiseRef.current;
      const retainBinding = (retained: QuickChatBinding): void => {
        quickChatBindingRef.current = retained;
        quickChatBindingScopeKeyRef.current = pendingStart?.quickChatId === retained.quickChatId
          ? pendingStart.scopeKey : quickChatBindingScopeKeyRef.current;
        quickChatAwaitingStartRef.current = false;
        setQuickChatBinding(retained);
        const buffered = quickChatBufferedEventsRef.current.splice(0);
        for (const event of buffered) processQuickChatEvent(event, quickChatGenerationRef.current);
      };
      const showRetryableFailure = (): void => {
        if (binding && !quickChatBindingRef.current) retainBinding(binding);
        resetScopeKey = quickChatBindingScopeKeyRef.current ?? pendingStart?.scopeKey ?? resetScopeKey;
        setQuickChatErrorForScope(resetScopeKey, quickChatResetFailureCopy[locale]);
      };

      try {
        const stopInFlight = quickChatStopPromiseRef.current;
        if (stopInFlight) await stopInFlight;

        binding = quickChatBindingRef.current;
        pendingStart = quickChatStartPromiseRef.current ?? pendingStart;
        resetScopeKey = quickChatBindingScopeKeyRef.current ?? pendingStart?.scopeKey ?? resetScopeKey;
        if (!binding && pendingStart?.quickChatId === resetChatId) {
          binding = await pendingStart.promise;
          if (!quickChatBindingRef.current) retainBinding(binding);
        }

        if (!isCurrentQuickChatGeneration(quickChatGenerationRef.current, resetGeneration)
          || quickChatIdRef.current !== resetChatId
          || binding && binding.quickChatId !== resetChatId) {
          showRetryableFailure();
          return false;
        }

        return await confirmQuickChatReset(
          binding,
          candidate => cancelQuickChatBinding(candidate),
          () => {
            if (!isCurrentQuickChatGeneration(quickChatGenerationRef.current, resetGeneration)
              || quickChatIdRef.current !== resetChatId) return false;
            resetCommitted = true;
            quickChatGenerationRef.current += 1;
            quickChatBindingRef.current = null;
            quickChatBindingScopeKeyRef.current = null;
            quickChatAwaitingStartRef.current = false;
            quickChatStoppedStreamIdRef.current = null;
            quickChatStopPendingRef.current = false;
            setQuickChatBinding(null);
            const nextId = newIndependentRequestId().replaceAll('-', '').toLowerCase();
            quickChatIdRef.current = nextId;
            setQuickChatId(nextId);
            quickChatBufferedEventsRef.current = [];
            quickChatBusyRef.current = false;
            setQuickChatBusy(false);
            setQuickChatErrorForScope(resetScopeKey, '');
            if (binding) {
              quickChatStatusesByScopeRef.current.set(resetScopeKey, quickChatResetSuccessCopy[locale]);
              quickChatStatusScopeKeyRef.current = resetScopeKey;
              if (currentQuickChatScopeKey() === resetScopeKey) setQuickChatStatus(quickChatResetSuccessCopy[locale]);
            }
            if (clearMessages) {
              updateQuickChatMessagesForScope(resetScopeKey, []);
            } else updateQuickChatMessagesForScope(resetScopeKey, current => finishLiveChatMessage(current));
            return true;
          },
          showRetryableFailure
        );
      } catch {
        showRetryableFailure();
        return false;
      } finally {
        quickChatResetPendingRef.current = false;
        if (!resetCommitted) quickChatStopPendingRef.current = stopWasPending;
      }
    });
  }

  async function sendQuickChat(prompt: string, context?: { pageUrl?: string; pageTitle?: string; selectedText?: string; pageText?: string }): Promise<void> {
    const activeScopeKey = `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`;
    if (quickChatBusyRef.current || quickChatStopPendingRef.current || quickChatResetPendingRef.current
      || quickChatBindingScopeKeyRef.current !== null && quickChatBindingScopeKeyRef.current !== activeScopeKey
      || quickChatTranscriptScopeKeyRef.current !== null && quickChatTranscriptScopeKeyRef.current !== activeScopeKey
      || !prompt.trim()) return;
    const generation = quickChatGenerationRef.current;
    quickChatStopPendingRef.current = true;
    const chatId = quickChatIdRef.current;
    const browserProfileId = activeProfileIdRef.current;
    const workspacePath = activeSpacePathRef.current || null;
    const backendProfileName = activeBackendProfileNameRef.current || undefined;
    const capturedScopeKey = `${browserProfileId}::${workspacePath || ''}::${backendProfileName || ''}`;
    let scopedSelection: Awaited<ReturnType<typeof readCapturedSpaceModelSelection>>;
    try {
      scopedSelection = await readCapturedSpaceModelSelection({ profileId: browserProfileId, spacePath: workspacePath || '' });
    } catch (error) {
      quickChatStopPendingRef.current = false;
      setQuickChatErrorForScope(capturedScopeKey, error instanceof Error ? error.message : String(error));
      return;
    }
    if (capturedScopeKey !== `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`) {
      quickChatStopPendingRef.current = false;
      return;
    }
    const selection = resolvePreferredChatModelSelection({
      spaceSelection: scopedSelection,
      selectedModel: selectedChatModel,
      selectedModelProvider: selectedChatModelProvider,
      setupModel: setupState.model,
      setupProvider: setupState.provider,
      allowMultiAgent: readShowUntestedProviderBetas()
    });
    if (selection.migratedFromMultiAgent) setQuickChatStatusForScope(capturedScopeKey,
      selection.model ? t('settings.panels.providers.singleModelMigration') : t('settings.panels.providers.multiAgentBetaRequired'));
    if (isMultiAgentModelSelection(selection) && !readShowUntestedProviderBetas()) {
      quickChatStopPendingRef.current = false;
      setQuickChatErrorForScope(capturedScopeKey, t('settings.panels.providers.multiAgentBetaRequired'));
      return;
    }
    if (!readShowUntestedProviderBetas() && (!selection.provider || !selection.model
      || !isProviderModelQualified(selection.provider, selection.model, browserProfileId,
        backendProfileName || 'default', window.localStorage))) {
      quickChatStopPendingRef.current = false;
      setQuickChatErrorForScope(capturedScopeKey, t('settings.panels.providers.betaCatalogEmpty'));
      return;
    }
    quickChatBusyRef.current = true;
    quickChatTranscriptScopeKeyRef.current = capturedScopeKey;
    quickChatErrorScopeKeyRef.current = capturedScopeKey;
    setQuickChatBusy(true);
    setQuickChatErrorForScope(capturedScopeKey, '');
    updateQuickChatMessagesForScope(capturedScopeKey, current => [...current,
      { id: crypto.randomUUID(), role: 'user', content: prompt },
      { id: crypto.randomUUID(), role: 'assistant', content: 'Working on it...', pending: true, streaming: true }
    ]);
    quickChatBufferedEventsRef.current = [];
    quickChatStoppedStreamIdRef.current = null;
    quickChatAwaitingStartRef.current = true;
    let pendingStart: { quickChatId: string; scopeKey: string; promise: Promise<QuickChatBinding> } | null = null;
    try {
      const startPromise = window.lastbrowser.quickChat.start({
        quickChatId: chatId, browserProfileId, workspacePath, ...(backendProfileName ? { backendProfileName } : {}), prompt,
        ...(context ? { context } : {}), ...(selection.model ? { model: selection.model } : {}),
        ...(selection.provider ? { modelProvider: selection.provider } : {})
      });
      pendingStart = { quickChatId: chatId, scopeKey: capturedScopeKey, promise: startPromise };
      quickChatStartPromiseRef.current = pendingStart;
      const started = await startPromise;
      if (quickChatStartPromiseRef.current === pendingStart) quickChatStartPromiseRef.current = null;
      if (quickChatResetPendingRef.current) return;
      const currentScopeKey = `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`;
      if (!isCurrentQuickChatGeneration(quickChatGenerationRef.current, generation)
        || chatId !== quickChatIdRef.current || capturedScopeKey !== currentScopeKey) {
        const staleBinding: QuickChatBinding = { quickChatId: started.quickChatId, streamId: started.streamId, scope: started.scope };
        quickChatBindingRef.current = staleBinding;
        quickChatBindingScopeKeyRef.current = capturedScopeKey;
        setQuickChatBinding(staleBinding);
        quickChatAwaitingStartRef.current = false;
        if (chatId === quickChatIdRef.current) void resetQuickChat(true);
        else {
          setQuickChatErrorForScope(capturedScopeKey, quickChatResetFailureCopy[locale]);
        }
        return;
      }
      quickChatAwaitingStartRef.current = false;
      const binding = { quickChatId: started.quickChatId, streamId: started.streamId, scope: started.scope };
      quickChatBindingRef.current = binding;
      quickChatBindingScopeKeyRef.current = capturedScopeKey;
      setQuickChatBinding(binding);
      const buffered = quickChatBufferedEventsRef.current.splice(0);
      for (const event of buffered) processQuickChatEvent(event, generation);
    } catch (error) {
      if (quickChatStartPromiseRef.current === pendingStart) quickChatStartPromiseRef.current = null;
      if (quickChatResetPendingRef.current || !isCurrentQuickChatGeneration(quickChatGenerationRef.current, generation)
        || chatId !== quickChatIdRef.current) return;
      quickChatAwaitingStartRef.current = false;
      quickChatBufferedEventsRef.current = [];
      const message = error instanceof Error ? error.message : String(error);
      setQuickChatErrorForScope(capturedScopeKey, message);
      updateQuickChatMessagesForScope(capturedScopeKey, current => finishLiveChatMessageWithError(current, message));
      quickChatBusyRef.current = false;
      setQuickChatBusy(false);
    }
  }

  async function stopQuickChat(): Promise<void> {
    if (quickChatResetPendingRef.current) return;
    const binding = quickChatBindingRef.current;
    if (!binding || quickChatAwaitingStartRef.current) {
      await resetQuickChat(true);
      return;
    }
    const generation = quickChatGenerationRef.current;
    quickChatStoppedStreamIdRef.current = binding.streamId;
    quickChatBusyRef.current = false;
    setQuickChatBusy(false);
    const bindingScopeKey = quickChatBindingScopeKeyRef.current;
    if (bindingScopeKey) updateQuickChatMessagesForScope(bindingScopeKey, current => finishLiveChatMessage(current));
    const stopPromise = window.lastbrowser.quickChat.stop({
      quickChatId: binding.quickChatId, streamId: binding.streamId, scope: binding.scope
    });
    quickChatStopPromiseRef.current = stopPromise;
    try {
      await stopPromise;
      if (!isCurrentQuickChatGeneration(quickChatGenerationRef.current, generation)) return;
      quickChatStopPendingRef.current = false;
      if (quickChatBindingRef.current?.streamId !== binding.streamId) return;
      const stoppedBinding = { ...binding, streamId: '' };
      quickChatBindingRef.current = stoppedBinding;
      setQuickChatBinding(stoppedBinding);
    } catch (error) {
      if (!isCurrentQuickChatGeneration(quickChatGenerationRef.current, generation)) return;
      quickChatStopPendingRef.current = false;
      if (quickChatBindingRef.current?.streamId !== binding.streamId) return;
      const message = error instanceof Error ? error.message : String(error);
      if (bindingScopeKey) setQuickChatErrorForScope(bindingScopeKey, message);
    } finally {
      if (quickChatStopPromiseRef.current === stopPromise) quickChatStopPromiseRef.current = null;
    }
  }

  async function runSidekickAction(action: SidekickActionId): Promise<void> {
    const capturedScopeKey = `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`;
    const capturedTabId = activeTab.id;
    if (isQuickChatAction(action)) {
      setQuickChatMode(true);
      setCopilotOpen(true);
      const context = await collectBrowserContext(webviewRef.current, activeTab);
      if (capturedScopeKey !== `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`
        || activeTabIdRef.current !== capturedTabId) return;
      const result = buildSidekickPrompt(action, context);
      if (result.ok) await sendQuickChat(result.prompt, {
        pageUrl: context.url, pageTitle: context.title, selectedText: context.selectedText, pageText: context.pageText
      });
      else setQuickChatErrorForScope(capturedScopeKey, result.reason);
      return;
    }
    setQuickChatMode(false);
    if (quickChatBusyRef.current || quickChatAwaitingStartRef.current) {
      const cleaned = await resetQuickChat(false);
      if (!cleaned) {
        setQuickChatMode(true);
        setCopilotOpen(true);
        return;
      }
    }
    setCopilotOpen(false);
    setActivePanel('chat');
    const result = await dispatchSidekickAction(action, webviewRef.current, activeTab, (prompt, title) => startNativeChat(prompt, title));
    if (!result.ok) setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'system', content: result.reason }]);
  }

  async function readWorkspaceEntry(entry: WorkspaceTreeEntry): Promise<void> {
    if (!activeSessionId) return;
    const nextPath = entry.path || entry.name;
    if (!nextPath) return;

    if (entry.is_dir || entry.type === 'dir' || entry.type === 'directory') {
      setWorkspacePath(nextPath);
      setWorkspacePreview(null);
      setWorkspacePreviewDraft('');
      setWorkspaceEditing(false);
      return;
    }

    try {
      const preview = await window.lastbrowser.sidekick.readWorkspaceFile({ sessionId: activeSessionId, path: nextPath });
      setWorkspacePreview(preview);
      setWorkspacePreviewDraft(String(preview.content || ''));
      setWorkspaceEditing(false);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createWorkspaceFileNative(): Promise<void> {
    if (!activeSessionId) return;
    const name = window.prompt('New file name');
    if (!name?.trim()) return;
    const path = joinWorkspacePath(workspacePath, name.trim());
    try {
      await window.lastbrowser.sidekick.createWorkspaceFile({ sessionId: activeSessionId, path, content: '' });
      setWorkspaceRefreshNonce((current) => current + 1);
      const preview = await window.lastbrowser.sidekick.readWorkspaceFile({ sessionId: activeSessionId, path }).catch(() => null);
      if (preview) {
        setWorkspacePreview(preview);
        setWorkspacePreviewDraft(String(preview.content || ''));
        setWorkspaceEditing(true);
      }
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createWorkspaceFolderNative(): Promise<void> {
    if (!activeSessionId) return;
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;
    try {
      await window.lastbrowser.sidekick.createWorkspaceDirectory({
        sessionId: activeSessionId,
        path: joinWorkspacePath(workspacePath, name.trim())
      });
      setWorkspaceRefreshNonce((current) => current + 1);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameWorkspaceEntryNative(entry: WorkspaceTreeEntry): Promise<void> {
    if (!activeSessionId) return;
    const currentPath = entry.path || entry.name;
    if (!currentPath) return;
    const nextName = window.prompt('Rename item', entry.name);
    if (!nextName?.trim()) return;
    try {
      const result = await window.lastbrowser.sidekick.renameWorkspaceEntry({
        sessionId: activeSessionId,
        path: currentPath,
        newName: nextName.trim()
      });
      const newPath = String(result.new_path || joinWorkspacePath(parentPath(currentPath), nextName.trim()));
      if (workspacePreview?.path === currentPath) {
        setWorkspacePreview((current) => current ? { ...current, path: newPath } : current);
      }
      setWorkspaceRefreshNonce((current) => current + 1);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteWorkspaceEntryNative(entry: WorkspaceTreeEntry): Promise<void> {
    if (!activeSessionId) return;
    const currentPath = entry.path || entry.name;
    if (!currentPath) return;
    const isFolder = isWorkspaceDirectory(entry);
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    try {
      await window.lastbrowser.sidekick.deleteWorkspaceEntry({
        sessionId: activeSessionId,
        path: currentPath,
        recursive: isFolder
      });
      if (workspacePreview?.path === currentPath) {
        setWorkspacePreview(null);
        setWorkspacePreviewDraft('');
        setWorkspaceEditing(false);
      }
      setWorkspaceRefreshNonce((current) => current + 1);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveWorkspacePreviewNative(): Promise<void> {
    if (!activeSessionId || !workspacePreview?.path) return;
    try {
      await window.lastbrowser.sidekick.saveWorkspaceFile({
        sessionId: activeSessionId,
        path: workspacePreview.path,
        content: workspacePreviewDraft
      });
      setWorkspacePreview((current) => current ? { ...current, content: workspacePreviewDraft, size: workspacePreviewDraft.length } : current);
      setWorkspaceEditing(false);
      setWorkspaceRefreshNonce((current) => current + 1);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }

  async function addSpaceNative(path: string, name: string, backendBinding?: { browserProfileId: string; backendProfileName: string }): Promise<{ ok: true; path: string; backendProfileName?: string } | { ok: false; error: string }> {
    // Invalidate listSpaces requests that started before this create. They can
    // resolve after the new Space is selected and otherwise restore an older
    // backend `last` value over the user's fresh selection.
    spaceDirectoryRevisionRef.current += 1;
    try {
      const result = await window.lastbrowser.sidekick.addSpace({ path, name, create: true });
      spaceDirectoryRevisionRef.current += 1;
      const nextSpaces = Array.isArray(result.workspaces) ? result.workspaces : spaces;
      const canonicalPath = resolveCanonicalSpacePath(path, nextSpaces);
      if (!canonicalPath) {
        const message = 'The backend created the Space but did not return its canonical path.';
        setSpacesError(message);
        return { ok: false, error: message };
      }
      setSpaces(nextSpaces);
      setSpacesError('');
      // Bind the explicit profile before selecting the Space: selection starts
      // scope resolution, which must never create an intermediate default binding.
      if (backendBinding) {
        setExplicitBackendProfileBySpace(prev => ({ ...prev,
          [`${backendBinding.browserProfileId}::${canonicalPath}`]: backendBinding.backendProfileName }));
      }
      handleSpaceSelect(canonicalPath);
      return { ok: true, path: canonicalPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSpacesError(message);
      return { ok: false, error: message };
    }
  }

  async function recoverExistingSpace(path: string, name: string, backendBinding?: { browserProfileId: string; backendProfileName: string }): Promise<{ ok: true; path: string; backendProfileName?: string } | { ok: false; error: string }> {
    try {
      const listed = await window.lastbrowser.sidekick.listSpaces();
      const listedSpaces = Array.isArray(listed.workspaces) ? listed.workspaces : [];
      const canonicalPath = resolveCanonicalSpacePath(path, listedSpaces);
      if (!canonicalPath) return { ok: false, error: t('spaceSetup.existingSpaceUnmatched') };
      const existing = listedSpaces.find(space => space.path === canonicalPath);
      if (!existing || (name.trim() && (existing.name ?? '').trim().toLocaleLowerCase() !== name.trim().toLocaleLowerCase())) {
        return { ok: false, error: t('spaceSetup.existingSpaceNameMismatch') };
      }
      const bindingsResult = await assistantController.listProfileBindings(backendBinding?.browserProfileId ?? activeProfileIdRef.current);
      if (!bindingsResult.ok) return { ok: false, error: bindingsResult.error.message };
      const bindingResolution = resolveExistingSpaceBackendProfile(canonicalPath, backendBinding?.backendProfileName, bindingsResult.value.bindings);
      if (!bindingResolution.ok) {
        return { ok: false, error: t(bindingResolution.reason === 'profile_mismatch'
          ? 'spaceSetup.existingSpaceProfileMismatch' : 'spaceSetup.existingSpaceBindingAmbiguous') };
      }
      spaceDirectoryRevisionRef.current += 1;
      setSpaces(listedSpaces);
      setSpacesError('');
      const boundBackendProfileName = backendBinding?.backendProfileName ?? bindingResolution.backendProfileName;
      if (boundBackendProfileName) {
        setExplicitBackendProfileBySpace(prev => ({ ...prev,
          [`${backendBinding?.browserProfileId ?? activeProfileIdRef.current}::${canonicalPath}`]: boundBackendProfileName }));
      }
      handleSpaceSelect(canonicalPath);
      return { ok: true, path: canonicalPath, ...(boundBackendProfileName ? { backendProfileName: boundBackendProfileName } : {}) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  const handleCreateSpaceFromModal = useCallback(async (data: SpaceSetupData) => {
    const creationProfileId = activeProfileIdRef.current;
    try {
      const created = await addSpaceNative(data.path, data.name, data.backendProfileName
        ? { browserProfileId: creationProfileId, backendProfileName: data.backendProfileName } : undefined);
      const recovered = created.ok ? created : await recoverExistingSpace(data.path, data.name, data.backendProfileName
        ? { browserProfileId: creationProfileId, backendProfileName: data.backendProfileName } : undefined);
      if (!recovered.ok) return created.ok ? recovered.error : `${created.error} ${recovered.error}`;
      const createdSpacePath = recovered.path;
      if (data.model) {
        const resolved = await assistantController.resolveScope({ browserProfileId: creationProfileId, workspacePath: createdSpacePath }, data.backendProfileName ?? recovered.backendProfileName);
        if (!resolved.ok) throw new Error(resolved.error.message);
        const current = await assistantController.request({ schemaVersion: 1, operation: 'modelSelection', scope: resolved.value.scope, payload: { action: 'get' } });
        if (!current.ok) throw new Error(current.error.message);
        const chosen = await assistantController.request({ schemaVersion: 1, operation: 'modelSelection', scope: resolved.value.scope, payload: {
          action: 'set', model: data.model, provider: data.modelProvider ?? '', expectedRevision: current.value.revision, clientRequestId: newIndependentRequestId()
        } });
        if (!chosen.ok) throw new Error(chosen.error.message);
        saveSpaceModel(createdSpacePath, chosen.value.model, window.localStorage, chosen.value.provider);
        if (activeProfileIdRef.current === creationProfileId && activeSpacePathRef.current === createdSpacePath) {
          useChatStore.getState().setSelectedModel(chosen.value.model);
          useChatStore.getState().setSelectedModelProvider(chosen.value.provider);
        }
      }
      if (activeProfileIdRef.current === creationProfileId && activeSpacePathRef.current === createdSpacePath) {
        newAssistantSpacePathRef.current = createdSpacePath;
        newAssistantSeedRef.current = data.assistantSeed;
        setQuickChatMode(false);
        setCopilotOpen(true);
      }
      if (data.pinnedApps && data.pinnedApps.length > 0) {
        data.pinnedApps.forEach((app) => {
          const existingVisibleApp = usePinnedAppStore.getState().apps.some((existing) =>
            existing.url === app.url && (!existing.spacePath || existing.spacePath === createdSpacePath)
          );
          if (existingVisibleApp) return;
          usePinnedAppStore.getState().addApp({
            name: app.name,
            url: app.url,
            color: app.color || data.color,
            bg: '#1c1c1c',
            spacePath: createdSpacePath
          });
        });
      }
      if (data.startUrl && data.startUrl !== 'app://browser-home') {
        addTab(data.startUrl);
      }
      return true;
    } catch (err) {
      console.error('[App] Failed to create space from modal:', err);
      setSpacesError(err instanceof Error ? err.message : String(err));
      return err instanceof Error ? err.message : String(err);
    }
  }, [spaces, handleSpaceSelect, addTab, assistantController, t]);

  async function renameSpaceNative(space: SpaceSummary): Promise<void> {
    const nextName = window.prompt('Rename space', spaceDisplayName(space));
    if (!nextName?.trim()) return;
    spaceDirectoryRevisionRef.current += 1;
    try {
      const result = await window.lastbrowser.sidekick.renameSpace({ path: space.path, name: nextName.trim() });
      spaceDirectoryRevisionRef.current += 1;
      if (Array.isArray(result.workspaces)) setSpaces(result.workspaces);
      setSpacesError('');
    } catch (error) {
      setSpacesError(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeSpaceNative(space: SpaceSummary): Promise<void> {
    if (!window.confirm(`Remove "${spaceDisplayName(space)}" from spaces?`)) return;
    spaceDirectoryRevisionRef.current += 1;
    try {
      const result = await window.lastbrowser.sidekick.removeSpace({ path: space.path, browserProfileId: activeProfileId });
      spaceDirectoryRevisionRef.current += 1;
      removeSpaceModel(space.path, window.localStorage);
      // Audio keepalive entries of a deleted space must not keep orphan
      // webviews (and their audio) alive (goal.md Paket 3).
      setAudioKeepalive((current) => current.filter((entry) => entry.spacePath !== space.path));
      const nextSpaces = Array.isArray(result.workspaces) ? result.workspaces : spaces.filter((item) => item.path !== space.path);
      setSpaces(nextSpaces);
      if (activeSpacePath === space.path) handleSpaceSelect(nextSpaces[0]?.path || '');
      setSpacesError('');
    } catch (error) {
      setSpacesError(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveSpaceNative(space: SpaceSummary, direction: -1 | 1): Promise<void> {
    const index = spaces.findIndex((item) => item.path === space.path);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= spaces.length) return;
    spaceDirectoryRevisionRef.current += 1;
    const next = [...spaces];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setSpaces(next);
    try {
      const result = await window.lastbrowser.sidekick.reorderSpaces({ paths: next.map((entry) => entry.path) });
      spaceDirectoryRevisionRef.current += 1;
      if (Array.isArray(result.workspaces)) setSpaces(result.workspaces);
      setSpacesError('');
    } catch (error) {
      setSpacesError(error instanceof Error ? error.message : String(error));
    }
  }

  function clampSidebarWidth(
    target: SidebarResizeTarget,
    width: number,
  ): number {
    const leftWidth = leftSidebarCollapsedRef.current ? COLLAPSED_LEFT_RAIL_WIDTH : DEFAULT_LEFT_RAIL_WIDTH;
    const contextWidth = contextSidebarCollapsedRef.current ? COLLAPSED_PANEL_WIDTH : contextSidebarWidthRef.current;
    const workspaceWidth = workspacePanelCollapsedRef.current ? COLLAPSED_PANEL_WIDTH : workspacePanelWidthRef.current;
    const browserFloor = MIN_BROWSER_WIDTH;
    const maxByViewport = Math.max(
      target === 'context' ? MIN_CONTEXT_SIDEBAR_WIDTH : MIN_WORKSPACE_PANEL_WIDTH,
      window.innerWidth - leftWidth - contextWidth - workspaceWidth - browserFloor
    );

    if (target === 'context') {
      return Math.round(Math.min(MAX_CONTEXT_SIDEBAR_WIDTH, Math.max(MIN_CONTEXT_SIDEBAR_WIDTH, Math.min(width, maxByViewport))));
    }

    return Math.round(Math.min(MAX_WORKSPACE_PANEL_WIDTH, Math.max(MIN_WORKSPACE_PANEL_WIDTH, Math.min(width, maxByViewport))));
  }

  function beginSidebarResize(target: SidebarResizeTarget, event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (target === 'context' && contextSidebarCollapsedRef.current) return;
    if (target === 'workspace' && workspacePanelCollapsedRef.current) return;

    resizeStateRef.current = {
      target,
      startX: event.clientX,
      startWidth: target === 'context' ? contextSidebarWidthRef.current : workspacePanelWidthRef.current
    };
    document.body.classList.add('sidebar-resizing');
  }

  useEffect(() => {
    function handleMouseMove(event: MouseEvent): void {
      const resize = resizeStateRef.current;
      if (!resize) return;

      const delta = resize.target === 'context'
        ? event.clientX - resize.startX
        : resize.startX - event.clientX;
      const nextWidth = clampSidebarWidth(resize.target, resize.startWidth + delta);

      if (resize.target === 'context') {
        setContextSidebarWidth(nextWidth);
      } else {
        setWorkspacePanelWidth(nextWidth);
      }
      document.body.classList.add('sidebar-resizing');
    }

    function handleMouseUp(): void {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.classList.remove('sidebar-resizing');
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
      document.body.classList.remove('sidebar-resizing');
    };
  }, []);

  useEffect(() => {
    if (!resizeStateRef.current) return;
    const target = resizeStateRef.current.target;
    const nextWidth = clampSidebarWidth(target, target === 'context' ? contextSidebarWidthRef.current : workspacePanelWidthRef.current);
    if (target === 'context') {
      setContextSidebarWidth(nextWidth);
    } else {
      setWorkspacePanelWidth(nextWidth);
    }
  }, [leftSidebarCollapsed, contextSidebarCollapsed, workspacePanelCollapsed]);

  const activePageCategory = useMemo(() => {
    return detectPageCategory(activeTab.url, activeTab.title);
  }, [activeTab.url, activeTab.title]);

  const quickActions = useMemo(() => {
    if (!activeTab.url || activeTab.url.startsWith('lastbrowser://') || activeTab.url.startsWith('about:') || activeTab.url.startsWith('chrome://')) {
      return [];
    }
    return getQuickActionChips(activePageCategory, activeTab.url);
  }, [activePageCategory, activeTab.url]);

  const handleExecuteQuickAction = useCallback((chip: QuickActionChip) => {
    if (!isQuickChatAction(chip.id)) {
      setQuickChatMode(false);
      setCopilotOpen(false);
      setActivePanel('chat');
      const capturedScopeKey = `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`;
      const capturedTabId = activeTab.id;
      void executeQuickAction(chip, activeTab, prompt => {
        if (capturedScopeKey !== `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`
          || activeTabIdRef.current !== capturedTabId) return;
        void startNativeChat(prompt, chip.label);
      });
      return;
    }
    setQuickChatMode(true);
    setCopilotOpen(true);
    const capturedScopeKey = `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`;
    const capturedTabId = activeTab.id;
    void collectBrowserContext(webviewRef.current, activeTab).then(context => {
      if (capturedScopeKey !== `${activeProfileIdRef.current}::${activeSpacePathRef.current}::${activeBackendProfileNameRef.current || ''}`
        || activeTabIdRef.current !== capturedTabId) return;
      return sendQuickChat(chip.promptTemplate, {
        pageUrl: context.url, pageTitle: context.title, selectedText: context.selectedText, pageText: context.pageText
      });
    }).catch(error => {
      setQuickChatErrorForScope(capturedScopeKey, error instanceof Error ? error.message : String(error));
    });
  }, [activeTab, setCopilotOpen, setActivePanel, selectedChatModel, selectedChatModelProvider, setupState.model, setupState.provider, startNativeChat]);

  const isModernBrowser = layoutMode === 'modern';
  const copilotModelSelection = resolvePreferredChatModelSelection({
    spaceSelection: loadSpaceModelSelection(activeSpacePath, window.localStorage),
    selectedModel: selectedChatModel,
    selectedModelProvider: selectedChatModelProvider,
    setupModel: setupState.model,
    setupProvider: setupState.provider,
    allowMultiAgent: readShowUntestedProviderBetas(),
  });

  if (!canRenderBrowserForAccessAuth(accessAuthChecked, {
    auth_enabled: accessAuthRequired || !accessAuthChecked,
    logged_in: accessAuthChecked && !accessAuthRequired
  })) {
    return (
      <main className="access-lock-screen">
        <section className="access-lock-card" aria-labelledby="access-lock-title">
          <div className="access-lock-icon"><ShieldCheck size={28} /></div>
          <p className="eyebrow">LastBrowser</p>
          <h1 id="access-lock-title">{accessAuthRequired ? t('access.lock.title') : t('access.lock.checking')}</h1>
          <p>{accessAuthRequired
            ? t('access.lock.description')
            : (accessAuthError || t('access.lock.checking'))}</p>
          {accessAuthRequired ? (
            <form onSubmit={(event) => void unlockBrowser(event)}>
              <label htmlFor="access-lock-password">{t('access.lock.password')}</label>
              <input id="access-lock-password" autoFocus type="password" autoComplete="current-password" value={accessPassword} onChange={(event) => setAccessPassword(event.target.value)} />
              {accessAuthError && <div className="access-lock-error" role="alert">{accessAuthError}</div>}
              <button type="submit" disabled={!accessPassword || accessAuthBusy}>{accessAuthBusy ? t('access.lock.unlocking') : t('access.lock.unlock')}</button>
            </form>
          ) : (
            <button type="button" onClick={() => {
              void window.lastbrowser.sidekick.getAccessAuthStatus().then((auth) => {
                setAccessAuthRequired(Boolean(auth.auth_enabled && !auth.logged_in));
                setAccessAuthChecked(true);
                setAccessAuthError('');
              }).catch((error) => setAccessAuthError(error instanceof Error ? error.message : String(error)));
            }}>{t('access.lock.retry')}</button>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className={`app-shell panel-${activePanel} ${isModernBrowser ? 'modern-mode' : ''} ${windowMaximized ? 'is-maximized' : ''} ${sidebarMode === 'hidden' ? 'zen-mode' : ''}`}>
      {/* Vision-Impaired 2.0: hidden SVG filter defs for color-vision correction (§7.4). */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          {(Object.keys(CVD_FILTER_MATRIXES) as Array<keyof typeof CVD_FILTER_MATRIXES>).map((filterId) => (
            <filter key={filterId} id={filterId}>
              <feColorMatrix type="matrix" values={CVD_FILTER_MATRIXES[filterId]} />
            </filter>
          ))}
        </defs>
      </svg>
      {/* Vision-Impaired 2.0: cursor companion loupe + shake-to-locate radar (§4). */}
      <CursorLoupeHUD />
      {isModernBrowser ? (
        <>
          <ModernTitlebar
            isLoading={activeTab.isLoading}
            onGoBack={() => webviewRef.current?.goBack()}
            onGoForward={() => webviewRef.current?.goForward()}
            onReloadOrStop={() => {
              if (activeTab.isLoading) {
                try {
                  webviewRef.current?.stop();
                } catch {
                  // ignore
                }
                updateLoading(activeTab.id, false);
              } else {
                webviewRef.current?.reload();
              }
            }}
            sidebarMode={sidebarMode}
            onToggleSidebar={cycleSidebarMode}
            zenMode={sidebarMode === 'hidden'}
            zenRevealed={zenTitlebarRevealed}
            onZenRevealChange={setZenTitlebarRevealed}
            blockedAdsCount={blockedAdsCount}
            savedMemoryMb={savedMemoryMb}
            onToggleShieldPopover={() => {}}
            onToggleFind={() => usePanelStore.getState().setFindOpen(!usePanelStore.getState().findOpen)}
            onToggleDownloads={() => usePanelStore.getState().setDownloadsOpen(!usePanelStore.getState().downloadsOpen)}
            hasActiveDownloads={hasActiveDownloads}
            onToggleExtensions={() => {
              toggleExtensionHub();
            }}
            copilotOpen={copilotOpen}
            onToggleCopilot={toggleCopilot}
            loupeActive={visionImpaired.enabled && visionImpaired.cursorLoupeEnabled}
            onToggleLoupe={() => {
              const store = usePanelStore.getState();
              store.setVisionImpaired(toggleVisionImpairedFeature(store.visionImpaired, 'cursorLoupeEnabled'));
            }}
            onOpenGithub={() => addTab('https://github.com/Loggableim/lastbrowser/issues')}
            quickActions={quickActions}
            onExecuteQuickAction={handleExecuteQuickAction}
            onTriggerSummarize={() => void runSidekickAction('summarize-page')}
            botName={setupState.botName || 'Nova'}
            topbarActionStrip={
              activePanel === 'browser' ? (
                <InPageActionBar
                  variant="topbar"
                  busy={sidekickBusy}
                  onAction={runSidekickAction}
                  zoomFactor={1}
                  onResetZoom={() => {
                    const view = webviewRef.current;
                    if (view && typeof view.setZoomFactor === 'function') {
                      view.setZoomFactor(1);
                    }
                  }}
                  onFindOpen={() => usePanelStore.getState().setFindOpen(!usePanelStore.getState().findOpen)}
                  downloadsOpen={usePanelStore.getState().downloadsOpen}
                  hasActiveDownloads={hasActiveDownloads}
                  onToggleDownloads={() => usePanelStore.getState().setDownloadsOpen(!usePanelStore.getState().downloadsOpen)}
                  historyOpen={usePanelStore.getState().historyOpen}
                  onToggleHistory={() => usePanelStore.getState().setHistoryOpen(!usePanelStore.getState().historyOpen)}
                  muted={false}
                  onToggleMute={() => {
                    const view = webviewRef.current;
                    if (isWebviewReady(view) && view && typeof view.isAudioMuted === 'function' && typeof view.setAudioMuted === 'function') {
                      try {
                        view.setAudioMuted(!view.isAudioMuted());
                      } catch {
                        // The guest may begin navigating after the click.
                      }
                    }
                  }}
                  dockMode={actionBarDock}
                  onSetDockMode={setActionBarDock}
                  overlayTools={(
                    <>
                      <button
                        type="button"
                        className={`devtools-trigger ${devToolsOpen ? 'active' : ''}`}
                        title="Toggle DevTools (F12)"
                        aria-label="Toggle DevTools (F12)"
                        aria-pressed={devToolsOpen}
                        onClick={toggleDevTools}
                      >
                        <Code2 size={14} />
                      </button>
                      <SitePermissionButton url={activeTab.url} />
                      <button
                        type="button"
                        className="permissions-trigger"
                        title="Site permissions"
                        aria-label="Site permissions"
                        aria-expanded={permissionsOpen}
                        onClick={() => usePanelStore.getState().setPermissionsOpen(!usePanelStore.getState().permissionsOpen)}
                      >
                        <ShieldCheck size={14} />
                      </button>
                    </>
                  )}
                />
              ) : undefined
            }
          >
            {activePanel === 'browser' ? (
              <AddressBar
                value={addressValue}
                onChange={setAddressValue}
                onSubmit={navigate}
                bookmarks={bookmarks}
                visits={visitedSites}
                searchEngineId={searchEngineId}
                activeBookmarkable={activeBookmarkable}
                activeBookmarked={activeBookmarked}
                onToggleBookmark={toggleActiveBookmark}
                inputRef={addressInputRef}
              />
            ) : (
              <div className="modern-titlebar-tool-banner">
                <button
                  type="button"
                  className="modern-back-to-web-btn"
                  onClick={() => setActivePanel('browser')}
                  title="Zurück zum Web-Browser (Tabs)"
                >
                  <ChevronLeft size={14} />
                  <span>Zurück zum Web</span>
                </button>
                <div className="modern-tool-active-badge">
                  <span className="modern-tool-dot" />
                  <span className="modern-tool-title">
                    {t(panelLabelTranslationKey(activePanel))}
                  </span>
                </div>
              </div>
            )}
          </ModernTitlebar>

          {sidebarMode === 'hidden' && (
            <>
              <div
                className="zen-left-hover-sensor"
                onMouseEnter={handleZenSidebarEnter}
                onMouseLeave={handleZenSidebarLeave}
                onClick={handleZenSidebarEnter}
                aria-hidden="true"
                title="Kante berühren, um Seitenleiste einzublenden"
              />
              <div
                className={`zen-sidebar-overlay ${zenSidebarRevealed ? 'zen-revealed' : ''}`}
                onMouseEnter={handleZenSidebarEnter}
                onMouseLeave={handleZenSidebarLeave}
              >
                <SidekickSidebar
                  mode={zenFloatingMode}
                  isFloatingOverlay={true}
                  onCloseOverlay={() => setZenSidebarRevealed(false)}
                  onDock={() => setSidebarMode(zenExitDefaultMode)}
                  tabs={tabs}
                  activeTabId={activeTab.id}
                  draggedTabId={draggedTabId}
                  onActivateTab={(tabId) => {
                    activeTabIdRef.current = tabId;
                    setActiveTabId(tabId);
                    setActivePanel('browser');
                    setZenSidebarRevealed(false);
                  }}
                  onCloseTab={closeTab}
                  onNewTab={(url, opts) => {
                    addTabAndFocusStartSearch(url, opts);
                    setZenSidebarRevealed(false);
                  }}
                  onPinTab={toggleTabPinned}
                  onToggleTabMute={toggleTabMute}
                  onDragStartTab={setDraggedTabId}
                  onDragEndTab={() => setDraggedTabId(null)}
                  onMoveTab={moveTab}
                  onCycleMode={() => {
                    setZenFloatingMode(zenFloatingMode === 'expanded' ? 'slim' : 'expanded');
                  }}
                  onSetMode={(m) => {
                    if (m === 'hidden') {
                      setZenSidebarRevealed(false);
                    } else {
                      setZenFloatingMode(m);
                    }
                  }}
                  activeSpacePath={activeSpacePath}
                  spaces={spaces}
                  onSelectSpace={(path) => {
                    handleSpaceSelect(path);
                    setZenSidebarRevealed(false);
                  }}
                  onCreateSpace={() => {
                    setSpaceSetupModalOpen(true);
                    setZenSidebarRevealed(false);
                  }}
                  onOpenSettings={() => {
                    setActivePanel('settings');
                    setZenSidebarRevealed(false);
                  }}
                  onOpenHistory={() => {
                    usePanelStore.getState().setHistoryOpen(!usePanelStore.getState().historyOpen);
                    setZenSidebarRevealed(false);
                  }}
                  onOpenDownloads={() => {
                    usePanelStore.getState().setDownloadsOpen(!usePanelStore.getState().downloadsOpen);
                    setZenSidebarRevealed(false);
                  }}
                  onOpenExtensions={() => {
                    openExtensionHub();
                    setZenSidebarRevealed(false);
                  }}
                  onOpenPermissions={() => {
                    usePanelStore.getState().setPermissionsOpen(true);
                    setZenSidebarRevealed(false);
                  }}
                  onOpenApp={(app, opts) => {
                    setZenSidebarRevealed(false);
                    if (app.panel) {
                      setActivePanel(app.panel);
                    } else if (app.url) {
                      if (opts?.newTab) {
                        addTab(app.url, { pinned: true });
                      } else {
                        const existingTabs = useTabStore.getState().tabs;
                        const appDomain = (() => {
                          try { return new URL(app.url).hostname.replace(/^www\./, ''); } catch { return ''; }
                        })();
                        const match = existingTabs.find(t => {
                          if (!t.url) return false;
                          try {
                            const d = new URL(t.url).hostname.replace(/^www\./, '');
                            return d === appDomain || d.endsWith(`.${appDomain}`);
                          } catch { return false; }
                        });
                        if (match) {
                          if (match.isDiscarded) wakeTab(match.id);
                          setActiveTabId(match.id);
                          setActivePanel('browser');
                        } else {
                          addTab(app.url, { pinned: true });
                        }
                      }
                    }
                  }}
                  onAddPinnedApp={() => { setPinnedEditApp(null); setPinnedModalOpen(true); }}
                  onEditPinnedApp={(app) => { setPinnedEditApp(app); setPinnedModalOpen(true); }}
                  activeTabUrl={activeTab?.url}
                  openTabUrls={tabs.map(t => t.url ?? '').filter(Boolean)}
                  botName={setupState.botName || 'Nova'}
                  onWakeTab={wakeTab}
                  activePanel={activePanel}
                  onSelectPanel={(panel) => {
                    setActivePanel(panel);
                    setZenSidebarRevealed(false);
                  }}
                  drawerTab={sidebarDrawerTab}
                  onSelectDrawerTab={setSidebarDrawerTab}
                  zenExitDefaultMode={zenExitDefaultMode}
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onSelectSession={(sessionId) => {
                    setActiveSessionId(sessionId);
                    setActivePanel('chat');
                    setZenSidebarRevealed(false);
                  }}
                  onCreateSession={() => void createNativeSession()}
                  splitTabIds={splitTabIds}
                  onAddSplitTab={addSplitTab}
                  onRemoveSplitTab={removeSplitTab}
                />
              </div>
            </>
          )}

          <div className={`browser-zen-workspace mode-${sidebarMode} dock-pos-${dockSettings.position}`}>
            <SidekickSidebar
              mode={sidebarMode}
              onRevealZen={handleZenSidebarEnter}
              tabs={tabs}
              activeTabId={activeTab.id}
              draggedTabId={draggedTabId}
              onActivateTab={(tabId) => {
                activeTabIdRef.current = tabId;
                setActiveTabId(tabId);
                setActivePanel('browser');
              }}
              onCloseTab={closeTab}
              onNewTab={(url, opts) => addTabAndFocusStartSearch(url, opts)}
              onPinTab={toggleTabPinned}
              onToggleTabMute={toggleTabMute}
              onDragStartTab={setDraggedTabId}
              onDragEndTab={() => setDraggedTabId(null)}
              onMoveTab={moveTab}
              onCycleMode={cycleSidebarMode}
              onSetMode={setSidebarMode}
              activeSpacePath={activeSpacePath}
              spaces={spaces}
              onSelectSpace={handleSpaceSelect}
              onCreateSpace={() => setSpaceSetupModalOpen(true)}
              onOpenSettings={() => setActivePanel('settings')}
              onOpenHistory={() => usePanelStore.getState().setHistoryOpen(!usePanelStore.getState().historyOpen)}
              onOpenDownloads={() => usePanelStore.getState().setDownloadsOpen(!usePanelStore.getState().downloadsOpen)}
              onOpenExtensions={() => {
                openExtensionHub();
              }}
              onOpenPermissions={() => usePanelStore.getState().setPermissionsOpen(true)}
              onOpenApp={(app, opts) => {
                if (app.panel) {
                  setActivePanel(app.panel);
                } else if (app.url) {
                  if (opts?.newTab) {
                    addTab(app.url, { pinned: true });
                  } else {
                    // Singleton routing: focus existing tab if domain matches
                    const existingTabs = useTabStore.getState().tabs;
                    const appDomain = (() => {
                      try { return new URL(app.url).hostname.replace(/^www\./, ''); } catch { return ''; }
                    })();
                    const match = existingTabs.find(t => {
                      if (!t.url) return false;
                      try {
                        const d = new URL(t.url).hostname.replace(/^www\./, '');
                        return d === appDomain || d.endsWith(`.${appDomain}`);
                      } catch { return false; }
                    });
                    if (match) {
                      if (match.isDiscarded) wakeTab(match.id);
                      setActiveTabId(match.id);
                      setActivePanel('browser');
                    } else {
                      addTab(app.url, { pinned: true });
                    }
                  }
                }
              }}
              onAddPinnedApp={() => { setPinnedEditApp(null); setPinnedModalOpen(true); }}
              onEditPinnedApp={(app) => { setPinnedEditApp(app); setPinnedModalOpen(true); }}
              activeTabUrl={activeTab?.url}
              openTabUrls={tabs.map(t => t.url ?? '').filter(Boolean)}
              botName={setupState.botName || 'Nova'}
              onWakeTab={wakeTab}
              activePanel={activePanel}
              onSelectPanel={(panel) => setActivePanel(panel)}
              drawerTab={sidebarDrawerTab}
              onSelectDrawerTab={setSidebarDrawerTab}
              zenExitDefaultMode={zenExitDefaultMode}
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={(sessionId) => {
                setActiveSessionId(sessionId);
                setActivePanel('chat');
              }}
              onCreateSession={() => void createNativeSession()}
              splitTabIds={splitTabIds}
              onAddSplitTab={addSplitTab}
              onRemoveSplitTab={removeSplitTab}
            />

            <div className={`browser-content-area ${copilotOpen ? 'with-copilot-split' : 'full-canvas'}`}>
              <div className="browser-canvas-pane">
                <BrowserMain
                  activePanel={activePanel}
                  activeSession={activeSession}
                  activeSessionId={activeSessionId}
                  activeTab={activeTab}
                  pendingStartSearchFocus={pendingStartSearchFocus}
                  onStartSearchFocusConsumed={() => setPendingStartSearchFocus(current => current?.tabId === activeTab.id ? null : current)}
                  onToggleDevTools={toggleDevTools}
                  onDevToolsOpenChange={setDevToolsOpen}
                  activeProfile={activeProfile}
                  profiles={profiles}
                  activeProfileId={activeProfileId}
                  activeBackendProfileName={activeBackendProfileName}
                  onSelectProfile={switchProfile}
                  onCreateProfile={createProfileEntry}
                  onRenameProfile={renameProfileEntry}
                  onDeleteProfile={deleteProfileEntry}
                  lastChatTurnUsage={lastChatTurnUsage}
                  nativeModelResolutionNotice={nativeModelResolutionNotice}
                  webviewStartupReady={windowStartupReady}
                  onTransferredWebviewReady={handleTransferredWebviewReady}
                  pendingTransferredTabId={pendingDetachedTransfer?.tabId ?? null}
                  onboardingStatus={onboardingStatus}
                  tabs={tabs}
                  audioKeepalive={audioKeepalive}
                  splitTabIds={splitTabIds}
                  splitSlotIndexes={splitSlotIndexes}
                  splitLayout={splitLayout}
                  snapRatios={snapRatios}
                  onSetSnapRatio={handleSetSnapRatio}
                  onSetSnapGroup={handleSetSnapGroup}
                  onDetachTab={handleDetachTab}
                  draggedTabId={draggedTabId}
                  onActivateTab={(tabId) => {
                    activeTabIdRef.current = tabId;
                    setActiveTabId(tabId);
                  }}
                  onAddSplitTab={addSplitTab}
                  onRemoveSplitTab={removeSplitTab}
                  onSetSplitLayout={setSplitLayout}
                  onReopenSetup={reopenSetupFromSettings}
                  busy={sidekickBusy}
                  chatError={chatError}
                  chatMessages={chatMessages}
                  chatRunState={chatRunState}
                  composerMode={composerMode}
                  composerText={composerText}
                  bookmarks={bookmarks}
                  serviceStatus={status}
                  sessionLoading={activeSessionLoading}
                  setupModel={setupState.model}
                  spaces={spaces}
                  activeSpacePath={activeSpacePath}
                  browserMode={browserMode}
                  browserLoadError={browserLoadError}
                  visitedSites={visitedSites}
                  browserFrameRef={browserFrameRef}
                  activeContextItem={activeContextItem}
                  webviewRef={webviewRef}
                  onAction={runSidekickAction}
                  onComposerMode={setComposerMode}
                  onComposerText={setComposerText}
                  onCreateSession={() => void createNativeSession()}
                  onAddSpace={(path, name) => void addSpaceNative(path, name)}
                  onMoveSpace={(space, direction) => void moveSpaceNative(space, direction)}
                  onNavigate={navigate}
                  onInstalledSidebarApp={(panel) => setInstalledSidebarApps((current) => Array.from(new Set([...current, panel])))}
                  onUninstalledSidebarApp={(panel) => setInstalledSidebarApps((current) => current.filter((item) => item !== panel))}
                  onWebviewNavigate={updateUrl}
                  onWebviewTitle={updateTitle}
                  onWebviewFavicon={updateFavicon}
                  onWebviewLoading={updateLoading}
                  onWebviewMediaPlaying={updateMediaPlaying}
                  hasActiveDownloads={hasActiveDownloads}
                  onRemoveSpace={(space) => void removeSpaceNative(space)}
                  onRenameSpace={(space) => void renameSpaceNative(space)}
                  onSelectSpace={handleSpaceSelect}
                  onNativeCommandAction={handleNativeCommandAction}
                  onSendChat={(message, effort) => void startNativeChat(message, message, undefined, effort)}
                  onStopChat={() => void stopNativeChat()}
                  onClearBrowserError={() => setBrowserLoadError('')}
                  onSetBrowserError={setBrowserLoadError}
                  onRemoveVisit={removeHistoryEntry}
                  onClearHistory={clearHistory}
                  onReopenClosedTab={reopenClosedTab}
                  searchEngineId={searchEngineId}
                  onSearchEngineChange={setSearchEngineId}
                  desktopSettings={desktopSettings}
                />
              </div>

              {copilotOpen && (quickChatMode ? <CopilotSplitView
                isOpen
                onClose={() => setCopilotOpen(false)}
                botName={setupState.botName || 'Nova'}
                modelName={copilotModelSelection.model || setupState.model || 'AI'}
                modelProvider={copilotModelSelection.provider}
                messages={isQuickChatScopeVisible(quickChatTranscriptScopeKeyRef.current, `${activeProfileId}::${activeSpacePath}::${activeBackendProfileName || ''}`)
                  ? quickChatMessages : []}
                busy={quickChatBusy && isQuickChatScopeVisible(quickChatBindingScopeKeyRef.current ?? quickChatStartPromiseRef.current?.scopeKey ?? null,
                  `${activeProfileId}::${activeSpacePath}::${activeBackendProfileName || ''}`)}
                error={isQuickChatScopeVisible(quickChatErrorScopeKeyRef.current, `${activeProfileId}::${activeSpacePath}::${activeBackendProfileName || ''}`) ? quickChatError : ''}
                status={isQuickChatScopeVisible(quickChatStatusScopeKeyRef.current, `${activeProfileId}::${activeSpacePath}::${activeBackendProfileName || ''}`) ? quickChatStatus : ''}
                allowWorkflows={false}
                onSwitchToSpaceAssistant={() => setQuickChatMode(false)}
                onSendMessage={text => void sendQuickChat(text)}
                onStopChat={() => void stopQuickChat()}
                activeUrl={activeTab.url}
                activeTitle={activeTab.title}
                quickActions={quickActions}
                onExecuteQuickAction={handleExecuteQuickAction}
                onSelectModel={(model, provider) => {
                  useChatStore.getState().setSelectedModel(model);
                  useChatStore.getState().setSelectedModelProvider(provider || '');
                  void (async () => {
                    const resolved = await assistantController.resolveScope(
                      { browserProfileId: activeProfileIdRef.current, workspacePath: activeSpacePathRef.current || null },
                      activeBackendProfileNameRef.current || undefined
                    );
                    if (!resolved.ok) return;
                    const current = await assistantController.request({ schemaVersion: 1, operation: 'modelSelection',
                      scope: resolved.value.scope, payload: { action: 'get' } });
                    if (!current.ok) return;
                    await assistantController.request({ schemaVersion: 1, operation: 'modelSelection', scope: resolved.value.scope,
                      payload: { action: 'set', model, provider: provider || '', expectedRevision: current.value.revision,
                        clientRequestId: newIndependentRequestId() } });
                  })();
                }}
                onNewChat={() => resetQuickChat(true)}
                sessions={[]}
                browserProfileId={activeProfileId}
                workspacePath={activeSpacePath || null}
                backendProfileName={activeBackendProfileName}
                onOpenSettings={() => { setActiveContextItem('providers'); setActivePanel('settings'); }}
              /> : assistantSelection && assistantSelection.scope.browserProfileId === activeProfileId && ((assistantSelection.workspacePath === null && !activeSpacePath) || (assistantSelection.workspacePath && resolveCanonicalSpacePath(activeSpacePath, [{ path: assistantSelection.workspacePath }]) === assistantSelection.workspacePath)) ? <SpaceAssistantPanel
                  selection={assistantSelection}
                  controller={assistantController}
                   onOpenPluginBrowser={openPluginBrowserUrl}
                  onClose={() => setCopilotOpen(false)}
                  onSwitchToQuickChat={() => setQuickChatMode(true)}
                  beginSetup={newAssistantSpacePathRef.current === activeSpacePath}
                  setupSeed={newAssistantSpacePathRef.current === activeSpacePath ? newAssistantSeedRef.current : undefined}
                  onEnterSpace={() => { newAssistantSpacePathRef.current = null; newAssistantSeedRef.current = undefined; setCopilotOpen(false); }}
                  onOpenWorkChat={(sid, scope) => {
                    if (scope.spaceId !== assistantSelection.scope.spaceId || scope.backendProfileId !== assistantSelection.scope.backendProfileId) return;
                    activeSessionIdRef.current = sid; setActiveSessionId(sid); setActivePanel('chat'); void loadActiveSession(sid);
                  }}
                  onOpenProviderSettings={() => { setActiveContextItem('providers'); setActivePanel('settings'); }}
                  onOpenGlobalOverview={() => setAssistantOverviewScope(assistantSelection.scope)}
                  onSelectPageContext={async kind => {
                    const guest = [...document.querySelectorAll<Electron.WebviewTag>('webview[data-tab-id]')]
                      .find(view => view.getAttribute('data-tab-id') === activeTab.id);
                    if (!guest || webviewRef.current !== guest || !isWebviewReady(guest)) {
                      throw new Error('The active page is not ready yet.');
                    }
                    const result = await assistantController.request({ schemaVersion: 1, operation: 'selectedContext', scope: assistantSelection.scope,
                      payload: { guestWebContentsId: guest.getWebContentsId(), includePage: kind === 'page', clientRequestId: newIndependentRequestId() } });
                    if (!result.ok) throw new Error(result.error.code);
                    return [result.value.ref];
                  }}
                />
                : <aside className="copilot-split-view space-assistant" aria-label={t('spaceAssistant.title')}>
                    <button type="button" onClick={() => setCopilotOpen(false)}>{t('common.close')}</button>
                    <p role={assistantSelectionError ? 'alert' : 'status'}>{assistantSelectionError ? t('spaceAssistant.stale') : (activeSpacePath ? t('spaceAssistant.running') : t('spaceAssistant.setup'))}</p>
                    {assistantSelectionError && <details><summary>{t('common.error')}</summary><p>{assistantSelectionError}</p></details>}
                  </aside>
              )}
            </div>
          </div>

          {/* Shell-level Nova Dock: renders OUTSIDE the sidebar <aside> whenever
              the dock position is not 'left', so right/top/bottom/floating are
              never clipped by the sidebar's overflow constraints (goal.md Paket 5). */}
          {dockSettings.position !== 'left' && sidebarMode === 'slim' && (
            <NovaDock
              botName={setupState.botName || 'Nova'}
              activePanel={activePanel}
              activeTabUrl={activeTab?.url}
              openTabUrls={tabs.map(t => t.url ?? '').filter(Boolean)}
              onSelectPanel={(panel) => setActivePanel(panel)}
              onOpenApp={(app, opts) => {
                if (app.panel) {
                  setActivePanel(app.panel);
                } else if (app.url) {
                  if (opts?.newTab) {
                    addTab(app.url, { pinned: true });
                  } else {
                    const existingTabs = useTabStore.getState().tabs;
                    const appDomain = (() => {
                      try { return new URL(app.url).hostname.replace(/^www\./, ''); } catch { return ''; }
                    })();
                    const match = existingTabs.find(t => {
                      if (!t.url) return false;
                      try {
                        const d = new URL(t.url).hostname.replace(/^www\./, '');
                        return d === appDomain || d.endsWith(`.${appDomain}`);
                      } catch { return false; }
                    });
                    if (match) {
                      if (match.isDiscarded) wakeTab(match.id);
                      setActiveTabId(match.id);
                      setActivePanel('browser');
                    } else {
                      addTab(app.url, { pinned: true });
                    }
                  }
                }
              }}
              onAddPinnedApp={() => { setPinnedEditApp(null); setPinnedModalOpen(true); }}
              onEditPinnedApp={(app) => { setPinnedEditApp(app); setPinnedModalOpen(true); }}
              onOpenHistory={() => usePanelStore.getState().setHistoryOpen(!usePanelStore.getState().historyOpen)}
              onOpenSettings={() => setActivePanel('settings')}
              onNewTab={(url) => addTabAndFocusStartSearch(url)}
              onExpandSidebar={() => setSidebarMode('expanded')}
              spacePath={activeSpacePath}
            />
          )}
        </>
      ) : (
        <>
          <WindowTitlebar
            tabs={tabs}
            activeTabId={activeTab.id}
            draggedTabId={draggedTabId}
            onActivateTab={(tabId) => {
              activeTabIdRef.current = tabId;
              setActiveTabId(tabId);
              setActivePanel('browser');
            }}
            onCloseTab={closeTab}
            onMoveTab={moveTab}
            onNewTab={() => addTabAndFocusStartSearch()}
            onPinTab={toggleTabPinned}
            onToggleTabMute={toggleTabMute}
            onDragStartTab={setDraggedTabId}
            onDragEndTab={() => setDraggedTabId(null)}
            onAddSplitTab={addSplitTab}
          />
          <div className="browser-chrome">
            <header
              className={`topbar ${windowMaximized ? 'is-maximized' : ''}`}
              onDoubleClick={handleTopbarDoubleClick}
              onMouseDown={handleTopbarMouseDown}
            >
              <div className="traffic-actions">
                <button type="button" aria-label="Back" onClick={() => webviewRef.current?.goBack()}><ChevronLeft size={17} /></button>
                <button type="button" aria-label="Forward" onClick={() => webviewRef.current?.goForward()}><ChevronRight size={17} /></button>
                <button
                  type="button"
                  aria-label={activeTab.isLoading ? 'Stop loading' : 'Reload'}
                  onClick={() => {
                    if (activeTab.isLoading) {
                      try {
                        webviewRef.current?.stop();
                      } catch {
                        // ignore
                      }
                      updateLoading(activeTab.id, false);
                    } else {
                      webviewRef.current?.reload();
                    }
                  }}
                >
                  {activeTab.isLoading ? <X size={16} /> : <RefreshCw size={16} />}
                </button>
              </div>
              <AddressBar
                value={addressValue}
                onChange={setAddressValue}
                onSubmit={navigate}
                bookmarks={bookmarks}
                visits={visitedSites}
                searchEngineId={searchEngineId}
                activeBookmarkable={activeBookmarkable}
                activeBookmarked={activeBookmarked}
                onToggleBookmark={toggleActiveBookmark}
                inputRef={addressInputRef}
              />
              <SpaceSelector
                activePath={activeSpacePath}
                error={spacesError}
                spaces={spaces}
                onOpenSpaces={() => setActivePanel('workspaces')}
                onSelect={handleSpaceSelect}
              />
              <div className={`runtime-pill ${status?.sidekick === 'ready' ? 'ready' : 'starting'}`}>
                <span className="status-dot" />
                <span>{status?.sidekick === 'ready' ? 'sidekick online' : 'sidekick starting'}</span>
              </div>
              <UpdatePill status={updateStatus} />
            </header>
            <BookmarkBar
              activeBookmarkable={activeBookmarkable}
              activeBookmarked={activeBookmarked}
              bookmarks={bookmarks}
              onNavigate={navigate}
              onRemove={removeBookmarkItem}
              onToggleActive={toggleActiveBookmark}
              onImport={importBookmarkItems}
            />
          </div>

          <main
            className={`workspace ${leftSidebarCollapsed ? 'left-collapsed' : ''} ${contextSidebarCollapsed ? 'context-collapsed' : ''} ${workspacePanelCollapsed ? 'workspace-collapsed' : ''}`}
            style={{
              '--left-rail-width': `${leftSidebarCollapsed ? COLLAPSED_LEFT_RAIL_WIDTH : DEFAULT_LEFT_RAIL_WIDTH}px`,
              '--context-sidebar-width': `${contextSidebarCollapsed ? COLLAPSED_PANEL_WIDTH : contextSidebarWidth}px`,
              '--workspace-panel-width': `${workspacePanelCollapsed ? COLLAPSED_PANEL_WIDTH : workspacePanelWidth}px`
            } as React.CSSProperties}
          >
            <ShellRail
              activePanel={activePanel}
              leftCollapsed={leftSidebarCollapsed}
              installedSidebarApps={installedSidebarApps}
              onPanel={(panel) => {
                setActivePanel(panel);
                if (panel === 'browser') {
                  setBrowserMode('search');
                }
              }}
              onToggleLeft={() => setLeftSidebarCollapsed((current) => !current)}
            />
            <ContextSidebar
              activePanel={activePanel}
              activeSessionId={activeSessionId}
              busy={sidekickBusy}
              collapsed={contextSidebarCollapsed}
              activeContextItem={activeContextItem}
              messages={messages}
              search={sessionSearch}
              sessions={sessions}
              serviceStatus={status}
              sessionError={sessionError}
              projects={projects}
              activeProjectFilter={activeProjectFilter}
              activeTagFilter={activeTagFilter}
              onAction={runSidekickAction}
              onNewSession={() => void createNativeSession()}
              onPanel={setActivePanel}
              onDeleteSession={(session) => void deleteNativeSession(session)}
              onDuplicateSession={(session) => void duplicateNativeSession(session)}
              onRenameSession={(session) => void renameNativeSession(session)}
              onPinSession={(session) => (session.pinned ? unpinNativeSession : pinNativeSession)(session)}
              onArchiveSession={(session) => archiveNativeSession(session)}
              onSearch={setSessionSearch}
              onSelectSession={(sessionId) => {
                setActiveSessionId(sessionId);
                setActivePanel('chat');
              }}
              onContextItemChange={setActiveContextItem}
              onBrowserModeChange={setBrowserMode}
              onToggleCollapse={() => setContextSidebarCollapsed((current) => !current)}
              onResizeStart={(event) => beginSidebarResize('context', event)}
              onProjectFilter={setActiveProjectFilter}
              onTagFilter={setActiveTagFilter}
            />
            <BrowserMain
              activePanel={activePanel}
              activeSession={activeSession}
              activeSessionId={activeSessionId}
              activeTab={activeTab}
              pendingStartSearchFocus={pendingStartSearchFocus}
              onStartSearchFocusConsumed={() => setPendingStartSearchFocus(current => current?.tabId === activeTab.id ? null : current)}
              onToggleDevTools={toggleDevTools}
              onDevToolsOpenChange={setDevToolsOpen}
              activeProfile={activeProfile}
              profiles={profiles}
              activeProfileId={activeProfileId}
              activeBackendProfileName={activeBackendProfileName}
              onSelectProfile={switchProfile}
              onCreateProfile={createProfileEntry}
              onRenameProfile={renameProfileEntry}
              onDeleteProfile={deleteProfileEntry}
              lastChatTurnUsage={lastChatTurnUsage}
              nativeModelResolutionNotice={nativeModelResolutionNotice}
              webviewStartupReady={windowStartupReady}
              onTransferredWebviewReady={handleTransferredWebviewReady}
              pendingTransferredTabId={pendingDetachedTransfer?.tabId ?? null}
              onboardingStatus={onboardingStatus}
              tabs={tabs}
              audioKeepalive={audioKeepalive}
              splitTabIds={splitTabIds}
              splitSlotIndexes={splitSlotIndexes}
              splitLayout={splitLayout}
              snapRatios={snapRatios}
              onSetSnapRatio={handleSetSnapRatio}
              onSetSnapGroup={handleSetSnapGroup}
              onDetachTab={handleDetachTab}
              draggedTabId={draggedTabId}
              onActivateTab={setActiveTabId}
              onAddSplitTab={addSplitTab}
              onRemoveSplitTab={removeSplitTab}
              onSetSplitLayout={setSplitLayout}
              onReopenSetup={reopenSetupFromSettings}
              busy={sidekickBusy}
              chatError={chatError}
              chatMessages={chatMessages}
              chatRunState={chatRunState}
              composerMode={composerMode}
              composerText={composerText}
              bookmarks={bookmarks}
              serviceStatus={status}
              sessionLoading={activeSessionLoading}
              setupModel={setupState.model}
              botName={setupState.botName || 'Nova'}
              spaces={spaces}
              activeSpacePath={activeSpacePath}
              browserMode={browserMode}
              browserLoadError={browserLoadError}
              visitedSites={visitedSites}
              browserFrameRef={browserFrameRef}
              activeContextItem={activeContextItem}
              webviewRef={webviewRef}
              onAction={runSidekickAction}
              onComposerMode={setComposerMode}
              onComposerText={setComposerText}
              onCreateSession={() => void createNativeSession()}
              onAddSpace={(path, name) => void addSpaceNative(path, name)}
              onMoveSpace={(space, direction) => void moveSpaceNative(space, direction)}
              onNavigate={navigate}
              onInstalledSidebarApp={(panel) => setInstalledSidebarApps((current) => Array.from(new Set([...current, panel])))}
              onUninstalledSidebarApp={(panel) => setInstalledSidebarApps((current) => current.filter((item) => item !== panel))}
              onWebviewNavigate={updateUrl}
              onWebviewTitle={updateTitle}
              onWebviewFavicon={updateFavicon}
              onWebviewLoading={updateLoading}
              onWebviewMediaPlaying={updateMediaPlaying}
              hasActiveDownloads={hasActiveDownloads}
              onRemoveSpace={(space) => void removeSpaceNative(space)}
              onRenameSpace={(space) => void renameSpaceNative(space)}
              onSelectSpace={handleSpaceSelect}
              onNativeCommandAction={handleNativeCommandAction}
              onSendChat={(message, effort) => void startNativeChat(message, message, undefined, effort)}
              onStopChat={() => void stopNativeChat()}
              onClearBrowserError={() => setBrowserLoadError('')}
              onSetBrowserError={setBrowserLoadError}
              onRemoveVisit={removeHistoryEntry}
              onClearHistory={clearHistory}
              onReopenClosedTab={reopenClosedTab}
              searchEngineId={searchEngineId}
              onSearchEngineChange={setSearchEngineId}
              desktopSettings={desktopSettings}
            />
            <WorkspacePanel
              activeSessionId={activeSessionId}
              collapsed={workspacePanelCollapsed}
              entries={workspaceEntries}
              error={workspaceError}
              editing={workspaceEditing}
              draft={workspacePreviewDraft}
              showHidden={workspaceShowHidden}
              path={workspacePath}
              preview={workspacePreview}
              serviceStatus={status}
              onEntry={readWorkspaceEntry}
              onCreateFile={() => void createWorkspaceFileNative()}
              onCreateFolder={() => void createWorkspaceFolderNative()}
              onDeleteEntry={(entry) => void deleteWorkspaceEntryNative(entry)}
              onDraft={setWorkspacePreviewDraft}
              onRenameEntry={(entry) => void renameWorkspaceEntryNative(entry)}
              onSavePreview={() => void saveWorkspacePreviewNative()}
              onToggleEditing={() => setWorkspaceEditing((current) => !current)}
              onToggleHidden={() => setWorkspaceShowHidden((current) => !current)}
              onParent={() => {
                setWorkspacePath(parentPath(workspacePath));
                setWorkspacePreview(null);
                setWorkspacePreviewDraft('');
                setWorkspaceEditing(false);
              }}
              onRefresh={() => setWorkspaceRefreshNonce((current) => current + 1)}
              onToggle={() => setWorkspacePanelCollapsed((current) => !current)}
              onResizeStart={(event) => beginSidebarResize('workspace', event)}
            />
          </main>
        </>
      )}
        {!setupLoading && setupRequired && (
          <FirstRunSetupPane
            browserProfileId={activeProfileId}
            workspacePath={activeSpacePath}
            backendProfileName={activeBackendProfileName || activeSession?.profile || null}
            aiChoice={firstRunAiChoiceForSetup(setupState)}
            status={status}
            onboardingStatus={onboardingStatus}
            setupLoading={setupLoading}
            error={setupError}
            saving={setupSaving}
            onRefreshOnboarding={refreshOnboardingStatus}
            onChooseAi={saveFirstRunAiChoice}
            onCompleteBrowserSetup={completeBrowserOnlySetup}
            onSubmit={completeSetup}
            onDismiss={() => {
              setSetupReopenRequested(false);
              setSetupDismissed(true);
              try {
                window.localStorage.setItem('lastbrowser.setupDismissed', '1');
              } catch {
                // Storage unavailable — the wizard stays dismissed for this session.
              }
            }}
          />
        )}
        <PinnedAppModal
          isOpen={pinnedModalOpen}
          onClose={() => { setPinnedModalOpen(false); setPinnedEditApp(null); }}
          editApp={pinnedEditApp}
          activeTab={activeTab ? { title: activeTab.title, url: activeTab.url, favicon: activeTab.favicon } : null}
          defaultSpacePath={activeSpacePath}
        />
        {canPresentWhatsNew && whatsNewCandidate && (
          <WhatsNewModal candidate={whatsNewCandidate} onClose={() => {
            void window.lastbrowser.updates.acknowledgeWhatsNew(whatsNewCandidate.toVersion).catch((error: unknown) => {
              console.warn('[updates] Could not persist dismissed release notes:', error);
            });
            setWhatsNewCandidate(null);
          }} />
        )}
        {assistantOverviewScope?.browserProfileId === activeProfileId && <IndependentActivityOverview
          scope={assistantOverviewScope} controller={assistantController} onClose={() => setAssistantOverviewScope(null)}
          onOpenSpace={async (space, sessionId) => {
            if (!assistantOverviewScope || space.scope.backendProfileId !== assistantOverviewScope.backendProfileId || space.scope.browserProfileId !== activeProfileIdRef.current || space.workspacePath === undefined) throw new Error('Space changed');
            const selectionRevision = activeSpaceSelectionRevisionRef.current;
            const selected = await assistantController.request({ schemaVersion: 1, operation: 'resolveScope', scope: assistantOverviewScope,
              payload: { browserProfileId: space.scope.browserProfileId, workspacePath: space.workspacePath, nativeSpaceId: space.scope.spaceId } });
            if (!selected.ok || selectionRevision !== activeSpaceSelectionRevisionRef.current || selected.value.scope.backendProfileId !== space.scope.backendProfileId || selected.value.scope.spaceId !== space.scope.spaceId || selected.value.scope.browserProfileId !== activeProfileIdRef.current) throw new Error('Space unavailable');
            const path = selected.value.workspacePath || '';
            if (sessionId && path !== activeSpacePathRef.current) pendingIndependentChatRef.current = { scope: space.scope, path, sessionId };
            handleSpaceSelect(path); activeSpacePathRef.current = path; setAssistantOverviewScope(null);
            if (sessionId) { activeSessionIdRef.current = sessionId; setActiveSessionId(sessionId); setActivePanel('chat'); }
            else { setQuickChatMode(false); setActivePanel('browser'); setCopilotOpen(true); }
          }} />}
        <SpaceSetupModal
          isOpen={spaceSetupModalOpen}
          onClose={() => setSpaceSetupModalOpen(false)}
          onCreateSpace={handleCreateSpaceFromModal}
          existingSpaceNames={spaces.map(spaceDisplayName)}
        />
        {ambiguousSpace && (
          <AmbiguousBackendProfileModal
            isOpen={true}
            browserProfileId={ambiguousSpace.browserProfileId}
            workspacePath={ambiguousSpace.workspacePath}
            onSelectProfile={(profileName) => {
              const key = `${ambiguousSpace.browserProfileId}::${ambiguousSpace.workspacePath || ''}`;
              setExplicitBackendProfileBySpace(prev => ({
                ...prev,
                [key]: profileName,
              }));
              setAmbiguousSpace(null);
            }}
            onClose={() => setAmbiguousSpace(null)}
          />
        )}
        <DownloadsPanel open={downloadsOpen} onClose={() => setDownloadsOpen(false)} />
        <CommandPalette onToggleTabPinned={toggleTabPinned} onToggleTabMute={toggleTabMute} />

    </div>
  );
}

function BrowserMain({
  activePanel,
  activeSession,
  activeSessionId,
  activeTab,
  pendingStartSearchFocus,
  onStartSearchFocusConsumed,
  onToggleDevTools,
  onDevToolsOpenChange,
  activeProfile,
  profiles,
  activeProfileId,
  activeBackendProfileName,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  webviewStartupReady = true,
  onTransferredWebviewReady = () => undefined,
  pendingTransferredTabId = null,
  onboardingStatus,
  onReopenSetup,
  busy,
  chatError,
  chatMessages,
  chatRunState,
  activeContextItem,
  bookmarks,
  browserMode,
  composerMode,
  composerText,
  serviceStatus,
  sessionLoading,
  setupModel,
  spaces,
  activeSpacePath,
  browserLoadError,
  visitedSites,
  browserFrameRef,
  webviewRef,
  onAction,
  onAddSpace,
  onComposerMode,
  onComposerText,
  onCreateSession,
  onMoveSpace,
  onNavigate,
  onInstalledSidebarApp,
  onUninstalledSidebarApp,
  onWebviewNavigate,
  onWebviewTitle,
  onWebviewFavicon,
  onWebviewLoading,
  onWebviewMediaPlaying,
  hasActiveDownloads,
  onRemoveSpace,
  onRenameSpace,
  onSelectSpace,
  onSendChat,
  onNativeCommandAction,
  onStopChat,
  onClearBrowserError,
  onSetBrowserError,
  onRemoveVisit,
  onClearHistory,
  onReopenClosedTab,
  searchEngineId,
  onSearchEngineChange,
  tabs,
  audioKeepalive = [],
  splitTabIds = [],
  splitSlotIndexes = [],
  splitLayout = 'columns',
  snapRatios,
  onSetSnapRatio,
  draggedTabId,
  onActivateTab,
  onAddSplitTab,
  onRemoveSplitTab,
  onSetSnapGroup,
  onDetachTab,
  onSetSplitLayout,
  botName = 'Nova',
  desktopSettings = null,
  lastChatTurnUsage = null,
  nativeModelResolutionNotice = null
}: {
  activePanel: LastbrowserPanelId;
  activeSession: DesktopSessionDetail | null;
  activeSessionId: string | null;
  activeTab: BrowserTab;
  pendingStartSearchFocus: { tabId: string; expiresAt: number } | null;
  onStartSearchFocusConsumed: () => void;
  onToggleDevTools: () => void;
  onDevToolsOpenChange: (isOpen: boolean) => void;
  activeProfile: BrowserProfile;
  profiles: BrowserProfile[];
  activeProfileId: string;
  activeBackendProfileName?: string;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (name: string) => void;
  onRenameProfile: (profileId: string, name: string) => void;
  onDeleteProfile: (profileId: string) => void;
  webviewStartupReady?: boolean;
  onTransferredWebviewReady?: (tabId: string, guestWebContentsId: number) => void;
  pendingTransferredTabId?: string | null;
  onboardingStatus: OnboardingStatus | null;
  onReopenSetup: () => void;
  busy: boolean;
  chatError: string;
  chatMessages: DesktopChatMessage[];
  chatRunState: ChatRunState;
  activeContextItem: string;
  bookmarks: BrowserBookmark[];
  browserMode: 'home' | 'search' | 'web';
  composerMode: ComposerMode;
  composerText: string;
  serviceStatus: ServiceStatus | null;
  sessionLoading: boolean;
  setupModel: string;
  spaces: SpaceSummary[];
  activeSpacePath: string;
  browserLoadError: string;
  visitedSites: BrowserVisit[];
  browserFrameRef: React.MutableRefObject<HTMLDivElement | null>;
  webviewRef: React.MutableRefObject<Electron.WebviewTag | null>;
  onAction: (action: SidekickActionId) => Promise<void>;
  onAddSpace: (path: string, name: string) => void;
  onComposerMode: (mode: ComposerMode) => void;
  onComposerText: (text: string) => void;
  onCreateSession: () => void;
  onMoveSpace: (space: SpaceSummary, direction: -1 | 1) => void;
  onNavigate: (url: string) => void;
  onInstalledSidebarApp: (panel: LastbrowserPanelId) => void;
  onUninstalledSidebarApp: (panel: LastbrowserPanelId) => void;
  onWebviewNavigate: (tabId: string, url: string) => void;
  onWebviewTitle: (tabId: string, title: string) => void;
  onWebviewFavicon?: (tabId: string, favicon: string) => void;
  onWebviewLoading?: (tabId: string, isLoading: boolean) => void;
  onWebviewMediaPlaying?: (tabId: string, isPlaying: boolean) => void;
  hasActiveDownloads?: boolean;
  onRemoveSpace: (space: SpaceSummary) => void;
  onRenameSpace: (space: SpaceSummary) => void;
  onSelectSpace: (path: string) => void;
  onSendChat: (message: string, reasoningEffort?: string) => void;
  onNativeCommandAction:(action:CommandAction)=>Promise<void>|void;
  onStopChat: () => void;
  onClearBrowserError: () => void;
  onSetBrowserError: (error: string) => void;
  onRemoveVisit: (url: string) => void;
  onClearHistory: () => void;
  onReopenClosedTab: () => void;
  searchEngineId: string;
  onSearchEngineChange: (id: string) => void;
  tabs?: BrowserTab[];
  audioKeepalive?: SpaceAudioKeepaliveEntry[];
  splitTabIds?: string[];
  splitSlotIndexes?: number[];
  splitLayout?: SplitLayoutMode;
  snapRatios: SnapLayoutRatios;
  onSetSnapRatio: (axis: 'x' | 'y', index: number, ratio: number) => void;
  draggedTabId?: string | null;
  onActivateTab?: (tabId: string) => void;
  onAddSplitTab?: (tabId: string) => void;
  onRemoveSplitTab?: (tabId: string) => void;
  onSetSnapGroup?: (layout: SnapLayoutType, tabIds: string[], slotIndexes?: number[]) => void;
  onDetachTab?: (tab: BrowserTab, screenX?: number, screenY?: number, guestWebContentsId?: number) => void;
  onSetSplitLayout?: (layout: SplitLayoutMode) => void;
  botName?: string;
  desktopSettings?: DesktopSettingsRecord | null;
  lastChatTurnUsage?: { sessionId: string; usage: NativeChatTurnUsage } | null;
  nativeModelResolutionNotice?: { sessionId: string; profileId: string; spacePath: string; backendProfileName: string | null; resolution: NativeModelResolution } | null;
}): JSX.Element {
  const { t } = useDesktopI18n();
  const modelFallbackNotice = nativeModelResolutionNotice && nativeModelResolutionNotice.sessionId === activeSessionId
    && nativeModelResolutionNotice.profileId === activeProfileId && nativeModelResolutionNotice.spacePath === activeSpacePath
    && nativeModelResolutionNotice.backendProfileName === (activeBackendProfileName ?? null)
    ? t('chat.modelFallbackSubscriptionUsed', { model: nativeModelResolutionNotice.resolution.effective.model }) : null;
  const browserWebviewStyle = {
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0
  } as React.CSSProperties;

  const knownSpacePaths = spaces.map((space) => space.path);
  const activeTabs = tabs && tabs.length > 0 ? tabs : [activeTab];
  const activeTabIds = new Set(activeTabs.map((tab) => tab.id));
  const keepaliveById = new Map(
    audioKeepalive
      .filter((entry) => entry.profileId === activeProfile.id && entry.spacePath !== activeSpacePath)
      .map((entry) => [entry.tab.id, entry] as const)
  );
  const renderedTabs = mergeSpaceAudioTabs(activeTabs, audioKeepalive, activeSpacePath, activeProfile.id);



  // Electron creates the guest webContents with the size the <webview> had at
  // mount time, and later CSS/size changes on that element do NOT resize the
  // guest (verified: explicit px size and display toggles both leave the guest
  // at its initial height). Only re-creating the element gives the guest the
  // correct bounds. So we mount the webview, then remount it once the frame
  // has been laid out — that second mount is the one that sticks.
  const [webviewReady, setWebviewReady] = useState(false);
  const [webviewMountKey, setWebviewMountKey] = useState(0);
  const [webviewReadinessRevision, setWebviewReadinessRevision] = useState(0);
  const allWebviewRefs = useRef<Record<string, Electron.WebviewTag>>({});
  const webviewNavigationCleanupRefs = useRef<Record<string, () => void>>({});
  const webviewReadinessCleanupRefs = useRef<Record<string, () => void>>({});
  const webviewRefCallbacks = useRef(new Map<string, React.RefCallback<Electron.WebviewTag>>());
  const smartInvertActive = usePanelStore((s) => s.visionImpaired.enabled && s.visionImpaired.smartInvertWebview);
  const transferredTabBootstrapIds = useRef(new Set<string>());
  const webviewMediaCleanupRefs = useRef<Record<string, () => void>>({});
  const onWebviewMediaPlayingRef = useRef(onWebviewMediaPlaying);
  onWebviewMediaPlayingRef.current = onWebviewMediaPlaying;
  const webviewEventHandlersRef = useRef({
    activeTabId: activeTab.id,
    onClearBrowserError,
    onTransferredWebviewReady,
    onSetBrowserError,
    onNavigate
  });
  webviewEventHandlersRef.current = {
    activeTabId: activeTab.id,
    onClearBrowserError,
    onTransferredWebviewReady,
    onSetBrowserError,
    onNavigate
  };
  const registerWebviewRef = useRef<(tabId: string, element: Electron.WebviewTag | null, previous: Electron.WebviewTag | null) => void>(() => {});
  registerWebviewRef.current = (tabId, element, previous) => {
    const existing = allWebviewRefs.current[tabId];
    if (element) {
      if (existing === element) return;
      if (existing) {
        webviewReadinessCleanupRefs.current[tabId]?.();
        webviewNavigationCleanupRefs.current[tabId]?.();
        webviewMediaCleanupRefs.current[tabId]?.();
      }
      allWebviewRefs.current[tabId] = element;
      const isCurrentElement = () => allWebviewRefs.current[tabId] === element;
      webviewReadinessCleanupRefs.current[tabId] = bindWebviewReadiness(
        element,
        isCurrentElement,
        () => setWebviewReadinessRevision((current) => current + 1)
      );
      const onDidStartLoading = () => {
        if (isCurrentElement() && tabId === webviewEventHandlersRef.current.activeTabId) {
          webviewEventHandlersRef.current.onClearBrowserError();
        }
      };
      const onDomReady = () => {
        if (!isCurrentElement() || !isWebviewReady(element)) return;
        void hideWebviewScrollbars(element);
        const config = usePanelStore.getState().visionImpaired;
        void refreshSmartInvertForWebview(element, config.enabled && config.smartInvertWebview);
        if (tabId === webviewEventHandlersRef.current.activeTabId) {
          try {
            webviewEventHandlersRef.current.onTransferredWebviewReady(tabId, element.getWebContentsId());
          } catch {
            // Electron can detach a guest while a navigation event is queued.
          }
        }
      };
      const onDidFailLoad = (rawEvent: Event) => {
        if (!isCurrentElement()) return;
        const event = rawEvent as Event & {
          isMainFrame?: boolean;
          errorCode?: number;
          errorDescription?: string;
        };
        if (!event.isMainFrame || event.errorCode === -3) return;
        if (tabId !== webviewEventHandlersRef.current.activeTabId) return;
        if ((event.errorCode ?? 0) < -100) {
          webviewEventHandlersRef.current.onSetBrowserError(`Connection failed (${event.errorDescription || 'unknown error'}). Returning to start page.`);
          setTimeout(() => {
            if (isCurrentElement() && tabId === webviewEventHandlersRef.current.activeTabId) {
              webviewEventHandlersRef.current.onNavigate(browserStartUrl);
            }
          }, 1500);
        } else {
          webviewEventHandlersRef.current.onSetBrowserError(`${event.errorCode}: ${event.errorDescription || 'Navigation failed'}`);
        }
      };
      element.addEventListener('did-start-loading', onDidStartLoading);
      element.addEventListener('dom-ready', onDomReady);
      element.addEventListener('did-fail-load', onDidFailLoad);
      webviewNavigationCleanupRefs.current[tabId] = () => {
        element.removeEventListener('did-start-loading', onDidStartLoading);
        element.removeEventListener('dom-ready', onDomReady);
        element.removeEventListener('did-fail-load', onDidFailLoad);
      };
      webviewMediaCleanupRefs.current[tabId]?.();
      webviewMediaCleanupRefs.current[tabId] = subscribeToWebviewMediaState(
        element,
        tabId,
        (id, isPlaying) => {
          if (isCurrentElement()) onWebviewMediaPlayingRef.current?.(id, isPlaying);
        }
      );
      if (tabId === webviewEventHandlersRef.current.activeTabId) webviewRef.current = element;
      return;
    }

    const removed = previous ?? existing;
    if (!removed || existing !== removed) return;
    webviewReadinessCleanupRefs.current[tabId]?.();
    webviewNavigationCleanupRefs.current[tabId]?.();
    webviewMediaCleanupRefs.current[tabId]?.();
    delete webviewReadinessCleanupRefs.current[tabId];
    delete webviewNavigationCleanupRefs.current[tabId];
    delete webviewMediaCleanupRefs.current[tabId];
    delete allWebviewRefs.current[tabId];
    if (webviewRef.current === removed) webviewRef.current = null;
  };
  const getWebviewRefCallback = (tabId: string): React.RefCallback<Electron.WebviewTag> => {
    let callback = webviewRefCallbacks.current.get(tabId);
    if (!callback) {
      let boundElement: Electron.WebviewTag | null = null;
      callback = (element) => {
        if (element) {
          boundElement = element;
          registerWebviewRef.current(tabId, element, null);
        } else {
          const previous = boundElement;
          boundElement = null;
          registerWebviewRef.current(tabId, null, previous);
        }
      };
      webviewRefCallbacks.current.set(tabId, callback);
    }
    return callback;
  };
  useEffect(() => {
    Object.values(allWebviewRefs.current).forEach((webview) => {
      if (smartInvertActive) void applySmartInvertToWebview(webview);
      else void removeSmartInvertFromWebview(webview);
    });
  }, [smartInvertActive]);
  // Keep hooks above the panel-specific returns below. BrowserMain is reused
  // while switching panels, so hooks after those returns change hook count.
  const superTabsActive = usePanelStore((s) => s.visionImpaired.enabled && s.visionImpaired.superSizedVerticalTabs);
  const splitMagnifierActive = usePanelStore((s) => s.visionImpaired.enabled && s.visionImpaired.splitScreenMagnifier);
  useEffect(() => () => {
    Object.values(webviewMediaCleanupRefs.current).forEach((cleanup) => cleanup());
    Object.values(webviewReadinessCleanupRefs.current).forEach((cleanup) => cleanup());
    Object.values(webviewNavigationCleanupRefs.current).forEach((cleanup) => cleanup());
    webviewMediaCleanupRefs.current = {};
    webviewReadinessCleanupRefs.current = {};
    webviewNavigationCleanupRefs.current = {};
    webviewRefCallbacks.current.clear();
    allWebviewRefs.current = {};
  }, []);
  const [snapFlyoutVisible, setSnapFlyoutVisible] = useState(false);
  const [snapDropTarget, setSnapDropTarget] = useState<GhostTarget | null>(null);
  const normalizedSnapLayout: SnapLayoutType = splitLayout in SNAP_LAYOUT_DEFINITIONS
    ? splitLayout as SnapLayoutType
    : splitTabIds.length === 4 ? 'quad-grid' : splitTabIds.length === 3 ? 'trio-columns' : 'dual-50-50';
  const splitGroupActive = splitTabIds.length > 1 && splitTabIds.includes(activeTab.id);
  function commitSnapDrop(layout: SnapLayoutType, slotIndex: number, draggedId = draggedTabId): void {
    if (!draggedId || !onSetSnapGroup) return;
    if (!tabs?.some((tab) => tab.id === draggedId)) return;
    const group = buildSnapGroupAfterDrop(layout, slotIndex, draggedId, {
      tabIds: splitTabIds,
      slotIndexes: splitSlotIndexes,
      activeTabId: activeTab.id,
      availableTabIds: tabs.map((tab) => tab.id)
    });
    onSetSnapGroup(layout, group.tabIds, group.slotIndexes);
    setSnapDropTarget(null);
    setSnapFlyoutVisible(false);
  }

  function handleSnapDragOver(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (!draggedTabId || !browserFrameRef.current) return;
    const rect = browserFrameRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(rect.height, 1)));
    const flyout = browserFrameRef.current.querySelector('.snap-bar-flyout.is-visible');
    const flyoutRect = flyout?.getBoundingClientRect();
    if (snapFlyoutVisible && flyoutRect && isPointInsideSnapFlyout(event.clientX, event.clientY, flyoutRect)) {
      setSnapDropTarget(null);
      return;
    }
    // Windows 11 style: flyout triggers only at top-center; corners trigger quad-grid snapping
    if (y < 0.16 && x >= 0.25 && x <= 0.75) {
      setSnapFlyoutVisible(true);
      setSnapDropTarget(null);
      return;
    }
    setSnapFlyoutVisible(false);
    if (splitGroupActive) {
      const definition = SNAP_LAYOUT_DEFINITIONS[normalizedSnapLayout];
      const targetSlot = definition.slots.findIndex((_slot, index) => {
        const bounds = getSnapSlotBounds(normalizedSnapLayout, index, snapRatios);
        return x >= bounds.left / 100 && x <= (bounds.left + bounds.width) / 100
          && y >= bounds.top / 100 && y <= (bounds.top + bounds.height) / 100;
      });
      if (targetSlot >= 0) {
        setSnapDropTarget({
          layout: normalizedSnapLayout,
          slotIndex: targetSlot,
          label: `${t(snapLayoutLabelKey(normalizedSnapLayout as Exclude<SnapLayoutType, 'single'>))} · ${t(snapSlotNameKey(normalizedSnapLayout as Exclude<SnapLayoutType, 'single'>, targetSlot))}`,
          bounds: getSnapSlotBounds(normalizedSnapLayout, targetSlot, snapRatios)
        });
        return;
      }
    }
    const target = getSnapTargetForPointer(x, y);
    target.label = `${t(snapLayoutLabelKey(target.layout as Exclude<SnapLayoutType, 'single'>))} · ${t(snapSlotNameKey(target.layout as Exclude<SnapLayoutType, 'single'>, target.slotIndex))}`;
    setSnapDropTarget(target);
  }
  useLayoutEffect(() => {
    const activeEl = allWebviewRefs.current[activeTab.id];
    webviewRef.current = activeEl ?? null;
  }, [activeTab.id]);

  useEffect(() => {
    const tabId = pendingTransferredTabId;
    if (!tabId || !webviewStartupReady || !webviewReady || tabId !== activeTab.id) return undefined;
    const webview = allWebviewRefs.current[tabId];
    if (!webview) return undefined;

    let cancelled = false;
    let checking = false;
    const confirmAttached = async () => {
      if (cancelled || checking || allWebviewRefs.current[tabId] !== webview || !isWebviewReady(webview)) return;
      checking = true;
      try {
        // Readiness is attached from the element ref before this effect runs,
        // so an early dom-ready event is retained for this exact guest.
        const guestId = webview.getWebContentsId();
        if (!cancelled && allWebviewRefs.current[tabId] === webview && isWebviewReady(webview)
          && Number.isInteger(guestId) && guestId > 0) {
          transferredTabBootstrapIds.current.add(tabId);
          onTransferredWebviewReady(tabId, guestId);
        }
      } catch {
        // The guest is not attached yet. Retry after it finishes mounting.
      } finally {
        checking = false;
      }
    };
    webview.addEventListener('dom-ready', confirmAttached);
    webview.addEventListener('did-stop-loading', confirmAttached);
    const interval = window.setInterval(() => { void confirmAttached(); }, 250);
    void confirmAttached();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      webview.removeEventListener('dom-ready', confirmAttached);
      webview.removeEventListener('did-stop-loading', confirmAttached);
    };
  }, [pendingTransferredTabId, webviewStartupReady, webviewReady, activeTab.id, onTransferredWebviewReady]);

  useLayoutEffect(() => {
    setWebviewReady(false);
    let cancelled = false;
    let attempts = 0;
    const measure = () => {
      if (cancelled) return;
      const frame = browserFrameRef.current;
      const rect = frame?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        setWebviewReady(true);
        // Force one remount so the guest is created with the real bounds.
        setWebviewMountKey((current) => current + 1);
        return;
      }
      // Give up after ~1s so a missing frame cannot block browsing forever.
      if (attempts++ < 60) window.requestAnimationFrame(measure);
      else setWebviewReady(true);
    };
    measure();
    return () => {
      cancelled = true;
    };
  }, [activeProfile.id, activePanel]);

  // Browsers are unusable without zoom: dense pages need scaling down, small
  // text needs scaling up. The guest webContents owns the zoom factor, so it
  // must be re-applied whenever the webview is recreated (profile/tab switch).
  const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const [zoomFactor, setZoomFactor] = useState<number>(() => {
    try {
      const defaultZoom = Number(desktopSettings?.default_zoom ?? loadDesktopSettingsFromStorage()?.default_zoom) || 100;
      return getEffectiveZoomForUrl(activeTab?.url || '', defaultZoom);
    } catch {
      return 1;
    }
  });

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(3, Math.max(0.5, next));
    setZoomFactor(clamped);
    const domain = getDomainFromUrl(activeTab.url);
    if (domain) {
      saveDomainZoom(domain, clamped);
    }
    try {
      window.localStorage.setItem('lastbrowser.zoomFactor', String(clamped));
    } catch {
      // Storage unavailable — zoom still applies for this session.
    }
    const view = webviewRef.current;
    if (view && typeof view.setZoomFactor === 'function') {
      try {
        view.setZoomFactor(clamped);
      } catch {
        // Guest not ready yet; the effect below re-applies on dom-ready.
      }
    }
  }, [activeTab.url]);

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoomFactor((current) => {
      const index = ZOOM_STEPS.findIndex((step) => step >= current - 0.001);
      const from = index >= 0 ? index : ZOOM_STEPS.length - 1;
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, from + direction))];
      const clamped = Math.min(3, Math.max(0.5, next));
      const domain = getDomainFromUrl(activeTab.url);
      if (domain) {
        saveDomainZoom(domain, clamped);
      }
      try {
        window.localStorage.setItem('lastbrowser.zoomFactor', String(clamped));
      } catch {
        // ignore
      }
      const view = webviewRef.current;
      if (view && typeof view.setZoomFactor === 'function') {
        try {
          view.setZoomFactor(clamped);
        } catch {
          // ignore
        }
      }
      return clamped;
    });
  }, [activeTab.url]);

  // Synchronize domain-specific or default appearance zoom on navigation / tab switch
  useEffect(() => {
    const defaultZoom = Number(desktopSettings?.default_zoom ?? loadDesktopSettingsFromStorage()?.default_zoom) || 100;
    const effective = getEffectiveZoomForUrl(activeTab.url, defaultZoom);
    setZoomFactor(effective);
    const view = webviewRef.current;
    if (view && typeof view.setZoomFactor === 'function') {
      try {
        view.setZoomFactor(effective);
      } catch {}
    }
  }, [activeTab.id, activeTab.url, desktopSettings?.default_zoom]);

  // Re-apply the stored zoom whenever the guest is (re)created.
  useEffect(() => {
    const view = webviewRef.current;
    if (!view || typeof view.setZoomFactor !== 'function') return;
    try {
      view.setZoomFactor(zoomFactor);
    } catch {
      // ignore
    }
  }, [zoomFactor, webviewMountKey, webviewReady]);

  // Sync tab muted state to the active webview
  useEffect(() => {
    const view = webviewRef.current;
    if (!view || typeof view.setAudioMuted !== 'function') return;
    try {
      view.setAudioMuted(Boolean(activeTab.isMuted));
    } catch {
      // ignore
    }
  }, [activeTab.id, activeTab.isMuted, webviewMountKey, webviewReady]);

  // ── Guest navigation events ──────────────────────────────────────────────
  // React does NOT wire the webview's DOM events from JSX props: `onDidNavigate`
  // and friends are silently ignored (verified — the address bar kept the old
  // URL after the guest had already navigated, and history recorded nothing).
  // The events must be registered imperatively on the element.
  useEffect(() => {
    let cancelled = false;
    let attached: Electron.WebviewTag | null = null;
    let attempts = 0;

    const onNavigate = (event: Event) => {
      const url = (event as unknown as { url?: string }).url;
      if (typeof url === 'string' && url) onWebviewNavigate(activeTab.id, url);
    };
    const onTitle = (event: Event) => {
      const title = (event as unknown as { title?: string }).title;
      if (typeof title === 'string') onWebviewTitle(activeTab.id, title);
    };
    const onFavicon = (event: Event) => {
      const favicons = (event as unknown as { favicons?: string[] }).favicons;
      if (favicons && favicons.length > 0 && favicons[0]) {
        onWebviewFavicon?.(activeTab.id, favicons[0]);
      }
    };
    const onStartLoading = () => {
      onWebviewLoading?.(activeTab.id, true);
    };
    const onStopLoading = () => {
      onWebviewLoading?.(activeTab.id, false);
    };
    const onFailLoad = () => {
      onWebviewLoading?.(activeTab.id, false);
    };
    const onCrash = () => {
      onWebviewLoading?.(activeTab.id, false);
      onSetBrowserError?.('The web page crashed or was terminated unexpectedly.');
    };
    const attach = () => {
      if (cancelled) return;
      const view = webviewRef.current;
      if (!view || typeof view.addEventListener !== 'function') {
        if (attempts++ < 120) window.requestAnimationFrame(attach);
        return;
      }
      attached = view;
      view.addEventListener('did-navigate', onNavigate);
      view.addEventListener('did-navigate-in-page', onNavigate);
      view.addEventListener('page-title-updated', onTitle);
      view.addEventListener('page-favicon-updated', onFavicon);
      view.addEventListener('did-start-loading', onStartLoading);
      view.addEventListener('did-stop-loading', onStopLoading);
      view.addEventListener('did-fail-load', onFailLoad);
      view.addEventListener('render-process-gone', onCrash);
    };
    attach();

    return () => {
      cancelled = true;
      if (attached) {
        try {
          attached.removeEventListener('did-navigate', onNavigate);
          attached.removeEventListener('did-navigate-in-page', onNavigate);
          attached.removeEventListener('page-title-updated', onTitle);
          attached.removeEventListener('page-favicon-updated', onFavicon);
          attached.removeEventListener('did-start-loading', onStartLoading);
          attached.removeEventListener('did-stop-loading', onStopLoading);
          attached.removeEventListener('did-fail-load', onFailLoad);
          attached.removeEventListener('render-process-gone', onCrash);
        } catch {
          // ignore
        }
      }
    };
  }, [activeTab.id, webviewMountKey, webviewReady, onWebviewNavigate, onWebviewTitle, onWebviewFavicon, onWebviewLoading, onWebviewMediaPlaying, onSetBrowserError]);

  // Split panes are independently interactive. Keep their tab metadata in sync
  // even when that pane is not the active tab (the active guest is handled above).
  useEffect(() => {
    if (!splitGroupActive || !webviewReady) return;
    const cleanups: Array<() => void> = [];
    for (const tabId of splitTabIds) {
      if (tabId === activeTab.id) continue;
      const view = allWebviewRefs.current[tabId];
      if (!view) continue;
      const onNavigate = (event: Event) => {
        const url = (event as Event & { url?: string }).url;
        if (url) onWebviewNavigate(tabId, url);
      };
      const onTitle = (event: Event) => {
        const title = (event as Event & { title?: string }).title;
        if (title) onWebviewTitle(tabId, title);
      };
      const onFavicon = (event: Event) => {
        const favicons = (event as Event & { favicons?: string[] }).favicons;
        if (favicons?.[0]) onWebviewFavicon?.(tabId, favicons[0]);
      };
      const onStart = () => onWebviewLoading?.(tabId, true);
      const onStop = () => onWebviewLoading?.(tabId, false);
      view.addEventListener('did-navigate', onNavigate);
      view.addEventListener('did-navigate-in-page', onNavigate);
      view.addEventListener('page-title-updated', onTitle);
      view.addEventListener('page-favicon-updated', onFavicon);
      view.addEventListener('did-start-loading', onStart);
      view.addEventListener('did-stop-loading', onStop);
      view.addEventListener('did-fail-load', onStop);
      cleanups.push(() => {
        view.removeEventListener('did-navigate', onNavigate);
        view.removeEventListener('did-navigate-in-page', onNavigate);
        view.removeEventListener('page-title-updated', onTitle);
        view.removeEventListener('page-favicon-updated', onFavicon);
        view.removeEventListener('did-start-loading', onStart);
        view.removeEventListener('did-stop-loading', onStop);
        view.removeEventListener('did-fail-load', onStop);
      });
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [splitGroupActive, splitTabIds.join('|'), activeTab.id, webviewReady, webviewMountKey, onWebviewNavigate, onWebviewTitle, onWebviewFavicon, onWebviewLoading]);

  // Ctrl/Cmd +, -, 0 — the shortcuts every browser user reaches for.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        stepZoom(1);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        stepZoom(-1);
      } else if (event.key === '0') {
        event.preventDefault();
        applyZoom(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepZoom, applyZoom]);

  // Ctrl/Cmd+Shift+T reopens the most recently closed tab.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      if (event.key !== 'T' && event.key !== 't') return;
      event.preventDefault();
      onReopenClosedTab();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onReopenClosedTab]);

  // ── DevTools + per-tab mute ──────────────────────────────────────────────
  // Both are per-guest: the webContents is recreated on profile/tab switch, so
  // the state must be re-read whenever the element is (re)created.
  const [muted, setMuted] = useState(false);

  const toggleMute = useCallback(() => {
    const view = webviewRef.current;
    if (!isWebviewReady(view) || !view || typeof view.setAudioMuted !== 'function') return;
    setMuted((current) => {
      const next = !current;
      try {
        view.setAudioMuted(next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Re-read both flags when the guest is recreated.
  useEffect(() => {
    const view = webviewRef.current;
    if (!view || allWebviewRefs.current[activeTab.id] !== view || !isWebviewReady(view)) {
      onDevToolsOpenChange(false);
      setMuted(Boolean(activeTab.isMuted));
      return;
    }
    try {
      setMuted(typeof view.isAudioMuted === 'function' ? view.isAudioMuted() : false);
    } catch {
      // A navigation can revoke guest readiness between the event and this effect.
      return;
    }
    return subscribeDevToolsState(
      view,
      () => webviewRef.current === view
        && allWebviewRefs.current[activeTab.id] === view
        && isWebviewReady(view),
      onDevToolsOpenChange
    );
  }, [webviewMountKey, webviewReady, webviewReadinessRevision, activeTab.id, activeTab.isMuted, onDevToolsOpenChange]);

  // F12 toggles DevTools; Ctrl/Cmd+M mutes the tab.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F12') {
        event.preventDefault();
        onToggleDevTools();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'm' || event.key === 'M')) {
        event.preventDefault();
        toggleMute();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'x' || event.key === 'X')) {
        event.preventDefault();
        usePanelStore.getState().toggleExtensionHub();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToggleDevTools, toggleMute]);

  // ── Find in page ─────────────────────────────────────────────────────────
  // Ctrl+F is muscle memory; without it long pages are unnavigable. The guest
  // reports matches via 'found-in-page', which we surface as "3 / 12".
  const {
    findOpen,
    setFindOpen,
    downloadsOpen,
    setDownloadsOpen,
    historyOpen,
    setHistoryOpen,
    permissionsOpen,
    setPermissionsOpen,
    extensionHubOpen,
    setExtensionHubOpen
  } = usePanelStore();
  const [findQuery, setFindQuery] = useState('');
  const [findResult, setFindResult] = useState<{ matches: number; active: number } | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (findOpen) {
      window.setTimeout(() => findInputRef.current?.select(), 0);
    }
  }, [findOpen]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindResult(null);
    const view = webviewRef.current;
    if (view && typeof view.stopFindInPage === 'function') {
      try {
        view.stopFindInPage('clearSelection');
      } catch {
        // ignore
      }
    }
  }, [setFindOpen]);

  const runFind = useCallback((query: string, forward = true) => {
    const view = webviewRef.current;
    if (!view || typeof view.findInPage !== 'function') return;
    if (!query) {
      setFindResult(null);
      try {
        view.stopFindInPage('clearSelection');
      } catch {
        // ignore
      }
      return;
    }
    try {
      // `forward` selects the direction; `findNext` advances to the next match
      // instead of restarting from the top. Passing `!forward` here inverted
      // the search and produced no result at all.
      view.findInPage(query, { forward, findNext: true });
    } catch {
      // ignore
    }
  }, []);

  // Ctrl+F opens the bar; Escape closes it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => findInputRef.current?.select(), 0);
      } else if (event.key === 'Escape' && findOpen) {
        closeFind();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [findOpen, closeFind]);

  // Surface match counts from the guest.
  //
  // The ref is still null on the first effect run (React attaches refs after
  // render), so a plain `webviewRef.current` check silently skips the listener
  // and the counter stays at 0/0 forever. Retry on the next frame until the
  // element exists.
  useEffect(() => {
    let cancelled = false;
    let attached: Electron.WebviewTag | null = null;
    let attempts = 0;

    const onFound = (event: Event) => {
      const detail = (event as unknown as { result?: { matches?: number; activeMatchOrdinal?: number } }).result;
      if (!detail) return;
      setFindResult({ matches: detail.matches ?? 0, active: detail.activeMatchOrdinal ?? 0 });
    };

    const attach = () => {
      if (cancelled) return;
      const view = webviewRef.current;
      if (!view || typeof view.addEventListener !== 'function') {
        if (attempts++ < 120) window.requestAnimationFrame(attach);
        return;
      }
      attached = view;
      view.addEventListener('found-in-page', onFound as EventListener);
    };
    attach();

    return () => {
      cancelled = true;
      if (attached) {
        try {
          attached.removeEventListener('found-in-page', onFound as EventListener);
        } catch {
          // ignore
        }
      }
    };
  }, [webviewMountKey, webviewReady]);

  function renderBrowserStartPage(tabId?: string, focusSearchOnMount = false, onSearchFocusConsumed?: () => void): React.ReactNode {
    const pageTabId = tabId || activeTab.id;
    const activatePane = () => {
      if (tabId && tabId !== activeTab.id) onActivateTab?.(tabId);
    };
    return (
      <NativeBrowserStartPage
        key={pageTabId}
        bookmarks={bookmarks}
        visits={visitedSites}
        onNavigate={(url) => { activatePane(); onNavigate(url); }}
        botName={botName}
        spaces={spaces}
        activeSpacePath={activeSpacePath}
        activeProfileId={activeProfile.id}
        activeSpaceTabs={tabs}
        focusSearchOnMount={activeTab.id === pageTabId && focusSearchOnMount}
        onSearchFocusConsumed={onSearchFocusConsumed}
        onSelectSpace={(path) => { activatePane(); onSelectSpace(path); }}
        onAddSpace={(path, name) => { activatePane(); onAddSpace(path, name); }}
        onAskAi={(prompt) => {
          activatePane();
          usePanelStore.getState().setCopilotOpen(true);
          void onSendChat(prompt);
        }}
        onOpenCommandPalette={() => { activatePane(); usePanelStore.getState().setCommandPaletteOpen(true); }}
      />
    );
  }

  if (activePanel === 'chat') {
    return (
      <PanelErrorBoundary panel={activePanel} key={activePanel}>
        <NativeChatMain
          activeSession={activeSession}
          activeSessionId={activeSessionId}
          busy={busy}
          chatError={chatError}
          messages={chatMessages}
          runState={chatRunState}
          composerMode={composerMode}
          composerText={composerText}
          serviceStatus={serviceStatus}
          sessionLoading={sessionLoading}
          setupModel={setupModel}
          activeSpacePath={activeSpacePath}
          activeBrowserProfileId={activeProfileId}
          activeBackendProfileName={activeBackendProfileName}
          showTokenUsage={desktopSettings?.show_token_usage === true}
          showTps={desktopSettings?.show_tps === true}
          showThinking={desktopSettings?.show_thinking === true}
          simplifiedToolCalling={desktopSettings?.simplified_tool_calling !== false}
          latestTurnUsage={lastChatTurnUsage?.sessionId === activeSessionId ? lastChatTurnUsage.usage : null}
          modelFallbackNotice={modelFallbackNotice}
          onComposerMode={onComposerMode}
          onComposerText={onComposerText}
          onCreateSession={onCreateSession}
          onSend={onSendChat}
          onCommandAction={onNativeCommandAction}
          onStop={onStopChat}
        />
      </PanelErrorBoundary>
    );
  }

  if (activePanel !== 'browser') {
    switch (activePanel) {
      case 'workspaces':
        return (
          <PanelErrorBoundary panel={activePanel} key={activePanel}>
            <NativeSpacesMain
              activeSpacePath={activeSpacePath}
              activeContextItem={activeContextItem}
              error=""
              serviceStatus={serviceStatus}
              spaces={spaces}
              onAddSpace={onAddSpace}
              onMoveSpace={onMoveSpace}
              onRemoveSpace={onRemoveSpace}
              onRenameSpace={onRenameSpace}
              onSelectSpace={onSelectSpace}
              onNewSession={onCreateSession}
            />
          </PanelErrorBoundary>
        );
      case 'tasks':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeTasksMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'kanban':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeKanbanMain activeContextItem={activeContextItem} activeSpacePath={activeSpacePath} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'todos':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeTodosMain activeContextItem={activeContextItem} activeSession={activeSession} messages={chatMessages} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'skills':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeSkillsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'agents':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeAgentsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'profiles':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeProfilesMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'memory':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeMemoryMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'insights':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeInsightsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'logs':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeLogsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'gmail':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeGmailMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'discord':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeDiscordMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} /></PanelErrorBoundary>;
      case 'appstore':
        return (
          <PanelErrorBoundary panel={activePanel} key={activePanel}>
            <NativeAppstoreMain
              activeContextItem={activeContextItem}
              serviceStatus={serviceStatus}
              onInstalledSidebarApp={onInstalledSidebarApp}
              onUninstalledSidebarApp={onUninstalledSidebarApp}
            />
          </PanelErrorBoundary>
        );
      case 'settings':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeSettingsMain activeContextItem={activeContextItem} serviceStatus={serviceStatus} onboardingStatus={onboardingStatus} onReopenSetup={onReopenSetup} searchEngineId={searchEngineId} onSearchEngineChange={onSearchEngineChange} desktopSettings={desktopSettings} profiles={profiles} activeProfileId={activeProfileId} activeSpacePath={activeSpacePath} activeBackendProfileName={activeBackendProfileName || activeSession?.profile || null} activeSessionId={activeSessionId} onSelectProfile={onSelectProfile} onCreateProfile={onCreateProfile} onRenameProfile={onRenameProfile} onDeleteProfile={onDeleteProfile} /></PanelErrorBoundary>;
      case 'terminal':
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeTerminalMain serviceStatus={serviceStatus} activeSessionId={activeSessionId} workspacePath={activeSpacePath} /></PanelErrorBoundary>;
      default:
        return <PanelErrorBoundary panel={activePanel} key={activePanel}><NativeChatMain activeSession={activeSession} activeSessionId={activeSessionId} busy={busy} chatError={chatError} messages={chatMessages} runState={chatRunState} composerMode={composerMode} composerText={composerText} serviceStatus={serviceStatus} sessionLoading={sessionLoading} setupModel={setupModel} activeSpacePath={activeSpacePath} activeBrowserProfileId={activeProfileId} activeBackendProfileName={activeBackendProfileName} showTokenUsage={desktopSettings?.show_token_usage === true} showTps={desktopSettings?.show_tps === true} showThinking={desktopSettings?.show_thinking === true} simplifiedToolCalling={desktopSettings?.simplified_tool_calling !== false} latestTurnUsage={lastChatTurnUsage?.sessionId === activeSessionId ? lastChatTurnUsage.usage : null} modelFallbackNotice={modelFallbackNotice} onComposerMode={onComposerMode} onComposerText={onComposerText} onCreateSession={onCreateSession} onSend={onSendChat} onCommandAction={onNativeCommandAction} onStop={onStopChat} /></PanelErrorBoundary>;
    }
  }

  const isHomeOrSearch = browserMode === 'search' || browserMode === 'home' || isAiBrowserHomeUrl(activeTab.url);
  return (
    <PanelErrorBoundary panel="browser" key="browser-page">
    <section className="browser-main browser-page-main">
      {/* Vision-Impaired 2.0 §5.1: super-sized vertical tab rail (Feature 9). */}
      {superTabsActive && (
        <SuperSizedTabStrip
          tabs={tabs || []}
          activeTabId={activeTab.id}
          onActivateTab={(tabId) => onActivateTab?.(tabId)}
          onCloseTab={(tabId) => useTabStore.getState().closeTab(tabId)}
          onNewTab={() => onNavigate('lastbrowser://start')}
        />
      )}
      {!isHomeOrSearch && (
        <InPageActionBar
          busy={busy}
          onAction={onAction}
          zoomFactor={zoomFactor}
          onResetZoom={() => applyZoom(1)}
          onFindOpen={() => setFindOpen(true)}
          downloadsOpen={downloadsOpen}
          hasActiveDownloads={hasActiveDownloads}
          onToggleDownloads={() => usePanelStore.getState().setDownloadsOpen(!usePanelStore.getState().downloadsOpen)}
          historyOpen={historyOpen}
          onToggleHistory={() => usePanelStore.getState().setHistoryOpen(!usePanelStore.getState().historyOpen)}
          muted={muted}
          onToggleMute={toggleMute}
          dockMode={usePanelStore.getState().actionBarDock}
          onSetDockMode={(dock) => usePanelStore.getState().setActionBarDock(dock)}
        />
      )}

      <PermissionsPanel open={permissionsOpen} onClose={() => setPermissionsOpen(false)} />
      <HistoryPanel
        open={historyOpen}
        visits={visitedSites}
        onClose={() => setHistoryOpen(false)}
        onOpen={(url) => onNavigate(url)}
        onRemove={(url) => onRemoveVisit(url)}
        onClear={() => onClearHistory()}
      />
      <UnifiedExtensionHub
        open={extensionHubOpen}
        onClose={() => setExtensionHubOpen(false)}
        activeSpace={activeSpacePath}
      />
      <div className="browser-webview-frame" ref={browserFrameRef}>
        <LiveAutomationBanner webview={webviewRef.current} />
        {findOpen && (
          <div className="find-bar" role="search">
            <Search size={14} />
            <input
              ref={findInputRef}
              value={findQuery}
              placeholder="Find in page"
              aria-label="Find in page"
              onChange={(event) => {
                setFindQuery(event.target.value);
                runFind(event.target.value, true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  runFind(findQuery, !event.shiftKey);
                }
              }}
            />
            <span className="find-count">
              {findResult ? `${findResult.active} / ${findResult.matches}` : findQuery ? '0 / 0' : ''}
            </span>
            <button
              type="button"
              aria-label="Previous match"
              title="Previous (Shift+Enter)"
              onClick={() => runFind(findQuery, false)}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="Next match"
              title="Next (Enter)"
              onClick={() => runFind(findQuery, true)}
            >
              <ChevronRight size={14} />
            </button>
            <button type="button" aria-label="Close find bar" title="Close (Esc)" onClick={closeFind}>
              <X size={14} />
            </button>
          </div>
        )}
        {browserLoadError && (
          <div className="browser-load-error" role="alert">
            <AlertTriangle size={16} />
            <span>{browserLoadError}</span>
          </div>
        )}
        {browserMode === 'search' ? (
          <div className="browser-mode-overlay" style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'var(--bg-main, #12141a)' }}>
            <NativeAiBrowserMain serviceStatus={serviceStatus} onNavigate={onNavigate} />
          </div>
        ) : !splitGroupActive && (browserMode === 'home' || isAiBrowserHomeUrl(activeTab.url)) ? (
          <div className="browser-mode-overlay" style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'var(--bg-main, #12141a)', overflowY: 'auto' }}>
            {renderBrowserStartPage(activeTab.id,
              pendingStartSearchFocus?.tabId === activeTab.id && pendingStartSearchFocus.expiresAt >= Date.now(),
              onStartSearchFocusConsumed)}
          </div>
        ) : null}
        {draggedTabId && (
          <div
            className="snap-drag-surface"
            onDragOver={handleSnapDragOver}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setSnapFlyoutVisible(false);
                setSnapDropTarget(null);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (snapDropTarget) commitSnapDrop(snapDropTarget.layout, snapDropTarget.slotIndex);
              else if (!snapFlyoutVisible) {
                const rect = browserFrameRef.current?.getBoundingClientRect();
                if (rect) commitSnapDrop('dual-50-50', (event.clientX - rect.left) / rect.width < 0.5 ? 0 : 1);
              }
            }}
          >
            <SnapBarFlyout
              visible={snapFlyoutVisible}
              onHoverSlot={setSnapDropTarget}
              onSelectSlot={commitSnapDrop}
              activeSlot={snapDropTarget ? { layout: snapDropTarget.layout, slotIndex: snapDropTarget.slotIndex } : null}
            />
            <SnapGhostOverlay target={snapDropTarget} active={Boolean(snapDropTarget)} />
            {!snapFlyoutVisible && !snapDropTarget && <div className="snap-drop-hint">{t('snap.dragHint')}</div>}
          </div>
        )}
        {webviewReady && splitGroupActive && (
          <MultiviewGridContainer
            layout={normalizedSnapLayout}
            tabIds={splitTabIds}
            slotIndexes={splitSlotIndexes}
            tabs={tabs || []}
            activeTabId={activeTab.id}
            ratios={snapRatios}
            onSetRatio={onSetSnapRatio}
            onActivateTab={onActivateTab}
            onRemoveSplitTab={onRemoveSplitTab}
            onDetachTab={(tab, screenX, screenY) => {
              const view = allWebviewRefs.current[tab.id];
              let guestId: number | undefined;
              if (isWebviewReady(view)) {
                try { guestId = view?.getWebContentsId(); } catch { /* guest may be detaching */ }
              }
              onDetachTab?.(tab, screenX, screenY, guestId);
            }}
            onMaximizeTab={(tabId) => {
              onActivateTab?.(tabId);
              splitTabIds.filter((id) => id !== tabId).forEach((id) => onRemoveSplitTab?.(id));
            }}
            onDropToSlot={(slotIndex) => { if (draggedTabId) commitSnapDrop(normalizedSnapLayout, slotIndex); }}
          />
        )}
        {/* ── Normal single-tab viewport ────────────────────────────────────
            Always rendered. Hidden when the active tab is part of a split
            (the split container above takes over).  Keeps all WebViews alive
            in the DOM so switching back from split never causes a blank tab. */}
        <div
          className="browser-tabs-viewport"
          style={{
            display: 'block',
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          {renderedTabs.map((tab) => {
            const isCurrent = tab.id === activeTab.id;
            const keepaliveEntry = keepaliveById.get(tab.id);
            const isAudioKeepalive = Boolean(keepaliveEntry && !activeTabIds.has(tab.id));
            const groupIndex = splitTabIds.indexOf(tab.id);
            const isInActiveSplit = splitGroupActive && groupIndex >= 0;
            const slotIndex = isInActiveSplit ? (splitSlotIndexes[groupIndex] ?? groupIndex) : -1;
            const slot = slotIndex >= 0 ? SNAP_LAYOUT_DEFINITIONS[normalizedSnapLayout].slots[slotIndex] : null;
            const paneBounds = slot ? getSnapSlotBounds(normalizedSnapLayout, slotIndex, snapRatios) : null;
            if (tab.isDiscarded && !isCurrent) return null;
            const isHomeTab = isAiBrowserHomeUrl(tab.url);
            if (isHomeTab && !isCurrent && !isInActiveSplit) return null;
            return (
              <div
                key={tab.id}
                className={`browser-tab-pane ${isCurrent ? 'active-tab-pane' : 'inactive-tab-pane'}`}
                style={{
                  position: 'absolute',
                  ...(isAudioKeepalive
                    ? { right: 0, bottom: 0, width: 1, height: 1, opacity: 0 }
                    : {
                        top: paneBounds ? `${paneBounds.top}%` : 0,
                        left: paneBounds ? `${paneBounds.left}%` : 0,
                        width: paneBounds ? `${paneBounds.width}%` : '100%',
                        height: paneBounds ? `${paneBounds.height}%` : '100%'
                      }),
                  minWidth: 0,
                  minHeight: 0,
                  visibility: (isCurrent || isInActiveSplit || isAudioKeepalive) ? 'visible' : 'hidden',
                  pointerEvents: (isCurrent || isInActiveSplit) ? 'auto' : 'none',
                  zIndex: isInActiveSplit ? 2 : isCurrent ? 1 : 0
                }}
              >
                {isHomeTab && isInActiveSplit ? (
                  <div className="snap-start-page-pane" style={{ position: 'absolute', inset: '28px 0 0', overflow: 'hidden' }}>
                    {renderBrowserStartPage(tab.id)}
                  </div>
                ) : webviewReady && webviewStartupReady && (
                  <webview
                    key={`${computeSpacePartition(
                      keepaliveEntry?.profileId ?? activeProfile.id,
                      keepaliveEntry?.spacePath ?? activeSpacePath,
                      tab.incognito,
                      knownSpacePaths
                    )}:${tab.id}:${webviewMountKey}`}
                    ref={getWebviewRefCallback(tab.id)}
                    src={pendingTransferredTabId === tab.id || transferredTabBootstrapIds.current.has(tab.id) ? 'about:blank' : tab.url}
                    data-tab-id={tab.id}
                    className="browser-view"
                    style={isAudioKeepalive
                      ? browserWebviewStyle
                      : isInActiveSplit
                        ? { ...browserWebviewStyle, position: 'absolute', top: 28, height: 'calc(100% - 28px)' }
                        : browserWebviewStyle}
                    partition={computeSpacePartition(
                      keepaliveEntry?.profileId ?? activeProfile.id,
                      keepaliveEntry?.spacePath ?? activeSpacePath,
                      tab.incognito,
                      knownSpacePaths
                    )}
                    allowpopups
                    plugins
                    webpreferences={tab.pinned ? 'contextIsolation=yes, plugins=yes, backgroundThrottling=no' : 'contextIsolation=yes, plugins=yes'}
                  />
                )}
                </div>
              );
            })}
            </div>
            {/* Vision-Impaired 2.0 §6: split-screen magnifier pane (Feature 18).
                Rendered inside the webview frame so it overlays the bottom 35%
                while the original page stays fully visible above. */}
            {splitMagnifierActive && !isHomeOrSearch && (
              <SplitScreenMagnifier webview={webviewRef.current} syncKey={activeTab.url} />
            )}
      </div>
    </section>
    </PanelErrorBoundary>
  );
}


function NativeSpacesMain({
  activeSpacePath,
  activeContextItem,
  error,
  serviceStatus,
  spaces,
  onAddSpace,
  onMoveSpace,
  onRemoveSpace,
  onRenameSpace,
  onSelectSpace,
  onNewSession
}: {
  activeSpacePath: string;
  activeContextItem: string;
  error: string;
  serviceStatus: ServiceStatus | null;
  spaces: SpaceSummary[];
  onAddSpace: (path: string, name: string) => void;
  onMoveSpace: (space: SpaceSummary, direction: -1 | 1) => void;
  onRemoveSpace: (space: SpaceSummary) => void;
  onRenameSpace: (space: SpaceSummary) => void;
  onSelectSpace: (path: string) => void;
  onNewSession: () => void;
}): JSX.Element {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Spaces');
  const ready = canCallSidekickApi(serviceStatus);
  const activeSpace = spaces.find((space) => space.path === activeSpacePath) || spaces[0] || null;

  useEffect(() => {
    setSection(activeContextItem || 'Spaces');
  }, [activeContextItem]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!path.trim()) return;
    onAddSpace(path.trim(), name.trim());
    setPath('');
    setName('');
  }

  return (
    <section className="browser-main spaces-main">
      <div className="spaces-header">
        <div>
          <span className="eyebrow">Spaces</span>
          <h1>Workspaces</h1>
          <p>{section === 'Active workspace' ? 'Aktiver Space und Session-Bindung im Fokus.' : section === 'Files' ? 'Spaces steuern den aktiven Workspace und die Datei-Leiste rechts.' : 'Neue Sessions starten im aktiven Space. Die rechte Workspace-Leiste bleibt an die aktive Session gebunden.'}</p>
        </div>
        <div className={`native-chat-status ${ready ? 'ready' : 'starting'}`}>
          <span className={ready ? 'status-dot ready' : 'status-dot'} />
          <span>{ready ? 'Online' : 'Starting'}</span>
        </div>
      </div>
      <div className="native-card-actions insights-tabs">
        {['Spaces', 'Active workspace', 'Files', 'New chat'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <section className="native-work-card detail-json-card">
        <header>
          <strong>{section}</strong>
          {section === 'New chat' && (
            <button type="button" className="primary-action compact" onClick={onNewSession} disabled={!ready}>
              <Plus size={13} />
              <span>Open chat</span>
            </button>
          )}
        </header>
        <pre>{jsonPreview({
          activeSpacePath,
          spaceCount: spaces.length,
          activeSpace,
          hint: section === 'New chat'
            ? 'Open a new chat session in the active space.'
            : section === 'Files'
              ? 'Use the workspace panel on the right to browse files for the active session.'
              : section === 'Active workspace'
                ? 'The active workspace binds new sessions to the current space.'
                : 'Spaces are the top-level workspace selector.'
        })}</pre>
      </section>
      <form className="space-create-form" onSubmit={submit}>
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Portfolio" />
        </label>
        <label>
          <span>Path</span>
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="C:\\work\\portfolio" />
        </label>
        <button type="submit" className="primary-action compact" disabled={!ready || !path.trim()}>
          <Plus size={15} />
          <span>Add Space</span>
        </button>
      </form>
      {error && <div className="workspace-error">{error}</div>}
      <AdvancedWebUiTools panel="workspaces" serviceStatus={serviceStatus} compact />
      <div className="spaces-grid">
        {spaces.map((space, index) => (
          <article key={space.path} className={`space-card ${space.path === activeSpacePath ? 'active' : ''}`}>
            <button type="button" className="space-card-main" onClick={() => onSelectSpace(space.path)}>
              <img src={brandAssets.sidebarIcons.folder} alt="" />
              <strong>{spaceDisplayName(space)}</strong>
              <span>{space.path}</span>
            </button>
            <div className="space-card-actions">
              <button type="button" title="Move up" disabled={index === 0} onClick={() => onMoveSpace(space, -1)}><ChevronLeft size={14} /></button>
              <button type="button" title="Move down" disabled={index === spaces.length - 1} onClick={() => onMoveSpace(space, 1)}><ChevronRight size={14} /></button>
              <button type="button" title="Rename space" onClick={() => onRenameSpace(space)}><Edit3 size={14} /></button>
              <button type="button" title="Remove space" onClick={() => onRemoveSpace(space)}><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
        {!spaces.length && (
          <div className="spaces-empty">
            <Folder size={26} />
            <span>{ready ? 'No spaces configured yet.' : 'Sidekick runtime is starting.'}</span>
          </div>
        )}
      </div>
      <section className="native-work-card detail-json-card">
        <header><strong>Active workspace</strong></header>
        <pre>{jsonPreview({
          activeSpacePath,
          activeSpace,
          actions: {
            select: 'Choose a space from the list to make it active',
            chat: 'Use the Open chat button to start a session in the active space'
          }
        })}</pre>
      </section>
    </section>
  );
}

function NativePanelMain({
  activePanel,
  serviceStatus,
  spaces
}: {
  activePanel: LastbrowserPanelId;
  serviceStatus: ServiceStatus | null;
  spaces: SpaceSummary[];
}): JSX.Element {
  const { t } = useDesktopI18n();
  const panel = lastbrowserPanels.find((item) => item.id === activePanel) || lastbrowserPanels[0];
  const panelLabel = t(panelLabelTranslationKey(panel.id));
  return (
    <section className="browser-main native-panel-main">
      <div className="native-panel-card">
        <img src={sidebarIconForPanel(activePanel)} alt="" />
        <span className="eyebrow">{panelLabel}</span>
        <h1>{panelLabel}</h1>
        <p>{panelLabel} is available in the native LastBrowser shell.</p>
        {!spaces.length && serviceStatus?.sidekick !== 'ready' && <small>Sidekick runtime is starting.</small>}
      </div>
    </section>
  );
}



function isTransientSidekickFetchError(message: string): boolean {
  return /fetch failed|service is not ready|ECONNREFUSED|unreachable/i.test(message);
}

function normalizeChatMessages(messages: DesktopChatMessage[] | undefined): DesktopChatMessage[] {
  return Array.isArray(messages)
    ? messages.filter((message) => String(message.content || '').trim() || message.role)
    : [];
}

function workspaceLabel(path?: string | null): string {
  if (!path || path === 'default') return 'default';
  const raw = String(path || '');
  const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function workspacePathParts(path?: string | null): string[] {
  const normalized = String(path || '.').replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/\/+$/, '');
  if (!normalized || normalized === '.') return [];
  return normalized.split('/').filter(Boolean);
}

function joinWorkspacePath(basePath?: string | null, name?: string | null): string {
  const cleanName = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const base = String(basePath || '.').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!base || base === '.') return cleanName;
  return `${base}/${cleanName}`;
}

function isWorkspaceDirectory(entry: WorkspaceTreeEntry): boolean {
  return entry.is_dir === true || entry.type === 'dir' || entry.type === 'directory';
}

function entryFromPreview(preview: WorkspaceFilePreview): WorkspaceTreeEntry {
  const path = preview.path || '';
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return {
    name: parts[parts.length - 1] || path || 'Preview',
    path,
    type: 'file',
    size: preview.size
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}


function parentPath(path: string): string {
  const normalized = (path || '.').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized || normalized === '.') return '.';
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/') || '.';
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
