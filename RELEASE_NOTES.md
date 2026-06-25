# Release Notes

Version v2.12.4 — June 24, 2026

## Fixes

**Total DPS** was showing an inflated number — it was summing each fight's DPS rate instead of computing aggregate DPS (total damage divided by total fight time). That's fixed now.

The **Damage** and **DPS** stat cards also showed "0 / No data" when switching to per-second (/1s) or per-minute (/60s) views. Those views now display the correct values — Damage /1s matches DPS, and Damage /60s scales accordingly.
