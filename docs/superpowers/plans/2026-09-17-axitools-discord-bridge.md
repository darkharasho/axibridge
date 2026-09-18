# AxiTools Discord Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AxiBridge user link a Discord channel served by the hosted Axi bot so fight reports are posted by the bot with real class/elite-spec emoji instead of by a webhook with coloured-circle Unicode glyphs.

**Architecture:** AxiBridge keeps all embed formatting and emits semantic tokens (`{{spec:firebrand}}`) instead of glyphs when its destination is a bridge. A new AxiTools HTTP route authenticates a channel-scoped `axb1.…` key, validates the payload against a narrow whitelist, substitutes tokens against the bot's application-emoji registry, enforces Discord length limits on the *substituted* text, and sends via the bot.

**Tech Stack:** AxiTools — Python 3.10+, discord.py ≥2.3.2, aiohttp, SQLite via `StorageManager`, Pillow (already a dependency), pytest + pytest-asyncio + pytest-aiohttp. AxiBridge — TypeScript, Electron main process, axios, `form-data`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-axitools-discord-bridge-design.md` (in the `axibridge` repo)

## Global Constraints

- **Two repos.** Tasks 1–5 and 9 are in `/var/home/mstephens/Documents/GitHub/axitools`. Tasks 6–8 are in `/var/home/mstephens/Documents/GitHub/axibridge`. Commit in the repo you are editing. Never run `git reset`, `git checkout -- .`, or `git clean` in either checkout.
- **Key prefix:** `axb1.` — format `axb1.<base64url(public_url, unpadded)>.<secrets.token_urlsafe(32)>`.
- **Scope isolation (security claim):** `axb1` keys authenticate only paths starting with `/bridge`; every other credential (`axt1` keys, the global token) is rejected with `401` on `/bridge` paths.
- **Persist `sha256(key)` hex digest only.** Never store or log key material.
- **Discord limits enforced post-substitution:** 1024 chars per field value, 6000 chars per embed, 25 fields per embed, 10 embeds per message, 2000 chars of `content`.
- **Application emoji assets:** 128×128 PNG, under 256 KB, padded to square with transparency — never stretched.
- **Rate limit:** 10 reports/minute per key, burst 5, `429` with `Retry-After`.
- **No silent fallback.** A failed bridge send is never retried via another destination.
- **Bridged posts appear as the bot** ("Axi" + bot avatar). `username`/`avatar_url` are not sendable by a bot and must be omitted from bridge payloads.
- **vitest parallelism:** always `--maxWorkers=2` (per the machine's global CLAUDE.md).
- Emoji token grammar: `{{spec:<lowercase-name>}}`, matched by `\{\{spec:([a-z0-9]+)\}\}`.

---

## File Structure

**AxiTools (`/var/home/mstephens/Documents/GitHub/axitools`):**

| File | Responsibility |
|---|---|
| `axitools/storage.py` (modify) | `bridge_keys` table + `BridgeKeyInfo` + CRUD, mirroring the existing `app_keys` block |
| `axitools/api/server.py` (modify) | `BRIDGE_KEY_PREFIX`, `generate_bridge_key()`, middleware scope isolation, the two `/bridge` routes |
| `axitools/api/bridge_payload.py` (create) | Pure payload whitelist validation. No Discord, no I/O |
| `axitools/emoji_registry.py` (create) | Asset-name → token-key normalization, token substitution, post-substitution limit enforcement. Pure |
| `axitools/scripts/sync_emoji.py` (create) | Icon normalization (Pillow) + upload/diff against the application's emoji |
| `axitools/api/bridge_worker.py` (create) | Serialized send queue so report traffic can't starve the bot's global rate-limit bucket |
| `axitools/cogs/bridge.py` (create) | `/bridge pair|list|revoke` |
| `axitools/cogs/dev.py` (modify) | `/dev bridgetest` |
| `tests/test_api_bridge_keys.py` (create) | Key format, storage roundtrip, auth, cross-scope rejection |
| `tests/test_bridge_payload.py` (create) | Whitelist validation table |
| `tests/test_emoji_registry.py` (create) | Normalization, substitution, truncation boundaries |
| `tests/test_sync_emoji.py` (create) | Real-asset image normalization |
| `tests/test_cogs_bridge.py` (create) | Pairing command gating and channel binding |

**AxiBridge (`/var/home/mstephens/Documents/GitHub/axibridge`):**

| File | Responsibility |
|---|---|
| `packages/bridge-metrics/src/professionUtils.ts` (modify) | `getProfessionEmojiToken()` |
| `src/main/axiToolsKey.ts` (create) | `axb1` key parsing/validation. Pure, no I/O |
| `src/main/discord.ts` (modify) | `DiscordDestination` union, `setDestination`, send dispatch, `SendResult` |
| `src/main/index.ts` (modify) | Destination wiring, unlink-on-401, status IPC |
| `src/renderer/global.d.ts` (modify) | `IWebhook` gains `kind` + bridge fields |
| `src/renderer/SettingsView.tsx` (modify) | "Link AxiTools channel" flow |
| `src/main/__tests__/axiToolsKey.test.ts` (create) | Key parsing |
| `src/main/__tests__/discordDestination.test.ts` (create) | Dispatch, token rendering, error classification |

**Scope note:** this is one plan rather than two because the AxiBridge half consumes a contract the AxiTools half defines — they are sequentially dependent, not independent subsystems. Tasks 1–5 nonetheless ship working, testable software on their own (a relay with no client is harmless).

---

### Task 1: Bridge key storage and scope-isolated auth

**Files:**
- Modify: `axitools/storage.py` (add near the `app_keys` block, `:720` schema and `:903-990` methods)
- Modify: `axitools/api/server.py:43` (prefix constants), `:90` (generation), `:104` (middleware)
- Test: `tests/test_api_bridge_keys.py`

**Interfaces:**
- Consumes: existing `hash_app_key(key) -> str`, `resolve_public_url() -> str`, `StorageManager`.
- Produces:
  - `BRIDGE_KEY_PREFIX = "axb1."`
  - `generate_bridge_key(base_url: str | None = None) -> str`
  - `StorageManager.add_bridge_key(guild_id: int, channel_id: int, token_hash: str, created_by: int) -> BridgeKeyInfo`
  - `StorageManager.get_bridge_key_scope(token_hash: str) -> tuple[int, int] | None` → `(guild_id, channel_id)`
  - `StorageManager.touch_bridge_key(token_hash: str) -> None`
  - `StorageManager.list_bridge_keys(guild_id: int) -> list[BridgeKeyInfo]`
  - `StorageManager.revoke_bridge_key(guild_id: int, key_id: int | None = None) -> int`
  - `BridgeKeyInfo(id, guild_id, channel_id, created_by, created_at, last_used_at=None)`
  - `request["bridge_scope"]` on authenticated `/bridge` requests.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_api_bridge_keys.py`. Copy the fixture block from `tests/test_api_app_keys.py:17-66` verbatim (`FakeGuild`, `FakeBot`, `_global_token_disabled_by_default`, `bot`, `api_client`, `_bearer`, `_decode_base64url`) and add:

```python
import base64
from pathlib import Path

import pytest
import pytest_asyncio

from axitools.api.server import (
    APP_KEY_PREFIX,
    BRIDGE_KEY_PREFIX,
    DEFAULT_PUBLIC_URL,
    build_app,
    generate_app_key,
    generate_bridge_key,
    hash_app_key,
)
from axitools.storage import StorageManager


@pytest.fixture
def bridge_key(bot):
    """A key scoped to guild 123, channel 999."""
    key = generate_bridge_key()
    bot.storage.add_bridge_key(123, 999, hash_app_key(key), created_by=42)
    return key


def test_generate_bridge_key_format(monkeypatch):
    monkeypatch.setenv("AXITOOLS_PUBLIC_URL", "https://bot.example.com")
    key = generate_bridge_key()
    assert key.startswith(BRIDGE_KEY_PREFIX)
    prefix, encoded_url, secret = key.split(".", 2)
    assert prefix == "axb1"
    assert _decode_base64url(encoded_url) == "https://bot.example.com"
    assert len(secret) == 43
    assert "." not in secret


def test_bridge_and_app_prefixes_differ():
    assert BRIDGE_KEY_PREFIX != APP_KEY_PREFIX
    assert not generate_bridge_key().startswith(APP_KEY_PREFIX)


def test_bridge_key_storage_roundtrip(tmp_path):
    storage = StorageManager(tmp_path)
    info = storage.add_bridge_key(123, 999, "hash-one", created_by=42)
    assert info.guild_id == 123
    assert info.channel_id == 999
    assert storage.get_bridge_key_scope("hash-one") == (123, 999)

    assert [k.id for k in storage.list_bridge_keys(123)] == [info.id]
    assert storage.revoke_bridge_key(123, info.id) == 1
    assert storage.get_bridge_key_scope("hash-one") is None


def test_bridge_key_revoke_all_for_guild(tmp_path):
    storage = StorageManager(tmp_path)
    storage.add_bridge_key(123, 999, "hash-a", created_by=1)
    storage.add_bridge_key(123, 888, "hash-b", created_by=1)
    storage.add_bridge_key(456, 777, "hash-c", created_by=1)
    assert storage.revoke_bridge_key(123) == 2
    assert storage.get_bridge_key_scope("hash-c") == (456, 777)


def test_touch_bridge_key_sets_last_used(tmp_path):
    storage = StorageManager(tmp_path)
    info = storage.add_bridge_key(123, 999, "hash-one", created_by=42)
    assert storage.list_bridge_keys(123)[0].last_used_at is None
    storage.touch_bridge_key("hash-one")
    assert storage.list_bridge_keys(123)[0].last_used_at is not None
    assert info.id == storage.list_bridge_keys(123)[0].id


@pytest.mark.asyncio
async def test_bridge_key_authenticates_whoami(api_client, bridge_key):
    resp = await api_client.get("/bridge/whoami", headers=_bearer(bridge_key))
    assert resp.status != 401


@pytest.mark.asyncio
async def test_unknown_bridge_key_is_401(api_client):
    resp = await api_client.get("/bridge/whoami", headers=_bearer(generate_bridge_key()))
    assert resp.status == 401


@pytest.mark.asyncio
async def test_app_key_rejected_on_bridge_route(api_client, bot):
    key = generate_app_key()
    bot.storage.add_app_key(123, hash_app_key(key), created_by=42)
    resp = await api_client.get("/bridge/whoami", headers=_bearer(key))
    assert resp.status == 401


@pytest.mark.asyncio
async def test_global_token_rejected_on_bridge_route(aiohttp_client, bot, monkeypatch):
    monkeypatch.setenv("AXITOOLS_ALLOW_GLOBAL_TOKEN", "1")
    client = await aiohttp_client(build_app(bot, token="test-token"))
    resp = await client.get("/bridge/whoami", headers=_bearer("test-token"))
    assert resp.status == 401


@pytest.mark.asyncio
async def test_bridge_key_rejected_on_guild_routes(api_client, bridge_key):
    resp = await api_client.get("/guilds/123/builds", headers=_bearer(bridge_key))
    assert resp.status == 401


@pytest.mark.asyncio
async def test_bridge_key_rejected_on_guilds_index(api_client, bridge_key):
    resp = await api_client.get("/guilds", headers=_bearer(bridge_key))
    assert resp.status == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /var/home/mstephens/Documents/GitHub/axitools && python -m pytest tests/test_api_bridge_keys.py -v`
Expected: FAIL — `ImportError: cannot import name 'BRIDGE_KEY_PREFIX'`.

- [ ] **Step 3: Add the storage layer**

In `axitools/storage.py`, add the dataclass next to `AppKeyInfo` (`:574`):

```python
@dataclass
class BridgeKeyInfo:
    """A channel-scoped AxiBridge report key."""

    id: int
    guild_id: int
    channel_id: int
    created_by: int
    created_at: str
    last_used_at: Optional[str] = None
```

