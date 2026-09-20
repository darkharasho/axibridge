/**
 * IPC channel names for share links. The main-process handler
 * (`src/main/handlers/shareHandlers.ts`) imports these values directly; the
 * preload bridge (`src/preload/index.ts`) cannot — it runs sandboxed, where a
 * relative value import throws at load — so it inlines the literals and imports
 * only their TYPES from here, which pins them to these definitions.
 */
export const SHARE_LOG_CHANNEL = 'share-log';
export const SHARE_PLAN_RETENTION_CHANNEL = 'share-plan-retention';
