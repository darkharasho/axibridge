# Report Webhook Forum Post Tags — Design

**Date:** 2026-08-06
**Status:** Approved

## Purpose

Report webhooks flagged as forum channels create a new forum post per report
(`thread_name`), but the posts arrive untagged. Discord's Execute Webhook
endpoint accepts `applied_tags` — an array of tag snowflake IDs, valid only
for forum/media channels, applied when the post is created, max 5 per post.
Add a fixed, per-webhook set of tag IDs that every report posted through that
hook receives.

Constraints that shape the design:

- Webhook credentials cannot list, create, or resolve tags — the user must
  supply raw tag IDs. Since August 2024 the Discord client exposes **Copy Tag
  ID** (Developer Mode → right-click a tag), so this is a one-time setup step
  on par with copying the webhook URL
  ([discord-api-docs#5908](https://github.com/discord/discord-api-docs/discussions/5908)).
- Tag IDs cannot be validated upfront (no webhook-accessible endpoint returns
  a forum's `available_tags`); a bad ID only surfaces as a 400 at post time.
- Tags are fixed per webhook. Per-session/dynamic tags are out of scope.

## Data model

- `IReportWebhook.forumTagIds?: string` — the raw text exactly as the user
  typed it (no normalization on save), typed optional because legacy
  persisted hooks lack the field. `makeDefaultReportWebhook` sets `''`.
  Persistence is the existing whole-array pass-through, so legacy hooks
  simply lack the field; every consumer treats `undefined` as `''`. No
  migration.
- `parseForumTagIds(raw?: string): string[]` in `src/shared/reportWebhooks.ts`:
  `raw.match(/\d+/g)` filtered to 15–21 digit runs, deduped preserving
  order, uncapped — consumers cap at `MAX_FORUM_POST_TAGS = 5` (posting
  slices to 5; the UI uses the overflow to show its "first 5 are used"
  note). Snowflakes are 17–20 digits today; the 15–21 window tolerates
  drift while ignoring stray short numbers in pasted text (tag names,
  counts), and an over-long digit run yields nothing rather than splitting
  into bogus IDs. Returns `[]` for undefined/empty/no matches.

## Changes by file

1. **`src/shared/reportWebhooks.ts`** — add the field to `IReportWebhook`,
   `''` default in `makeDefaultReportWebhook`, export `MAX_FORUM_POST_TAGS`
   and `parseForumTagIds`.

2. **`src/renderer/ReportWebhooksCard.tsx`** — extend the draft key union
   (`'name' | 'url' | 'titleTemplate'`) with `'forumTagIds'`. Render one text
   input, only when `hook.isForum` is checked, using the same
   commit-on-blur draft pattern as the other text fields. Muted hint line
   below it:
   - parsed count when > 0: `N tag(s) will be applied`;
   - warning when the raw text is non-empty but nothing parses: `No tag IDs
     recognized — IDs are 17–20 digit numbers`;
   - note when more than 5 parse: `Discord allows 5 tags per post; the first
     5 are used`;
   - always: `Get IDs in Discord: User Settings → Advanced → Developer Mode,
     then right-click a tag in the forum → Copy Tag ID`.

3. **`src/main/reportWebhooks.ts`** — `post(withThreadName)` becomes
   `post(withThreadName, withTags)`; when `withThreadName && withTags` and
   `parseForumTagIds(hook.forumTagIds)` is non-empty, set
   `body.applied_tags` to the parsed IDs. `applied_tags` is never sent
   without `thread_name`, and the key is omitted entirely (never `[]`) when
   there are no IDs. Retry ladder below.

4. **Tests** — see Testing.

## Posting retry ladder

Per response, the `thread_name` check takes precedence (structural: wrong
channel type changes whether tags are sent at all), then the `applied_tags`
check (content: bad tag IDs). At most one forum-flag flip and one tag-drop
retry per hook — worst case 3 POSTs, each with its own existing 10s timeout.

1. First attempt: `post(hook.isForum, true)`.
2. 400 matching `/thread[_ ]?name/i` → existing flip self-heal, unchanged:
   retry `post(!isForum, true)` and persist the corrected flag on success
   (tags ride along when the flip turns `thread_name` on; they are gated off
   it when the flip turns it off).
3. 400 matching `/applied_tags/i` (on the first attempt or on a flipped
   attempt) → retry the same shape without tags. On success the hook's
   result stays `ok: true` and `persistForumFlag` still fires if a flip was
   involved, but `onStatus` emits a warning: `Posted to <name> without tags —
   check its forum tag IDs.`

Tag failures persist nothing — the bad IDs stay in settings for the user to
fix — and every fallback path still tries to land the report link.
`ReportWebhookPostResult` is unchanged; a tags-dropped success is `ok: true`
with the degradation conveyed by the warning status line.

Walked sequences:

- Forum hook, bad tag ID: `thread+tags` → 400 applied_tags → `thread` → ok
  (warn).
- Regular-flagged hook that is actually a forum, tags configured: `plain` →
  400 thread_name → `thread+tags` → 400 applied_tags → `thread` → ok (warn,
  flag persisted).
- Forum-flagged hook that is actually regular: `thread+tags` → 400
  thread_name → `plain` → ok (flag persisted; tags unused by gating).

## Testing

`src/main/__tests__/reportWebhooks.test.ts`:

- forum hook with `forumTagIds` sends parsed `applied_tags`;
- non-forum hook never sends `applied_tags` even when the field is set;
- legacy hook object without the field and hook with garbage-only text →
  no `applied_tags` key in the body;
- 7 IDs → first 5 sent; duplicates deduped;
- 400 mentioning `applied_tags` → retried without tags, result `ok: true`,
  warning status emitted;
- flip-to-forum self-heal carries tags; tag 400 on the flipped attempt →
  third attempt without tags, `persistForumFlag` called on success;
- existing thread_name/self-heal tests remain green.

`src/shared/__tests__/reportWebhooks.test.ts` — `parseForumTagIds`: comma,
space, and newline separators; IDs embedded in prose; short and over-long
digit runs ignored; 15/21-digit boundaries; dedupe; uncapped output;
`undefined`/`''` → `[]`.

`src/renderer/__tests__/ReportWebhooksCard.test.tsx` — field renders only
when Forum channel is checked; value commits on blur; hint shows parsed
count / no-IDs warning / first-5 note.

## Out of scope

- Dynamic tags (per-commander/guild/session mapping).
- Tag name→ID resolution or upfront validation against Discord — impossible
  with webhook-only credentials.
- Tags for the fight-summary webhooks (`src/main/discord.ts`) — that path
  has no forum support today.
- Editing tags on already-posted reports.
