# Day 17

Day 17 of 40 for 40, built live on Twitch on Tuesday 24 November 2026. The problem is "Buried neighbourhood favour requests", from Anastasia. The answer is a "bat signal": one named ask, sent to a group of helpers by SMS or phone call. Work is tracked on the Superthread `day17` board and the "Day 17 - plan & brief" page.

- **Form factor:** agent. It reaches people by SMS and phone calls, with a web page for sign-up and for sending the signal. No native app and no WhatsApp for now.
- **Name:** TBC. The repo, the Workers and the URL path are all `day17` until the app has one.

## Layout

A pnpm workspace. Install with `pnpm install` from the root, and add dependencies with `pnpm --filter <package> add <dep>`.

- **`apps/landing`:** the landing page, Vue 3 and Vite, built into `dist/day17/` and served as static assets by the `day17` Worker at `build40for40.com/day17/`.
- **`workers/api`:** the `day17-api` Worker at `build40for40.com/day17/api`, with every route under `/day17/api/v1`. Its routes are more specific than the landing page's, so they win. Code is split by feature: `verify/` (SMS code sign-in), `households/` (`/me`, sign-up, delete), `signals/` (the red button, matching an ask to groups, inbound SMS routing and the hourly cron) and `sms/` (the provider interface, the fake and Textbelt providers and every system text).
- **`packages/contract`:** shared request and response types, error codes, limits and the `normalisePhone` helper, imported as `contract` by both the landing page and the API. Its `exports` point at the TypeScript source, so there's no build step.
- **`workers/*` and `packages/*`:** new Workers and shared code go here, one folder each. A new Worker needs its own `wrangler` script, the account's `account_id`, and a deploy step in CI.

## Commands

- `pnpm dev` applies the D1 migrations locally, then runs the landing page on 5173 and the API on 8787, with Vite proxying `/day17/api`. Open http://localhost:5173/day17/. Copy `workers/api/.dev.vars.example` to `workers/api/.dev.vars` first and set `SESSION_SECRET` to any long random string.
- `pnpm typecheck`, `pnpm test` and `pnpm build` run across the workspace. Tests sit next to the file they cover. `workers/api/src/flow.int.test.ts` runs the whole sign-up and signal flow through the router with the fake provider.
- `pnpm --filter api migrate` applies `workers/api/migrations/` to the local D1 database in `workers/api/.wrangler/`. Delete that folder to start from an empty database.
- `pnpm --filter api types` regenerates `worker-configuration.d.ts` after a change to the API's `wrangler.jsonc`.
- CI runs all of it on every PR. See "CI and CD" below.

## CI and CD

One workflow, `.github/workflows/ci.yml`, built from the shared `build40for40/actions`.

- **`check`:** runs on every PR and on `main`. Typecheck, tests and build across the workspace, then a landing page preview with its link commented on the PR. It's the check `main` requires.
- **`deploy`:** runs on `main` after `check`. It applies the D1 migrations in `workers/api/migrations/` to the remote `day17` database, deploys the API, then deploys the landing page. Deploys queue and never cancel, so a migration is never cut off.
- **Migrations must be safe for the old code,** since they land a moment before the new Worker does. Add columns and tables first, and drop things in a later change.
- **Secrets:** a GitHub secret named in the workflow's `secrets:` list is sent to the API Worker with each deploy. One with no value in GitHub is left as it is on the Worker, so a secret set by hand with `pnpm --filter api wrangler secret put` survives. A new secret needs its name in the `env:` block and the `secrets:` list.
- **Previews are the landing page only.** The API has no preview, so on a preview link the page's API calls fail. Test API changes with `pnpm dev` and the tests.
- **A new Worker** gets its own `deploy-worker` step in the `deploy` job.

## Data

