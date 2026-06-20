<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  let r = $derived(data.ready);
  let done = $derived(r ? Object.values(r.checklist).filter(Boolean).length : 0);
  let pct = $derived(Math.round((done / 5) * 100));
</script>

<section class="max-w-6xl mx-auto">
  <h1 class="text-2xl font-semibold tracking-tight mb-1">Get started</h1>
  <p class="text-ink-mute mb-6">The fastest path from here to sending. Steps the app can do for you are one click.</p>

  {#if !r}
    <div class="card p-6">
      <h2 class="text-lg font-medium mb-2">No project yet</h2>
      <p class="text-ink-mute mb-4">Create your first project to begin.</p>
      <a href="/projects" class="btn-primary">+ New project</a>
    </div>
  {:else}
    {#if form?.ok === 'enroll'}<div class="toast text-accent-good mb-4">Enrolled {form.added?.toLocaleString?.() ?? form.added} prospect(s) into the campaign.</div>{/if}
    {#if form?.ok === 'auto'}<div class="toast text-accent-good mb-4">Email channel set to Auto — the scheduler can now send.</div>{/if}
    {#if form?.ok === 'started'}<div class="toast text-accent-good mb-4">Campaign started. It sends on schedule as soon as a mailbox is connected.</div>{/if}
    {#if form?.error}<div class="toast text-accent-bad mb-4">{form.error}</div>{/if}

    <!-- stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="stat"><div class="stat-label">Prospects</div><div class="stat-value">{r.prospects.toLocaleString()}</div></div>
      <div class="stat"><div class="stat-label">Daily capacity</div><div class="stat-value">{r.capacity.limit.toLocaleString()}</div><div class="text-[10px] text-ink-dim">{r.capacity.mailboxes} mailbox(es)</div></div>
      <div class="stat"><div class="stat-label">Active in campaigns</div><div class="stat-value">{r.enrolledActive.toLocaleString()}</div></div>
      <div class="stat"><div class="stat-label">Sent</div><div class="stat-value">{r.sent.toLocaleString()}</div></div>
    </div>

    <!-- guided checklist -->
    <div class="card p-5 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-medium">Go-live checklist</h2>
        {#if done === 5}<span class="chip-good">Live — sending on schedule</span>{:else}<span class="chip-warn">{done}/5 — not sending yet</span>{/if}
      </div>
      <div class="h-1.5 rounded-full bg-bg-elev overflow-hidden mb-4"><div class="h-full bg-brand transition-all" style="width:{pct}%"></div></div>

      <div class="space-y-2">
        <!-- 1. mailboxes -->
        <div class="flex items-center gap-3 p-3 rounded-lg border border-bg-border">
          <span class="w-6 h-6 rounded-full grid place-items-center text-xs shrink-0 {r.checklist.mailboxes ? 'bg-accent-good/20 text-accent-good border border-accent-good/40' : 'bg-bg-elev text-ink-dim border border-bg-border'}">{r.checklist.mailboxes ? '✓' : 1}</span>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium">Connect sending mailboxes</div><div class="text-xs text-ink-dim">{r.capacity.mailboxes} connected · ~{r.capacity.limit.toLocaleString()} emails/day{r.checklist.mailboxes ? '' : ' · needs your inbox credentials'}</div></div>
          <a href="/mailboxes" class="btn-{r.checklist.mailboxes ? 'ghost' : 'primary'} btn-sm">{r.checklist.mailboxes ? 'Manage' : 'Connect'}</a>
        </div>

        <!-- 2. campaign -->
        <div class="flex items-center gap-3 p-3 rounded-lg border border-bg-border">
          <span class="w-6 h-6 rounded-full grid place-items-center text-xs shrink-0 {r.checklist.campaign ? 'bg-accent-good/20 text-accent-good border border-accent-good/40' : 'bg-bg-elev text-ink-dim border border-bg-border'}">{r.checklist.campaign ? '✓' : 2}</span>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium">Review your campaign sequence</div><div class="text-xs text-ink-dim">{r.primaryCampaign?.name ?? 'No campaign yet'}</div></div>
          <a href={r.primaryCampaign ? `/campaigns/${r.primaryCampaign.id}` : '/campaigns'} class="btn-outline btn-sm">Review</a>
        </div>

        <!-- 3. enroll (one-click) -->
        <div class="flex items-center gap-3 p-3 rounded-lg border border-bg-border">
          <span class="w-6 h-6 rounded-full grid place-items-center text-xs shrink-0 {r.checklist.enrolled ? 'bg-accent-good/20 text-accent-good border border-accent-good/40' : 'bg-bg-elev text-ink-dim border border-bg-border'}">{r.checklist.enrolled ? '✓' : 3}</span>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium">Enroll prospects</div><div class="text-xs text-ink-dim">{r.enrolledActive.toLocaleString()} active · {r.withEmail.toLocaleString()} have an email</div></div>
          <form method="POST" action="?/enrollAll" use:enhance>
            <button class="btn-{r.checklist.enrolled ? 'ghost' : 'primary'} btn-sm" type="submit">{r.checklist.enrolled ? 'Enroll more' : `Enroll ${r.withEmail.toLocaleString()}`}</button>
          </form>
        </div>

        <!-- 4. email auto (one-click) -->
        <div class="flex items-center gap-3 p-3 rounded-lg border border-bg-border">
          <span class="w-6 h-6 rounded-full grid place-items-center text-xs shrink-0 {r.checklist.emailAuto ? 'bg-accent-good/20 text-accent-good border border-accent-good/40' : 'bg-bg-elev text-ink-dim border border-bg-border'}">{r.checklist.emailAuto ? '✓' : 4}</span>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium">Turn on automatic sending</div><div class="text-xs text-ink-dim">{r.checklist.emailAuto ? 'Email channel is Auto' : 'Email is Manual — flip to Auto'}</div></div>
          {#if !r.checklist.emailAuto}
            <form method="POST" action="?/setAuto" use:enhance><button class="btn-primary btn-sm" type="submit">Set to Auto</button></form>
          {:else}<span class="chip-good">Auto</span>{/if}
        </div>

        <!-- 5. start (deliberate go-live) -->
        <div class="flex items-center gap-3 p-3 rounded-lg border border-bg-border">
          <span class="w-6 h-6 rounded-full grid place-items-center text-xs shrink-0 {r.checklist.running ? 'bg-accent-good/20 text-accent-good border border-accent-good/40' : 'bg-bg-elev text-ink-dim border border-bg-border'}">{r.checklist.running ? '✓' : 5}</span>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium">Start sending</div><div class="text-xs text-ink-dim">{r.checklist.running ? 'Running' : 'Goes live on your campaign schedule'}</div></div>
          {#if !r.checklist.running}
            <form method="POST" action="?/start" use:enhance onsubmit={(e) => { if (!confirm('Start sending? Emails go out on the campaign schedule as soon as a mailbox is connected.')) e.preventDefault(); }}>
              <button class="btn-primary btn-sm" type="submit">Start</button>
            </form>
          {:else}<span class="chip-good">Running</span>{/if}
        </div>
      </div>

      {#if r.daysToClear}
        <p class="text-xs text-ink-dim mt-3">At ~{r.capacity.limit.toLocaleString()}/day, {r.enrolledActive.toLocaleString()} enrolled clear in ~{r.daysToClear} sending day(s). Add mailboxes to go faster.</p>
      {/if}
    </div>

    <!-- recommended -->
    <h3 class="text-sm font-medium mb-2">Recommended</h3>
    <div class="grid sm:grid-cols-3 gap-3">
      <a href="/settings" class="card card-hover p-4 block">
        <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full {r.ai.enabled ? 'bg-accent-good' : 'bg-accent-warn'}"></span><h4 class="font-medium text-sm">AI provider</h4></div>
        <p class="text-xs text-ink-dim mt-1">{r.ai.enabled ? `On — ${r.ai.active}` : 'Off — add a free key (Gemini/Cerebras)'}</p>
      </a>
      <a href="/deliverability" class="card card-hover p-4 block">
        <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-sky-500"></span><h4 class="font-medium text-sm">Authenticate domains</h4></div>
        <p class="text-xs text-ink-dim mt-1">Check SPF / DKIM / DMARC for inbox placement</p>
      </a>
      <a href="/settings" class="card card-hover p-4 block">
        <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-ink-dim"></span><h4 class="font-medium text-sm">Change password</h4></div>
        <p class="text-xs text-ink-dim mt-1">{r.userEmail} — set your own under Account</p>
      </a>
    </div>
  {/if}
</section>
