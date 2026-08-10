---
name: no-release-notes-approval
description: User has waived the RELEASE_NOTES.md approval gate for /release — write, show, and proceed without waiting
metadata:
  type: feedback
---

For `/release` runs in this project, skip the "wait for approval before proceeding" step that the release skill (`.claude/skills/release/SKILL.md`) otherwise specifies for Job 1. Write `RELEASE_NOTES.md`, show the notes in the final report, and go straight into committing/pushing them and then Job 2 (the build pipeline) — do not pause the turn waiting for a reply.

**Why:** The user has explicitly and repeatedly waived this gate (standing instruction restated verbatim in task prompts, and also recorded in their own global auto-memory as `feedback_release_notes_no_approval`). They want the release flow to run end-to-end in one pass.

**How to apply:** Applies specifically to the release-notes approval checkpoint in [[project_release_patterns]]'s Job 1. Still treat everything else in the skill literally (exact commands for Job 2, no manual validate/build/tag steps, RELEASE_NOTES.md header must match the tag). If a future task prompt does NOT restate this override, ask before assuming it still applies — this note records what happened, not a blanket permanent rule change to the skill file itself.
