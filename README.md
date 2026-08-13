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
- The JSONBin API key now lives only as a **Worker secret**, never sent to
  the browser. The site's own JS calls `/api/sync` (same origin, no
  credentials attached); the Worker is the only thing that ever talks to
  JSONBin directly.
- Static files still deploy exactly like before, just from a `public/`
  folder instead of the repo root.

This is the same architecture as the Packaging Handover site, so if that
one's already live, this will feel familiar — same secret names, same
deploy method, same login page pattern.

## Repo structure

```
balter-logistics-handover/
├── wrangler.jsonc        # Worker + static assets config
├── package.json
├── .gitignore
├── .dev.vars.example     # copy to .dev.vars for local testing (gitignored)
├── src/
│   └── worker.js         # the ONE entry point — auth, sync proxy, static fallthrough
└── public/                # everything that used to be the site root
    ├── index.html
    ├── style.css
    ├── app.js
    ├── config.js          # no secrets in here anymore — see below
    ├── manifest.json
    └── assets/
```

## How the Worker decides what to do with a request

1. `/login` and `/logout` — always reachable, no auth required.
2. Everything else — checked against a signed session cookie:
   - Missing/expired/tampered → page requests get redirected to `/login`;
     `/api/*` requests get a `401 { error: "unauthorized" }`.
   - Valid → continue.
3. `/api/sync` (only reachable once authenticated) — proxied server-side to
   JSONBin.io using the Worker's own secrets. `GET` fetches the latest
   record, `PUT` saves it. The response the browser sees never contains the
   JSONBin key.
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

### 3. Set the four secrets

In the Worker's **Settings → Variables and Secrets**, add these four as
type **Secret** (not Text — Text values are visible in the dashboard and
in build logs; Secrets are encrypted and hidden after saving):

| Name | Value |
|---|---|
| `SITE_PASSWORD` | The password your team will type in at `/login` |
| `SESSION_SECRET` | A long random string (32+ characters) — used to sign session cookies. Generate one with `openssl rand -base64 32` or any password generator. Never reuse this across projects. |
| `JSONBIN_BIN_ID` | The Bin ID from your JSONBin.io bin (create a **new, separate** bin for this site — don't reuse the Packaging Handover's bin) |
| `JSONBIN_API_KEY` | Your JSONBin **X-Master-Key**, or better, a scoped Access Key limited to just this one bin |

If you skip the last two, the site still works perfectly — it just runs in
local-only mode (each device saves to itself, no cross-device sync), and
the sync indicator will say "Saved to this device." Nothing breaks; sync
just quietly turns itself off.

### 4. Redeploy

Push to the connected branch (or trigger a deploy from the dashboard) and
Cloudflare builds and deploys automatically. Visit the Worker's URL —
you should land on the login page.

## Local development

```
npm install
cp .dev.vars.example .dev.vars   # fill in real values; this file is gitignored
npm run dev                       # wrangler dev, reads secrets from .dev.vars
```

## Logging in / out

- Visiting any page while unauthenticated redirects to `/login`.
- Sessions last 30 days (`SESSION_MAX_AGE_SECONDS` in `worker.js` — change
  if you want shorter/longer).
- The **Log out** button in the top bar clears the session cookie and
  sends everyone back to `/login`.

## Multi-device sync — same as before, just server-side now

Cloud sync behaves exactly like it did previously (autosave, live sync
across devices, the green/amber/red dot in the top bar) — the only
difference is *where* the JSONBin credentials live. `config.js` no longer
has anywhere to put them; the site detects at runtime whether the Worker
has sync configured and adapts automatically.

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
