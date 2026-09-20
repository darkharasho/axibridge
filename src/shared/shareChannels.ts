/**
 * IPC channel names for share links, imported by both the main-process handler
 * (`src/main/handlers/shareHandlers.ts`) and the preload bridge
 * (`src/preload/index.ts`) so the two string literals cannot drift apart.
 */
export const SHARE_LOG_CHANNEL = 'share-log';
export const SHARE_PLAN_RETENTION_CHANNEL = 'share-plan-retention';
