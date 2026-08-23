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
- **Replacing SigV4 uploads.** Manual mode keeps its hand-rolled SigV4 path unchanged.
  OAuth mode gets a second, bearer-token transport beside it — not a migration.
- **Removing the manual fields.** They stay, as fallback and for custom domains.

## Verified against the live API, 2026-08-23

Everything in this section was checked directly rather than inferred from prose. Two
findings reverse the first draft of this design.

### OAuth *can* carry the uploads — via the REST API, not SigV4

The first draft asserted "there is no documented Cloudflare REST endpoint for putting
an object into a bucket." That is wrong. The endpoint exists:

```
PUT /accounts/{account_id}/r2/buckets/{bucket_name}/objects/{object_key}
```

> "Uploads an object to an R2 bucket. The object body is provided as the request body.
> The maximum upload size for this endpoint is 300 MB. For most workloads, we recommend
> using R2's S3-compatible API or a Worker with an R2 binding instead."

It takes a plain `Authorization: Bearer` token. So an OAuth access token holding
`workers-r2.write` can upload a sidecar with **no API token and no SigV4 at all**.

Confirmed empirically: an OAuth access token (Wrangler's, as a stand-in) authenticates
successfully against `GET /accounts/{id}/r2/buckets`. OAuth bearer → R2 REST API works.

Constraints that come with this path:

| | |
|---|---|
| Max object size | **300 MB** per request (vs 5 GiB single-part on S3) |
| Rate limit | 1,200 requests / 5 min across *all* R2 REST operations on the account |
| Object-scoped tokens | Not supported by the REST API — admin-level `workers-r2.write` required |

Both limits are comfortable for AxiBridge: a publish writes two or three objects, and
`replay.json` — the largest artifact — sits well under 300 MB after the trim pass. It is
not comfortable for anything that grows, so the ceiling belongs in a check, not a
comment.

### OAuth *cannot* mint an API token — the scope does not exist

This was open question 2, and it resolves **no**.

`GET /client/v4/oauth/scopes` returns **383 scopes**. None of them grants API token
management. Searching the full catalog for `token`, `iam`, `permission`, `credential`
or `api-key` yields exactly one unrelated hit (`access-service-token.*`, Zero Trust
service tokens). There is no `api-tokens.write` equivalent to request.

Confirmed empirically: `GET /user/tokens` with an OAuth access token returns

```json
{"success": false, "errors": [{"code": 9109, "message": "Unauthorized to access requested resource"}]}
```

while `GET /accounts` on the same token succeeds. The token is valid; token management
is simply not reachable through OAuth.

The R2 scopes that *do* exist:

| scope id | name |
|---|---|
| `workers-r2.write` | Workers R2 Storage Write (admin) |
| `workers-r2.read` | Workers R2 Storage Read |
| `workers-r2.metadata_read` | Workers R2 Storage Metadata Read |
| `workers-r2-bucket-item.write` | Workers R2 Storage Bucket Item Write |
| `workers-r2-bucket-item.read` | Workers R2 Storage Bucket Item Read |

`POST /accounts/{id}/r2/temp-access-credentials` is not a way around this: it requires
`parentAccessKeyId`, so it derives from an API token that must already exist.

### What this changes

The first draft's plan — OAuth mints an API token, we derive an S3 key pair from it,
every existing upload path stays untouched — **is not buildable**. The replacement is
better in one way and worse in two:

- **Better:** no long-lived credential is ever created, stored, or leaked. Nothing to
  revoke on disconnect except the OAuth grant itself, which the user can already do from
  their Cloudflare profile.
- **Worse:** AxiBridge grows a *second* upload path. `r2SignedRequest`, `r2PutObject`,
  `r2DeleteObject` and `r2EnsureBucketCors` (`githubHandlers.ts:486-650`) stay for manual
  mode, and an OAuth mode adds bearer-token REST equivalents beside them.
- **Worse:** publishing now depends on a live OAuth session. The first draft's key pair
  outlived the grant; a bearer token does not. Access tokens must be refreshed before
  each publish, and a rejected refresh token breaks publishing until the user re-signs-in.

The consent scope is also coarser than the first draft implied. `workers-r2.write` is
account-wide R2 admin — it cannot be narrowed to one bucket at consent time. The screen
will say AxiBridge can read and write *all* R2 storage in the selected account. That is
a real thing to disclose, and an argument for keeping manual mode prominent for anyone
who would rather hand over a bucket-scoped key.

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
- Scopes: `workers-r2.write` (account-wide R2 admin — the REST object endpoints do not
  accept object-scoped grants), `memberships.read` to enumerate authorizable accounts,
  and `offline_access` for a refresh token
- **Domain verification is required before the client can be made public.** A private
  client only works for members of the registering account, which is useless here.
  This needs a DNS TXT record on a domain we control, plus a logo, client URL, policy
  URL and ToS URL for the consent screen.

Endpoints, from Cloudflare's
[discovery document](https://dash.cloudflare.com/.well-known/openid-configuration):

```
authorize  https://dash.cloudflare.com/oauth2/auth
token      https://dash.cloudflare.com/oauth2/token
revoke     https://dash.cloudflare.com/oauth2/revoke
jwks       https://dash.cloudflare.com/.well-known/jwks.json
```

The document advertises `code_challenge_methods_supported: ["plain", "S256"]` and
`token_endpoint_auth_methods_supported` including `"none"`, so the public-client +
PKCE-S256 shape is supported at the protocol level. (It also advertises `implicit`,
`client_credentials` and device code — those are first-party only; the docs state
plainly that third-party clients get authorization code and nothing else.)

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
   a. `GET /accounts` — list accounts the user authorized, and let them pick if more
      than one;
   b. `POST /accounts/{id}/r2/buckets` — create the bucket (default name
      `axibridge-reports`, adopt it if it already exists and is ours);
   c. `PUT /accounts/{id}/r2/buckets/{bucket}/domains/managed` — enable the public
      development URL, then `GET` it back for the `pub-<hash>.r2.dev` hostname;
   d. `PUT /accounts/{id}/r2/buckets/{bucket}/cors` — the OAuth-mode equivalent of
      `r2EnsureBucketCors`.
5. Persist `r2AccountId`, `r2BucketName`, `r2PublicUrl`, the refresh token, and
   `r2AuthMode: 'oauth'`. **No access key pair is created** — see the verified
   section above; there is no scope that would allow it.
6. Prove it works before reporting success: `PUT` a small object through
   `/accounts/{id}/r2/buckets/{bucket}/objects/{key}` with the bearer token, `GET` it
   back over the public `r2.dev` URL to confirm the bucket really is public, then
   `DELETE` it.

Step 6 matters: today a bad configuration is discovered at publish time. This flow
should never report "connected" without having completed one real round trip.

Publishing then diverges by mode. `planSidecarHosting` is unchanged — it still decides
*whether* a sidecar goes to R2 — but the transport differs:

| mode | transport |
|---|---|
| `manual` | existing `r2PutObject` / `r2DeleteObject`, hand-rolled SigV4 |
| `oauth` | `PUT`/`DELETE` on the REST object endpoints, `Authorization: Bearer` |

Both must go through one seam, not two call sites that drift. The natural shape is an
uploader interface resolved once from `r2AuthMode`, with `planSidecarHosting` and its
callers (`githubHandlers.ts:1862`, `:1911`) unaware of which one they got.

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

### 4. Credential storage and session lifetime

OAuth mode stores the refresh token, the chosen account ID, the bucket name, the public
URL, and an `r2AuthMode` discriminator of `manual | oauth`. `r2AccessKeyId` and
`r2SecretAccessKey` stay **empty** in OAuth mode — which means `resolveR2Config`
(`githubHandlers.ts:468`), whose entire contract is "all five fields non-empty", has to
learn about the discriminator. That is the one place this phase genuinely reaches into
existing logic, and it should be a widening of the config type rather than a special
case sprinkled through the callers.

- **Disconnect** clears the stored tokens and calls the revoke endpoint. There is no
  minted API token to clean up — a strict improvement over the first draft, which would
  have left a credential behind on any failed disconnect.
- **Refresh is on the publish path.** Unlike a derived key pair, a bearer token expires.
  Publishing must refresh before use and surface a clear "sign in to Cloudflare again"
  state when the refresh token is rejected — not a SigV4-shaped error, and not a silent
  drop of the sidecar. This is a genuine regression in robustness versus manual mode and
  should be stated in the UI, not hidden.
- Manual mode is untouched, and switching to manual entry drops the OAuth state.

### 5. Failure and fallback

Every step above can fail against someone else's account. The flow must degrade to
"here are the five fields, and here's a deep link to the exact dashboard page" rather
than dead-ending. In particular: consent declined, no accounts authorized, R2 not
enabled on the account, bucket name taken by an unrelated bucket, and insufficient
permissions on the granted scopes.

One failure mode is invisible from the client side and worth handling by name:
**account administrators can disable OAuth access to account resources** entirely
(*Manage Account → Members → Settings → Public OAuth App access*). The symptom is an
account that simply does not appear in the consent screen's account list. A user in a
guild-owned Cloudflare account may hit this and have no idea why their account is
missing; the empty-account-list message should name it.

## Open questions

Questions 2 and 4 from the first draft are now answered — see the verified section
above. What remains:

1. **Does enabling R2 on a fresh account require a payment method?** The docs say
   "You must purchase R2 before you can generate an API token", which is Cloudflare's
   wording for the free-tier enable click — R2's free tier is 10 GB with no egress
   charges. Whether a card must be on file is unverified and decides whether the flow
   is fully hands-off or ends in one unavoidable dashboard deep-link. **Verify against
   a genuinely fresh account before building.** This is now the only remaining
   prerequisite.
2. **Does `PUT .../objects/{key}` actually accept an OAuth bearer token?** Reads were
   confirmed (`GET /accounts/{id}/r2/buckets` succeeds on an OAuth token); the write
   was not tested, because testing it means writing an object into a real bucket. This
   is load-bearing for the whole design and needs one round-trip put/delete against a
   scratch bucket before anything is built.
3. **Whether the 1,200-per-5-minutes REST limit counts object operations.** The limit
   is stated as "across all R2 REST API operations on your account", while a separate
   footnote says the bucket-management rate limit does *not* apply to object reads and
   writes. AxiBridge writes two or three objects per publish either way, so this is a
   sizing question, not a blocker.
4. **Access/refresh token lifetimes**, and whether refresh tokens rotate. Now more
   important than in the first draft: publishing depends on refresh succeeding.
5. **Loopback redirect URIs** — confirm Cloudflare accepts `http://127.0.0.1` with a
   dynamic port for public clients. The docs show only an `https://example.com`
   example. If only fixed ports are allowed, the listener needs a reserved port with a
   fallback.
6. **Bucket adoption semantics** when `axibridge-reports` already exists — adopt,
   suffix, or ask.

## What this does not change

`planSidecarHosting` and its routing table, the sidecar encoding contract
(`slice.json.gz`, `Content-Type: application/gzip`, no `Content-Encoding`), the SigV4
implementation used by manual mode, and the Phase B rule that **sidecars never fall
back to GitHub Pages**.

`resolveR2Config` *does* change, narrowly: it can no longer treat "five non-empty
fields" as the definition of "R2 is configured", because OAuth mode has no key pair.
