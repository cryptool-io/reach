<script lang="ts">
  import { enhance } from '$app/forms';
  import { STAGES, STAGE_LABEL, CHANNEL_KINDS, CHANNEL_LABEL, INTENTS, INTENT_LABEL } from '$lib/types';

  let { data, form } = $props();
  let { prospect, project, channels, assets, fields, introPaths } = $derived(data);
  let researching = $state(false);

  let customValues = $derived.by(() => {
    try {
      return JSON.parse(prospect.customJson || '{}') as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  });
  let editFields = $state(false);

  let intent = $state(INTENTS[0]);
  let channelKind = $state(CHANNEL_KINDS[0]);

  function copy(s: string) {
    navigator.clipboard.writeText(s);
  }

  function channelKindFor(channelId: string) {
    return channels.find((c) => c.id === channelId)?.kind ?? 'unknown';
  }
</script>

<section class="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
  <!-- Left: prospect summary + actions -->
  <div class="lg:col-span-1 space-y-4">
    <div class="card p-5">
      <div class="text-xs text-ink-dim mb-1">{project.name}</div>
      <h1 class="text-xl font-semibold tracking-tight">{prospect.name}</h1>
      <div class="text-ink-mute">{prospect.role}{prospect.role && prospect.company ? ' · ' : ''}{prospect.company}</div>

      <form method="POST" action="?/updateStage" use:enhance class="mt-4">
        <label class="label">Stage</label>
        <select name="stage" class="input" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}>
          {#each STAGES as s}
            <option value={s} selected={prospect.stage === s}>{STAGE_LABEL[s]}</option>
          {/each}
        </select>
      </form>

      <div class="mt-4 flex items-center gap-2">
        <form method="POST" action="?/research" use:enhance={() => { researching = true; return async ({ update }) => { await update(); researching = false; }; }}>
          <button class="btn-outline" type="submit" disabled={researching}>{researching ? 'Researching…' : '🔎 Research with Claude'}</button>
        </form>
        {#if prospect.score > 0}<span class="chip-brand">fit {prospect.score}/100</span>{/if}
      </div>
      {#if form?.ok === 'researched'}<div class="mt-2 text-xs text-accent-good">Brief saved to Notes. Angle: {form.angle}</div>{/if}
    </div>

    <!-- Warm intro paths -->
    {#if introPaths.length}
      <div class="card p-5">
        <h3 class="text-sm font-medium mb-1">Warm intro paths</h3>
        <p class="text-xs text-ink-dim mb-2">People in your network at {prospect.company}:</p>
        <div class="space-y-1.5 text-sm">
          {#each introPaths as c}
            <div class="flex justify-between gap-2">
              <span>{c.name}{c.title ? ` · ${c.title}` : ''}</span>
              <span class="chip-mute">{c.strength === 3 ? 'strong' : c.strength === 1 ? 'weak' : 'ok'}</span>
            </div>
          {/each}
        </div>
        <a href="/network" class="text-xs text-brand-hi hover:underline mt-2 inline-block">Manage network →</a>
      </div>
    {/if}

    <div class="card p-5">
      <h3 class="text-sm font-medium mb-3">Channels</h3>
      <div class="space-y-2 text-sm">
        {#if prospect.email}<div class="flex justify-between"><span class="text-ink-mute">Email</span><a href={`mailto:${prospect.email}`} class="text-brand-hi truncate ml-2">{prospect.email}</a></div>{/if}
        {#if prospect.linkedinUrl}<div class="flex justify-between"><span class="text-ink-mute">LinkedIn</span><a href={prospect.linkedinUrl} target="_blank" rel="noopener" class="text-brand-hi truncate ml-2">profile ↗</a></div>{/if}
        {#if prospect.xHandle}<div class="flex justify-between"><span class="text-ink-mute">X</span><a href={`https://x.com/${prospect.xHandle.replace(/^@/, '')}`} target="_blank" rel="noopener" class="text-brand-hi">@{prospect.xHandle.replace(/^@/, '')}</a></div>{/if}
        {#if prospect.telegram}<div class="flex justify-between"><span class="text-ink-mute">Telegram</span><span>{prospect.telegram}</span></div>{/if}
        {#if prospect.discord}<div class="flex justify-between"><span class="text-ink-mute">Discord</span><span>{prospect.discord}</span></div>{/if}
      </div>
    </div>

    {#if fields.length}
      <div class="card p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium">Details</h3>
          <button class="btn-ghost text-xs" onclick={() => (editFields = !editFields)}>{editFields ? 'Cancel' : 'Edit'}</button>
        </div>
        {#if editFields}
          <form method="POST" action="?/updateFields" use:enhance={() => async ({ update }) => { await update(); editFields = false; }} class="space-y-2">
            {#each fields as field}
              <div>
                <label class="label" for={`cf-${field.key}`}>{field.label}</label>
                <input id={`cf-${field.key}`} name={`custom.${field.key}`} type={field.type === 'number' ? 'number' : 'text'} class="input" value={customValues[field.key] ?? ''} />
              </div>
            {/each}
            <button class="btn-primary w-full" type="submit">Save details</button>
          </form>
        {:else}
          <div class="space-y-1.5 text-sm">
            {#each fields as field}
              <div class="flex justify-between gap-3">
                <span class="text-ink-mute">{field.label}</span>
                <span class="text-right">{customValues[field.key] || '—'}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="card p-5">
      <h3 class="text-sm font-medium mb-3">Notes</h3>
      <form method="POST" action="?/addNote" use:enhance class="space-y-2 mb-3">
        <textarea name="body" rows="2" class="input text-xs" placeholder="Quick note…"></textarea>
        <button class="btn-outline w-full" type="submit">Add note</button>
      </form>
      <div class="space-y-2 max-h-64 overflow-auto">
        {#each prospect.notes as n}
          <div class="text-xs">
            <div class="text-ink">{n.body}</div>
            <div class="text-ink-dim mt-0.5">{new Date(n.createdAt).toLocaleString()} · {n.source}</div>
          </div>
        {/each}
      </div>
    </div>

    {#if assets.length}
      <div class="card p-5">
        <h3 class="text-sm font-medium mb-3">Assets</h3>
        <ul class="space-y-1 text-sm">
          {#each assets as a}
            <li><a href={a.url} target="_blank" rel="noopener" class="text-brand-hi hover:underline">{a.title}</a> <span class="text-ink-dim text-xs">· {a.kind}</span></li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <!-- Right: composer + timeline -->
  <div class="lg:col-span-2 space-y-4">
    <div class="card p-5">
      <h3 class="text-sm font-medium mb-3">Message composer</h3>
      <form method="POST" action="?/draft" use:enhance class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Channel</label>
            <select name="channelKind" class="input" bind:value={channelKind}>
              {#each CHANNEL_KINDS as c}<option value={c}>{CHANNEL_LABEL[c]}</option>{/each}
            </select>
          </div>
          <div>
            <label class="label">Intent</label>
            <select name="intent" class="input" bind:value={intent}>
              {#each INTENTS as i}<option value={i}>{INTENT_LABEL[i]}</option>{/each}
            </select>
          </div>
        </div>
        <button type="submit" class="btn-primary">Draft with Claude</button>
      </form>

      {#if form?.error}
        <div class="mt-3 text-sm text-accent-bad">{form.error}</div>
      {/if}

      {#if form?.drafts}
        <div class="mt-5 space-y-3">
          <div class="text-xs uppercase tracking-wider text-ink-mute">Drafts — {CHANNEL_LABEL[form.channelKind]} · {INTENT_LABEL[form.intent]}</div>
          {#each form.drafts as d, i}
            <div class="card p-4 border-bg-border">
              <div class="text-xs text-ink-dim mb-2">Variant {i + 1}{d.rationale ? ` — ${d.rationale}` : ''}</div>
              <pre class="whitespace-pre-wrap text-sm text-ink font-sans">{d.body}</pre>
              <div class="flex gap-2 mt-3">
                <button class="btn-ghost" onclick={() => copy(d.body)}>Copy</button>
                <form method="POST" action="?/send" use:enhance class="inline">
                  <input type="hidden" name="body" value={d.body} />
                  <input type="hidden" name="channelKind" value={form.channelKind} />
                  <input type="hidden" name="intent" value={form.intent} />
                  <button class="btn-primary" type="submit">Send (manual)</button>
                </form>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if form?.sent}
        <div class="mt-3 text-sm text-accent-good">
          Logged to conversation.
          {#if form.openUrl}<a href={form.openUrl} target="_blank" rel="noopener" class="text-brand-hi ml-2">Open ↗</a>{/if}
          {#if form.note}<span class="text-ink-dim ml-2">{form.note}</span>{/if}
        </div>
      {/if}
    </div>

    <div class="card p-5">
      <h3 class="text-sm font-medium mb-1">Call debrief</h3>
      <p class="text-xs text-ink-dim mb-3">Paste a call transcript or your notes. Claude summarizes it, updates the stage, and adds a follow-up task.</p>
      <form method="POST" action="?/debrief" use:enhance class="space-y-2">
        <textarea name="transcript" rows="4" class="input text-xs" placeholder="Paste transcript or notes from the call…"></textarea>
        <button class="btn-outline" type="submit">Summarize & update CRM</button>
      </form>
      {#if form?.ok === 'debriefed'}<div class="mt-2 text-sm text-accent-good">Debrief saved{form.stage ? ` · stage → ${form.stage}` : ''}. See Notes + Pipeline task.</div>{/if}
    </div>

    <div class="card p-5">
      <h3 class="text-sm font-medium mb-3">Timeline</h3>
      {#if prospect.conversations.length === 0}
        <div class="text-sm text-ink-mute">No messages yet.</div>
      {:else}
        <div class="space-y-3">
          {#each prospect.conversations as c}
            <div>
              <div class="text-xs uppercase tracking-wider text-ink-mute mb-1">{CHANNEL_LABEL[channelKindFor(c.channelId) as keyof typeof CHANNEL_LABEL] ?? c.channelId}</div>
              {#each c.messages as m}
                <div class="border-l-2 {m.direction === 'in' ? 'border-accent-info' : 'border-brand'} pl-3 py-1 my-1">
                  <div class="text-xs text-ink-dim">{m.direction === 'in' ? prospect.name : 'You'} · {new Date(m.createdAt).toLocaleString()} · {m.status}</div>
                  <div class="text-sm whitespace-pre-wrap">{m.body}</div>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</section>
