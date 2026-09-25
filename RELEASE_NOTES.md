# Release Notes

Version v3.17.3 — September 24, 2026

## Deployment changes
- dist-web will no longer be deployed to the GitHub Pages site during releases. The Pages site still rebuilds automatically on pushes to main, but this release won’t publish dist-web artifacts, which helps avoid breaking the live site.
- The Pages build is still part of the flow, but we now focus on edge cache handling rather than forcing a Pages deploy.

NOTE: This doesn’t retroactively affect content from past releases; it only changes what happens for this release’s deploy.

## Cloudflare edge cache purge
- After this release, if you provide a CLOUDFLARE_API_TOKEN, we purge the Cloudflare edge cache for bridge.axi.link to surface updates faster.
- If the token isn’t set, we skip the purge and you may see cached content for up to four hours.
- The purge is tied to this release and doesn’t retroactively clear caches from previous releases.

## QoL Improvements
- The release flow is simpler and less risky for the live site; edge cache purge now ensures users see updates without forcing a full, potentially disruptive Pages deployment.
