# Release Notes

Version v1.20.6 — February 4, 2026

## 🌟 Highlights
- Stats view now supports sharing stats to Discord.
- Stats view icons are fetched and cached for faster loading.
- Settings navigation now uses section IDs with smooth scrolling for easier access.
- Smarter upload retry queue with UI and state management.

## 🛠️ Improvements
- Settings view now supports custom scroll handling for a smoother experience.
- Settings layout enhances padding and spacing across screen sizes.
- Left content alignment and mobile navigation padding improved for smaller screens.
- App layout and header styling refined for a cleaner, more consistent look.
- Upload status pie chart visuals refined for clarity.

## 🧯 Fixes
- Fix: correct global fetch binding in useStatsScreenshot hook to ensure stats images load reliably.
- Upload retry queue now checks for actual entries to determine when to retry.
- When retrying uploads, status now shows as 'uploading' to stay consistent.
- Mobile navigation items max height and padding adjusted for better fit on small screens.
- General layout and styling fixes for app content and header alignment.

## ⚠️ Breaking Changes
None.
