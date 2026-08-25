# Balter Brewing — Logistics Daily Handover

A password-gated daily handover sheet, replacing the Excel version, matching
the security setup used on the sibling "Daily Packaging Handover" site.

## What changed, and why

This site previously had two real vulnerabilities:

1. **No password** — anyone with the URL could open and edit it.
2. **A JSONBin.io API key embedded in client-side JS** (`config.js`) —
   visible to anyone who opened the browser's dev tools or viewed page
   source, giving them read/write access to the synced data (and, if it
   was a Master Key, potentially to other bins on the same account).

Both are fixed by moving from static hosting (Netlify/Cloudflare Pages
drag-and-drop) to a **Cloudflare Worker** that sits in front of everything:

- Every request — including requests for `index.html`, `app.js`, `style.css`,
  the lot — is checked for a valid signed session cookie **before** anything
  is served. No cookie, an expired one, or a tampered one → bounced to
  `/login`.
- Cross-device sync now runs on **Cloudflare KV** — a key-value store
  bound directly to the Worker. There's no external API and no API key at
  all anymore; the sync data never leaves Cloudflare's own infrastructure.
  (This replaced an earlier JSONBin.io-based version of this same site —
  if you're looking at an older version of this README, that's why the two
  don't match.)
- Static files still deploy exactly like before, just from a `public/`
  folder instead of the repo root.

This is the same architecture as the Packaging Handover site, so if that
one's already live, this will feel familiar — same secret names, same
deploy method, same login page pattern. (That site may still be on the
JSONBin version rather than KV — the password-gate half of the design is
identical either way; only the sync backend differs.)

## Repo structure

```
balter-logistics-handover/
├── wrangler.jsonc        # Worker + static assets + KV namespace binding
├── package.json
├── .gitignore
├── .dev.vars.example     # copy to .dev.vars for local testing (gitignored)
├── src/
│   └── worker.js         # the ONE entry point — auth, sync (KV), static fallthrough
└── public/                # everything that used to be the site root
    ├── index.html
    ├── style.css
    ├── app.js
    ├── config.js          # no secrets in here — see below
    ├── manifest.json
    └── assets/
```

## How the Worker decides what to do with a request

1. `/login` and `/logout` — always reachable, no auth required.
2. Everything else — checked against a signed session cookie:
   - Missing/expired/tampered → page requests get redirected to `/login`;
     `/api/*` requests get a `401 { error: "unauthorized" }`.
   - Valid → continue.
3. `/api/sync` (only reachable once authenticated) — reads/writes a single
   shared record directly in Cloudflare KV, via the `HANDOVER_KV` binding.
   `GET` returns the current record (or `null` if nothing's been saved
   yet), `PUT` overwrites it. There's no external network call and nothing
   for the browser to ever see beyond the handover data itself.
4. Anything else that passes auth → served from `public/` via the Worker's
   `ASSETS` binding.

The session cookie itself is `<expiry-timestamp>.<HMAC-SHA256 signature>`,
signed with a secret (`SESSION_SECRET`) that only the Worker knows, and set
as `HttpOnly; Secure; SameSite=Lax`. There's nothing in the cookie for a
person to usefully tamper with — changing the expiry invalidates the
signature, and the signature can't be forged without the secret.

## One-time setup

### 1. Push this to a GitHub repo

Cloudflare's **Git integration ("Workers Builds")** is what deploys this —
not drag-and-drop, which can't run a Worker script at all. Create a new
GitHub repo and push this whole folder to it.

### 2. Connect it in Cloudflare

In the Cloudflare dashboard: **Workers & Pages → Create → Workers Builds →
connect your GitHub repo.** Point it at this repo; Cloudflare will detect
`wrangler.jsonc` and handle the build/deploy automatically on every push.

### 3. Create the KV namespace and bind it

Sync data lives in a Cloudflare KV namespace, not an external service. Create
one and wire it up:

**Via the dashboard:** Workers & Pages → **KV** → **Create a namespace**
(call it something like `balter-logistics-kv`). Copy the namespace ID it
gives you, then open your Worker → **Settings → Bindings → Add → KV
Namespace**, set the variable name to `HANDOVER_KV`, and pick the namespace
you just created.

**Via the CLI instead**, if you'd rather:
```
npx wrangler kv namespace create HANDOVER_KV
```
This prints a namespace ID — paste it into `wrangler.jsonc` in place of
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`, commit, and push (Workers Builds will
pick up the binding from `wrangler.jsonc` automatically on the next deploy).

If you skip this step, the site still works perfectly — it just runs in
local-only mode (each device saves to itself, no cross-device sync), and
the sync indicator will say "Saved to this device." Nothing breaks; sync
just quietly turns itself off until the binding exists.

### 4. Set the two secrets

In the Worker's **Settings → Variables and Secrets**, add these as type
**Secret** (not Text — Text values are visible in the dashboard and in
build logs; Secrets are encrypted and hidden after saving):

| Name | Value |
|---|---|
| `SITE_PASSWORD` | The password your team will type in at `/login` |
| `SESSION_SECRET` | A long random string (32+ characters) — used to sign session cookies. Generate one with `openssl rand -base64 32` or any password generator. Never reuse this across projects. |

(No JSONBin secrets needed anymore — if you're migrating this site from an
earlier JSONBin-based version, you can safely delete `JSONBIN_BIN_ID` and
`JSONBIN_API_KEY` from the Worker's secrets once KV is confirmed working,
and delete the old bin from your JSONBin.io account.)

### 5. Redeploy

Push to the connected branch (or trigger a deploy from the dashboard) and
Cloudflare builds and deploys automatically. Visit the Worker's URL —
you should land on the login page.

## Local development

```
npm install
cp .dev.vars.example .dev.vars   # fill in real values; this file is gitignored
npm run dev                       # wrangler dev, reads secrets from .dev.vars
```

`wrangler dev` automatically simulates the `HANDOVER_KV` binding locally
(persisted to disk under `.wrangler/`), so sync testing works out of the
box without touching your real production KV namespace.

## Logging in / out

- Visiting any page while unauthenticated redirects to `/login`.
- Sessions last 30 days (`SESSION_MAX_AGE_SECONDS` in `worker.js` — change
  if you want shorter/longer).
- The **Log out** button in the top bar clears the session cookie and
  sends everyone back to `/login`.

## Multi-device sync — same as before, now on Cloudflare KV

Cloud sync behaves exactly like it did previously (autosave, live sync
across devices, the green/amber/red dot in the top bar) — the only
difference is *where* the data lives. `config.js` has nowhere to put sync
credentials because there aren't any anymore; the site detects at runtime
whether the Worker has the KV binding configured and adapts automatically.

One thing worth knowing about KV specifically: writes can take up to about
a minute to become visible from a *different* Cloudflare data centre (KV is
eventually consistent, not instant, globally). In practice this is rarely
noticeable for a small team's daily sheet — the site already polls every
20 seconds — but if two people save near-simultaneously from opposite
sides of the country, the very latest write might take a few extra seconds
to show up everywhere.

### Migrating existing data from the old JSONBin version

If this site was previously running on JSONBin and you want to carry
today's data across rather than starting fresh in KV: log into the old
version, open the browser console, and run a quick fetch against the old
JSONBin bin to grab the current record, then — once the KV version is
deployed and you're logged into it — `PUT` that same JSON to `/api/sync`
from the console while logged in. Happy to walk through the exact commands
if you want to do this rather than just letting the sheet start fresh.

## Safety tip rotation & weather auto-fill

Unaffected by any of this — both still work exactly as before, driven from
`public/config.js` (weather location) and the `SAFETY_MESSAGES` array in
`public/app.js`.

## The "Build handover email" button

Unaffected — still builds the same formatted email/plain-text/image output
client-side.

## Editing colours or the logo

Still in `public/style.css` (`:root { ... }`) and `public/index.html` /
`public/assets/smiley-box-logo.svg`, same as before.
