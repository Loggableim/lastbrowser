/** Future feature gate. Release builds omit the opt-in build variable. */
export const AI_ORCHESTRATION_ENABLED = import.meta.env.VITE_ENABLE_AI_ORCHESTRATION === 'true';
