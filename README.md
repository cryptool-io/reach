# Reach

Universal multi-channel outreach engine. Channel-first, domain-agnostic. Sister tool to `amt.cryptool.io`.

**Production: https://reach.cryptool.io** — Ubuntu/ronserver2, nginx + PM2 (app `reach`, port 3400), PostgreSQL 16 (`reach_db`), TLS via Let's Encrypt. Local dev stays on SQLite. Deploy/redeploy steps, the SQLite→Postgres migration, and operations are in [`deploy/README.md`](deploy/README.md).

## What's in v0

Every "Claude For Fundraising" card, mapped onto a universal project-shaped engine (fundraising = one preset):

| Image card | Lives here | Status |
|---|---|---|
| Investor Sourcer | `/sourcer` — Claude suggests targets from ICP → add as prospects | ✅ |
| Warm Intro Mapper | `/network` import + warm-intro paths on each prospect | ✅ |
| Pitch Deck Builder | `/studio` → Build deck (Claude → markdown, downloadable) | ✅ |
| Cold Outreach Writer | `/prospects/[id]` → Message Composer (`cold-intro`) | ✅ |
| Data Room Architect | `/studio` → Build data-room plan (structure + checklist) | ✅ |
| Investor Update Writer | Composer intent = `update` | ✅ |
| Objection Handler | Composer intent = `reply` + thread context | ✅ |
| Follow-Up Expert | `/campaigns` (sequences + conditions) + auto-fire | ✅ |
| LinkedIn Outreach Assistant | LinkedIn adapter (manual = Claude-in-Chrome) + DM/connect steps | ✅ manual |
| Investor CRM System | `/pipeline` + `/prospects` + `/conversations` | ✅ |
| Investor Intelligence System | `/prospects/[id]` → Research with Claude (brief + angle + fit score) | ✅ |
| Call Debrief System | `/prospects/[id]` → Call debrief (summary → stage + follow-up task) | ✅ |
| 475 Claude Prompts | `PromptTemplate` — every composer + agent prompt editable per project (`/settings`) | ✅ |
| 550+ Vetted Investors | CSV import + Sourcer + a starter-funds loader (Fundraising preset) | ✅ BYO |
| Autopilot Playbooks | `/campaigns` + `/cadences` + auto-fire scheduler | ✅ |

Enrichment/Sourcer synthesize from project data + best-effort public fetch; verified contact data needs a data provider (Apollo/Crunchbase). The starter-funds list is real public firm names with **no** fabricated contacts — verify before outreach.

Channels day-one: **Email** (mailto: in manual mode), **LinkedIn** (open profile in Claude-in-Chrome). **X / Telegram / Discord** rows exist on every project but their adapters are stubs until you wire credentials.

Mode switch is per channel: **manual** (drafts only, you send), **semi** (1-click send — pending wiring), **auto** (cadence fires without approval — pending wiring).

## Run

```powershell
cd C:\Users\ronza\Claude\MickAI\reach
npm install
npx prisma generate
npx prisma db push
npm run dev                # localhost:5173 — starts empty; create your first project
```

Set `ANTHROPIC_API_KEY` in `.env` before using the Message Composer.

## Spin up a new project (any outreach context — fundraising, sales, recruiting, PR…)

The app ships **no tenant data** — it's universal. On first run you create your own project:

1. `/projects` → **New project**.
2. **Pick a preset** — *Blank / Fundraising / Sales / Recruiting*. A preset only pre-fills editable settings (custom fields + a starter cadence + prompt copies); everything is changeable afterwards.
3. Set name, narrative (your one-liner / pitch), ICP (who you're targeting).
4. The project is auto-bootstrapped with one row per channel (all disconnected, mode = manual) and editable AI prompts.
5. `/settings` → tune **Custom fields**, **Messaging (AI prompts)**, channels and assets.
6. `/connections` → connect your own mailbox / bots (see below).
7. `/prospects` → import your list (template is generated from your field schema).
8. `/campaigns` → build a sequence, enroll prospects, work the Queue (or flip to auto).

Nothing is domain-hardcoded: the engine reads narrative/ICP/fields/prompts **from the project record**, so "Fundraising" is just a preset someone picked — that's what "channel-first, domain-agnostic" means.

## Per-project configuration (self-serve)

Everything domain-specific is a setting the project owner controls:

- **Presets** (`/projects` on create) — Blank / Fundraising / Sales / Recruiting starting points.
- **Custom fields** (`/settings` → Custom fields) — declare your own fields (key + label + type). They appear on the prospect form & detail, in the import template, and as `{{custom.key}}` snippets in campaigns.
- **AI prompts** (`/settings` → Messaging) — edit the Claude prompt per message intent (cold-intro / reply / comment / follow-up / update); reset any to default. Stored per project (`PromptTemplate`); the composer prefers your override.
- **Narrative / ICP / mode / assets** (`/settings`) — drive the composer and what's attachable.

## Cold outreach Campaigns (Woodpecker-style)

`/campaigns` is the cold-outreach engine, modeled on woodpecker.co:

- **Sequences** — up to 16 steps mixing Email / LinkedIn (connect + message) / Call / SMS / Manual tasks.
- **A/B versions** — up to 5 per step; the queue round-robins by send count; per-version sent/open/reply stats.
- **Conditions** — per step: always · if no reply · if not opened · if opened · if clicked.
- **Delivery settings** — mailbox + inbox rotation, daily limit, randomized send interval (min/max), send days + window + timezone (incl. per-prospect timezone), adaptive sending.
- **Behaviour** — stop on reply (in-thread), stop on click, auto-reply (OOO) reschedule.
- **Tracking** — open / click toggles + custom tracking domain (counters activate once a sending integration is wired).
- **Deliverability & compliance** — warm-up, spam-check, **empty-snippet detection** (won't send a message with an unfilled `{{tag}}`), duplicate detection, unsubscribe line, blacklist.
- **Snippets / merge tags** — `{{first_name}} {{name}} {{company}} {{role}} {{email}}` + any imported custom field via `{{custom.key}}`.
- **Queue** — what's due now, snippet-rendered per prospect, with Send & advance / Mark replied / Opt out (manual mode).
- **Stats** — enrolled · sent · open rate · reply rate · bounced · opt-out, plus interest sorting (interested / maybe / not / completed).

In **manual mode** the campaign computes *what* to send and *when*; you confirm each send from the Queue. Flip a channel to **auto** in `/settings` (post-wiring) and the same `nextActionAt` schedule drives an automated sender.

## Importing lists

`/prospects` → **Import**:
- **↓ Download template** / **Copy template** / **Use as example** — the CSV template is **generated from this project's field schema** (core columns + your custom field keys), so a Fundraising project gets investor columns, a Sales project gets account columns, etc.
- Core columns (`name, company, role, email, linkedinUrl, xHandle, telegram, discord`) map to prospect fields.
- Every other column — your declared custom fields **and** any extra header — is preserved in `customJson`, shown on the prospect detail, and usable as a `{{custom.key}}` snippet in campaigns.

## AI agents

Every agent is an editable prompt (`/settings` → Messaging & agent prompts) run through `src/lib/agents.ts`; all are universal (work for any project preset):

- **Intelligence** — `/prospects/[id]` → *Research with Claude*: best-effort fetches public URLs, then writes a brief + sharpest opening angle + a 0-100 fit score (saved as a Note, score on the prospect). Marks confidence so you know how much was real vs inferred.
- **Call Debrief** — paste a transcript → summary + objections + next step → updates the stage and creates a dated follow-up task.
- **Warm Intro Mapper** — `/network`: import your LinkedIn connections; each prospect shows who in your network is at the same firm.
- **Sourcer** — `/sourcer`: from your ICP + criteria, Claude proposes target firms/personas with a search query each; one click adds them as prospects (tagged `source=sourcer`, contacts left blank to verify).
- **Studio** — `/studio`: *Pitch Deck Builder* (10-12 slides, downloadable `.md`) and *Data Room Architect* (folder structure + document checklist). Missing numbers become `[PLACEHOLDER]` — never invented.

> All agents need `ANTHROPIC_API_KEY` set. They degrade gracefully (clear error) without it.

## Reply detection (IMAP)

Add IMAP host/port to a connected email channel (`/connections`) and the scheduler polls the mailbox each tick: inbound mail is matched to a prospect by email, logged into the conversation, and any active campaign enrollment is marked **replied** — so stop-on-reply fires hands-free. Body parsing via `mailparser`; first run looks back 7 days, then watermarks on `Channel.lastSyncAt`.

## Quick start (go live)

Open the app → **Create your account** (first run) → the **Dashboard** shows a go-live checklist:
1. **Connect mailboxes** (`/connections` → Sending mailboxes) — add several inboxes; capacity = Σ their daily limits. "Send a test from every mailbox" confirms each works.
2. **Review the campaign** — a ready 4-step *Investor cold outreach* sequence is seeded (draft), with A/B on step 1 and fallback snippets.
3. **Enroll prospects** — `/prospects` filter your list → select → *Add to campaign* (or enroll all matching).
4. **Set Email → Auto** (`/settings`).
5. **Start the campaign** — it then rotate-sends on schedule.

Snippets support **fallbacks**: `{{first_name|there}}`, `{{company|your fund}}` — blank fields read cleanly instead of leaving a raw tag, so a messy list still sends well.

## Conditional branching

Each step has a condition — **always · if no reply · if opened · if clicked · if not opened**. When a step comes due, the engine checks it against the prospect's tracked state: if it's not met (e.g. `if-opened` but they never opened), the step is **skipped** and the sequence advances to the next one. So you can branch follow-ups on engagement (openers get one path, non-openers another). `stop-on-reply` / `stop-on-click` are enforced via enrollment status.

### Wait-steps (pause until opened/clicked, with a timeout)

For an `if-opened` or `if-clicked` step you can tick **"wait for it"** instead of skipping. The enrollment is then **parked** on that step and re-checked (every ~30 min) until the condition flips *or* a timeout you set elapses. On timeout it either **skips the step** or **sends anyway**, per the step's `onTimeout`. This is the difference between *"only send if they've already opened"* (skip-and-advance) and *"hold the follow-up until they open, but don't wait forever"* (wait-step).

- Configure it inline in the sequence editor: `wait N days · if opened · ☑ wait for it · up to N days, else [skip step | send anyway]`.
- Parked prospects show a **waiting** chip on the Prospects tab; the Stats tab has a **Waiting** counter and each step's funnel notes its wait config. The scheduler tick report includes a `waited` count.
- Data: `CampaignStep.waitForCondition / waitTimeoutHours / onTimeout`, anchored by `CampaignEnrollment.waitingSince` (reset whenever the step advances). Decision logic is the pure, unit-tested `src/lib/campaigns/gating.ts` (`evaluateStepGate`). Manual Queue sends always override the gate. Verified end-to-end against live SMTP: park-while-unopened → release-on-open, timeout→skip, and timeout→send-anyway.

## Analytics

The campaign **Stats** tab shows a **per-step funnel** (sent → opened → clicked → replied with rates) and, for A/B steps, per-version rows with the **winning version** flagged (highest reply rate, tiebreak open rate).

## Open / click tracking

Auto-sent campaign emails go out as HTML with:
- an **open pixel** → `/t/o/<messageId>.gif` (first open counted, then always returns the pixel), and
- **click-tracked links** → `/t/c/<messageId>?u=<url>` (first click counted, then 302-redirects).

Counts roll up to each step version (`opened`/`clicked`/`replied`) so the campaign **Stats** tab shows real open/click/reply rates. Reply rate is wired from IMAP reply-sync. Tracking endpoints are public (recipients have no session); toggle per campaign in Delivery → Tracking; set a **custom tracking domain** there or `PUBLIC_BASE_URL` for prod. Note: pixel-based open tracking is inherently approximate (image blockers, Apple Mail Privacy Protection inflate it).

## Mailboxes (per project/company)

Each project (= a company on the platform) connects its **own** sending inboxes on the **`/mailboxes`** page:
- **Add mailbox** — provider preset (Gmail/Outlook/custom) + SMTP/IMAP creds, daily limit, warm-up. Tested on save.
- **Bulk import** — paste/upload a CSV to connect many inboxes at once (columns: `fromEmail,host,user,pass` required; `label,fromName,port,secure,imapHost,imapPort,dailyLimit,warmup` optional). Template provided.
- **Test all** / **Send a test from every mailbox** — verify deliverability before go-live.
- Capacity summary (Σ daily limits = emails/day), per-mailbox sent-today, pause/resume/delete.

Credentials are encrypted at rest and scoped to the project, so each company's inboxes stay isolated.

## Bulk cold email (inbox rotation)

To send at volume Reach uses **inbox rotation** — connect *many* sending mailboxes; the engine rotates across them with per-mailbox daily caps + warm-up. **Daily throughput ≈ Σ (per-mailbox daily limit).** A single Gmail can't send thousands (it gets throttled/banned ~500/day) — connect several mailboxes (different inboxes/domains), each ~30–50/day.

- **Add mailboxes:** `/connections` → *Sending mailboxes* → add SMTP accounts (provider preset auto-fills host/port + IMAP), set a daily limit, leave warm-up on. Each is tested on save. Capacity summary shows total emails/day + remaining.
- **Engine** (`src/lib/mailboxes.ts`): `pickMailbox` chooses the least-loaded mailbox under its cap (rotation); `effectiveDailyLimit` ramps during warm-up (15/day → +5/day → cap); `sendProjectEmail` sends + records; `projectCapacity` totals it.
- **Sender:** the scheduler tick drains due enrollments in a **batch** (not one), each email sent through a rotated mailbox, stopping when mailboxes hit their daily caps. Unsubscribe line is appended; stop-on-reply respected.
- **To switch on:** set the **Email** channel to **Auto** (`/settings`), add mailboxes, set a campaign **running**. Manual mode still drafts `mailto:` for review.

Verified end-to-end against 3 live SMTP mailboxes (cap 5 each): a 12-prospect batch sent **4 / 4 / 4** — evenly rotated, caps respected.

> Deliverability still depends on your domains: warm up inboxes, set SPF/DKIM/DMARC, keep volume per mailbox modest, honor unsubscribes.

## Auto-fire (full automation)

Reach ships an **in-process scheduler** (`src/lib/scheduler.ts`, started in `hooks.server.ts`) that ticks every 60s and, for each **running** campaign, sends the next due step automatically — but only on channels you've set to **auto** *and* **connected**. It respects:

- **Send window** — days of week + from/to time in the campaign's timezone.
- **Daily limit** — counts `CampaignSend` rows since local midnight.
- **Send interval** — won't fire again until `intervalMinMinutes` since the last send (human-like drip).
- **Stop-on-reply** — enrollments marked replied/bounced/opted-out are skipped.
- **Eligibility** — only steps whose channel is auto + connected fire; LinkedIn/call/manual steps stay in the manual Queue.

Manual sending (the Queue) and auto-fire share one code path (`src/lib/campaigns/dispatch.ts`), so behaviour is identical either way. Trigger a tick on demand with the **⚡ Run auto-fire now** button on `/campaigns` (or `POST /api/scheduler/tick`). Verified end-to-end against a live SMTP server: a due step sent a real email, advanced the sequence, incremented the A/B stat, and a non-connected channel was correctly skipped.

> Default is safe: every channel starts **manual + disconnected**, so nothing auto-sends until you connect a mailbox and flip it to **auto**.
> For production scale, swap `tick()` onto BullMQ + Redis — the logic is unchanged.

## Connecting accounts (`/connections`)

Each project/client connects **their own** sending accounts — credentials are encrypted at rest (AES-256-GCM, key derived from `APP_SESSION_SECRET`). One guided card per channel with step-by-step instructions:

- **Email (SMTP)** — provider presets (Gmail/Workspace, Outlook/M365, custom) auto-fill host/port. Enter from-name/email + username + password (Gmail needs an **App password**). **Test connection** verifies the SMTP login; **Send test** delivers a real test email to an address you choose.
- **Telegram** — bot token from @BotFather; Test calls `getMe`.
- **Discord** — bot token from the developer portal; Test calls `users/@me`.
- **X / Twitter** — Bearer token (DM send needs a paid tier); Test reads your account.
- **LinkedIn** — manual via Claude-in-Chrome (no send API); save your profile URL.

Once an **email** channel shows **connected**, any send in **semi/auto** mode goes out through that project's mailbox for real. **Manual** mode still produces a `mailto:` draft for review. Set the mode per channel in `/settings`.

### Test it with your own email
1. `/connections` → **Email** → pick the **Gmail** (or Outlook) preset.
2. Enter your from-email + username and an **App password** → **Save**.
3. **Test connection** (verifies login) → **Send test** to your inbox.
4. Flip the email channel to **semi** or **auto** in `/settings` to send campaign/composer messages for real.

## Login / auth

The whole app is gated behind a login (`hooks.server.ts` redirects unauthenticated requests to `/login`). On first run `/login` shows **Create your account** (sets up the admin); after that it's a normal sign-in. Passwords are hashed with scrypt (`src/lib/auth.ts`); sessions are DB-backed (`Session` table) with an httpOnly cookie. Sign out from the sidebar footer. `User`/`Session` are Prisma models — add more users by registering (or extend with an invite flow later).

## DB

SQLite at `prisma/dev.db` for dev (the `DATABASE_URL` path is relative to `prisma/`). The Prisma schema is Postgres-compatible — swap `provider = "postgresql"` and `DATABASE_URL` to deploy.

## Roadmap (post-v0)

- Wire Gmail OAuth for real inbox fetch + send.
- X / Telegram / Discord adapters.
- Cadence auto-fire (BullMQ + Redis scheduler).
- Intelligence enrichment job.
- Warm intro mapper.
- Call debrief transcript intake.
- More presets (Partnerships, PR) + a guided setup checklist.
- Pipeline analytics + channel ROI.
- cryptool SSO; deploy to `reach.cryptool.io`.
