<script lang="ts">
  import { enhance } from '$app/forms';

  let { data } = $props();
  let showNew = $state(false);
  let selectedPreset = $state('blank');

  const HINTS: Record<string, { narrative: string; icp: string }> = {
    blank: { narrative: 'One or two lines on what you do and why someone should care now.', icp: 'Who you are targeting and why they fit.' },
    fundraising: { narrative: 'What you are building, traction, the round (stage, size, instrument).', icp: 'Investor profile: fund type, ticket size, stage, geography, thesis fit.' },
    sales: { narrative: 'What you sell, the problem it solves, proof (customers, numbers).', icp: 'Target accounts: company size, industry, role/persona, trigger to buy.' },
    recruiting: { narrative: 'The role, the company, why it is a great move for the right person.', icp: 'Ideal candidate: seniority, skills, current company, location.' }
  };
  let narrativeHint = $derived((HINTS[selectedPreset] ?? HINTS.blank).narrative);
  let icpHint = $derived((HINTS[selectedPreset] ?? HINTS.blank).icp);
</script>

<section class="max-w-4xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Projects</h1>
      <p class="text-ink-mute">Multi-tenant root. Each project has its own prospects, channels, and cadences.</p>
    </div>
    <button class="btn-primary" onclick={() => (showNew = !showNew)}>
      {showNew ? 'Cancel' : '+ New project'}
    </button>
  </div>

  {#if showNew}
    <div class="card p-5 mb-6">
      <form method="POST" action="?/create" use:enhance class="space-y-4">
        <div>
          <span class="label">Start from a preset</span>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {#each data.presets as p}
              <label class="card p-3 cursor-pointer border {selectedPreset === p.id ? 'border-brand' : 'border-bg-border'}">
                <input type="radio" name="preset" value={p.id} bind:group={selectedPreset} class="sr-only" />
                <div class="font-medium text-sm">{p.label}</div>
                <div class="text-xs text-ink-dim mt-1">{p.description}</div>
                {#if p.fieldCount > 0}<div class="text-[10px] text-ink-dim mt-1">{p.fieldCount} custom fields</div>{/if}
              </label>
            {/each}
          </div>
          <p class="text-xs text-ink-dim mt-1">A preset just pre-fills fields, prompts and a starter cadence — all editable later.</p>
        </div>
        <div>
          <label class="label" for="pname">Name</label>
          <input id="pname" name="name" required class="input" placeholder="Acme · Seed round" />
        </div>
        <div>
          <label class="label" for="pnar">Narrative (one-liner / pitch)</label>
          <textarea id="pnar" name="narrativeMd" rows="3" class="input font-mono text-xs" placeholder={narrativeHint}></textarea>
        </div>
        <div>
          <label class="label" for="picp">ICP (who you're targeting)</label>
          <textarea id="picp" name="icpMd" rows="3" class="input font-mono text-xs" placeholder={icpHint}></textarea>
        </div>
        <button type="submit" class="btn-primary">Create project</button>
      </form>
    </div>
  {/if}

  <div class="space-y-2">
    {#each data.projects as p}
      <div class="card p-4 flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium">{p.name}</span>
            <span class="chip-mute">{p.slug}</span>
            <span class="chip-brand">mode {p.modeDefault}</span>
          </div>
          <div class="text-xs text-ink-dim mt-1">
            {p._count.prospects} prospects · {p._count.conversations} conversations · {p._count.channels} channels
          </div>
        </div>
        <form method="POST" action="?/delete" use:enhance>
          <input type="hidden" name="id" value={p.id} />
          <button class="btn-ghost text-accent-bad hover:text-accent-bad" type="submit" onclick={(e) => { if (!confirm('Delete project? All prospects + messages go too.')) e.preventDefault(); }}>Delete</button>
        </form>
      </div>
    {:else}
      <div class="card p-6 text-center text-ink-mute">No projects yet. Click <span class="text-ink">+ New project</span> to begin.</div>
    {/each}
  </div>
</section>
