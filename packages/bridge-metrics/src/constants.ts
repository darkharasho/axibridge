/**
 * Shared constants used across the main process, renderer, and shared modules.
 */

/**
 * Numeric threshold for distinguishing millisecond timestamps from second timestamps.
 * Values >= this are Unix timestamps in milliseconds; values < this are in seconds.
 */
export const TIMESTAMP_MS_THRESHOLD = 1e12;

/**
 * Guild Wars 2 boon ID for Stability.
 */
export const STABILITY_BOON_ID = 1122;

/**
 * Maximum number of logs processed concurrently during bulk upload.
 */
export const BULK_PROCESS_CONCURRENCY = 3;
