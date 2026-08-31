# Release Notes

Version v3.4.4 — August 31, 2026

## Fixes
- Squad averages now exclude combat-inactive squad members. You’ll see slightly different numbers for new data.
- NOTE: This applies to new uploads; existing reports won’t be retroactively changed.

## QoL Improvements
- Tests now read large fixtures at runtime to avoid heap issues during type checks. No impact on how you use the app.
- Bump @axiapps/axilog to 1.10.2 and regenerate native fixtures. Internal update, no user-facing changes.
