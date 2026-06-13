# Release Notes

Version v2.10.0 — June 13, 2026

## Headless mode for services
- You can run the bridge without a BrowserWindow (headless).  
- If you open a second window later, it will attach to the running headless services.  
- Great for automation or server-style usage when you don’t need a UI.

## Expanded metrics and reporting
- New at-a-glance metrics: report-level run summaries, per-player aggregates, and run-set comparisons.  
- These let you compare runs side-by-side and spot trends more quickly.  
- NOTE: These metrics show up with new uploads; existing reports won’t retroactively gain them.

## Under-the-hood improvements
- Core player aggregation and the rollup builder moved into the shared bridge-metrics package.  
- Shared metric extractors are now in the bridge-metrics workspace package.  
- These changes are mostly behind the scenes but set the stage for faster, more reliable metrics work.

## QoL Improvements
- Trimmed fixtures to streamline Setup and testing.  
- Reduced some internal test tooling and doc path clutter for a cleaner project surface.