In the `executescript` schema block that creates `app_keys` (`:720`), append:

```sql
                CREATE TABLE IF NOT EXISTS bridge_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL,
                    channel_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_by INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    last_used_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_bridge_keys_guild ON bridge_keys(guild_id);
```

Add the methods after `revoke_app_key`:

```python
    def add_bridge_key(
        self, guild_id: int, channel_id: int, token_hash: str, created_by: int
    ) -> BridgeKeyInfo:
        """Register a channel-scoped AxiBridge key. Existing keys stay valid."""

        created_at = utcnow()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO bridge_keys
                    (guild_id, channel_id, token_hash, created_by, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (guild_id, channel_id, token_hash, created_by, created_at),
            )
            key_id = int(cursor.lastrowid)
        return BridgeKeyInfo(
            id=key_id,
            guild_id=guild_id,
            channel_id=channel_id,
            created_by=created_by,
            created_at=created_at,
        )

    def get_bridge_key_scope(self, token_hash: str) -> Optional[tuple]:
        """Return ``(guild_id, channel_id)`` bound to ``token_hash``, if any."""

        with self._connect() as connection:
            row = connection.execute(
                "SELECT guild_id, channel_id FROM bridge_keys WHERE token_hash = ? LIMIT 1",
                (token_hash,),
            ).fetchone()
        return (int(row["guild_id"]), int(row["channel_id"])) if row else None

    def touch_bridge_key(self, token_hash: str) -> None:
        """Record that a bridge key was just used. Best-effort; never raises."""

        try:
            with self._connect() as connection:
                connection.execute(
                    "UPDATE bridge_keys SET last_used_at = ? WHERE token_hash = ?",
                    (utcnow(), token_hash),
                )
        except Exception:  # logging-only path; auth must not fail on a stats write
            logger.debug("touch_bridge_key failed", exc_info=True)

    def list_bridge_keys(self, guild_id: int) -> List[BridgeKeyInfo]:
        """All bridge keys for a guild, oldest first."""

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, guild_id, channel_id, created_by, created_at, last_used_at
                FROM bridge_keys WHERE guild_id = ? ORDER BY id
                """,
                (guild_id,),
            ).fetchall()
        return [
            BridgeKeyInfo(
                id=int(row["id"]),
                guild_id=int(row["guild_id"]),
                channel_id=int(row["channel_id"]),
                created_by=int(row["created_by"]),
                created_at=str(row["created_at"]),
                last_used_at=row["last_used_at"],
            )
            for row in rows
        ]

    def revoke_bridge_key(self, guild_id: int, key_id: Optional[int] = None) -> int:
        """Delete bridge keys for a guild. With ``key_id`` only that key is removed;
        without it, every key for the guild is removed. Returns rows deleted."""

        with self._connect() as connection:
            if key_id is None:
                cursor = connection.execute(
                    "DELETE FROM bridge_keys WHERE guild_id = ?", (guild_id,)
                )
            else:
                cursor = connection.execute(
                    "DELETE FROM bridge_keys WHERE guild_id = ? AND id = ?",
                    (guild_id, key_id),
                )
            return cursor.rowcount
```

- [ ] **Step 4: Add key generation and middleware isolation**

In `axitools/api/server.py`, beside `APP_KEY_PREFIX` (`:43`):

```python
BRIDGE_KEY_PREFIX = "axb1."
```

After `generate_app_key` (`:90`):

```python
def generate_bridge_key(base_url: str | None = None) -> str:
    """Build a channel-scoped AxiBridge key: ``axb1.<base64url(base_url)>.<secret>``."""
    if base_url is None:
        base_url = resolve_public_url()
    encoded_url = base64.urlsafe_b64encode(base_url.encode("utf-8")).rstrip(b"=").decode("ascii")
    secret = secrets.token_urlsafe(32)
    return f"{BRIDGE_KEY_PREFIX}{encoded_url}.{secret}"
```

At the **top** of `_auth_middleware` (`:104`), before the global-token check, so no other credential can reach a bridge route:

```python
@web.middleware
async def _auth_middleware(request: web.Request, handler):
    supplied = request.headers.get("Authorization", "")
    bearer = supplied[len("Bearer "):] if supplied.startswith("Bearer ") else ""

    # Bridge routes are reachable only with an axb1 key, and an axb1 key is
    # reachable only on bridge routes. This mutual exclusion is the security
    # boundary that keeps a desktop app's plaintext credential harmless.
    is_bridge_path = request.path.startswith("/bridge")
    if is_bridge_path or bearer.startswith(BRIDGE_KEY_PREFIX):
        if not (is_bridge_path and bearer.startswith(BRIDGE_KEY_PREFIX)):
            return web.json_response({"error": "unauthorized"}, status=401)
        bot = request.app["bot"]
        token_hash = hash_app_key(bearer)
        scope = await asyncio.to_thread(bot.storage.get_bridge_key_scope, token_hash)
        if scope is None:
            return web.json_response({"error": "unauthorized"}, status=401)
        asyncio.create_task(asyncio.to_thread(bot.storage.touch_bridge_key, token_hash))
        request["bridge_scope"] = scope
        return await handler(request)

    expected = f"Bearer {request.app['api_token']}"
    # … existing body unchanged from here …
```

Delete the now-duplicated `expected`/`supplied`/`bearer` assignments further down so the values above are the only ones.

- [ ] **Step 5: Add a minimal `/bridge/whoami` so the auth tests can exercise a route**

In `build_app` (`axitools/api/server.py:1621`), add before `return app`:

```python
    app.router.add_get("/bridge/whoami", _handle_bridge_whoami)
```

And the handler next to the other `_handle_*` functions:

```python
async def _handle_bridge_whoami(request: web.Request) -> web.Response:
    """Identify the guild and channel a bridge key is bound to, for paste-time
    validation in AxiBridge."""
    guild_id, channel_id = request["bridge_scope"]
    bot = request.app["bot"]
    guild = discord.utils.get(bot.guilds, id=guild_id)
    if guild is None:
        return web.json_response(
            {"error": "the bot is no longer in that server"}, status=403
        )
    channel = guild.get_channel(channel_id)
    if channel is None:
        return web.json_response(
            {"error": "the paired channel no longer exists"}, status=403
        )
    return web.json_response(
        {
            "guild_id": str(guild_id),
            "guild_name": guild.name,
            "channel_id": str(channel_id),
            "channel_name": getattr(channel, "name", str(channel_id)),
        }
    )
```

`FakeGuild` in the test has no `get_channel`, so extend the copied fixture class with:

```python
class FakeChannel:
    def __init__(self, channel_id: int, name: str) -> None:
        self.id = channel_id
        self.name = name


class FakeGuild:
    def __init__(self, guild_id: int, name: str) -> None:
        self.id = guild_id
        self.name = name
        self._channels = {999: FakeChannel(999, "wvw-reports")}

    def get_channel(self, channel_id: int):
        return self._channels.get(channel_id)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /var/home/mstephens/Documents/GitHub/axitools && python -m pytest tests/test_api_bridge_keys.py -v`
Expected: PASS (13 tests).

- [ ] **Step 7: Run the existing API suite for regressions**

Run: `python -m pytest tests/test_api_app_keys.py tests/test_api_server.py tests/test_api_domains.py -q`
Expected: PASS — the middleware rewrite must not change `axt1` or global-token behaviour.

- [ ] **Step 8: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axitools
git add axitools/storage.py axitools/api/server.py tests/test_api_bridge_keys.py
git commit -m "feat(bridge): channel-scoped axb1 keys with scope-isolated auth"
```

---

### Task 2: `/bridge pair|list|revoke` cog

**Files:**
- Create: `axitools/cogs/bridge.py`
- Test: `tests/test_cogs_bridge.py`

**Interfaces:**
- Consumes: `generate_bridge_key()`, `hash_app_key()`, `StorageManager.add_bridge_key/list_bridge_keys/revoke_bridge_key` from Task 1.
- Produces: `BridgeCog(bot)` with `bridge_pair`, `bridge_list`, `bridge_revoke` coroutine methods.

- [ ] **Step 1: Write the failing test**

Create `tests/test_cogs_bridge.py`. Model it on `tests/test_cogs_config.py`'s interaction fakes:

```python
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from axitools.api.server import BRIDGE_KEY_PREFIX, hash_app_key
from axitools.cogs.bridge import BridgeCog
from axitools.storage import StorageManager


def _interaction(*, manage_guild=True, guild_id=123, channel_id=999):
    interaction = MagicMock()
    interaction.guild = MagicMock()
    interaction.guild.id = guild_id
    interaction.guild.name = "Vigil Keep"
    interaction.channel = MagicMock()
    interaction.channel.id = channel_id
    interaction.channel.name = "wvw-reports"
    interaction.channel.mention = "#wvw-reports"
    interaction.user = MagicMock()
    interaction.user.id = 42
    interaction.user.guild_permissions.manage_guild = manage_guild
    interaction.response.send_message = AsyncMock()
    return interaction


def _cog(tmp_path: Path) -> BridgeCog:
    bot = MagicMock()
    bot.storage = StorageManager(tmp_path)
    return BridgeCog(bot)


@pytest.mark.asyncio
async def test_pair_requires_manage_guild(tmp_path):
    cog = _cog(tmp_path)
    interaction = _interaction(manage_guild=False)
    await cog.bridge_pair.callback(cog, interaction)
    assert cog.bot.storage.list_bridge_keys(123) == []
    message = interaction.response.send_message.await_args.args[0]
    assert "Manage Server" in message


@pytest.mark.asyncio
async def test_pair_binds_invoking_channel_and_is_ephemeral(tmp_path):
    cog = _cog(tmp_path)
    interaction = _interaction()
    await cog.bridge_pair.callback(cog, interaction)

    keys = cog.bot.storage.list_bridge_keys(123)
    assert len(keys) == 1
    assert keys[0].channel_id == 999
    assert keys[0].created_by == 42

    kwargs = interaction.response.send_message.await_args.kwargs
    assert kwargs["ephemeral"] is True
    message = interaction.response.send_message.await_args.args[0]
    assert BRIDGE_KEY_PREFIX in message
    assert "only shown once" in message


@pytest.mark.asyncio
async def test_paired_key_hash_is_what_is_stored(tmp_path):
    cog = _cog(tmp_path)
    interaction = _interaction()
    await cog.bridge_pair.callback(cog, interaction)
    message = interaction.response.send_message.await_args.args[0]
    key = next(t for t in message.split() if t.startswith(BRIDGE_KEY_PREFIX))
    assert cog.bot.storage.get_bridge_key_scope(hash_app_key(key)) == (123, 999)


@pytest.mark.asyncio
async def test_list_shows_only_this_guilds_pairings(tmp_path):
    cog = _cog(tmp_path)
    cog.bot.storage.add_bridge_key(123, 999, "hash-a", created_by=42)
    cog.bot.storage.add_bridge_key(456, 777, "hash-b", created_by=42)
    interaction = _interaction()
    await cog.bridge_list.callback(cog, interaction)
    message = interaction.response.send_message.await_args.args[0]
    assert "999" in message
    assert "777" not in message


@pytest.mark.asyncio
async def test_revoke_removes_one_key(tmp_path):
    cog = _cog(tmp_path)
    info = cog.bot.storage.add_bridge_key(123, 999, "hash-a", created_by=42)
    interaction = _interaction()
    await cog.bridge_revoke.callback(cog, interaction, info.id)
    assert cog.bot.storage.list_bridge_keys(123) == []


@pytest.mark.asyncio
async def test_revoke_cannot_touch_another_guilds_key(tmp_path):
    cog = _cog(tmp_path)
    other = cog.bot.storage.add_bridge_key(456, 777, "hash-b", created_by=42)
    interaction = _interaction(guild_id=123)
    await cog.bridge_revoke.callback(cog, interaction, other.id)
    assert cog.bot.storage.get_bridge_key_scope("hash-b") == (456, 777)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_cogs_bridge.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'axitools.cogs.bridge'`.

- [ ] **Step 3: Write the cog**

Create `axitools/cogs/bridge.py`:

```python
"""AxiBridge report-relay pairing commands."""
from __future__ import annotations

