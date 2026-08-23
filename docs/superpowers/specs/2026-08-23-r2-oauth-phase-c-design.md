# R2 Setup Phase C — Sign in with Cloudflare (design)

Phase A shipped an ephemeral fight slicer in the desktop app
(`docs/superpowers/specs/2026-08-22-fight-slicer-design.md`). Phase B put a slicer in
the published web report and made a slice a shareable link
(`docs/superpowers/specs/2026-08-22-fight-slicer-phase-b-design.md`). Both leaned on
Cloudflare R2 being configured. Phase C attacks the reason most users never configure
it: the setup is five hand-copied fields and a trip through the Cloudflare dashboard.

## Problem

R2 is not a feature toggle — it is a credential-presence check. `resolveR2Config`
(`src/main/handlers/githubHandlers.ts:468`) returns `null` unless all five of
`R2_FIELDS` are non-empty:

```
r2AccountId  r2AccessKeyId  r2SecretAccessKey  r2BucketName  r2PublicUrl
```

Getting those five values means: create a Cloudflare account, enable R2, create a
bucket, enable the bucket's public development URL, open **Manage R2 API Tokens**,
create a token, and copy four opaque strings plus a `pub-<hash>.r2.dev` hostname into
Settings — with the secret access key shown exactly once. Any transcription error
surfaces later as a SigV4 signature failure at publish time, not at entry time.

The cost of not doing it is asymmetric and, until recently, undocumented in the UI.
Per `planSidecarHosting` (`githubHandlers.ts:677`):

| artifact | R2 configured | not configured |
|---|---|---|
| `report.json` + viewer | Pages | Pages |
| `replay.json` | R2 | Pages, or dropped if over `MAX_GITHUB_BLOB_BYTES` |
| `slice.json.gz` | R2 | **dropped — no web slicer at all** |

So a user who skips R2 silently loses the entire Phase B feature. Making that
consequence legible was a copy fix (commit `4edfb31b`). Making it *not happen* is
this phase.

## Non-goals

- **Hosting `report.json` itself on R2.** Pages serves the report URL; moving the
  payload off it is a separate design with CORS and share-link implications.
- **Replacing SigV4 uploads.** See below — OAuth cannot do this.
- **Removing the manual fields.** They stay, as fallback and for custom domains.

## Constraint: OAuth cannot authenticate the uploads

