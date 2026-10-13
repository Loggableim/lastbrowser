export type LocalModel = {
  id: string; name: string; repository: string; revision: string; filename: string;
  bytes: number; sha256: string; url: string; license: string; evaluation: 'candidate' | 'verified';
  contextTokens: number; estimatedRamBytes: number;
  agentEvaluation?: 'limited' | 'failed' | 'unverified';
};
export type HardwareReport = {
  platform: string; arch: string; cpu: string; cores: number; ramBytes: number;
  availableRamBytes: number; freeDiskBytes: number | null;
  gpus: Array<{ name: string; driver: string; vramBytes: number | null; source: string }>;
  warnings: string[];
};
export type LocalAiState = {
  hardware: HardwareReport | null; catalog: LocalModel[]; installed: string[];
  runtimeAvailable: boolean; phase: 'idle' | 'downloading' | 'verifying' | 'loading' | 'ready' | 'error';
  activeChats: number;
  recommendations?: Record<string, { usable: boolean; reason: string }>;
  recommendedModel?: string | null;
  modelId: string | null; completedBytes: number; totalBytes: number; error: string;
  endpoint: string | null; backend: 'cpu' | 'vulkan';
  measuredTokensPerSecond: number | null; toolTestPassed: boolean;
  scope: { workspace: string; modelId: string | null; allowFallback: boolean; useAsDefault: boolean } | null;
};