import logging
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from ..api.server import generate_bridge_key, hash_app_key
from ..bot import AxiToolsBot

LOGGER = logging.getLogger(__name__)


class BridgeCog(
    commands.GroupCog, name="bridge", group_extras={"category": "Server Setup"}
):
    """Pair AxiBridge desktop clients to a channel in this server."""

    def __init__(self, bot: AxiToolsBot) -> None:
        super().__init__()
        self.bot = bot

    @staticmethod
    async def _check_manage_guild(interaction: discord.Interaction) -> bool:
        """Gate pairing behind Manage Server, replying ephemerally on failure."""
        if not interaction.guild:
            await interaction.response.send_message(
                "This command can only be used inside a server.", ephemeral=True
            )
            return False
        if not isinstance(interaction.user, discord.Member) and not hasattr(
            interaction.user, "guild_permissions"
        ):
            await interaction.response.send_message(
                "Unable to resolve your server membership.", ephemeral=True
            )
            return False
        if not interaction.user.guild_permissions.manage_guild:
            await interaction.response.send_message(
                "You need the **Manage Server** permission to pair AxiBridge.",
                ephemeral=True,
            )
            return False
        return True

    @app_commands.command(
        name="pair",
        description="Generate an AxiBridge key that posts fight reports to this channel.",
    )
    async def bridge_pair(self, interaction: discord.Interaction) -> None:
        if not await self._check_manage_guild(interaction):
            return

        # The channel is the invocation context, never a parameter: a key can
        # never be minted for a channel the invoker cannot see.
        key = generate_bridge_key()
        self.bot.storage.add_bridge_key(
            interaction.guild.id,
            interaction.channel.id,
            hash_app_key(key),
            interaction.user.id,
        )
        await interaction.response.send_message(
            f"AxiBridge key for **{interaction.guild.name}** → "
            f"{interaction.channel.mention}:\n"
            f"```\n{key}\n```\n"
            "Paste this into AxiBridge → Settings → Discord → **Link AxiTools "
            "channel**. Reports will be posted by this bot, not a webhook.\n"
            "⚠️ This key is only shown once. Use `/bridge list` to review or "
            "`/bridge revoke` to remove it.",
            ephemeral=True,
        )

    @app_commands.command(
        name="list", description="List the AxiBridge pairings for this server."
    )
    async def bridge_list(self, interaction: discord.Interaction) -> None:
        if not await self._check_manage_guild(interaction):
            return

        keys = self.bot.storage.list_bridge_keys(interaction.guild.id)
        if not keys:
            await interaction.response.send_message(
                "No AxiBridge pairings on this server. Create one with "
                "`/bridge pair` in the channel that should receive reports.",
                ephemeral=True,
            )
            return

        lines = []
        for info in keys:
            channel = interaction.guild.get_channel(info.channel_id)
            where = channel.mention if channel else f"deleted channel {info.channel_id}"
            used = info.last_used_at or "never used"
            lines.append(
                f"`#{info.id}` → {where} · created by <@{info.created_by}> "
                f"on {info.created_at} · last used {used}"
            )
        await interaction.response.send_message(
            "**AxiBridge pairings**\n"
            + "\n".join(lines)
            + "\n\nRemove one with `/bridge revoke id:<number>`.",
            ephemeral=True,
        )

    @app_commands.command(name="revoke", description="Revoke an AxiBridge pairing by id.")
    @app_commands.describe(id="The pairing id from /bridge list.")
    async def bridge_revoke(self, interaction: discord.Interaction, id: int) -> None:
        if not await self._check_manage_guild(interaction):
            return

        removed = self.bot.storage.revoke_bridge_key(interaction.guild.id, id)
        await interaction.response.send_message(
            f"Revoked pairing `#{id}`. That key can no longer post here."
            if removed
            else f"No pairing `#{id}` on this server. See `/bridge list`.",
            ephemeral=True,
        )


async def setup(bot: AxiToolsBot) -> None:
    await bot.add_cog(BridgeCog(bot))
```

- [ ] **Step 4: Register the cog**

Find where cogs are loaded in `axitools/bot.py` (grep for `cogs.config`) and add `cogs.bridge` to the same list, in alphabetical position.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_cogs_bridge.py tests/test_bot_sanity.py -v`
Expected: PASS. `test_bot_sanity.py` covers cog loading, so it catches a registration typo.

- [ ] **Step 6: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axitools
git add axitools/cogs/bridge.py axitools/bot.py tests/test_cogs_bridge.py
git commit -m "feat(bridge): add /bridge pair|list|revoke"
```

---

### Task 3: Emoji registry — key normalization, substitution, limit enforcement

**Files:**
- Create: `axitools/emoji_registry.py`
- Test: `tests/test_emoji_registry.py`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `TOKEN_RE: re.Pattern`
  - `emoji_key_for_asset(filename: str) -> str`
  - `substitute(text: str, registry: dict[str, str]) -> str`
  - `substitute_payload(payload: dict, registry: dict[str, str]) -> dict`
  - `enforce_limits(payload: dict) -> dict`
  - `FIELD_VALUE_LIMIT = 1024`, `EMBED_CHAR_LIMIT = 6000`, `FIELDS_PER_EMBED = 25`, `MAX_EMBEDS = 10`, `CONTENT_LIMIT = 2000`

- [ ] **Step 1: Write the failing test**

Create `tests/test_emoji_registry.py`:

```python
import pytest

from axitools.emoji_registry import (
    EMBED_CHAR_LIMIT,
    FIELD_VALUE_LIMIT,
    emoji_key_for_asset,
    enforce_limits,
    substitute,
    substitute_payload,
)

REGISTRY = {
    "firebrand": "<:firebrand:111111111111111111>",
    "revenant": "<:revenant:222222222222222222>",
}


@pytest.mark.parametrize(
    "filename,expected",
    [
        ("Firebrand.png", "firebrand"),
        ("Revenant_icon.png", "revenant"),
        ("Guardian.png", "guardian"),
        ("Bladesworn.png", "bladesworn"),
    ],
)
def test_emoji_key_for_asset(filename, expected):
    assert emoji_key_for_asset(filename) == expected


def test_substitute_known_token():
    assert substitute("{{spec:firebrand}} Alice", REGISTRY) == (
        "<:firebrand:111111111111111111> Alice"
    )


def test_substitute_unknown_token_degrades_to_name():
    assert substitute("{{spec:harbinger}} Bob", REGISTRY) == "Harbinger Bob"


def test_substitute_leaves_other_text_alone():
    assert substitute("no tokens {here}", REGISTRY) == "no tokens {here}"


def test_substitute_payload_covers_content_and_fields():
    payload = {
        "content": "{{spec:firebrand}}",
        "embeds": [
            {
                "title": "{{spec:revenant}} fight",
                "description": "{{spec:firebrand}}",
                "fields": [
                    {"name": "{{spec:firebrand}}", "value": "{{spec:revenant}} x", "inline": True}
                ],
                "footer": {"text": "{{spec:firebrand}}"},
            }
        ],
    }
    out = substitute_payload(payload, REGISTRY)
    assert out["content"] == REGISTRY["firebrand"]
    embed = out["embeds"][0]
    assert embed["title"] == f"{REGISTRY['revenant']} fight"
    assert embed["description"] == REGISTRY["firebrand"]
    assert embed["fields"][0]["name"] == REGISTRY["firebrand"]
    assert embed["fields"][0]["value"] == f"{REGISTRY['revenant']} x"
    assert embed["footer"]["text"] == REGISTRY["firebrand"]


def test_substitute_payload_does_not_mutate_input():
    payload = {"embeds": [{"description": "{{spec:firebrand}}"}]}
    substitute_payload(payload, REGISTRY)
    assert payload["embeds"][0]["description"] == "{{spec:firebrand}}"


# --- limit enforcement -----------------------------------------------------
# These are the cases the whole design exists to prevent: a field that fits
# BEFORE substitution and overflows AFTER.

def _rows(n: int) -> str:
    # Each row is 30 chars of emoji markup + a short name, like a real report.
    return "\n".join(f"{REGISTRY['firebrand']} Player{i:02d}" for i in range(n))


def test_field_value_under_limit_is_untouched():
    value = _rows(5)
    payload = {"embeds": [{"fields": [{"name": "Damage", "value": value}]}]}
    assert enforce_limits(payload)["embeds"][0]["fields"][0]["value"] == value


def test_oversized_field_value_is_truncated_to_whole_rows():
    value = _rows(40)  # ~40 × 40 chars ≫ 1024
    assert len(value) > FIELD_VALUE_LIMIT
    payload = {"embeds": [{"fields": [{"name": "Damage", "value": value}]}]}
    out = enforce_limits(payload)["embeds"][0]["fields"][0]["value"]
    assert len(out) <= FIELD_VALUE_LIMIT
    # Never split a row, and never split an emoji reference.
    original_rows = value.split("\n")
    assert out.split("\n") == original_rows[: len(out.split("\n"))]
    assert "<:firebrand:111111111111111111" not in out.replace(
        REGISTRY["firebrand"], ""
    )


def test_single_row_longer_than_limit_is_dropped_not_split():
    payload = {"embeds": [{"fields": [{"name": "X", "value": "a" * 2000}]}]}
    fields = enforce_limits(payload)["embeds"][0].get("fields", [])
    assert fields == []


def test_embed_char_limit_drops_trailing_fields():
    field = {"name": "Damage", "value": _rows(20)}
    payload = {"embeds": [{"fields": [dict(field) for _ in range(30)]}]}
    embed = enforce_limits(payload)["embeds"][0]
    total = sum(len(f["name"]) + len(f["value"]) for f in embed["fields"])
    assert total <= EMBED_CHAR_LIMIT
    assert len(embed["fields"]) <= 25


def test_too_many_embeds_are_dropped():
    payload = {"embeds": [{"description": "x"} for _ in range(14)]}
    assert len(enforce_limits(payload)["embeds"]) == 10
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_emoji_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'axitools.emoji_registry'`.

- [ ] **Step 3: Write the module**

Create `axitools/emoji_registry.py`:

```python
"""Application-emoji token substitution for relayed AxiBridge reports.

AxiBridge emits semantic tokens (``{{spec:firebrand}}``) rather than emoji
markup, because a changed icon is a delete-plus-create in Discord's API and so
gets a NEW id — an id cached in a desktop app would rot. The bot substitutes at
send time from its own registry.

Substitution GROWS the text: ``{{spec:firebrand}}`` is 18 characters,
``<:firebrand:1234567890123456789>`` is ~32. So Discord's limits have to be
enforced here, after substitution, not by the client beforehand.
"""
from __future__ import annotations

import re
from typing import Dict

TOKEN_RE = re.compile(r"\{\{spec:([a-z0-9]+)\}\}")

FIELD_VALUE_LIMIT = 1024
EMBED_CHAR_LIMIT = 6000
FIELDS_PER_EMBED = 25
MAX_EMBEDS = 10
CONTENT_LIMIT = 2000


def emoji_key_for_asset(filename: str) -> str:
    """Registry key for an icon file in ``media/gw2classicons``.

    Assets are bare spec/profession names (``Firebrand.png``) with one
    exception, ``Revenant_icon.png``, so a trailing ``_icon`` is stripped.
    """
    stem = filename.rsplit(".", 1)[0]
    if stem.endswith("_icon"):
        stem = stem[: -len("_icon")]
    return stem.lower()


