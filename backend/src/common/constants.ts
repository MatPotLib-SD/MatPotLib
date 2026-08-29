/**
 * Universal alert cooldown. An alert for the same (plant, metric) cooldown
 * key is suppressed if another one was created within this window.
 */
export const ALERT_COOLDOWN_SECONDS = 7200; // 2h, universal

/**
 * Expected device reporting interval (informational — the firmware posts on
 * this cadence; the backend does not schedule anything off it).
 */
export const READING_INTERVAL_MINUTES = 15;
