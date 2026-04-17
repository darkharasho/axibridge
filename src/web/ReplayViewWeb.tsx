// Re-export for future web-specific extensions.
// Currently ReplayView works unchanged in the web report; the report payload
// carries stats.replayFights directly and StatsView's ReplaySection consumes it.
export { ReplayView as ReplayViewWeb } from '../renderer/stats/map/ReplayView';
export { default } from '../renderer/stats/map/ReplayView';