def substitute(text: str, registry: Dict[str, str]) -> str:
    """Replace ``{{spec:x}}`` with its emoji markup.

    An unknown key degrades to the capitalized name so a report from a newer
    AxiBridge naming a spec this bot has not synced still posts readably.
    """
    if not text:
        return text

    def _replace(match: re.Match) -> str:
        key = match.group(1)
        return registry.get(key) or key.capitalize()

    return TOKEN_RE.sub(_replace, text)


def substitute_payload(payload: dict, registry: Dict[str, str]) -> dict:
    """Return a copy of *payload* with every text field substituted."""
    out = dict(payload)
    if "content" in out:
        out["content"] = substitute(out["content"], registry)

    embeds = []
    for embed in out.get("embeds") or []:
        new_embed = dict(embed)
        for key in ("title", "description"):
            if key in new_embed:
                new_embed[key] = substitute(new_embed[key], registry)
        if isinstance(new_embed.get("footer"), dict) and "text" in new_embed["footer"]:
            footer = dict(new_embed["footer"])
            footer["text"] = substitute(footer["text"], registry)
            new_embed["footer"] = footer
        if new_embed.get("fields"):
            new_embed["fields"] = [
                {
                    **field,
                    "name": substitute(field.get("name", ""), registry),
                    "value": substitute(field.get("value", ""), registry),
                }
                for field in new_embed["fields"]
            ]
        embeds.append(new_embed)
    if embeds or "embeds" in out:
        out["embeds"] = embeds
    return out


def _truncate_rows(value: str, limit: int) -> str:
    """Drop trailing newline-separated rows until *value* fits.

    Rows are never split, so an ``<:name:id>`` reference can never be cut in
    half — a half-reference renders as literal text and looks broken.
    """
    if len(value) <= limit:
        return value
    rows = value.split("\n")
    while rows:
        rows.pop()
        candidate = "\n".join(rows)
        if len(candidate) <= limit:
            return candidate
    return ""


def enforce_limits(payload: dict) -> dict:
    """Return a copy of *payload* trimmed to Discord's documented maxima."""
    out = dict(payload)
    if out.get("content"):
        out["content"] = out["content"][:CONTENT_LIMIT]

    embeds = []
    for embed in (out.get("embeds") or [])[:MAX_EMBEDS]:
        new_embed = dict(embed)
        if new_embed.get("fields"):
            kept = []
            used = len(new_embed.get("title") or "") + len(
                new_embed.get("description") or ""
            )
            for field in new_embed["fields"][:FIELDS_PER_EMBED]:
                value = _truncate_rows(field.get("value", ""), FIELD_VALUE_LIMIT)
                if not value:
                    continue
                cost = len(field.get("name", "")) + len(value)
                if used + cost > EMBED_CHAR_LIMIT:
                    break
                used += cost
                kept.append({**field, "value": value})
            new_embed["fields"] = kept
        embeds.append(new_embed)
    if embeds or "embeds" in out:
        out["embeds"] = embeds
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_emoji_registry.py -v`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axitools
git add axitools/emoji_registry.py tests/test_emoji_registry.py
git commit -m "feat(bridge): emoji token substitution and post-substitution limits"
```

---

### Task 4: Emoji sync script (asset normalization + upload diff)

**Files:**
- Create: `axitools/scripts/sync_emoji.py`
- Test: `tests/test_sync_emoji.py`

**Interfaces:**
- Consumes: `emoji_key_for_asset()` from Task 3; `CLASS_ICON_PATH` from `axitools/constants.py:10`.
- Produces:
  - `normalize_icon(path: Path) -> bytes` — 128×128 square PNG bytes under 256 KB
  - `plan_sync(local: dict[str, bytes], remote: dict[str, str]) -> tuple[list[str], list[str]]` → `(to_upload, to_delete)`
  - `load_local_icons(directory: Path) -> dict[str, bytes]`
  - `build_registry(emojis: list[dict]) -> dict[str, str]` — `{key: "<:name:id>"}`

- [ ] **Step 1: Write the failing test**

Create `tests/test_sync_emoji.py`:

```python
import io
from pathlib import Path

import pytest
from PIL import Image

from axitools.constants import CLASS_ICON_PATH
from axitools.scripts.sync_emoji import (
    EMOJI_MAX_BYTES,
    EMOJI_SIZE,
    build_registry,
    load_local_icons,
    normalize_icon,
    plan_sync,
)


@pytest.mark.parametrize(
    "asset",
    ["Bladesworn.png", "Amalgam.png", "Firebrand.png", "Revenant_icon.png"],
)
def test_normalize_icon_real_assets(asset):
    """The shipped assets are 256–750px, some non-square, some over 256KB."""
    data = normalize_icon(CLASS_ICON_PATH / asset)
    assert len(data) <= EMOJI_MAX_BYTES
    image = Image.open(io.BytesIO(data))
    assert image.size == (EMOJI_SIZE, EMOJI_SIZE)
    assert image.format == "PNG"


def test_normalize_pads_rather_than_stretches(tmp_path):
    """A wide source keeps its aspect ratio; the remainder is transparent."""
    source = tmp_path / "wide.png"
    Image.new("RGBA", (200, 100), (255, 0, 0, 255)).save(source)
    image = Image.open(io.BytesIO(normalize_icon(source)))
    assert image.size == (EMOJI_SIZE, EMOJI_SIZE)
    # Middle row is opaque red, top row is transparent padding.
    assert image.getpixel((EMOJI_SIZE // 2, EMOJI_SIZE // 2))[3] == 255
    assert image.getpixel((EMOJI_SIZE // 2, 0))[3] == 0


def test_load_local_icons_keys_by_registry_key():
    icons = load_local_icons(CLASS_ICON_PATH)
    assert "firebrand" in icons
    assert "revenant" in icons  # from Revenant_icon.png
    assert "revenant_icon" not in icons
    assert all(len(v) <= EMOJI_MAX_BYTES for v in icons.values())


def test_plan_sync_uploads_missing():
    upload, delete = plan_sync({"firebrand": b"x"}, {})
    assert upload == ["firebrand"]
    assert delete == []


def test_plan_sync_leaves_matching_alone():
    upload, delete = plan_sync({"firebrand": b"x"}, {"firebrand": "111"})
    assert upload == []
    assert delete == []


def test_plan_sync_deletes_orphans():
    upload, delete = plan_sync({}, {"scrapper": "222"})
    assert upload == []
    assert delete == ["scrapper"]


def test_build_registry_formats_markup():
    registry = build_registry(
        [{"name": "firebrand", "id": "111111111111111111"}]
    )
    assert registry == {"firebrand": "<:firebrand:111111111111111111>"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_sync_emoji.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'axitools.scripts.sync_emoji'`.

- [ ] **Step 3: Write the script**

Create `axitools/scripts/__init__.py` if absent (empty file). Create `axitools/scripts/sync_emoji.py`:

```python
"""Sync ``media/gw2classicons`` into this application's Discord emoji.

Run manually — NOT at bot startup. Application emoji are global to the
application, so a startup uploader races every restart and every deployed
replica, and one bad asset would break boot instead of failing one command:

    python -m axitools.scripts.sync_emoji            # dry run
    python -m axitools.scripts.sync_emoji --apply
"""
from __future__ import annotations

import argparse
import asyncio
import io
import logging
import os
from pathlib import Path
from typing import Dict, List, Tuple

import aiohttp
from PIL import Image

from ..constants import CLASS_ICON_PATH
from ..emoji_registry import emoji_key_for_asset

LOGGER = logging.getLogger(__name__)

EMOJI_SIZE = 128          # what Discord serves emoji at anyway
EMOJI_MAX_BYTES = 256_000  # Discord's cap is 256 KB
API_BASE = "https://discord.com/api/v10"


def normalize_icon(path: Path) -> bytes:
    """Return upload-ready PNG bytes: square, ``EMOJI_SIZE``², under the cap.

    Pads the shorter axis with transparency instead of stretching — the shipped
    icons include non-square art (``Bladesworn.png`` is 572×599) and stretching
    makes it look subtly wrong.
    """
    with Image.open(path) as source:
        image = source.convert("RGBA")
        side = max(image.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
        canvas = canvas.resize((EMOJI_SIZE, EMOJI_SIZE), Image.LANCZOS)

    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", optimize=True)
    data = buffer.getvalue()
    if len(data) > EMOJI_MAX_BYTES:
        raise ValueError(f"{path.name} is {len(data)}B after normalization")
    return data


def load_local_icons(directory: Path = CLASS_ICON_PATH) -> Dict[str, bytes]:
    """Normalized PNG bytes for every icon, keyed by registry key."""
    return {
        emoji_key_for_asset(path.name): normalize_icon(path)
        for path in sorted(directory.glob("*.png"))
    }


def plan_sync(
    local: Dict[str, bytes], remote: Dict[str, str]
) -> Tuple[List[str], List[str]]:
    """Return ``(to_upload, to_delete)`` keys.

    Discord has no emoji-update endpoint, so a changed icon is a delete plus a
    create and therefore a new id. Callers delete before uploading.
    """
    to_upload = sorted(key for key in local if key not in remote)
    to_delete = sorted(key for key in remote if key not in local)
    return to_upload, to_delete


def build_registry(emojis: List[dict]) -> Dict[str, str]:
    """Map registry key -> ``<:name:id>`` markup."""
    return {
        str(emoji["name"]): f"<:{emoji['name']}:{emoji['id']}>" for emoji in emojis
    }


async def fetch_remote(session: aiohttp.ClientSession, app_id: str) -> Dict[str, str]:
    async with session.get(f"{API_BASE}/applications/{app_id}/emojis") as response:
        response.raise_for_status()
        body = await response.json()
    return {str(e["name"]): str(e["id"]) for e in body.get("items", body)}


async def main_async(apply: bool) -> int:
    token = os.environ["DISCORD_TOKEN"]
    app_id = os.environ["DISCORD_APPLICATION_ID"]
    local = load_local_icons()
    headers = {"Authorization": f"Bot {token}"}

    async with aiohttp.ClientSession(headers=headers) as session:
        remote = await fetch_remote(session, app_id)
        to_upload, to_delete = plan_sync(local, remote)
        print(f"{len(local)} local, {len(remote)} remote")
        print(f"upload: {to_upload or 'none'}")
        print(f"delete: {to_delete or 'none'}")
        if not apply:
            print("dry run — pass --apply to write")
            return 0

        for key in to_delete:
            async with session.delete(
                f"{API_BASE}/applications/{app_id}/emojis/{remote[key]}"
            ) as response:
                response.raise_for_status()
            print(f"deleted {key}")

        import base64

        for key in to_upload:
            encoded = base64.b64encode(local[key]).decode("ascii")
            async with session.post(
                f"{API_BASE}/applications/{app_id}/emojis",
                json={"name": key, "image": f"data:image/png;base64,{encoded}"},
            ) as response:
                response.raise_for_status()
            print(f"uploaded {key}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="perform the writes")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    return asyncio.run(main_async(args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_sync_emoji.py -v`
Expected: PASS (10 tests). If `normalize_icon` raises on a real asset, the optimize pass is insufficient — reduce `EMOJI_SIZE` to 112 rather than allowing an over-cap upload.

- [ ] **Step 5: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axitools
git add axitools/scripts/ tests/test_sync_emoji.py
git commit -m "feat(bridge): emoji sync script with square-pad normalization"
```

---

### Task 5: Payload validation

**Files:**
- Create: `axitools/api/bridge_payload.py`
- Test: `tests/test_bridge_payload.py`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `validate_report(body: dict) -> dict` — returns the whitelisted payload, raises `ValueError` with a user-safe message
  - `ALLOWED_EMBED_KEYS: frozenset`

- [ ] **Step 1: Write the failing test**

Create `tests/test_bridge_payload.py`:

```python
import pytest

from axitools.api.bridge_payload import validate_report

