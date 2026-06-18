<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  let loading = $state(false);
</script>

<section class="max-w-4xl">
  <div class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight">Sourcer</h1>
    <p class="text-ink-mute">Claude suggests target organisations & personas that match your ICP. Add the good ones as prospects, then verify/enrich contact details.</p>
  </div>

  {#if !data.project}
    <div class="card p-6 text-ink-mute">Pick or create a project first.</div>
  {:else}
    <div class="card p-5 mb-5">
      <form method="POST" action="?/suggest" use:enhance={() => { loading = true; return async ({ update }) => { await update(); loading = false; }; }} class="space-y-3">
        <div class="text-xs text-ink-dim">Using this project's ICP: <span class="text-ink-mute">{data.project.icpMd || '(none set — add one in Settings for better targeting)'}</span></div>
        <div>
          <label class="label" for="crit">Extra criteria (optional)</label>
          <input id="crit" name="criteria" class="input" placeholder="e.g. UK + MENA, write £250k–£2M, crypto-native, active in last 6 months" />
        </div>
        <button class="btn-primary" type="submit" disabled={loading}>{loading ? 'Sourcing…' : 'Suggest targets'}</button>
      </form>
    </div>

    <div class="chip-warn inline-flex mb-4">AI suggestions — no live contact DB. Verify identities & find real contact details before outreach.</div>

    {#if form?.error}<div class="card p-3 mb-4 text-sm text-accent-bad">{form.error}</div>{/if}
    {#if form?.added}<div class="card p-3 mb-4 text-sm text-accent-good">Added {form.added} prospects (tagged source = sourcer). Verify their details on /prospects.</div>{/if}

    {#if form?.suggestions}
      <form method="POST" action="?/add" use:enhance>
        {#if form.note}<p class="text-xs text-ink-dim mb-2">{form.note}</p>{/if}
        <div class="space-y-2 mb-3">
          {#each form.suggestions as s}
            <label class="card p-3 flex items-start gap-3 cursor-pointer">
              <input type="checkbox" name="row" value={JSON.stringify(s)} checked class="mt-1" />
              <div class="flex-1 min-w-0">
                <div class="font-medium">{s.company} <span class="text-ink-dim text-xs">· {s.role}</span></div>
                <div class="text-sm text-ink-mute">{s.reason}</div>
                {#if s.search_query}<div class="text-xs text-ink-dim mt-0.5">find: <code>{s.search_query}</code></div>{/if}
              </div>
            </label>
          {/each}
        </div>
        <button class="btn-primary" type="submit">Add selected as prospects</button>
      </form>
    {/if}
  {/if}
</section>
