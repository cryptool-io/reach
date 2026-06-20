<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  let loading = $state(false);
  let aLoading = $state(false);
</script>

<section class="mx-auto max-w-5xl">
  <div class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight">Lead Finder</h1>
    <p class="text-ink-mute">Find investor contacts — search Apollo's licensed, verified database, or let AI suggest targets from your ICP.</p>
  </div>

  {#if !data.project}
    <div class="card p-6 text-ink-mute">Pick or create a project first.</div>
  {:else}
    {#if form?.error}<div class="card p-3 mb-4 text-sm text-accent-bad">{form.error}</div>{/if}
    {#if form?.added}<div class="card p-3 mb-4 text-sm text-accent-good">Added {form.added} prospect(s){form.skipped ? `, skipped ${form.skipped} duplicate(s)` : ''}. See them on Prospects.</div>{/if}

    <!-- Apollo: verified contacts -->
    <div class="card p-5 mb-5">
      <div class="flex items-center gap-2 mb-1">
        <h2 class="text-base font-semibold">Verified contacts — Apollo</h2>
        {#if data.apollo}<span class="chip-good">connected</span>{:else}<span class="chip-warn">not configured</span>{/if}
      </div>
      {#if data.apollo}
        <p class="text-xs text-ink-dim mb-3">Search Apollo's licensed B2B database and import verified contacts (email + LinkedIn) straight in as prospects — the compliant alternative to scraping.</p>
        <form method="POST" action="?/apolloSearch" use:enhance={() => { aLoading = true; return async ({ update }) => { await update(); aLoading = false; }; }} class="grid sm:grid-cols-3 gap-2">
          <div class="sm:col-span-3"><label class="label" for="at">Titles (comma-separated)</label><input id="at" name="titles" class="input" placeholder="Partner, Managing Partner, Principal, Angel Investor" value={form?.apolloResult?.query?.titles ?? ''} /></div>
          <div class="sm:col-span-2"><label class="label" for="ak">Keywords</label><input id="ak" name="keywords" class="input" placeholder="venture capital, seed, crypto, web3" value={form?.apolloResult?.query?.keywords ?? ''} /></div>
          <div><label class="label" for="al">Locations</label><input id="al" name="locations" class="input" placeholder="London, United States" value={form?.apolloResult?.query?.locations ?? ''} /></div>
          <input type="hidden" name="page" value="1" />
          <div class="sm:col-span-3"><button class="btn-primary" type="submit" disabled={aLoading}>{aLoading ? 'Searching…' : 'Search Apollo'}</button></div>
        </form>

        {#if form?.apolloResult}
          <form method="POST" action="?/apolloImport" use:enhance class="mt-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-ink-mute">{form.apolloResult.total.toLocaleString()} match(es) · showing {form.apolloResult.people.length}</span>
              <button class="btn-primary btn-sm" type="submit">Import selected</button>
            </div>
            <div class="card overflow-hidden">
              <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
                  <tr><th class="px-3 py-2 w-8"></th><th class="text-left px-3 py-2 font-medium">Name</th><th class="text-left px-3 py-2 font-medium">Title</th><th class="text-left px-3 py-2 font-medium">Company</th><th class="text-left px-3 py-2 font-medium">Email</th></tr>
                </thead>
                <tbody>
                  {#each form.apolloResult.people as p}
                    <tr class="border-t border-bg-border">
                      <td class="px-3 py-2"><input type="checkbox" name="row" value={JSON.stringify(p)} checked /></td>
                      <td class="px-3 py-2 font-medium">{p.name}</td>
                      <td class="px-3 py-2 text-ink-mute">{p.title}</td>
                      <td class="px-3 py-2 text-ink-mute">{p.company}</td>
                      <td class="px-3 py-2 text-xs">{#if p.email}<span class="text-accent-good break-all">{p.email}</span>{:else}<span class="text-ink-dim">locked</span>{/if}</td>
                    </tr>
                  {:else}
                    <tr><td colspan="5" class="px-3 py-8 text-center text-ink-mute">No matches — broaden the criteria.</td></tr>
                  {/each}
                </tbody>
              </table>
              </div>
            </div>
          </form>
        {/if}
      {:else}
        <p class="text-xs text-ink-dim">Add <code>APOLLO_API_KEY</code> to the server <code>.env</code> (get one at apollo.io → Settings → Integrations → API) to search verified contacts here.</p>
      {/if}
    </div>

    <!-- AI suggestions -->
    <div class="card p-5 mb-3">
      <h2 class="text-base font-semibold mb-1">AI target suggestions</h2>
      <p class="text-xs text-ink-dim mb-3">Claude suggests firms & personas that match your ICP — useful for ideas; verify and enrich with Apollo before outreach.</p>
      <form method="POST" action="?/suggest" use:enhance={() => { loading = true; return async ({ update }) => { await update(); loading = false; }; }} class="space-y-3">
        <div class="text-xs text-ink-dim">ICP: <span class="text-ink-mute">{data.project.icpMd || '(none set — add one in Settings for better targeting)'}</span></div>
        <div>
          <label class="label" for="crit">Extra criteria (optional)</label>
          <input id="crit" name="criteria" class="input" placeholder="e.g. UK + MENA, writes £250k–£2M, crypto-native, active last 6 months" />
        </div>
        <button class="btn-outline" type="submit" disabled={loading}>{loading ? 'Sourcing…' : 'Suggest targets'}</button>
      </form>
    </div>

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
