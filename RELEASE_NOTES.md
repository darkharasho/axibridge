# Release Notes

Version v1.40.6 — March 3, 2026

## Better update-check error handling
- If the GitHub update feed times out or returns 502/503/504, ArcBridge now shows a friendly retry message: “GitHub temporarily failed to respond to the update check. Please try again in a moment.”
- Errors from the update feed that include HTML payloads are now cleaned up so you won’t see raw HTML in updater messages.
- For unknown errors, only the first line of the message is shown, removing embedded data that isn’t helpful.

NOTE: This behavior applies to new updater errors going forward and won’t retroactively change past messages.