R2's data plane is the S3-compatible API, authenticated with AWS Signature Version 4.
There is no documented Cloudflare REST endpoint for putting an object into a bucket —
the [REST API](https://developers.cloudflare.com/r2/platform/limits/) is bucket
management and configuration, rate limited to 1,200 requests per five minutes, and
Cloudflare's own troubleshooting page notes that object-level tokens fail against it
entirely. An OAuth access token is a bearer token and cannot sign a SigV4 request.

**Therefore OAuth is a provisioning mechanism, not an upload credential.** The app
still ends up holding an access key pair; it just mints one instead of asking for it.
`r2SignedRequest`, `r2PutObject`, `r2DeleteObject` and `r2EnsureBucketCors`
(`githubHandlers.ts:486-650`) are unchanged by this phase.

## Design

### 1. The OAuth client

Cloudflare shipped [self-managed OAuth clients](https://developers.cloudflare.com/changelog/post/2026-06-03-public-oauth-clients/)
GA on 2026-06-03. Desktop applications are an explicitly supported client type:

| client type | flow | token endpoint auth | PKCE |
|---|---|---|---|
| Browser, mobile, **desktop**, CLI | Authorization Code | `none` | Required, S256 |

So AxiBridge registers its own public client — no client secret shipped in the
binary, no borrowing of Wrangler's client ID.

Registration is a one-time act by the maintainer, not the user:

- Create the client under **Manage account → OAuth clients**
- `grant_types: ["authorization_code"]`, `response_types: ["code"]`,
  `token_endpoint_auth_method: "none"`
- Redirect URI: a loopback listener, `http://127.0.0.1:<ephemeral>/oauth/callback`
- Scopes: the R2 admin permission (scope names correspond to API token permission
  names) plus whatever is needed to create an API token
- **Domain verification is required before the client can be made public.** A private
  client only works for members of the registering account, which is useless here.
  This needs a DNS TXT record on a domain we control, plus a logo, client URL, policy
  URL and ToS URL for the consent screen.

### 2. The provisioning flow

"Sign in with Cloudflare" in the R2 settings section runs, in the main process:

1. Start a loopback HTTP listener on an ephemeral port; generate `state` and a PKCE
   verifier/challenge.
2. Open the system browser to Cloudflare's authorize endpoint. **Not** a
   `BrowserWindow` — an embedded browser for a third-party consent screen is both a
   phishing-training pattern and increasingly blocked by identity providers.
3. On callback: validate `state`, exchange the code + verifier for an access token
   (and refresh token) at the token endpoint.
4. Call the REST API with the access token to:
   a. list accounts the user authorized, and let them pick if more than one;
   b. create the bucket (default name `axibridge-reports`, adopt it if it already
      exists and is empty-or-ours);
   c. enable the bucket's public development URL and read back the
      `pub-<hash>.r2.dev` hostname;
   d. create an R2 API token scoped to that bucket with object read+write.
5. Derive the S3 credentials from the token response, per
   [R2 Tokens](https://developers.cloudflare.com/r2/api/tokens/):
   - `r2AccessKeyId` = the token's `id`
   - `r2SecretAccessKey` = **SHA-256 hex of the token's `value`**
6. Write all five settings fields, then run the existing `r2EnsureBucketCors` and a
   round-trip put/delete to prove the credentials actually work before reporting
   success.

Step 6 matters: today a bad credential is discovered at publish time. This flow should
never report "connected" without having completed one real signed request.

### 3. `r2.dev` is the right default

Cloudflare labels the `r2.dev` public development URL as non-production and
[rate limits it](https://developers.cloudflare.com/r2/platform/limits/) —
hundreds of requests/second yields `429`, and throughput may be throttled.

That warning is worth stating and worth *not* over-weighting. The reference
installation already runs on `r2.dev` (`pub-f64d7fbe….r2.dev`) and serves real
published reports from it. A guild opening a report is single-digit requests per
reader, not hundreds per second. Auto-provisioning to `r2.dev` gives a new user
exactly the working setup an existing user has.

Connecting a custom domain is therefore an **optional later upgrade**, surfaced as a
hint rather than a step, and the manual `r2PublicUrl` field remains editable for
anyone who has one.

### 4. Credential storage and revocation

The derived key pair goes where the current fields go — same store, same shape — so
nothing downstream changes. Additionally stored: the refresh token, the account ID
chosen, the created API token's `id` (so it can be revoked), and an `r2AuthMode`
discriminator of `manual | oauth`.

- **Disconnect** revokes the created API token via the API and clears all five fields,
  rather than just forgetting them locally. A token we minted and abandoned is a
  credential the user cannot see in a list they think of as theirs.
- If the refresh token is rejected, the app does **not** silently degrade: publishes
  still work, because the derived S3 key pair is independent of the OAuth session and
  outlives it. Re-auth is only needed to re-provision.
- Manual mode is untouched, and switching to manual entry drops the OAuth state.

### 5. Failure and fallback

Every step above can fail against someone else's account. The flow must degrade to
"here are the five fields, and here's a deep link to the exact dashboard page" rather
than dead-ending. In particular: consent declined, no accounts authorized, R2 not
enabled on the account, bucket name taken by an unrelated bucket, and insufficient
permissions on the granted scopes.

## Open questions

1. **Does enabling R2 on a fresh account require a payment method?** The docs say
   "You must purchase R2 before you can generate an API token", which is Cloudflare's
   wording for the free-tier enable click — R2's free tier is 10 GB with no egress
   charges. Whether a card must be on file is unverified and decides whether the flow
   is fully hands-off or ends in one unavoidable dashboard deep-link. **Verify against
   a genuinely fresh account before building.**
2. **Exact scope IDs.** Scope names correspond to API token permission names, fetched
   from `GET /client/v4/oauth/scopes` (requires auth). Need the concrete IDs for R2
   admin read+write and for token creation — and confirmation that an OAuth-issued
   token is permitted to mint an API token at all, which is the load-bearing
   assumption of step 4d.
3. **Access/refresh token lifetimes**, and whether refresh tokens rotate.
4. **Loopback redirect URIs** — confirm Cloudflare accepts `http://127.0.0.1` with a
   dynamic port for public clients. If only fixed ports are allowed, the listener
   needs a reserved port with a fallback.
5. **Bucket adoption semantics** when `axibridge-reports` already exists — adopt,
   suffix, or ask.

Questions 1 and 2 are prerequisites: if OAuth-issued tokens cannot create API tokens,
the entire design collapses to "OAuth logs you in and then still asks for five
fields", which is not worth building.

## What this does not change

`resolveR2Config`, `planSidecarHosting`, the sidecar encoding contract, the SigV4
implementation, and the Phase B rule that **sidecars never fall back to GitHub Pages**.
Phase C changes only how the five values get into the store.