VALID = {
    "content": "**Stonemist Keep** — 12:03",
    "embeds": [
        {
            "title": "Squad Summary",
            "description": "35 players",
            "color": 3447003,
            "footer": {"text": "AxiBridge"},
            "fields": [
                {"name": "Damage", "value": "{{spec:firebrand}} Alice 1.2M", "inline": True}
            ],
        }
    ],
}


def test_accepts_a_real_report():
    out = validate_report(VALID)
    assert out["embeds"][0]["fields"][0]["name"] == "Damage"
    assert out["content"] == VALID["content"]


def test_strips_username_and_avatar():
    """A bot cannot set these, and accepting them would imply it can."""
    out = validate_report({**VALID, "username": "AxiBridge", "avatar_url": "http://x"})
    assert "username" not in out
    assert "avatar_url" not in out


@pytest.mark.parametrize(
    "payload,reason",
    [
        ({"embeds": [{"image": {"url": "http://x"}}]}, "image"),
        ({"embeds": [{"author": {"name": "x"}}]}, "author"),
        ({"embeds": [{"fields": [{"name": "a", "value": "b", "url": "http://x"}]}]}, "url"),
        ({"allowed_mentions": {"parse": ["everyone"]}, "embeds": []}, "allowed_mentions"),
        ({"mentions": ["123"], "embeds": []}, "mentions"),
        ({"components": [], "embeds": []}, "components"),
        ({"embeds": [{"color": "blurple"}]}, "color"),
        ({"embeds": "nope"}, "embeds"),
        ({"embeds": [{"fields": {"a": 1}}]}, "fields"),
    ],
)
def test_rejects_unknown_or_malformed_keys(payload, reason):
    with pytest.raises(ValueError) as excinfo:
        validate_report(payload)
    assert reason in str(excinfo.value)


def test_rejects_too_many_embeds():
    with pytest.raises(ValueError, match="embeds"):
        validate_report({"embeds": [{"description": "x"} for _ in range(11)]})


def test_rejects_too_many_fields():
    embed = {"fields": [{"name": "a", "value": "b"} for _ in range(26)]}
    with pytest.raises(ValueError, match="fields"):
        validate_report({"embeds": [embed]})


def test_rejects_empty_message():
    with pytest.raises(ValueError, match="empty"):
        validate_report({"embeds": []})


def test_content_only_message_is_valid():
    assert validate_report({"content": "hello"})["content"] == "hello"


def test_rejects_at_everyone_in_content():
    with pytest.raises(ValueError, match="mention"):
        validate_report({"content": "@everyone look"})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_bridge_payload.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'axitools.api.bridge_payload'`.

- [ ] **Step 3: Write the module**

Create `axitools/api/bridge_payload.py`:

```python
"""Whitelist validation for relayed AxiBridge report payloads.

The relay is public, so it must never forward client-supplied JSON to Discord
verbatim — that is an open "post anything as this bot" proxy. Only the keys a
fight report actually uses are accepted; everything else is a hard error.
"""
from __future__ import annotations

from typing import Any, Dict

ALLOWED_TOP_KEYS = frozenset({"content", "embeds"})
ALLOWED_EMBED_KEYS = frozenset(
    {"title", "description", "color", "footer", "fields", "timestamp"}
)
ALLOWED_FIELD_KEYS = frozenset({"name", "value", "inline"})
ALLOWED_FOOTER_KEYS = frozenset({"text"})

MAX_EMBEDS = 10
MAX_FIELDS = 25
MAX_CONTENT = 2000
MAX_TEXT = 6000  # per string; enforce_limits does the per-embed accounting

# Dropped silently rather than rejected: a bot cannot set them, and AxiBridge's
# webhook path legitimately includes them.
IGNORED_TOP_KEYS = frozenset({"username", "avatar_url"})


