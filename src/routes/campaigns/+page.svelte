<script lang="ts">
  import { enhance } from '$app/forms';
  let { data } = $props();
  let showNew = $state(false);
  let tickResult = $state<string | null>(null);
  let ticking = $state(false);

  const statusChip: Record<string, string> = {
    draft: 'chip-mute',
    running: 'chip-good',
    paused: 'chip-warn',
    completed: 'chip-brand'
  };

  async function runAutoFire() {
    ticking = true;
    tickResult = null;
    try {
      const r = await fetch('/api/scheduler/tick', { method: 'POST' });
      const j = await r.json();
      tickResult = `Scanned ${j.scanned} running campaign(s), sent ${j.sent}, replies matched ${j.repliesMatched ?? 0}. ${j.details.join(' · ')}`;
    } catch (e) {
      tickResult = 'Tick failed: ' + (e as Error).message;
    } finally {
      ticking = false;
    }
  }
</script>

<section>
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Campaigns</h1>
      <p class="text-ink-mute">Cold outreach sequences — multi-step, multi-channel, with A/B versions and conditions.</p>
    </div>
    <div class="flex gap-2">
      <button class="btn-outline" onclick={runAutoFire} disabled={ticking}>{ticking ? 'Running…' : '⚡ Run auto-fire now'}</button>
      <button class="btn-primary" onclick={() => (showNew = !showNew)}>{showNew ? 'Cancel' : '+ New campaign'}</button>
    </div>
  </div>

  {#if tickResult}
    <div class="card p-3 mb-4 text-sm text-ink-mute">{tickResult}</div>
  {/if}

  {#if showNew}
    <div class="card p-5 mb-6">
      <form method="POST" action="?/create" use:enhance class="flex gap-2 items-end">
        <div class="flex-1">
          <label class="label" for="cname">Campaign name</label>
          <input id="cname" name="name" class="input" placeholder="Investor cold outreach — Seed round" required />
        </div>
        <button type="submit" class="btn-primary">Create</button>
      </form>
    </div>
  {/if}

  <div class="space-y-2">
    {#each data.campaigns as c}
      <a href={`/campaigns/${c.id}`} class="card p-4 flex items-center gap-4 hover:border-brand/40 transition-colors">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium">{c.name}</span>
            <span class={statusChip[c.status] ?? 'chip-mute'}>{c.status}</span>
          </div>
          <div class="text-xs text-ink-dim mt-1">
            {c._count.steps} steps · {c.stats.enrolled} prospects · {c.stats.sent} sent · {c.stats.replyRate}% reply · {c.stats.interested} interested
          </div>
        </div>
        <div class="flex items-center gap-6 text-center shrink-0">
          <div><div class="text-lg font-semibold">{c.stats.sent}</div><div class="text-[10px] uppercase tracking-wider text-ink-dim">Sent</div></div>
          <div><div class="text-lg font-semibold">{c.stats.openRate}%</div><div class="text-[10px] uppercase tracking-wider text-ink-dim">Open</div></div>
          <div><div class="text-lg font-semibold">{c.stats.replyRate}%</div><div class="text-[10px] uppercase tracking-wider text-ink-dim">Reply</div></div>
        </div>
      </a>
    {:else}
      <div class="card p-6 text-center text-ink-mute">No campaigns yet. Create one to start cold outreach.</div>
    {/each}
  </div>
</section>
