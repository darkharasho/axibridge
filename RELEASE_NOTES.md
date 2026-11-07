# Release Notes

Version v3.22.12 — November 6, 2026

## Web Reports That Never Showed Up
Sometimes GitHub's own Pages deploy gets stuck or fails after a publish, so the report link says "not available" for hours even though the upload worked. AxiBridge now watches the actual deploy and, if GitHub drops it, pushes a fresh deploy for you (up to twice). It also checks your report site about a minute after launch and fixes it if the last publish never went live, so sites that are stuck right now will repair themselves once you update.
- The publish status now tells you when a retry was needed, and if GitHub keeps failing it says so instead of claiming success.

## Signed Windows Installer
The Windows installer is now code-signed, so Windows should stop treating it as an unknown publisher.
