# Release Notes

Version v1.13.0 — January 31, 2026

## 🌟 Highlights
- ArcBridge replaces the old gw2-arc-log-uploader branding with a refreshed name and configurations.
- On first run, ArcBridge will automatically migrate your legacy settings so you don’t have to start from scratch.
- Auto-detection and configuration for your logs now use ArcBridge paths and the ARCBRIDGE_LOG_DIR environment variable.

## 🛠️ Improvements
- Added automatic migration of legacy settings from older names to ArcBridge on startup.
- Updated internal identifiers and protocol usage to ArcBridge for consistency.
- Log directory and config detection now respect ARCBRIDGE_LOG_DIR and ArcBridge config locations.
- Startup flow includes a migration step to align legacy install names with ArcBridge.

## 🧯 Fixes
- Legacy settings are migrated automatically to prevent losing preferences.
- Improved handling of log directory detection and configuration paths to match ArcBridge setup.

## ⚠️ Breaking Changes
- Branding and protocol identifiers changed to ArcBridge; external tools or scripts that referenced the old gw2-arc-log-uploader name or User-Agent may need updates.
