<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();

  let showNew = $state(false);
  const sample = JSON.stringify(
    [
      { day: 0, channel: 'linkedin', intent: 'comment', note: 'comment on recent post' },
      { day: 2, channel: 'linkedin', intent: 'cold-intro' },
      { day: 5, channel: 'email', intent: 'cold-intro' },
      { day: 10, channel: 'linkedin', intent: 'follow-up' }
    ],
    null,
    2
  );
</script>

<section>
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Cadences</h1>
      <p class="text-ink-mute">Sequenced playbooks — auto-fire is post-v0; for now each step creates a dated task.</p>
    </div>
    <button class="btn-primary" onclick={() => (showNew = !showNew)}>{showNew ? 'Cancel' : '+ New cadence'}</button>
  </div>

  {#if showNew}
    <div class="card p-5 mb-6">
      <form method="POST" action="?/create" use:enhance class="space-y-3">
        <div><label class="label">Name</label><input name="name" class="input" placeholder="Cold-to-meeting" /></div>
        <div>
          <label class="label">Steps (JSON array)</label>
          <textarea name="steps" rows="10" class="input font-mono text-xs" placeholder={sample}></textarea>
          <p class="text-xs text-ink-dim mt-1">Each step: <code>{`{day, channel, intent, note?}`}</code></p>
        </div>
        {#if form?.error}<div class="text-sm text-accent-bad">{form.error}</div>{/if}
        <button type="submit" class="btn-primary">Create</button>
      </form>
    </div>
  {/if}

  <div class="space-y-3">
    {#each data.cadences as c}
      {@const steps = JSON.parse(c.stepsJson)}
      <div class="card p-5">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-medium">{c.name}</h3>
          <span class="chip-mute">{c._count.runs} run{c._count.runs === 1 ? '' : 's'}</span>
        </div>
        <ol class="text-sm space-y-1 text-ink-mute mb-3">
          {#each steps as s, i}
            <li>D+{s.day} · <span class="text-ink">{s.channel}</span> · {s.intent}{s.note ? ` — ${s.note}` : ''}</li>
          {/each}
        </ol>
        <form method="POST" action="?/assign" use:enhance class="flex gap-2 items-end">
          <input type="hidden" name="cadenceId" value={c.id} />
          <div class="flex-1">
            <label class="label">Assign to prospect</label>
            <select name="prospectId" class="input" required>
              <option value="">—</option>
              {#each data.prospects as p}<option value={p.id}>{p.name} ({p.company || 'no company'})</option>{/each}
            </select>
          </div>
          <button class="btn-outline" type="submit">Assign</button>
        </form>
      </div>
    {:else}
      <div class="card p-6 text-center text-ink-mute">No cadences. Create one to start sequencing follow-ups.</div>
    {/each}
  </div>
</section>
