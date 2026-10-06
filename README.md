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

## How multi-device sync works (and what it can't promise)

Every computer keeps its own copy of each day in the browser, and syncs it
with one shared copy stored in Cloudflare KV, through the site's own
`/api/sync` address. The page is the same on every computer; nothing secret
is ever sent to the browser.

**The rules that keep people from overwriting each other** (all covered by the
automated tests in `tests/`):

- **Baseline.** Each computer remembers the last copy of the day that the
  *server* is known to hold. It is only set from what the server returned, or
  from exactly what this computer sent after a confirmed save. It is stored in
  the browser, so reloading or a short outage doesn't lose it.
- **Merge by section.** When saving, the page first fetches the shared copy.
  For each section of the sheet (wrap-up, AM priorities, additional tasks,
  lock-ups, outbound, inbound, deliveries, packaging plan, checks, roster,
  absent staff, safety, weather): if *this* computer changed it since the
  baseline, this computer's version wins; otherwise the shared version wins.
  So two people editing *different* sections never overwrite each other.
- **A brand-new computer** (or a day it has never edited) merges with the
  shared copy instead of ignoring it, so it opens showing everyone's work.
- **Revision ids, not clocks.** Each save gets a random revision id. The page
  only ever asks "is this the same revision?", never "which is newer?", so
  computers with different clocks can't confuse it.
- **Reads are strict.** If a read fails, the page treats it as an error — never
  as "nothing stored" — so one failed read can't lead to a save that wipes
  other days.
- **One sync at a time**, with edits made meanwhile gathered into a follow-up.
- **Read-back.** After saving, the page reads the shared copy back. If another
  computer's save landed after ours, it merges theirs in and sends again
  (up to 3 tries).
- **Outages heal themselves.** If a save fails, the edit stays on that
  computer (and survives a reload). At the next background check it is sent
  automatically.
- **Your cursor stays put** when the screen refreshes with someone else's change.
- **Housekeeping.** Days older than 21 days are removed from the *shared*
  copy on each save (each computer keeps its own history). The page checks for
  changes every 45 seconds, only while the tab is visible. The status pill
  explains any problem when you hover over it.

### Known limits — please read

1. **Two people saving in the same fraction of a second can very occasionally
   still lose an edit.** Cloudflare KV has no "only save if nobody else has"
   operation (no atomic compare-and-swap), so this can't be fully closed here.
   In 40 simulated races with 3 computers editing at once, no edit was lost;
   on a deliberately slow, erratic simulated network, none in 20. That is a
   good sign, not a guarantee.
2. **Two people editing the *same section* at the same time:** the later save
   of that whole section wins (for example, two people adding rows to the
   Outbound table in the same moment). Different sections are safe.
3. **KV is "eventually consistent".** A change made through one Cloudflare
   location can take up to a minute or more to appear through another. All of
   your team is in one city, so you will almost always use the same location,
   but a phone hotspot or a different internet provider can be routed
   elsewhere. In that rare case a computer can briefly see slightly old data
   (and, in the worst case, a very recent edit by someone else could be
   overwritten). If this ever looks like it is happening, the proper fix is to
   move the shared copy to a Cloudflare **Durable Object**, which gives
   one-at-a-time, instantly consistent saves. That is a bigger change than
   this update; it can be done as a follow-up.
4. **Free-plan allowance.** On Cloudflare's *free* Workers plan, KV allows
   **1,000 writes and 100,000 reads per day**, resetting at 00:00 UTC, which is
   **10:00 am Brisbane time**. Each saved edit costs 1 write and 2 reads;
   background checks cost 1 read each (about 80 an hour per open tab). If the
   write allowance runs out, saves fail until the reset: the pill turns red and
   its hover text says why. Nothing is lost — edits stay on each computer and
   send themselves after the reset. You can watch usage in the Cloudflare
   dashboard (Storage & Databases → KV → your namespace → Metrics). The paid
   Workers plan (about US$5/month) removes the cap.
5. **Switching to a different date within about a second of editing** can leave
   that edit waiting on the computer until that date is opened again (it is
   never lost, and it then sends automatically).
6. **Old days are deleted from the shared copy after 21 days.** They remain on
   any computer that viewed them.

## Deploying an update (not the first-time setup)

Cloudflare builds from GitHub, so deploying means putting the new files in your
repo and pushing. **Only copy the files in the update list; do not overwrite
`wrangler.jsonc`** — in this project it may hold your real KV namespace ID,
and the copy inside a downloaded zip only has a placeholder.

1. Copy these files from the zip over the same-named files in your repo folder:
   `public/app.js`, `public/index.html`, `public/config.js`, `src/worker.js`,
   `README.md`, and the whole `tests/` folder.
2. Commit and push (GitHub Desktop: write a summary, "Commit to main", "Push origin").
3. In Cloudflare: Workers & Pages → your Worker → **Deployments** — wait for the
   newest build to show success.
4. Open the site, press **Ctrl+F5** once on each computer, log in, and check the
   pill in the top bar says "Synced across devices".

**If the site says it is "missing SITE_PASSWORD / SESSION_SECRET" after the
deploy:** editing `src/worker.js` can make Cloudflare drop the dashboard secrets
from the active version. Go to the Worker → **Settings → Variables and Secrets**
and check both secrets are listed (re-add them if not), then **Deployments /
Version History → promote the newest version**. Also check **Settings →
Bindings** still lists your KV namespace as `HANDOVER_KV`. `"run_worker_first":
true` in `wrangler.jsonc` must stay — it is what puts the password gate in front
of every file.

## Running the tests (developers)

Needs Node 18+. From the repo folder:

```
cd tests
node scenarios.js                        # 13 checks: new browser, simultaneous saves, outage recovery...
node scenarios_site.js                   # 22 Logistics-specific checks (weather race, Additional Tasks...)
node stress.js                           # 3 computers racing, 40 trials — should lose 0 edits
SLOW=1 VERIFY_MS=400 node stress.js      # same on a slow, erratic network, 20 trials
node worker_test.mjs                     # 21 checks on src/worker.js
```

`APP_SRC=/path/to/old/app.js node scenarios.js` runs the same tests against any
other version of the page. `tests/dom_test.js` (optional) runs the real page in a
full simulated browser; it needs `npm install jsdom` first.

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
