# Day 17

Day 17 of 40 for 40, built live on Twitch on Tuesday 24 November 2026. The problem is "Buried neighbourhood favour requests", from Anastasia. The answer is a "bat signal": one named ask, sent to a group of helpers by SMS or phone call. Work is tracked on the Superthread `day17` board and the "Day 17 - plan & brief" page.

- **Form factor:** SMS and phone calls out, with a web page for sign-up and for sending the signal. No native app and no WhatsApp for now.
- **Name:** TBC. The repo, the Workers and the URL path are all `day17` until the app has one.

## Layout

A pnpm workspace. Install with `pnpm install` from the root, and add dependencies with `pnpm --filter <package> add <dep>`.

- **`apps/landing`:** the landing page, Vue 3 and Vite, built into `dist/day17/` and served as static assets by the `day17` Worker at `build40for40.com/day17/`.
- **`workers/api`:** the `day17-api` Worker at `build40for40.com/day17/api`. Its routes are more specific than the landing page's, so they win.
- **`workers/*` and `packages/*`:** new Workers and shared code go here, one folder each. A new Worker needs its own `wrangler` script, the account's `account_id`, and a deploy step in CI.

## Commands

- `pnpm dev` runs the landing page on 5173 and the API on 8787, with Vite proxying `/day17/api`. Open http://localhost:5173/day17/.
- `pnpm typecheck`, `pnpm test` and `pnpm build` run across the workspace. Tests sit next to the file they cover.
- `pnpm --filter api types` regenerates `worker-configuration.d.ts` after a change to the API's `wrangler.jsonc`.
- CI runs all of it on every PR, uploads a landing page preview, and deploys both Workers on `main`.

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
