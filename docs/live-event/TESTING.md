# caLANdar Live: testing it locally

Everything Live does can be tried on one machine: a seeded event that is
running _now_, several gamers in different browser windows, and a Steam
simulator in place of real Steam presence.

## 1. Start the API and the frontend

```sh
just dev            # Postgres (docker-compose), the API on :8080, vite on :3000
```

Without `RESEND_API_KEY` set, `just dev-api` sets `EMAIL_TO_LOG=1`: no
email is sent, and signing in prints a `http://localhost:3000/verify_email?token=…`
link in the API's output to open instead.

`just dev-api` sets `LIVE_DEV_TOOLS=1`, which turns on the local-only
seed and simulators. Never set it in production.

> The database is published on 5432 and the API listens on 8080. If
> either is taken, pick others: `PORT=55555 DB_PORT=55432 just dev`.
> Put them in `.env` (or pass them to every recipe, e.g.
> `DB_PORT=55432 just live-seed`) so the other recipes agree.

Optional extras:

| Variable                   | What it turns on                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `STEAM_API_KEY` (real key) | Real Steam presence polling every 30s for attendees with a Steam id                                          |
| `VAPID_PRIVATE_KEY`        | Web Push. Make one with `cd api && cargo run -q -- dev-vapid`                                                |
| `GOOGLE_PLACES_API_KEY`    | Food near the venue in the propose sheet (also set a venue location in Live settings)                        |
| `LIVE_STREAM_ORIGIN`       | Streams from a separate origin (production: the `calandar-live` service). Unset locally: the API serves them |

## 2. Seed an event that is running now

```sh
just live-seed
```

It creates "Live Test LAN …" (doors 3 hours ago, ending in 45 hours) with:

- ten gamers (yes, maybe, no and not-yet RSVPs; some with fake Steam ids);
- a room with twelve seats and seven reservations;
- suggested games with votes and owners, so the planner suggests sessions;
- **Deep Rock Galactic starting in four minutes** (to see the start grace),
  and Left 4 Dead 2 later tonight.

It prints the URL and the gamers to sign in as.

## 3. Sign in as different gamers

Signing in normally needs the email link. Locally, mint a token instead:

```sh
just live-token ana@example.com
```

It prints the token and a snippet to paste into the browser console on
`http://localhost:3000`, then reloads signed in. Use a separate browser
profile (or a private window) per gamer. `lewis@oaten.name` is an admin.

## 4. Things to try

**Plumbing.** Open Live in two windows. The panel shows `● LIVE`. As the
admin, open the amber **Admin** button and post to everyone: the other
window gets an amber toast at once. Hide a tab for two minutes: its stream
closes (`PAUSED`) and catches up when you come back. Go offline in devtools
and back: `OFFLINE`, then everything you missed arrives.

**Timeline and check-in.** Press **I'm here** in each window. Drag a session
on the Schedule page (as the admin): it moves on every Live screen and the
feed says so. Overlapping sessions now pack into lanes instead of being
refused.

**Presence.** As the admin, use **Simulate Steam** (bottom right, dev only):
pick a checked-in gamer and a game, press **Playing**. A lobby is created
and they're in it (`NOW · STEAM`). The first time a game is seen, they're
asked for players and teams, which are saved for everyone. Others can
**Join now** from lobby details; **Leave** sticks until Steam shows a
different game. Joining by hand while Steam shows another game gives five
minutes to launch it, then becomes a pre-join. The last one out leaves the
lobby empty; five minutes later it's done with its actual times. Pre-join a
planner suggestion and it's fixed on the schedule. Admins: **Audit** shows
each gamer's stays.

**Votes and the start-time machine.** Watch Deep Rock Galactic start: with
nobody in, everyone pre-joined gets the pink **Nobody's in yet** toast with
**Join now** and **Delay start…**. Join, and the grace locks for five
minutes; anyone still elsewhere then drops out. Nobody joins: it's booted.
**Call vote ▾** proposes a game or food (alongside: needs one backer within
five minutes; against a planned lobby: opens _What's on at …?_), keeps
playing, changes a lobby or kicks off early. Vote by tapping options;
unanimity finalises after 20 seconds, "happy to split" splits the party,
the deadline goes to the plurality. Admins force, split or veto inline or
from the Admin button, and handle the check-in queue.

**Room scale.** In **Live settings** (admins, right column) make a
wall-board link and open it on a TV-sized window: no login, updates live,
shows posts marked **ALSO ON TV**, and sleeps in the hours you set. **Notify
me** subscribes the browser to Web Push (with `VAPID_PRIVATE_KEY` set). Add a
Discord webhook to get results and proposals posted there.

Time-based rules (graces, deadlines) run every 2 seconds while anyone has
Live open, and when a countdown you're looking at reaches zero.

## 5. Automated checks

```sh
cd api && cargo test                               # engine rules, views, crypto
cd api && DATABASE_URL=… cargo test -- --ignored live_db   # the write path against Postgres
cd frontend && npx vitest run                      # store, connection, selectors, toasts
```

The end-to-end script drives the steps above in headless Chrome against a
running stack (fresh `just live-seed` first):

```sh
cd docs/live-event/e2e && npm install
CHROME_PATH=$(which google-chrome) node final.js <event id>
```

Set `RESTART_API` to a command that restarts the API to also check that
streams recover from a restart.
