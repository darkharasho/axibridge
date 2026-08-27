---
name: discord-implement
description: Read a Discord thread and implement the feature described in it
---

# Discord Thread Feature Implementer

Read a Discord thread and implement the feature described in it.

**Thread ID:** $ARGUMENTS

## Instructions

Follow these steps exactly. Do not skip steps or reorder them.

### Step 1: Validate Input

If `$ARGUMENTS` is empty or missing, stop and output:

> **Error:** Usage: `/discord-implement <thread_id>`

### Step 2: Read the Discord Bot Token

Use the Bash tool to read the token from `.env`:

```bash
grep '^DISCORD_BOT_TOKEN=' .env | sed 's/^DISCORD_BOT_TOKEN=//' | tr -d '"' | tr -d "'"
```

If the output is empty or the file doesn't exist, stop and output:

> **Error:** No Discord bot token found. Add `DISCORD_BOT_TOKEN=<your_token>` to `.env` at the repository root.

Store the token value for use in subsequent API calls.

### Step 3: Fetch Thread Metadata

Use the Bash tool to call the Discord API:

```bash
curl -s -w "\n%{http_code}" -H "Authorization: Bot <token>" "https://discord.com/api/v10/channels/$ARGUMENTS"
```

The `-w "\n%{http_code}"` appends the HTTP status code on a new line so you can check for errors.

If the response status is:
- **401 or 403:** Stop. Output: "Bot token is invalid or the bot lacks permission to read this channel."
- **404:** Stop. Output: "Thread not found. Check that the thread ID is correct and the bot has access to the channel."
- **429:** Read `retry_after` from the response JSON body. Use the Bash tool to run `sleep <retry_after>`, then retry the request once. If still 429, stop and report the rate limit.

From the response, note the thread `name` (this is the thread title).

### Step 4: Fetch All Messages

Use the Bash tool to fetch messages:

```bash
curl -s -w "\n%{http_code}" -H "Authorization: Bot <token>" "https://discord.com/api/v10/channels/$ARGUMENTS/messages?limit=100"
```

Handle errors the same as Step 3.

Messages are returned newest-first. If 100 messages are returned (meaning there may be more), paginate:

- Take the `id` of the **last** message in the response (the oldest one returned).
- Fetch again with `&before=<that_id>`.
- Repeat until fewer than 100 messages are returned.

Collect all messages and reverse them to chronological order.

If no messages are found, stop and output:

> **Warning:** Thread has no messages. Nothing to implement.

### Step 5: Download and View Images

For each message, check its `attachments` array. For each attachment where `content_type` starts with `image/`:

- Use the Bash tool to download the image:

```bash
curl -s -o /tmp/discord_img_<message_id>_<index>.png "<attachment_url>"
```

- Then use the Read tool to view `/tmp/discord_img_<message_id>_<index>.png` to see the image.
- Note which message it was attached to and what it depicts.

Also check each message's `embeds` array for any embeds with `image` or `thumbnail` fields and fetch those too using the same curl-then-Read pattern.

### Step 6: Synthesize the Feature Request

Compile everything you've read into a structured summary. Format it like this:

```
## Feature Request from Discord Thread

**Thread:** <thread name>
**Participants:** <comma-separated list of unique author display names>
**Message count:** <number>

### Feature Description
<Distill the conversation into a clear feature request. What does the user want built? Be specific.>

### Visual References
<For each image you viewed, describe what it shows and how it relates to the feature request. If no images, write "None.">

### Key Decisions & Constraints
<List any decisions, preferences, or constraints mentioned in the thread. If none, write "None explicitly stated.">

### Raw Thread Transcript
<For each message in chronological order:>
**<author global_name or username>** (<timestamp>):
(Prefer `author.global_name` when present — this is the display name — falling back to `author.username`.)
<message content>
<if attachments: [Image: <description of what the image shows>]>
```

Present this synthesis to the user and ask:

> "Here's what I found in the thread. Does this capture the feature request correctly? Any corrections before I start brainstorming?"

**Wait for the user to confirm before proceeding.**

### Step 7: Begin Brainstorming

After the user confirms the synthesis, invoke the brainstorming skill:

Use the Skill tool to invoke `superpowers:brainstorming`.

Frame your opening message to the brainstorming flow as:

> "I need to implement a feature for the AxiBridge project based on a Discord thread discussion. Here's the feature request: <paste the Feature Description and Visual References and Key Decisions sections from the synthesis>"

Then follow the brainstorming skill's process from there.

### Step 8: Close the Discord Thread

After the feature has been fully implemented, merged, and the user confirms it's done, close out the Discord thread. Use the bot token from Step 2 and the thread ID from the arguments.

**Important:** All Discord API calls in this step must pipe JSON through Python to avoid shell escaping issues with curl's `-d` flag. Use this pattern for every POST/PATCH:

```bash
python3 -c "
import json, sys
sys.stdout.write(json.dumps(<payload_dict>))
" | curl -s -w '\n%{http_code}' -X <METHOD> \
  -H 'Authorization: Bot <token>' \
  -H 'Content-Type: application/json' \
  -d @- '<url>'
```

**8a. Post a comment summarizing what was implemented:**

```bash
python3 -c "
import json, sys
sys.stdout.write(json.dumps({'content': '<summary of what was implemented>'}))
" | curl -s -w '\n%{http_code}' -X POST \
  -H 'Authorization: Bot <token>' \
  -H 'Content-Type: application/json' \
  -d @- 'https://discord.com/api/v10/channels/$ARGUMENTS/messages'
```

**8b. Add the "Closed" tag and archive (close) the thread:**

First, fetch the parent forum channel's available tags to find the "Closed" tag ID:

```bash
curl -s -H "Authorization: Bot <token>" "https://discord.com/api/v10/channels/<parent_id>" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'{t[\"id\"]}: {t[\"name\"]}') for t in d.get('available_tags',[])]"
```

The `parent_id` comes from the thread metadata fetched in Step 3.

Then PATCH the thread to **add** the "Closed" tag and archive it.

**Keep the thread's existing tags.** Bug/Idea and product tags (AxiBridge, AxiLog, etc.)
are what make closed threads findable later — closing a thread must not strip them.
Take `applied_tags` from the Step 3 metadata, append the "Closed" tag id if it isn't
already there, and send the combined list. Drop only a conflicting status tag such as
"Wont Do". Discord caps `applied_tags` at 5.

```bash
python3 -c "
import json, sys
existing = <applied_tags from Step 3 metadata>
closed = '<closed_tag_id>'
tags = existing + ([closed] if closed not in existing else [])
sys.stdout.write(json.dumps({'applied_tags': tags, 'archived': True}))
" | curl -s -w '\n%{http_code}' -X PATCH \
  -H 'Authorization: Bot <token>' \
  -H 'Content-Type: application/json' \
  -d @- 'https://discord.com/api/v10/channels/$ARGUMENTS'
```

If any call returns 403, report that the bot lacks permission for that action and move on to the next sub-step.

If a PATCH returns 400 with `{"message": "Thread is archived", "code": 50083}`, the thread
was already closed — an archived thread accepts no other edits. Unarchive it first, then
re-send the tags and archive in one PATCH:

```bash
echo '{"archived": false}' | curl -s -X PATCH \
  -H 'Authorization: Bot <token>' -H 'Content-Type: application/json' \
  -d @- 'https://discord.com/api/v10/channels/$ARGUMENTS'
# then re-run the applied_tags + archived:true PATCH above
```