- **D1:** the API's own database, named `day17` and bound as `DB`. It's separate from the site's `40for40` database. The schema lives in `workers/api/migrations/`, one numbered SQL file per change. Tests apply the migrations to a fresh database for every test file.
- **Tables:** `households`, `people` (one row per phone number), `memberships` (owner or helper, with the name that parent gave the helper), `signals` (at most one open per group, with the helper the parent signed off on), `signal_recipients` (one row per helper per signal: their reply code and their state), `messages` (every text in and out, deduped by `provider_id`), `verifications` (hashed sign-in codes) and `rate_events` (one row per rate limited action, keyed by phone or IP).
- **Several groups:** a parent can own up to 5 groups (one per child, the football team), each with a name, a description of what it's for, its own helpers and its own open signal. The page has one red button for all of them: `POST /signals` takes `householdIds` and opens a signal in each chosen group (or sends an update where one is already open), and refuses an empty list. Solve and sign-off still take one `householdId`. A helper who is in two of the chosen groups gets two texts.
- **Matching an ask to groups:** as the parent types, the page calls `POST /signals/match`, which asks Jev one yes or no question per group (the wording lives in `workers/api/src/signals/match.ts`) and returns a score from 0 to 1 for each. The page ticks every group at `MATCH_THRESHOLD` (60%) or more and none below it, the parent can tick and untick any of them, and Send stays off until at least one is ticked. A parent with one group skips the classifier. If Jev fails the route answers 503 `classifier_unavailable`, never a guess, and the parent picks by hand. By text there's no matching: a parent with several groups is told to pick on the page, unless exactly one of their groups has a signal open, which then gets the update.
- **Reply codes:** every helper gets a code for each signal, unique among their open ones, and answers with `Y4` (can help), `C4` (checking) or `N4` (can't). A text with a code always goes to that signal, so a parent who also helps another household can't open their own signal by mistake. Free text from a parent with an unanswered alert gets a "which signal?" prompt first, and sending it again opens their own.
- **Only where replies can arrive:** a provider says whether it can receive texts (`receives`). The fake can, Textbelt can't. With Textbelt the broadcast goes out without the reply code line and the page hides the helper states, so nobody is asked to reply to a number that can't hear them.
- **States:** a helper is `not_read`, `pending`, `accepted` or `rejected`. A signal is in alert until the parent signs off on one accepted helper (`OK 2` by text, or Confirm on the page), which doesn't close it. Other accepted helpers stay warm as backup, and if the signed off helper sends `N`, the signal goes back to alert and everyone who hasn't answered is asked again. Only SOLVED or the 24 hour cron closes a signal.
- **Names:** a helper's name lives on their membership, so each parent only ever sees the name they typed. `people.name` is the name a parent gave themselves.
- **Deletion:** deleting a household removes its memberships, signals and messages, the people it leaves with no other household (the parent included), and signs the parent out. Someone who texted STOP keeps a nameless row with `opted_out_at` so they're never texted again, not even a sign-in code.
- **My profile:** the page at `#profile` shows the parent's number, greyed out because it can't be changed, and lets them change their name (`PATCH /me`), sign out (`POST /sign-out`, which only clears the cookie on that browser) and delete their data (`DELETE /me`). That last one removes every group they own, then forgets them the same way deleting their last household does. Someone who still helps another household keeps a nameless row there.
- **Changing helpers:** `POST /households/helpers` adds one helper to a group and texts them the welcome. `DELETE /households/helpers?personId=<id>` takes one off, along with that group's texts to them and their place on its open signal. Both take the group id (`householdId` in the body, `id` in the query) once a parent owns several. A helper added while a signal is open doesn't get that signal. The add form and the new group form offer the people already in the parent's other groups, matched by phone number, so a number is only ever offered or added once per group.
- **Limits:** on top of the contract's limits, `workers/api/src/limits.ts` caps sign-in codes per IP and across everyone per hour, broadcasts (signals and updates, counted once per group) per parent per day, group matches per parent per hour, new households per parent per day, and helpers added per parent per day. Those counts are kept by phone, so deleting a household doesn't reset them. "Nothing open" and refusal replies go out at most once an hour per number, and texts from `SIGNAL_NUMBER` itself are ignored. Only UK (+44) and French (+33) numbers are accepted.
- **Cron:** every hour the API closes signals open for more than 24 hours, without texting anyone, forgets sign-in codes older than an hour and rate events older than a day. Trigger it locally with `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`.

## Environment

- **`SESSION_SECRET`:** required secret. It signs the `day17_session` cookie and hashes sign-in codes.
- **`TURNSTILE_SECRET`:** optional secret. When it's set, `/verify/start` checks a Turnstile token. When it isn't, the check is skipped.
- **`SMS_PROVIDER`:** `textbelt` in `wrangler.jsonc`, so a deploy sends real texts. `pnpm dev` and the tests override it to `fake`.
- **`TEXTBELT_KEY`:** secret, required when the provider is `textbelt`. It's a GitHub secret that CI passes to the Worker.
- **`TYPESAFE_API_KEY`:** secret for [TypeSafe](https://docs.typesafe.ai)'s Jev model, which matches an ask to groups. It's an org-wide GitHub secret that CI passes to the Worker. Without it, as in `pnpm dev` unless it's in `.dev.vars`, matching answers 503 and the page falls back to picking by hand. The ask and the group names and descriptions are sent to TypeSafe, never names or phone numbers.
- **`ALLOW_FAKE_SMS`:** the fake provider only runs when this is `true`. `pnpm dev` passes it with `--var` and the tests bind it, but a deploy doesn't have it, so a deployed Worker can never fall back to the fake.
- **`SIGNAL_NUMBER`:** the shared number parents text. Empty while the provider is Textbelt, which has no number to text, so `/me` returns null and the page leaves the number out.

## Textbelt

The deployed provider. [Textbelt](https://textbelt.com) sends one text per HTTP call from a shared pool of numbers, paid for in packs of texts.

- **Outbound only.** It can't receive texts outside the US, so `/sms/inbound` always answers 403. Signals are sent, updated and solved from the web page, and a reply or a STOP from a helper never reaches the app. No text or page promises either: a helper who wants out asks the parent.
- **No links** in a text until the key is whitelisted on Textbelt's site.
- **About one text a second** is what Textbelt asks for, so `sendAll` sends a group's texts one at a time with the provider's `gapMs` between them. A 10 helper group takes about 10 seconds to go out, inside the request.
- **Every sign-in code is a paid text.**

## The fake SMS provider

Used by `pnpm dev` and the tests.

No texts leave the machine. The fake provider prints every outbound text in the API's `wrangler dev` output as `[fake sms] to +447700900400: ...`, which is where sign-in codes show up. Its inbound webhook takes plain JSON, so you can play any phone with curl. Every JSON route needs `content-type: application/json`, which keeps plain HTML forms on other build40for40.com pages from posting to it:

```sh
B=http://localhost:5173/day17/api/v1
curl -X POST $B/verify/start -H 'content-type: application/json' -d '{"phone":"07700 900400"}'
curl -c jar -X POST $B/verify/check -H 'content-type: application/json' -d '{"phone":"+447700900400","code":"<code from the log>"}'
curl -b jar -X POST $B/households -H 'content-type: application/json' \
  -d '{"parentName":"Anastasia","householdName":"The Martins","description":"Getting Leo to and from school","helpers":[{"name":"Grandma","phone":"07700 900401"}]}'
curl -X POST $B/sms/inbound -H 'content-type: application/json' -d '{"from":"+447700900400","body":"Can anyone grab Leo at 5?"}'
curl -X POST $B/sms/inbound -H 'content-type: application/json' -d '{"from":"+447700900401","body":"Y1 on my way"}'
curl -X POST $B/sms/inbound -H 'content-type: application/json' -d '{"from":"+447700900400","body":"OK 1"}'
curl -X POST $B/sms/inbound -H 'content-type: application/json' -d '{"from":"+447700900400","body":"SOLVED"}'
```

Add a `providerId` to an inbound body to try a webhook retry: the second one is ignored. Texts to `+447700900999` always fail, to test failed sends. Use only numbers from the `+447700900000` to `+447700900999` drama range.

Shared 40 for 40 context lives in `../AGENTS.md`.

## The problem

Buried neighbourhood favour requests

Problem: Parents and neighbours coordinate small, urgent favours (late pickup, strike day kid care, parcel collection, party RSVPs) through scattered WhatsApp chains. Requests get buried, nobody knows who's responding, and it takes several messages to settle one thing.hundreds of of whatsapp groups taking up space on my phone. It has to work in French (as well as English).

Task: Build a private, invite-only app where a group member posts a request ("can anyone grab my child at 5?" « Who’s going to play football at 10am?), the group gets a push notification, and one tap claims it, or people tap to show they’re in. The request then closes so no one doubles up. Groups would also cover parcels and events (invite, RSVPs, messages). Can be deleted easily with all data once not used.

## From the brief and plan

A summary of the team's planning call, from the Superthread "Day 17 - plan & brief" page. That page is the source.

### What we're building

A "bat signal" for households: incident.io for parents. A parent with an emergency (a hospital ride, no nappies, a late pickup) sends one named ask, and it goes out at once to a group of helpers they chose earlier, by SMS or phone call.

It is not a to-do list. One signal is open at a time per group, "one in, one out", and it disappears when it's solved. One thing gets everyone's attention, and two things split the responsibility.

### MVP

- **Sign up:** a parent registers on the website and adds their helpers.
- **A number to message:** the parent gets a number. A message to it is the signal, and it's broadcast to each helper individually.
- **Groups:** any size, 2 or 18. A person can be in several groups on the same phone number, with a different signal per group ("this kid's pickup"). Two separate emergencies are two separate signals.
- **Opt in:** the parent opts the helpers in.
- **Solved:** follow-ups are pushed to the group ("grandma solved it, thanks"). The parent may have to report it solved. A "done" notification is a stretch.

### Decisions

- **Output is SMS and phone calls,** because they're universal: grandparents may not be on WhatsApp. One registered business number can be saved as an emergency contact, so it gets through work and sleep modes.
- **No native app:** App Store review takes too long and costs money.
- **No web push:** a web app can't do push notifications reliably.
- **No WhatsApp API for now:** Meta's KYC and compliance are a hurdle. SMS looks easier.
- **Input can be a web page:** a landing page or app with a red button, with SMS and calls as the output.
- **Make it fun:** theatre drives usage. The working brand is the bat signal.

### Open questions

- Which SMS and voice provider: Twilio was proposed, and the team is looking for an alternative with lighter KYC that can broadcast SMS.
- Whether a helper who doesn't reply counts as opted in.
- How to avoid notification fatigue.
- The name. "Poppy" and "puppy bat" came up, and Poppy is already the Day 7 app.
- If no provider works out, fall back to a browser-only version. ElevenLabs' direct phone integration is another option.

### Stretch

- **Stages like incident.io:** acknowledge, then accept or reject, then status updates ("found a car, arriving soon"). Several acknowledgements give a backup.
- **Repeat until resolved:** keep calling and texting until someone in the group picks it up.
- **Voice agent and AI layer:** knows who's available and what they can do (grandparents can't lift or drive), and decides who to alert and when.
- **Fun:** hero kudos ("good job, hero"), superhero personas, ElevenLabs voices, sound effects.
- **Hardware:** a red phone-style button, a light-up phone case, a wearable fall or shake trigger.

### Next steps from the call

- Find a Twilio competitor and confirm it can broadcast SMS.
- Draft the architecture.
- Build the registration form and website sign-up.
- Look into ElevenLabs and the best experience for the bat signal brand.
