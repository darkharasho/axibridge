# Release Notes

Version v3.14.0 — September 19, 2026

## Updating no longer dead-ends

If the AppImage you launched from got replaced or deleted while AxiBridge was still
running, every update attempt died with a raw `ENOENT ... unlink` and there was no way
out of it — retrying just produced the same error forever. AxiBridge now puts that path
back before handing off to the installer, so the update goes through. Same guard on the
install-on-quit path, which used to fail silently on the way out.

## AxiBridge shows its name on Discord posts

Fight embeds now carry "AxiBridge" and the logo in the header, so it's obvious where a
post came from in a busy channel.

## File pickers remember where you were

Picking a log folder, importing settings, saving an export — each dialog now reopens
where you last left it instead of dumping you in Downloads. Electron 44 stopped letting
the OS remember this on its own, so AxiBridge tracks it per dialog: choosing a settings
file won't move where the log-folder picker opens next.

## Fixes

- Cleared the fixable dependency security advisories.