def _require_str(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string")
    if len(value) > MAX_TEXT:
        raise ValueError(f"{label} is too long")
    return value


def _validate_footer(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("footer must be an object")
    unknown = set(raw) - ALLOWED_FOOTER_KEYS
    if unknown:
        raise ValueError(f"footer key not allowed: {sorted(unknown)[0]}")
    return {"text": _require_str(raw.get("text", ""), "footer.text")}


def _validate_field(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("each field must be an object")
    unknown = set(raw) - ALLOWED_FIELD_KEYS
    if unknown:
        raise ValueError(f"field key not allowed: {sorted(unknown)[0]}")
    field = {
        "name": _require_str(raw.get("name", ""), "field.name"),
        "value": _require_str(raw.get("value", ""), "field.value"),
    }
    if "inline" in raw:
        if not isinstance(raw["inline"], bool):
            raise ValueError("field.inline must be a boolean")
        field["inline"] = raw["inline"]
    return field


def _validate_embed(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("each embed must be an object")
    unknown = set(raw) - ALLOWED_EMBED_KEYS
    if unknown:
        raise ValueError(f"embed key not allowed: {sorted(unknown)[0]}")

    embed: Dict[str, Any] = {}
    for key in ("title", "description", "timestamp"):
        if key in raw:
            embed[key] = _require_str(raw[key], f"embed.{key}")
    if "color" in raw:
        if not isinstance(raw["color"], int) or isinstance(raw["color"], bool):
            raise ValueError("embed.color must be an integer")
        embed["color"] = raw["color"]
    if "footer" in raw:
        embed["footer"] = _validate_footer(raw["footer"])
    if "fields" in raw:
        if not isinstance(raw["fields"], list):
            raise ValueError("embed.fields must be a list")
        if len(raw["fields"]) > MAX_FIELDS:
            raise ValueError(f"too many fields (max {MAX_FIELDS})")
        embed["fields"] = [_validate_field(f) for f in raw["fields"]]
    return embed


def validate_report(body: Any) -> Dict[str, Any]:
    """Return a whitelisted copy of *body*, or raise ``ValueError``."""
    if not isinstance(body, dict):
        raise ValueError("body must be a JSON object")

    unknown = set(body) - ALLOWED_TOP_KEYS - IGNORED_TOP_KEYS
    if unknown:
        raise ValueError(f"key not allowed: {sorted(unknown)[0]}")

    payload: Dict[str, Any] = {}
    if "content" in body:
        content = _require_str(body["content"], "content")
        if len(content) > MAX_CONTENT:
            raise ValueError("content is too long")
        if "@everyone" in content or "@here" in content:
            raise ValueError("content may not mention everyone or here")
        payload["content"] = content

    if "embeds" in body:
        if not isinstance(body["embeds"], list):
            raise ValueError("embeds must be a list")
        if len(body["embeds"]) > MAX_EMBEDS:
            raise ValueError(f"too many embeds (max {MAX_EMBEDS})")
        payload["embeds"] = [_validate_embed(e) for e in body["embeds"]]

    if not payload.get("content") and not payload.get("embeds"):
        raise ValueError("report is empty")
    return payload
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_bridge_payload.py -v`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axitools
git add axitools/api/bridge_payload.py tests/test_bridge_payload.py
git commit -m "feat(bridge): whitelist validation for relayed report payloads"
```

---

### Task 6: `POST /bridge/report` — rate limit, queue, send

**Files:**
- Create: `axitools/api/bridge_worker.py`
- Modify: `axitools/api/server.py` (route + handler), `axitools/bot.py` (worker startup)
- Test: `tests/test_api_bridge_report.py`

**Interfaces:**
- Consumes: `request["bridge_scope"]` (Task 1), `validate_report` (Task 5), `substitute_payload`/`enforce_limits` (Task 3), `resolve_channel` from `axitools/api/discord_actions.py:116`.
- Produces:
  - `RateLimiter(rate_per_minute: int = 10, burst: int = 5)` with `check(key_hash: str) -> float | None` returning seconds to wait, or `None` when allowed
  - `BridgeSendQueue(bot)` with `async def submit(channel, payload, files) -> None` and `async def run()`
  - `POST /bridge/report` → `202 {"queued": true}`

- [ ] **Step 1: Write the failing test**

Create `tests/test_api_bridge_report.py`, reusing the fixture block from `tests/test_api_bridge_keys.py` (copy it; the engineer may read tasks out of order):

```python
import pytest

from axitools.api.bridge_worker import RateLimiter


def test_rate_limiter_allows_burst_then_blocks():
    limiter = RateLimiter(rate_per_minute=10, burst=5)
    for _ in range(5):
        assert limiter.check("hash") is None
    retry_after = limiter.check("hash")
    assert retry_after is not None and retry_after > 0


def test_rate_limiter_is_per_key():
    limiter = RateLimiter(rate_per_minute=10, burst=1)
    assert limiter.check("a") is None
    assert limiter.check("b") is None
    assert limiter.check("a") is not None


@pytest.mark.asyncio
async def test_report_queues_and_substitutes(api_client, bridge_key, bot):
    bot.emoji_registry = {"firebrand": "<:firebrand:111111111111111111>"}
    resp = await api_client.post(
        "/bridge/report",
        headers=_bearer(bridge_key),
        json={
            "embeds": [
                {"fields": [{"name": "Damage", "value": "{{spec:firebrand}} Alice"}]}
            ]
        },
    )
    assert resp.status == 202
    sent = bot.sent_payloads[-1]
    assert sent["embeds"][0]["fields"][0]["value"] == (
        "<:firebrand:111111111111111111> Alice"
    )


@pytest.mark.asyncio
async def test_report_rejects_unknown_keys(api_client, bridge_key):
    resp = await api_client.post(
        "/bridge/report",
        headers=_bearer(bridge_key),
        json={"embeds": [{"image": {"url": "http://x"}}]},
    )
    assert resp.status == 400
    assert "image" in (await resp.json())["error"]


@pytest.mark.asyncio
async def test_report_403_when_channel_is_gone(api_client, bot, monkeypatch):
    from axitools.api.server import generate_bridge_key, hash_app_key

    key = generate_bridge_key()
    bot.storage.add_bridge_key(123, 5555, hash_app_key(key), created_by=42)
    resp = await api_client.post(
        "/bridge/report", headers=_bearer(key), json={"content": "hi"}
    )
    assert resp.status == 403


@pytest.mark.asyncio
async def test_report_429_includes_retry_after(api_client, bridge_key):
    for _ in range(5):
        await api_client.post(
            "/bridge/report", headers=_bearer(bridge_key), json={"content": "hi"}
        )
    resp = await api_client.post(
        "/bridge/report", headers=_bearer(bridge_key), json={"content": "hi"}
    )
    assert resp.status == 429
    assert "Retry-After" in resp.headers
```

Extend the copied `FakeBot` so sends are observable and no Discord call happens:

```python
class FakeBot:
    def __init__(self, root: Path) -> None:
        self.storage = StorageManager(root)
        self.guilds = [FakeGuild(123, "Vigil Keep"), FakeGuild(456, "Durmand Priory")]
        self.emoji_registry = {}
        self.sent_payloads = []

    async def send_bridge_report(self, channel, payload, files=None):
        self.sent_payloads.append(payload)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_api_bridge_report.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'axitools.api.bridge_worker'`.

- [ ] **Step 3: Write the worker**

Create `axitools/api/bridge_worker.py`:

```python
"""Rate limiting and serialized sending for relayed AxiBridge reports.

A hosted bot shares ONE global Discord rate-limit bucket across every guild, so
report sends are queued off the HTTP request: a guild dumping forty logs must
not make slash commands feel laggy for everybody else.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, Optional

LOGGER = logging.getLogger(__name__)


class RateLimiter:
    """Token bucket keyed by credential hash, so one guild cannot starve another."""

    def __init__(self, rate_per_minute: int = 10, burst: int = 5) -> None:
        self._rate = rate_per_minute / 60.0
        self._burst = float(burst)
        self._buckets: Dict[str, tuple] = {}

    def check(self, key_hash: str) -> Optional[float]:
        """Consume a token. Returns ``None`` when allowed, else seconds to wait."""
        now = time.monotonic()
        tokens, last = self._buckets.get(key_hash, (self._burst, now))
        tokens = min(self._burst, tokens + (now - last) * self._rate)
        if tokens < 1.0:
            self._buckets[key_hash] = (tokens, now)
            return max(1.0, (1.0 - tokens) / self._rate)
        self._buckets[key_hash] = (tokens - 1.0, now)
        return None


class BridgeSendQueue:
    """Serialize report sends through a single worker task."""

    def __init__(self, bot) -> None:
        self.bot = bot
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run())

    async def submit(self, channel, payload: dict, files=None) -> None:
        """Enqueue a send. Raises ``asyncio.QueueFull`` if the backlog is full."""
        self._queue.put_nowait((channel, payload, files))

    async def run(self) -> None:
        while True:
            channel, payload, files = await self._queue.get()
            try:
                await self.bot.send_bridge_report(channel, payload, files)
            except Exception:  # one bad report must not kill the worker
                LOGGER.exception("bridge report send failed")
            finally:
                self._queue.task_done()
```

- [ ] **Step 4: Add the bot-side sender**

In `axitools/bot.py`, on the bot class, add:

```python
    async def send_bridge_report(self, channel, payload: dict, files=None) -> None:
        """Send a relayed AxiBridge report as this bot."""
        embeds = [discord.Embed.from_dict(e) for e in payload.get("embeds") or []]
        await channel.send(
            content=payload.get("content") or None,
            embeds=embeds or None,
            files=files or None,
            allowed_mentions=discord.AllowedMentions.none(),
        )
```

and, in the bot's `setup_hook`/`on_ready` where the API runner is started, load the emoji registry once and start the queue:

```python
        from .api.bridge_worker import BridgeSendQueue
        from .scripts.sync_emoji import build_registry

        self.bridge_queue = BridgeSendQueue(self)
        self.bridge_queue.start()
        try:
            self.emoji_registry = build_registry(
                [{"name": e.name, "id": e.id} for e in await self.fetch_application_emojis()]
            )
        except Exception:
            LOGGER.exception("could not load application emoji; tokens will degrade to names")
            self.emoji_registry = {}
```

- [ ] **Step 5: Add the route and handler**

In `axitools/api/server.py`, import at the top:

```python
from .bridge_payload import validate_report
from .bridge_worker import RateLimiter
from ..emoji_registry import enforce_limits, substitute_payload
```

In `build_app`, create one limiter per app and register the route:

```python
    app["bridge_rate_limiter"] = RateLimiter()
    app.router.add_post("/bridge/report", _handle_bridge_report)
```

And the handler:

```python
async def _handle_bridge_report(request: web.Request) -> web.Response:
    guild_id, channel_id = request["bridge_scope"]
    bot = request.app["bot"]

    supplied = request.headers.get("Authorization", "")
    key_hash = hash_app_key(supplied[len("Bearer "):])
    retry_after = request.app["bridge_rate_limiter"].check(key_hash)
    if retry_after is not None:
        return web.json_response(
            {"error": "rate limited"},
            status=429,
            headers={"Retry-After": str(int(retry_after))},
        )

    guild = discord.utils.get(bot.guilds, id=guild_id)
    if guild is None:
        return web.json_response(
            {"error": "the bot is no longer in that server"}, status=403
        )
    try:
        channel = resolve_channel(guild, channel_id)
    except ValueError:
        return web.json_response(
            {"error": "the paired channel no longer exists"}, status=403
        )

    body = await _parse_json_body(request)
    if body is None:
        return web.json_response({"error": "invalid JSON body"}, status=400)
    try:
        payload = validate_report(body)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)

    registry = getattr(bot, "emoji_registry", {}) or {}
    payload = enforce_limits(substitute_payload(payload, registry))

    queue = getattr(bot, "bridge_queue", None)
    if queue is None:
        await bot.send_bridge_report(channel, payload)
    else:
        try:
            await queue.submit(channel, payload)
        except asyncio.QueueFull:
            return web.json_response(
                {"error": "relay backlog is full"},
                status=429,
                headers={"Retry-After": "30"},
            )
    return web.json_response({"queued": True}, status=202)
```

Add `from .discord_actions import resolve_channel` to the imports if not already present.

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_api_bridge_report.py tests/test_api_bridge_keys.py -v`
Expected: PASS. In the test client `bot.bridge_queue` is unset, so the handler's direct-send branch runs and `sent_payloads` is populated synchronously.

- [ ] **Step 7: Run the whole suite**

Run: `python -m pytest -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axitools
git add axitools/api/bridge_worker.py axitools/api/server.py axitools/bot.py tests/test_api_bridge_report.py
git commit -m "feat(bridge): POST /bridge/report with per-key limits and a send queue"
```

---

### Task 7: AxiBridge — emoji token renderer

**Files:**
- Modify: `packages/bridge-metrics/src/professionUtils.ts:193`
- Modify: `packages/bridge-metrics/src/index.ts` (export)
- Test: `packages/bridge-metrics/src/__tests__/professionUtils.test.ts` (create if absent)

**Interfaces:**
- Consumes: existing `getProfessionBase()`.
- Produces: `getProfessionEmojiToken(profession: string): string` → `'{{spec:firebrand}}'`.

- [ ] **Step 1: Write the failing test**

Create or extend `packages/bridge-metrics/src/__tests__/professionUtils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getProfessionEmoji, getProfessionEmojiToken } from '../professionUtils';

describe('getProfessionEmojiToken', () => {
    it('tokenizes an elite spec by its own name, not its base profession', () => {
        expect(getProfessionEmojiToken('Firebrand')).toBe('{{spec:firebrand}}');
        expect(getProfessionEmojiToken('Bladesworn')).toBe('{{spec:bladesworn}}');
    });

    it('tokenizes a core profession by its own name', () => {
        expect(getProfessionEmojiToken('Guardian')).toBe('{{spec:guardian}}');
    });

    it('falls back to unknown for blank or missing input', () => {
        expect(getProfessionEmojiToken('')).toBe('{{spec:unknown}}');
        expect(getProfessionEmojiToken(undefined as unknown as string)).toBe('{{spec:unknown}}');
    });

    it('emits only characters the relay token grammar accepts', () => {
        const token = getProfessionEmojiToken('Holosmith');
        expect(token).toMatch(/^\{\{spec:[a-z0-9]+\}\}$/);
    });

    it('leaves the unicode renderer untouched', () => {
        expect(getProfessionEmoji('Firebrand')).toBe('🔵');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /var/home/mstephens/Documents/GitHub/axibridge && npx vitest run packages/bridge-metrics/src/__tests__/professionUtils.test.ts --maxWorkers=2`
Expected: FAIL — `getProfessionEmojiToken is not a function`.

- [ ] **Step 3: Implement**

In `packages/bridge-metrics/src/professionUtils.ts`, after `getProfessionEmoji` (`:193`):

```ts
/**
 * Semantic token for a relayed Discord report, e.g. `{{spec:firebrand}}`.
 *
 * Unlike getProfessionEmoji (which collapses to the base profession because a
 * Unicode circle is all it has), this keys on the elite spec itself — AxiTools
 * has one application emoji per spec and substitutes at send time. Non-alpha
 * characters are stripped so the token always matches the relay's grammar.
 */
export function getProfessionEmojiToken(profession: string): string {
    const key = (profession || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `{{spec:${key || 'unknown'}}}`;
}
```

Add it to the export list in `packages/bridge-metrics/src/index.ts` alongside `getProfessionEmoji`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/professionUtils.test.ts --maxWorkers=2`
Expected: PASS (5 tests).

- [ ] **Step 5: Rebuild the workspace package**

The app resolves `@axiapps/bridge-metrics` through `dist/`, not `src/` — skipping this produces phantom `TS2305 has no exported member` errors in Task 8.

Run: `npm run build -w @axiapps/bridge-metrics && grep -c getProfessionEmojiToken packages/bridge-metrics/dist/index.d.ts`
Expected: build succeeds, grep prints a non-zero count.

- [ ] **Step 6: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
git add packages/bridge-metrics/src packages/bridge-metrics/dist
git commit -m "feat(discord): add profession emoji token renderer"
```

---

### Task 8: AxiBridge — destination union, dispatch, and key parsing

**Files:**
- Create: `src/main/axiToolsKey.ts`
- Modify: `src/main/discord.ts:278-300` (class head), `:325` (image payload), `:1072` and `:1081` (embed posts)
- Modify: `src/renderer/global.d.ts:5`
- Test: `src/main/__tests__/axiToolsKey.test.ts`, `src/main/__tests__/discordDestination.test.ts`

**Interfaces:**
- Consumes: `getProfessionEmojiToken` (Task 7); the relay contract from Tasks 1 and 6.
- Produces:
  - `parseBridgeKey(key: string): { relayUrl: string } | null`
  - `type DiscordDestination = { kind: 'webhook'; url: string } | { kind: 'bridge'; relayUrl: string; token: string }`
  - `type SendResult = { ok: true } | { ok: false; reason: 'revoked' | 'forbidden' | 'rate-limited' | 'network'; message: string }`
  - `DiscordNotifier.setDestination(dest: DiscordDestination | null): void`
  - `DiscordNotifier.sendLog(...): Promise<SendResult>`

- [ ] **Step 1: Write the failing key-parsing test**

Create `src/main/__tests__/axiToolsKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBridgeKey } from '../axiToolsKey';

const b64url = (s: string) => Buffer.from(s, 'utf-8').toString('base64url');
const validKey = `axb1.${b64url('https://bot.example.com')}.${'a'.repeat(43)}`;

describe('parseBridgeKey', () => {
    it('decodes the relay URL from the key', () => {
        expect(parseBridgeKey(validKey)).toEqual({ relayUrl: 'https://bot.example.com' });
    });

    it('accepts a loopback http URL for self-hosters', () => {
        const key = `axb1.${b64url('http://127.0.0.1:8642')}.${'a'.repeat(43)}`;
        expect(parseBridgeKey(key)).toEqual({ relayUrl: 'http://127.0.0.1:8642' });
    });

    it('rejects an axt1 guild key', () => {
        expect(parseBridgeKey(`axt1.${b64url('https://x.example')}.${'a'.repeat(43)}`)).toBeNull();
    });

    it.each([
        ['empty', ''],
        ['no prefix', 'not-a-key'],
        ['missing secret', `axb1.${b64url('https://x.example')}`],
        ['short secret', `axb1.${b64url('https://x.example')}.abc`],
        ['undecodable url', 'axb1.!!!!.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
        ['non-http url', `axb1.${b64url('ftp://x.example')}.${'a'.repeat(43)}`],
    ])('rejects %s without throwing', (_label, key) => {
        expect(parseBridgeKey(key as string)).toBeNull();
    });

    it('tolerates surrounding whitespace from a paste', () => {
        expect(parseBridgeKey(`  ${validKey}\n`)).toEqual({ relayUrl: 'https://bot.example.com' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/axiToolsKey.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../axiToolsKey`.

- [ ] **Step 3: Implement key parsing**

Create `src/main/axiToolsKey.ts`:

```ts
/**
 * Parsing for AxiTools bridge keys: `axb1.<base64url(relayUrl)>.<secret>`.
 *
 * The relay URL travels inside the credential so a user never types it and the
 * relay can move hostnames by reissuing keys.
 */

const PREFIX = 'axb1';
const MIN_SECRET_LENGTH = 32;

export function parseBridgeKey(key: string): { relayUrl: string } | null {
    const parts = (key || '').trim().split('.');
    if (parts.length !== 3) return null;

    const [prefix, encodedUrl, secret] = parts;
    if (prefix !== PREFIX) return null;
    if (!secret || secret.length < MIN_SECRET_LENGTH) return null;

    let relayUrl: string;
    try {
        relayUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8');
    } catch {
        return null;
    }
    if (!/^https?:\/\/\S+$/.test(relayUrl)) return null;

    return { relayUrl };
}
```

Note: `Buffer.from(…, 'base64url')` does not throw on invalid input, it returns garbage — the URL regex is what rejects `'axb1.!!!!.…'`, so keep both checks.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/axiToolsKey.test.ts --maxWorkers=2`
Expected: PASS (9 cases).

- [ ] **Step 5: Write the failing dispatch test**

Create `src/main/__tests__/discordDestination.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import { DiscordNotifier } from '../discord';

const logData = {
    permalink: 'https://dps.report/abcd',
    id: 'log-1',
    filePath: '/tmp/fight.zevtc',
    mode: 'embed' as const,
};

const details = {
    players: [
        { account: 'Alice.1234', name: 'Alice', profession: 'Firebrand', notInSquad: false },
    ],
};

describe('DiscordNotifier destination dispatch', () => {
    beforeEach(() => {
        vi.mocked(axios.post).mockReset();
        vi.mocked(axios.post).mockResolvedValue({ status: 204, data: {} } as never);
    });

    it('posts to the webhook URL for a webhook destination', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' });
        await notifier.sendLog(logData, details);

        const [url, body] = vi.mocked(axios.post).mock.calls[0];
        expect(url).toBe('https://discord.com/api/webhooks/1/x');
        expect((body as any).username).toBe('AxiBridge');
    });

    it('posts to the relay report route with a bearer token for a bridge destination', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });
        await notifier.sendLog(logData, details);

        const [url, body, config] = vi.mocked(axios.post).mock.calls[0];
        expect(url).toBe('https://bot.example.com/bridge/report');
        expect((config as any).headers.Authorization).toBe('Bearer axb1.x.y');
        // A bot cannot set these; sending them would be rejected by validation.
        expect((body as any).username).toBeUndefined();
        expect((body as any).avatar_url).toBeUndefined();
    });

    it('emits emoji tokens on the bridge path and unicode on the webhook path', async () => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);

        notifier.setDestination({ kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' });
        await notifier.sendLog(logData, details);
        const webhookBody = JSON.stringify(vi.mocked(axios.post).mock.calls[0][1]);

        vi.mocked(axios.post).mockClear();
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });
        await notifier.sendLog(logData, details);
        const bridgeBody = JSON.stringify(vi.mocked(axios.post).mock.calls[0][1]);

        expect(bridgeBody).toContain('{{spec:firebrand}}');
        expect(webhookBody).not.toContain('{{spec:');
    });

    it('classifies a 401 as revoked and does not retry', async () => {
        vi.mocked(axios.post).mockRejectedValue({ response: { status: 401 } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const result = await notifier.sendLog(logData, details);
        expect(result).toMatchObject({ ok: false, reason: 'revoked' });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    });

    it('classifies a 403 as forbidden and surfaces the relay message', async () => {
        vi.mocked(axios.post).mockRejectedValue({
            response: { status: 403, data: { error: "the paired channel no longer exists" } },
        } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const result = await notifier.sendLog(logData, details);
        expect(result).toMatchObject({ ok: false, reason: 'forbidden' });
        expect((result as any).message).toContain('paired channel');
    });

    it('retries a 429 once honouring Retry-After', async () => {
        vi.mocked(axios.post)
            .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '0' } } } as never)
            .mockResolvedValueOnce({ status: 202, data: { queued: true } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const result = await notifier.sendLog(logData, details);
        expect(result).toEqual({ ok: true });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
    });

    it('never falls back to another destination after a bridge failure', async () => {
        vi.mocked(axios.post).mockRejectedValue({ response: { status: 500 } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        await notifier.sendLog(logData, details);
        for (const call of vi.mocked(axios.post).mock.calls) {
            expect(call[0]).toBe('https://b/bridge/report');
        }
    });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/discordDestination.test.ts --maxWorkers=2`
Expected: FAIL — `notifier.setDestination is not a function`.

- [ ] **Step 7: Implement the destination union in `src/main/discord.ts`**

Add near the top, beside the other exports:

```ts
export type DiscordDestination =
    | { kind: 'webhook'; url: string }
    | { kind: 'bridge'; relayUrl: string; token: string };

export type SendFailureReason = 'revoked' | 'forbidden' | 'rate-limited' | 'network';

export type SendResult =
    | { ok: true }
    | { ok: false; reason: SendFailureReason; message: string };
```

Replace the class head (`:279-289`):

```ts
export class DiscordNotifier {
    private destination: DiscordDestination | null = null;

    public setWebhookUrl(url: string | null) {
        this.destination = url ? { kind: 'webhook', url } : null;
    }

    public setDestination(dest: DiscordDestination | null) {
        this.destination = dest;
    }

    private get isBridge(): boolean {
        return this.destination?.kind === 'bridge';
    }
```

Add the two send helpers as private methods:

```ts
    /** Post an embed/content payload to the active destination. */
    private async postPayload(payload: Record<string, unknown>): Promise<void> {
        const dest = this.destination!;
        if (dest.kind === 'webhook') {
            await axios.post(dest.url, {
                username: "AxiBridge",
                avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                ...payload
            });
            return;
        }
        // A bot cannot override username/avatar_url — bridged reports post as the
        // bot itself, and the relay rejects unknown keys.
        await axios.post(`${dest.relayUrl}/bridge/report`, payload, {
            headers: { Authorization: `Bearer ${dest.token}` }
        });
    }

    /** Post a multipart (PNG attachment) payload to the active destination. */
    private async postForm(form: FormData): Promise<void> {
        const dest = this.destination!;
        if (dest.kind === 'webhook') {
            await axios.post(dest.url, form, { headers: form.getHeaders() });
            return;
        }
        await axios.post(`${dest.relayUrl}/bridge/report`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bearer ${dest.token}` }
        });
    }

    /** Map a thrown axios error to a SendResult. */
    private classify(error: any): SendResult {
        const status = error?.response?.status;
        const relayMessage = error?.response?.data?.error;
        if (status === 401) {
            return { ok: false, reason: 'revoked', message: 'This link was revoked — pair again.' };
        }
        if (status === 403) {
            return { ok: false, reason: 'forbidden', message: relayMessage || 'Axi cannot post in that channel.' };
        }
        if (status === 429) {
            return { ok: false, reason: 'rate-limited', message: 'Too many reports — try again shortly.' };
        }
        return { ok: false, reason: 'network', message: relayMessage || String(error?.message || error) };
    }
```

- [ ] **Step 8: Route the three existing post sites through the helpers**

- Image mode (`:325-352`): build `payload` without `username`/`avatar_url`, append `payload_json: JSON.stringify(payload)` as today, and replace `await axios.post(this.webhookUrl, form, …)` with `await this.postForm(form)`. For the webhook path the username/avatar must still be present, so set them inside `postForm` is wrong — instead keep building them into `payload` only when `!this.isBridge`:

```ts
                const payload: any = {};
                if (!this.isBridge) {
                    payload.username = "AxiBridge";
                    payload.avatar_url = DISCORD_WEBHOOK_AVATAR_URL;
                }
```

- Complex embed (`:1072`): replace with `await this.postPayload({ embeds });`
- Fallback embed (`:1081`): replace with `await this.postPayload({ embeds: [ … ] });`

Replace the guard at the top of `sendLog` (`:300`) and the `catch` at the end:

```ts
        if (!this.destination) {
            console.log("No Discord destination configured, skipping notification.");
            return { ok: true };
        }
```

```ts
        } catch (error) {
            const result = this.classify(error);
            if (result.reason === 'rate-limited' || result.reason === 'network') {
                const waited = Number((error as any)?.response?.headers?.['retry-after']) || 2;
                await new Promise(resolve => setTimeout(resolve, waited * 1000));
                try {
                    await this.resend(logData, jsonDetails);
                    return { ok: true };
                } catch (retryError) {
                    return this.classify(retryError);
                }
            }
            console.error("Failed to send Discord notification:", error);
            return result;
        }
```

Extract the existing body of `sendLog` into a private `resend(logData, jsonDetails)` that performs exactly one attempt and rethrows, so `sendLog` is `try { await this.resend(...); return { ok: true }; } catch { … }`. This keeps one attempt path and makes "retry once" literal. Change the signature to `Promise<SendResult>`.

- [ ] **Step 9: Emit tokens on the bridge path**

In the `getClassToken` closure (`:713-724`), add the bridge branch before the existing `'emoji'` handling:

```ts
                        const getClassToken = (p: any) => {
                            if (classDisplay === 'short') {
                                return getProfessionAbbrev(p.profession || 'Unknown');
                            }
                            if (classDisplay === 'emoji') {
                                const profession = p.profession || 'Unknown';
                                // On the bridge path AxiTools substitutes a real
                                // per-spec emoji, so the colour-collision hacks
                                // below are unnecessary.
                                if (this.isBridge) return getProfessionEmojiToken(profession);
                                const professionBase = getProfessionBase(profession);
                                if (professionBase === 'Ranger') return '🟩';
                                if (professionBase === 'Revenant') return '🟥';
                                return getProfessionEmoji(profession);
                            }
                            return '';
                        };
```

Import `getProfessionEmojiToken` on `:29`. If `getClassToken` sits in a scope where `this` is not the notifier, capture `const isBridge = this.isBridge;` above the closure and use that.

- [ ] **Step 10: Widen `IWebhook`**

In `src/renderer/global.d.ts:5`:

```ts
export interface IWebhook {
    id: string;
    name: string;
    /** Webhook destinations only. */
    url?: string;
    /** Absent means 'webhook', so stored destinations need no migration. */
    kind?: 'webhook' | 'bridge';
    /** Bridge destinations: decoded from the axb1 key at link time. */
    relayUrl?: string;
    token?: string;
    guildName?: string;
    channelName?: string;
}
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/discordDestination.test.ts src/main/__tests__/axiToolsKey.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 12: Typecheck and run the full unit suite**

Run: `npm run typecheck && npm run test:unit`
Expected: PASS. `url` becoming optional on `IWebhook` may surface `string | undefined` errors at existing consumers — fix each with an explicit guard (`w.kind === 'bridge' ? … : w.url ?? ''`), never with a non-null assertion.

- [ ] **Step 13: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
git add src/main/axiToolsKey.ts src/main/discord.ts src/renderer/global.d.ts src/main/__tests__
git commit -m "feat(discord): route reports through an AxiTools bridge destination"
```

---

### Task 9: AxiBridge — link flow, unlink on revoke, status surfacing

**Files:**
- Modify: `src/main/index.ts:1246`, `:1641`, `:1661-1683` (settings wiring), `:782` and `:932` (send call sites)
- Modify: `src/preload/index.ts` (expose the new IPC)
- Modify: `src/renderer/SettingsView.tsx:1912` (webhook list props)
- Test: `src/main/__tests__/bridgeLinkIpc.test.ts`

**Interfaces:**
- Consumes: `parseBridgeKey` (Task 8), `DiscordNotifier.setDestination`, `SendResult`, `GET /bridge/whoami` (Task 1).
- Produces:
  - IPC handler `bridge:link` → `{ ok: true; guildName: string; channelName: string; relayUrl: string } | { ok: false; error: string }`
  - Renderer event `discord-destination-status` → `{ webhookId: string; reason: SendFailureReason; message: string }`
  - `electronAPI.linkBridgeChannel(key: string)` and `electronAPI.onDiscordDestinationStatus(cb)`

**Why a new channel:** today `sendLog` swallows every error into `console.error` (`src/main/discord.ts:1097`), so there is no existing user-visible path for Discord failures to reuse. The spec's "same path as today" is console-only; this task adds the minimum channel needed for unlink-on-revoke to be visible.

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/bridgeLinkIpc.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import { linkBridgeChannel } from '../bridgeLink';

const b64url = (s: string) => Buffer.from(s, 'utf-8').toString('base64url');
const key = `axb1.${b64url('https://bot.example.com')}.${'a'.repeat(43)}`;

describe('linkBridgeChannel', () => {
    beforeEach(() => vi.mocked(axios.get).mockReset());

    it('validates the key against the relay and returns display labels', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: { guild_name: 'Vigil Keep', channel_name: 'wvw-reports' },
        } as never);

        const result = await linkBridgeChannel(key);
        expect(result).toEqual({
            ok: true,
            relayUrl: 'https://bot.example.com',
            guildName: 'Vigil Keep',
            channelName: 'wvw-reports',
        });
        expect(vi.mocked(axios.get).mock.calls[0][0]).toBe('https://bot.example.com/bridge/whoami');
    });

    it('rejects a malformed key without calling the relay', async () => {
        const result = await linkBridgeChannel('nonsense');
        expect(result).toMatchObject({ ok: false });
        expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
    });

    it('surfaces the relay error rather than storing a destination', async () => {
        vi.mocked(axios.get).mockRejectedValue({
            response: { status: 403, data: { error: 'the paired channel no longer exists' } },
        } as never);

        const result = await linkBridgeChannel(key);
        expect(result).toEqual({ ok: false, error: 'the paired channel no longer exists' });
    });

    it('reports an unreachable relay plainly', async () => {
        vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED') as never);
        const result = await linkBridgeChannel(key);
        expect(result).toMatchObject({ ok: false });
        expect((result as any).error).toContain('ECONNREFUSED');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/bridgeLinkIpc.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../bridgeLink`.

- [ ] **Step 3: Implement the link check**

Create `src/main/bridgeLink.ts`:

```ts
import axios from 'axios';
import { parseBridgeKey } from './axiToolsKey';

export type LinkResult =
    | { ok: true; relayUrl: string; guildName: string; channelName: string }
    | { ok: false; error: string };

/**
 * Validate an axb1 key against its relay at paste time.
 *
 * Checking now rather than at first send means a typo'd key surfaces
 * immediately, not three hours later when a raid's reports never appear.
 */
export async function linkBridgeChannel(key: string): Promise<LinkResult> {
    const parsed = parseBridgeKey(key);
    if (!parsed) {
        return { ok: false, error: 'That does not look like an AxiTools bridge key (axb1.…).' };
    }
    try {
        const response = await axios.get(`${parsed.relayUrl}/bridge/whoami`, {
            headers: { Authorization: `Bearer ${key.trim()}` },
            timeout: 10_000
        });
        return {
            ok: true,
            relayUrl: parsed.relayUrl,
            guildName: String(response.data?.guild_name ?? 'Unknown server'),
            channelName: String(response.data?.channel_name ?? 'unknown-channel')
        };
    } catch (error: any) {
        return { ok: false, error: String(error?.response?.data?.error ?? error?.message ?? error) };
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/bridgeLinkIpc.test.ts --maxWorkers=2`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the IPC handler and destination selection**

In `src/main/index.ts`, beside the other `ipcMain.handle` registrations:

```ts
    ipcMain.handle('bridge:link', async (_event, key: string) => linkBridgeChannel(key));
```

Replace the selected-webhook block (`:1676-1683`) so a bridge entry produces a bridge destination:

```ts
                const webhooks = store.get('webhooks', []) as IWebhook[];
                const selected = webhooks.find((w) => w.id === settings.selectedWebhookId);
                if (selected?.kind === 'bridge' && selected.relayUrl && selected.token) {
                    discord?.setDestination({
                        kind: 'bridge',
                        relayUrl: selected.relayUrl,
                        token: selected.token
                    });
                } else if (selected?.url) {
                    discord?.setDestination({ kind: 'webhook', url: selected.url });
                } else {
                    discord?.setDestination(null);
                }
```

- [ ] **Step 6: Handle a revoked link at the send sites**

At both `await discord?.sendLog(...)` calls (`:782`, `:932`), capture the result and act on it:

```ts
                    const sendResult = await discord?.sendLog(
                        { ...result, filePath, mode: 'embed', splitEnemiesByTeam },
                        prunedDetails
                    );
                    if (sendResult && !sendResult.ok) {
                        const selectedId = store.get('selectedWebhookId', null) as string | null;
                        if (sendResult.reason === 'revoked' && selectedId) {
                            // The token is dead: stop using it rather than retrying
                            // a credential that will never authenticate again.
                            const webhooks = (store.get('webhooks', []) as IWebhook[]).map((w) =>
                                w.id === selectedId ? { ...w, token: undefined } : w
                            );
                            store.set('webhooks', webhooks);
                            discord?.setDestination(null);
                        }
                        win?.webContents.send('discord-destination-status', {
                            webhookId: selectedId,
                            reason: sendResult.reason,
                            message: sendResult.message
                        });
                    }
```

- [ ] **Step 7: Expose both to the renderer**

In `src/preload/index.ts`, alongside the existing members:

```ts
    linkBridgeChannel: (key: string) => ipcRenderer.invoke('bridge:link', key),
    onDiscordDestinationStatus: (callback: (payload: { webhookId: string | null; reason: string; message: string }) => void) => {
        const listener = (_event: unknown, payload: any) => callback(payload);
        ipcRenderer.on('discord-destination-status', listener);
        return () => ipcRenderer.removeListener('discord-destination-status', listener);
    },
```

Declare both on the `electronAPI` interface in `src/renderer/global.d.ts` (the block around `:346`).

- [ ] **Step 8: Add the settings UI**

In the webhook-list component rendered at `src/renderer/SettingsView.tsx:1912`, add a **Link AxiTools channel** button beside the existing add-webhook control. It opens a single-field form:

- Label: `AxiTools bridge key`
- Helper text: *"In Discord, run `/bridge pair` in the channel that should receive reports, then paste the key here."*
- Note, shown always: *"Bridged reports are posted by the Axi bot, so they appear as **Axi** rather than AxiBridge. If the bot is offline, bridged reports are not delivered."*

On submit, call `window.electronAPI.linkBridgeChannel(key)`. On `ok: false`, render `error` inline and store nothing. On `ok: true`, append
`{ id: crypto.randomUUID(), name: `${guildName} › #${channelName}`, kind: 'bridge', relayUrl, token: key.trim(), guildName, channelName }`
to `webhooks` and save via the existing `saveSettings({ webhooks })` path.

Bridge rows render a small "Bridge" badge instead of the URL, and their remove action is labelled **Unlink** with the caption *"Also run `/bridge revoke` in Discord to invalidate the key."*

Subscribe to `onDiscordDestinationStatus` where the other renderer subscriptions are set up, and show the `message` using the existing error-surfacing component in that view.

- [ ] **Step 9: Typecheck, lint, and run the full suite**

Run: `npm run validate && npm run test:unit`
Expected: PASS. `npm run lint` is `--max-warnings 0`, so unused imports from the edits will fail it.

- [ ] **Step 10: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
git add src/main/bridgeLink.ts src/main/index.ts src/preload/index.ts src/renderer/global.d.ts src/renderer/SettingsView.tsx src/main/__tests__/bridgeLinkIpc.test.ts
git commit -m "feat(settings): link an AxiTools channel as a report destination"
```

---

### Task 10: `/dev bridgetest` and the manual pass

**Files:**
- Modify: `axitools/cogs/dev.py`
- Test: manual (real Discord API)

**Interfaces:**
- Consumes: `bot.emoji_registry`, `bot.send_bridge_report`, `substitute_payload`, `enforce_limits`.
- Produces: `/dev bridgetest` slash command (non-production only, like the existing `/dev updatenotes`).

- [ ] **Step 1: Add the command**

In `axitools/cogs/dev.py`, following the shape of the existing `/dev updatenotes`:

```python
    @app_commands.command(
        name="bridgetest",
        description="Post a canned AxiBridge report here to check emoji spacing.",
    )
    async def bridgetest(self, interaction: discord.Interaction) -> None:
        from ..emoji_registry import enforce_limits, substitute_payload

        rows = "\n".join(
            f"{{{{spec:{spec}}}}} {i + 1:>2} Player{i:02d}  {1234 - i * 37:>5}"
            for i, spec in enumerate(
                ["firebrand", "scourge", "spellbreaker", "herald", "tempest"]
            )
        )
        payload = {
            "content": "**Bridge test** — canned report",
            "embeds": [
                {
                    "title": "{{spec:firebrand}} Squad Summary",
                    "color": 3447003,
                    "fields": [
                        {"name": "Damage", "value": rows, "inline": True},
                        {"name": "Healing", "value": rows, "inline": True},
                    ],
                    "footer": {"text": "AxiBridge · /dev bridgetest"},
                }
            ],
        }
        registry = getattr(self.bot, "emoji_registry", {}) or {}
        await self.bot.send_bridge_report(
            interaction.channel, enforce_limits(substitute_payload(payload, registry))
        )
        await interaction.response.send_message(
            f"Posted with {len(registry)} emoji in the registry.", ephemeral=True
        )
```

- [ ] **Step 2: Run the cog suite**

Run: `cd /var/home/mstephens/Documents/GitHub/axitools && python -m pytest tests/test_cogs_dev.py -v`
Expected: PASS — the existing suite asserts which commands are registered, so it may need the new name added to its expected list.

- [ ] **Step 3: Commit**

```bash
git add axitools/cogs/dev.py tests/test_cogs_dev.py
git commit -m "feat(bridge): add /dev bridgetest for manual emoji checks"
```

- [ ] **Step 4: Manual verification (requires a test guild and the bot's token)**

Not automatable — these are real Discord API behaviours:

1. `python -m axitools.scripts.sync_emoji` (dry run), confirm it lists ~43 uploads and zero deletes.
2. `python -m axitools.scripts.sync_emoji --apply`, then restart the bot so `emoji_registry` loads.
3. In a test guild, `/dev bridgetest` — check the emoji render, and specifically that the monospace column alignment in the inline fields still reads correctly now that a glyph occupies a different width than `🔵` did.
4. `/bridge pair` in that channel; paste the key into AxiBridge; confirm the settings row reads **<guild> › #<channel>**.
5. Send a real fight report from AxiBridge and compare it side by side with the same report sent to a webhook.
6. `/bridge revoke` the pairing, send another report, and confirm AxiBridge marks the destination unlinked rather than retrying.

Record anything surprising about step 3 in the spec — column width is the one thing the automated truncation tests cannot judge.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Destinations (`IWebhook` union, `DiscordNotifier` dispatch) | 8 |
| Emoji tokens (`getProfessionEmojiToken`) | 7 |
| Relay endpoint + whitelist | 5, 6 |
| Character budget / post-substitution truncation | 3 |
| Send worker | 6 |
| Key format, hash-only persistence | 1 |
| Scope isolation (`axb1` vs `axt1` vs global) | 1 |
| Pairing flow (`/bridge pair|list|revoke`) | 2 |
| Error semantics (401/403/429) | 6 (server), 8 (client) |
| Rate limiting per key | 6 |
| Registry + sync command + asset normalization | 3, 4 |
| Substitution with graceful miss | 3 |
| Settings link flow, unlink, identity caveat | 9 |
| No silent fallback | 8 |
| Testing strategy | every task; manual in 10 |
| `/dev bridgetest` | 10 |

**Deviation from the spec, noted deliberately:** the spec said bridge errors would reach the user "through whatever path the existing webhook failures use today." Reading the code, that path is `console.error` only — `sendLog` swallows everything. Task 9 therefore adds a `discord-destination-status` IPC event, which is new surface the spec did not call for but which unlink-on-revoke cannot work without.

**Type consistency:** `SendResult`/`SendFailureReason` are defined in Task 8 and consumed by name in Task 9. `BridgeKeyInfo.channel_id` is used in Tasks 1, 2 and 6. `get_bridge_key_scope` returns `(guild_id, channel_id)` in Task 1 and is destructured that way in Task 6. `emoji_key_for_asset` is defined in Task 3 and imported by Task 4. `parseBridgeKey` returns `{ relayUrl }` in Task 8 and is consumed that way in Task 9. `build_registry` is defined in Task 4 and called from `bot.py` in Task 6.
