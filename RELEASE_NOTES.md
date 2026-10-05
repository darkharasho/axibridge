# Release Notes

Version v3.21.0 — October 4, 2026

## Shared Publishing Sites
You can now publish to one GitHub Pages site together with your guild. Add other publishers from Settings: they get an invite, and a banner on the dashboard lets them join with one click. Every report records who published it, and you'll be asked to confirm before deleting a report someone else published.
- Organization repos work too. If an invite fails because of org permissions, the error tells you what to change.
- The site's logo and theme belong to its admin, so other publishers can't change them by accident.
- If two people publish at the same moment, both reports now land. Before, one could silently replace the other.

## Your Sites
Settings now has a "Publishing to" card. It shows which site your reports go to, your role on it, its members and its live URL. Under the card, "Switch site" opens your site list. From there you can accept invites, create a new site, add a repo you already have, or use "Find my sites" to pull in every repo you can publish to.
- Your old starred repos are carried over into the new site list automatically.
- History lists every saved site, and exporting or importing settings now includes your site list.

## QoL Improvements
- The publish button now names the site it will publish to and tells you where the report will appear.

## Fixes
- Fixed History reading the wrong branch or folder for sites that use a custom Pages source.
- Fixed expired or revoked invites still showing in the banner and in Settings.
- Fixed the site logo not being pushed again after you switch sites.
