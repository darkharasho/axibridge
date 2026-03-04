# Release Notes

Version v1.40.5 — March 3, 2026

## Auto-update reliability and error handling
- If an update check hits a retryable error, the app will automatically retry once after 2 seconds and show a brief “Temporary network issue while checking for updates. Retrying...” message.
- If the retry fails or the error isn’t retryable, you’ll see a clearer, user-friendly message plus the underlying raw detail for troubleshooting.
- The retry state is cleared on successful update checks/downloads to avoid getting stuck in a loop.
- NOTE: This behavior only applies to new errors encountered after this update; past failures aren’t retroactively retried.

## Dropped log handling and extraction
- Dropped logs are now detected more reliably from both items and files and support .zevtc/.evtc formats.
- When a path is available, it’s used directly; if not, a path resolver is used to obtain one.
- Dropped logs are queued as uploads with clear statuses and fight names, so you can see what’s next to upload.

## UI improvements: retry on update errors
- The update error modal now includes a Try Again button to manually re-check for updates without guessing what went wrong.
- The retry action ties into the app’s update flow so you can re-initiate the check with a single click.

## Preload path resolution for dropped files
- The preload layer exposes a path resolver to improve dropped-file handling across environments, making drops more reliable when a direct file path isn’t readily available.

## QoL Improvements
- Drag-and-drop results show as queued uploads with descriptive names, making your workflow clearer.
- Tests were added to ensure dropped-log extraction and auto-update error handling work as expected, giving more confidence in these flows.
