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

> **Error:** No Discord bot token found. Add `DISCORD_BOT_TOKEN` to your `.env` file.

Store the token value for use in subsequent API calls.

### Step 3: Fetch Thread Metadata

Use WebFetch to call the Discord API:

- **URL:** `https://discord.com/api/v10/channels/$ARGUMENTS`
- **Headers:** `Authorization: Bot <token>`

If the response status is:
- **401 or 403:** Stop. Output: "Bot token is invalid or the bot lacks permission to read this channel."
- **404:** Stop. Output: "Thread not found. Check that the thread ID is correct and the bot has access to the channel."
- **429:** Read `retry_after` from the response body, wait that many seconds, then retry once. If still 429, stop and report the rate limit.

From the response, note the thread `name` (this is the thread title).

### Step 4: Fetch All Messages

Use WebFetch to fetch messages:

- **URL:** `https://discord.com/api/v10/channels/$ARGUMENTS/messages?limit=100`
- **Headers:** `Authorization: Bot <token>`

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

- Use WebFetch to fetch the attachment `url`.
- View the image to understand what it shows (mockup, screenshot, diagram, etc.).
- Note which message it was attached to and what it depicts.

Also check each message's `embeds` array for any embeds with `image` or `thumbnail` fields and fetch those too.

### Step 6: Synthesize the Feature Request

Compile everything you've read into a structured summary. Format it like this:

```
## Feature Request from Discord Thread

**Thread:** <thread name>
**Participants:** <comma-separated list of unique author usernames>
**Message count:** <number>

### Feature Description
<Distill the conversation into a clear feature request. What does the user want built? Be specific.>

### Visual References
<For each image you viewed, describe what it shows and how it relates to the feature request. If no images, write "None.">

### Key Decisions & Constraints
<List any decisions, preferences, or constraints mentioned in the thread. If none, write "None explicitly stated.">

### Raw Thread Transcript
<For each message in chronological order:>
**<author username>** (<timestamp>):
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
