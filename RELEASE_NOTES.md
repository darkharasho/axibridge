# Release Notes

Version v2.5.10 — July 22, 2025

## How-To Guide improvements

The How-To Guide got a significant content pass. Getting Started now has four dedicated sub-pages: finding your log directory (with exact paths for native, Steam, and Steam+Proton/Linux installs), setting up a dps.report token, creating a Discord webhook step by step, and a first-fight walkthrough showing what happens end-to-end with expected timing at each stage. Cloudflare R2 also has its own section now, covering bucket creation, public access, CORS config, and connecting credentials to AxiBridge. The "In this section" cards on parent nodes were previously labeled "Children" — that's fixed.

## How-To Guide button on the welcome modal

The "Learn More" button on the first-time welcome modal is now a proper "How-To Guide" button that opens the guide directly instead of dumping you into parser settings. It also has a book icon so it's clearer what it does.

## Fixes

- Fixed several broken icons in the How-To Guide where `alert-triangle` wasn't resolving — those warning icons were silently invisible.
- Fixed `npm run dev:fake-first-time` pointing at the wrong file (was looking for `axibridge-settings.json` in the project root instead of the actual electron-store config at `~/.config/AxiBridge-Dev/config.json`).
