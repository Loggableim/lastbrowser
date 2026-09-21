/**
 * Zustand store for native chat, sessions, and streaming state.
 */

import { create } from 'zustand';
import type {
  ChatRunState,
  DesktopChatMessage,
  DesktopSessionDetail,
  DesktopSessionSummary
} from '../shell-state.js';
import type { ComposerMode } from '../panels/NativeChatMain.js';

export interface ChatState {
  sessions: DesktopSessionSummary[];
  sessionSearch: string;
  sessionError: string;
  activeSessionId: string | null;
  activeSession: DesktopSessionDetail | null;
  activeSessionLoading: boolean;
  chatMessages: DesktopChatMessage[];
  chatError: string;
  chatRunState: ChatRunState;
  activeStreamId: string | null;
  composerText: string;
  composerMode: ComposerMode;

  setSessions: (
    sessions:
      | DesktopSessionSummary[]
      | ((prev: DesktopSessionSummary[]) => DesktopSessionSummary[])
  ) => void;
  setSessionSearch: (search: string) => void;
  setSessionError: (error: string) => void;
  setActiveSessionId: (id: string | null) => void;
  setActiveSession: (
    session:
      | DesktopSessionDetail | null
      | ((prev: DesktopSessionDetail | null) => DesktopSessionDetail | null)
  ) => void;
  setActiveSessionLoading: (loading: boolean) => void;
  setChatMessages: (
    messages:
      | DesktopChatMessage[]
      | ((prev: DesktopChatMessage[]) => DesktopChatMessage[])
  ) => void;
  setChatError: (error: string) => void;
  setChatRunState: (state: ChatRunState) => void;
  setActiveStreamId: (id: string | null) => void;
  setComposerText: (text: string) => void;
  setComposerMode: (mode: ComposerMode) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  sessionSearch: '',
  sessionError: '',
  activeSessionId: null,
  activeSession: null,
  activeSessionLoading: false,
  chatMessages: [],
  chatError: '',
  chatRunState: 'idle',
  activeStreamId: null,
  composerText: '',
  composerMode: 'action',

  setSessions: (sessions) =>
    set((state) => ({
      sessions: typeof sessions === 'function' ? sessions(state.sessions) : sessions
    })),
  setSessionSearch: (sessionSearch) => set({ sessionSearch }),
  setSessionError: (sessionError) => set({ sessionError }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setActiveSession: (activeSession) =>
    set((state) => ({
      activeSession: typeof activeSession === 'function' ? activeSession(state.activeSession) : activeSession
    })),
  setActiveSessionLoading: (activeSessionLoading) => set({ activeSessionLoading }),
  setChatMessages: (chatMessages) =>
    set((state) => ({
      chatMessages: typeof chatMessages === 'function' ? chatMessages(state.chatMessages) : chatMessages
    })),
  setChatError: (chatError) => set({ chatError }),
  setChatRunState: (chatRunState) => set({ chatRunState }),
  setActiveStreamId: (activeStreamId) => set({ activeStreamId }),
  setComposerText: (composerText) => set({ composerText }),
  setComposerMode: (composerMode) => set({ composerMode })
}));
