<script lang="ts">
  let { data } = $props();
  let r = $derived(data.ready);

  let steps = $derived(
    r
      ? [
          { done: r.checklist.mailboxes, label: 'Connect sending mailboxes', hint: `${r.capacity.mailboxes} connected · ~${r.capacity.limit.toLocaleString()} emails/day capacity`, href: '/mailboxes' },
          { done: r.checklist.campaign, label: 'Review your campaign sequence', hint: r.primaryCampaign ? r.primaryCampaign.name : 'No campaign yet', href: r.primaryCampaign ? `/campaigns/${r.primaryCampaign.id}` : '/campaigns' },
          { done: r.checklist.enrolled, label: 'Enroll prospects into the campaign', hint: `${r.enrolledActive.toLocaleString()} active enrollments`, href: r.primaryCampaign ? `/campaigns/${r.primaryCampaign.id}?tab=prospects` : '/prospects' },
          { done: r.checklist.emailAuto, label: 'Set the Email channel to Auto', hint: r.checklist.emailAuto ? 'Auto' : 'Currently Manual — flip in Settings', href: '/settings' },
          { done: r.checklist.running, label: 'Start the campaign', hint: r.checklist.running ? 'Running' : 'Draft — press Start on the campaign', href: r.primaryCampaign ? `/campaigns/${r.primaryCampaign.id}` : '/campaigns' }
        ]
      : []
  );
  let allDone = $derived(steps.length > 0 && steps.every((s) => s.done));
</script>

<section class="max-w-4xl">
  <h1 class="text-2xl font-semibold tracking-tight mb-1">Dashboard</h1>
  <p class="text-ink-mute mb-6">Cold outreach at volume via inbox rotation.</p>

  {#if !r}
    <div class="card p-6">
      <h2 class="text-lg font-medium mb-2">No project yet</h2>
      <p class="text-ink-mute mb-4">Create your first project to begin.</p>
      <a href="/projects" class="btn-primary">+ New project</a>
    </div>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      <div class="card p-4"><div class="text-xs uppercase tracking-wider text-ink-mute">Prospects</div><div class="text-2xl font-semibold mt-1">{r.prospects.toLocaleString()}</div></div>
      <div class="card p-4"><div class="text-xs uppercase tracking-wider text-ink-mute">Daily capacity</div><div class="text-2xl font-semibold mt-1">{r.capacity.limit.toLocaleString()}</div><div class="text-[10px] text-ink-dim">{r.capacity.mailboxes} mailbox(es)</div></div>
      <div class="card p-4"><div class="text-xs uppercase tracking-wider text-ink-mute">Active in campaigns</div><div class="text-2xl font-semibold mt-1">{r.enrolledActive.toLocaleString()}</div></div>
      <div class="card p-4"><div class="text-xs uppercase tracking-wider text-ink-mute">Sent</div><div class="text-2xl font-semibold mt-1">{r.sent.toLocaleString()}</div></div>
    </div>

    <div class="card p-5 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium">Go-live checklist</h2>
        {#if allDone}<span class="chip-good">Live — sending on schedule</span>{:else}<span class="chip-warn">Not sending yet</span>{/if}
      </div>
      <div class="space-y-2">
        {#each steps as s, i}
          <a href={s.href} class="flex items-center gap-3 p-3 rounded-lg row-hover border border-bg-border">
            <span class="w-6 h-6 rounded-full grid place-items-center text-xs shrink-0 {s.done ? 'bg-accent-good/20 text-accent-good border border-accent-good/40' : 'bg-bg-elev text-ink-dim border border-bg-border'}">{s.done ? '✓' : i + 1}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium {s.done ? 'text-ink' : 'text-ink-mute'}">{s.label}</div>
              <div class="text-xs text-ink-dim">{s.hint}</div>
            </div>
            <span class="text-ink-dim">→</span>
          </a>
        {/each}
      </div>
      {#if r.daysToClear}
        <p class="text-xs text-ink-dim mt-3">At current capacity (~{r.capacity.limit.toLocaleString()}/day), {r.enrolledActive.toLocaleString()} enrolled prospects clear in ~{r.daysToClear} sending day(s). Add mailboxes to go faster.</p>
      {/if}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <a href="/mailboxes" class="card p-5 hover:border-brand/40 transition-colors"><h3 class="font-medium">Mailboxes</h3><p class="text-sm text-ink-mute mt-1">Connect inboxes for rotation.</p></a>
      <a href="/campaigns" class="card p-5 hover:border-brand/40 transition-colors"><h3 class="font-medium">Campaigns</h3><p class="text-sm text-ink-mute mt-1">Sequences, A/B, conditions.</p></a>
      <a href="/prospects" class="card p-5 hover:border-brand/40 transition-colors"><h3 class="font-medium">Prospects</h3><p class="text-sm text-ink-mute mt-1">Filter, segment, enroll.</p></a>
    </div>
  {/if}
</section>
