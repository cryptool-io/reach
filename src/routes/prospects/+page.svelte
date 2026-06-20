<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { STAGES, STAGE_LABEL, CHANNEL_KINDS, CHANNEL_LABEL } from '$lib/types';

  let { data, form } = $props();
  let mode = $state<'list' | 'new' | 'import'>('list');
  let showFilters = $state(true);

  const OPS = [
    { v: 'contains', l: 'contains' },
    { v: 'starts', l: 'starts with' },
    { v: 'ends', l: 'ends with' },
    { v: 'is', l: 'is' }
  ];
  let fieldOptions = $derived([
    { v: 'name', l: 'Name' },
    { v: 'company', l: 'Company' },
    { v: 'email', l: 'Email' },
    { v: 'role', l: 'Role' },
    { v: 'linkedinUrl', l: 'LinkedIn URL' },
    ...data.fields.map((f) => ({ v: `custom.${f.key}`, l: f.label }))
  ]);
  let activeFilters = $derived(
    [data.q, data.filters.val, data.filters.camp, data.filters.contacted, data.filters.tag, data.stage].filter(Boolean)
      .length + (data.filters.channels?.length ?? 0)
  );

  // ── columns chooser (persisted) ─────────────────────────────────────
  const BASE_COLS = [
    { key: 'company', label: 'Company', sortable: true },
    { key: 'role', label: 'Role' },
    { key: 'email', label: 'Email' },
    { key: 'linkedinUrl', label: 'LinkedIn' },
    { key: 'stage', label: 'Stage', sortable: true },
    { key: 'tags', label: 'Tags' },
    { key: 'score', label: 'Score', sortable: true },
    { key: 'channels', label: 'Channels' }
  ];
  let allCols = $derived([
    ...BASE_COLS,
    ...data.fields.map((f) => ({ key: `custom.${f.key}`, label: f.label, sortable: false }))
  ]);
  let visibleCols = $state<string[]>(['company', 'role', 'stage', 'tags', 'channels']);
  onMount(() => {
    try {
      const s = localStorage.getItem('reach-cols');
      if (s) visibleCols = JSON.parse(s);
    } catch {
      /* ignore */
    }
  });
  function toggleCol(k: string) {
    visibleCols = visibleCols.includes(k) ? visibleCols.filter((x) => x !== k) : [...visibleCols, k];
    try {
      localStorage.setItem('reach-cols', JSON.stringify(visibleCols));
    } catch {
      /* ignore */
    }
  }
  function cell(p: (typeof data.prospects)[number], key: string): string {
    if (key === 'channels')
      return [p.email && 'email', p.linkedinUrl && 'linkedin', p.xHandle && 'x', p.telegram && 'telegram', p.discord && 'discord']
        .filter(Boolean)
        .join(' · ');
    if (key === 'stage') return STAGE_LABEL[p.stage as keyof typeof STAGE_LABEL] ?? p.stage;
    if (key === 'score') return String(p.score || '');
    if (key.startsWith('custom.')) {
      try {
        return String((JSON.parse(p.customJson || '{}') as Record<string, unknown>)[key.slice(7)] ?? '');
      } catch {
        return '';
      }
    }
    return String((p as Record<string, unknown>)[key] ?? '');
  }

  // ── sort ────────────────────────────────────────────────────────────
  function sortUrl(key: string) {
    const params = new URLSearchParams($page.url.search);
    const cur = params.get('sort') ?? 'updatedAt';
    const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';
    if (cur === key) params.set('dir', dir === 'asc' ? 'desc' : 'asc');
    else {
      params.set('sort', key);
      params.set('dir', 'asc');
    }
    params.delete('page');
    return `/prospects?${params.toString()}`;
  }
  function sortArrow(key: string) {
    if (data.filters.sort !== key) return '';
    return data.filters.dir === 'asc' ? ' ▲' : ' ▼';
  }

  // ── selection + bulk ────────────────────────────────────────────────
  let selected = $state<Set<string>>(new Set());
  let allMatching = $state(false);
  let pageIds = $derived(data.prospects.map((p) => p.id));
  let allPageSelected = $derived(pageIds.length > 0 && pageIds.every((id) => selected.has(id)));
  let selectionActive = $derived(allMatching || selected.size > 0);
  let targetCount = $derived(allMatching ? data.total : selected.size);

  function toggleRow(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    selected = s;
    if (allMatching) allMatching = false;
  }
  function toggleAllPage() {
    const s = new Set(selected);
    if (allPageSelected) pageIds.forEach((id) => s.delete(id));
    else pageIds.forEach((id) => s.add(id));
    selected = s;
    allMatching = false;
  }
  function clearSelection() {
    selected = new Set();
    allMatching = false;
  }
  // picking an option in a dropdown performs the action immediately (no separate button)
  function submitOnPick(e: Event) {
    const el = e.currentTarget as HTMLSelectElement;
    if (el.value) el.form?.requestSubmit();
  }
  // reset selection after a successful bulk action
  $effect(() => {
    if (form?.ok === 'bulk') clearSelection();
  });

  let filterQs = $derived($page.url.search.slice(1));
  let exportUrl = $derived(`/prospects/export${$page.url.search}`);

  // ── import template ─────────────────────────────────────────────────
  const coreCols = ['name', 'company', 'role', 'email', 'linkedinUrl', 'xHandle', 'telegram', 'discord'];
  let templateHeader = $derived([...coreCols, ...data.fields.map((f) => f.key)].join(','));
  let importTemplate = $derived(
    `${templateHeader}\nJane Doe,Acme Inc,Head of Partnerships,jane@acme.com,https://linkedin.com/in/janedoe,janedoe,,${data.fields.map(() => '').join(',')}`
  );
  let csvText = $state('');
  function useTemplate() { csvText = importTemplate; }
  function copyTemplate() { navigator.clipboard.writeText(importTemplate); }
  function downloadTemplate() {
    const blob = new Blob([importTemplate], { type: 'text/csv' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'prospect-import-template.csv';
    a.click();
    URL.revokeObjectURL(u);
  }

  let pageCount = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
  function pageUrl(p: number) {
    const params = new URLSearchParams($page.url.search);
    if (p > 1) params.set('page', String(p));
    else params.delete('page');
    const s = params.toString();
    return s ? `/prospects?${s}` : '/prospects';
  }
</script>

{#snippet scopeInputs()}
  <input type="hidden" name="scope" value={allMatching ? 'all' : 'selected'} />
  <input type="hidden" name="filterQs" value={filterQs} />
  {#if !allMatching}{#each [...selected] as id}<input type="hidden" name="id" value={id} />{/each}{/if}
{/snippet}

<section class="mx-auto max-w-7xl">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Prospects</h1>
      <p class="text-ink-mute">Universal contact records. Filter, segment, and act in bulk.</p>
    </div>
    <div class="flex gap-2">
      {#if data.preset === 'fundraising'}
        <form method="POST" action="?/loadStarter" use:enhance>
          <button class="btn-ghost" type="submit" title="Load a small starter list of well-known funds (verify contacts before outreach)">Load starter funds</button>
        </form>
      {/if}
      <button class="btn-outline" onclick={() => (mode = mode === 'import' ? 'list' : 'import')}>{mode === 'import' ? 'Cancel' : 'Import CSV'}</button>
      <button class="btn-primary" onclick={() => (mode = mode === 'new' ? 'list' : 'new')}>{mode === 'new' ? 'Cancel' : '+ New prospect'}</button>
    </div>
  </div>

  {#if mode === 'new'}
    <div class="card p-5 mb-6">
      <form method="POST" action="?/create" use:enhance class="grid grid-cols-2 gap-3">
        <div class="col-span-2"><label class="label">Name *</label><input name="name" required class="input" /></div>
        <div><label class="label">Company</label><input name="company" class="input" /></div>
        <div><label class="label">Role</label><input name="role" class="input" /></div>
        <div><label class="label">Email</label><input name="email" class="input" type="email" /></div>
        <div><label class="label">LinkedIn URL</label><input name="linkedinUrl" class="input" /></div>
        <div><label class="label">X / Twitter</label><input name="xHandle" class="input" placeholder="handle" /></div>
        <div><label class="label">Telegram</label><input name="telegram" class="input" placeholder="@user" /></div>
        <div><label class="label">Discord</label><input name="discord" class="input" placeholder="user#1234" /></div>
        {#each data.fields as field}
          <div><label class="label">{field.label}</label><input name={`custom.${field.key}`} type={field.type === 'number' ? 'number' : 'text'} class="input" /></div>
        {/each}
        <div class="col-span-2"><button type="submit" class="btn-primary">Create</button></div>
      </form>
    </div>
  {:else if mode === 'import'}
    <div class="card p-5 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium">Import prospects</h3>
        <div class="flex gap-2">
          <button type="button" class="btn-outline" onclick={downloadTemplate}>↓ Download template</button>
          <button type="button" class="btn-outline" onclick={copyTemplate}>Copy template</button>
          <button type="button" class="btn-ghost" onclick={useTemplate}>Use as example</button>
        </div>
      </div>
      <p class="text-sm text-ink-mute mb-1">Paste CSV with a header row. Core columns map to fields:
        <code class="text-ink">name, company, role, email, linkedinUrl, xHandle, telegram, discord</code>.</p>
      <p class="text-xs text-ink-dim mb-3">Any extra column is kept as a custom field and becomes a <code>{`{{custom.key}}`}</code> snippet.</p>
      <form method="POST" action="?/importCsv" use:enhance={() => async ({ update }) => { await update(); mode = 'list'; }} class="space-y-3">
        <textarea name="csv" bind:value={csvText} rows="10" class="input font-mono text-xs" placeholder={importTemplate}></textarea>
        <button type="submit" class="btn-primary">Import</button>
      </form>
      {#if form?.imported !== undefined}<div class="mt-3 text-sm text-accent-good">Imported {form.imported} prospects{form.customFields?.length ? ` · custom fields: ${form.customFields.join(', ')}` : ''}.</div>{/if}
      {#if form?.error}<div class="mt-3 text-sm text-accent-bad">{form.error}</div>{/if}
    </div>
  {/if}

  <!-- Woodpecker-style filter panel -->
  <div class="card p-0 mb-3 overflow-hidden">
    <button class="w-full flex items-center gap-2 px-4 py-2.5 text-sm row-hover" onclick={() => (showFilters = !showFilters)}>
      <span class="font-medium">Filters{activeFilters ? ` (${activeFilters})` : ''}</span>
      <div class="flex-1"></div>
      <span class="text-ink-dim">{showFilters ? '▴' : '▾'}</span>
    </button>
    {#if showFilters}
      <form method="GET" class="border-t border-bg-border p-4 space-y-3">
        <div class="flex gap-2 items-center flex-wrap">
          <select name="f" class="input !w-44">{#each fieldOptions as o}<option value={o.v} selected={data.filters.field === o.v}>{o.l}</option>{/each}</select>
          <select name="op" class="input !w-36">{#each OPS as o}<option value={o.v} selected={data.filters.op === o.v}>{o.l}</option>{/each}</select>
          <input name="v" value={data.filters.val ?? ''} class="input !w-72" placeholder="value…" />
          <span class="text-ink-dim text-xs">or</span>
          <input name="q" value={data.q} class="input !w-56" placeholder="quick search" />
        </div>
        <div class="flex gap-2 items-end flex-wrap">
          <div><span class="label">Stage</span>
            <select name="stage" class="input !py-1 !w-32"><option value="">Any</option>{#each STAGES as s}<option value={s} selected={data.stage === s}>{STAGE_LABEL[s]}</option>{/each}</select>
          </div>
          <div><span class="label">In campaign</span>
            <select name="camp" class="input !py-1 !w-40"><option value="">Any</option>{#each data.campaigns as c}<option value={c.id} selected={data.filters.camp === c.id}>{c.name}</option>{/each}</select>
          </div>
          <div><span class="label">Campaign status</span>
            <select name="cstatus" class="input !py-1 !w-32">
              {#each ['', 'active', 'replied', 'bounced', 'completed', 'opted-out'] as st}<option value={st} selected={data.filters.cstatus === st}>{st || 'Any'}</option>{/each}
            </select>
          </div>
          <div><span class="label">Contacted</span>
            <select name="contacted" class="input !py-1 !w-32">
              <option value="" selected={!data.filters.contacted}>Any</option>
              <option value="yes" selected={data.filters.contacted === 'yes'}>Contacted</option>
              <option value="no" selected={data.filters.contacted === 'no'}>Not contacted</option>
            </select>
          </div>
          <div><span class="label">Tag</span><input name="tag" value={data.filters.tag ?? ''} class="input !py-1 !w-32" placeholder="tag" /></div>
          <div><span class="label">Has channel</span>
            <div class="flex gap-2 flex-wrap items-center h-[34px]">
              {#each CHANNEL_KINDS as c}<label class="flex items-center gap-1 text-xs"><input type="checkbox" name="ch" value={c} checked={data.filters.channels?.includes(c)} /> {CHANNEL_LABEL[c]}</label>{/each}
            </div>
          </div>
          <div class="flex-1"></div>
          <button class="btn-primary" type="submit">Apply</button>
          {#if activeFilters}<a href="/prospects" class="btn-ghost">Clear all</a>{/if}
        </div>
      </form>
    {/if}
  </div>

  <!-- toolbar: count · columns · export · bulk -->
  <div class="flex items-center gap-2 mb-3 flex-wrap">
    <span class="text-sm text-ink-dim">{data.total.toLocaleString()} prospects</span>
    <div class="flex-1"></div>
    <details class="relative">
      <summary class="btn-outline cursor-pointer list-none">⊞ Columns</summary>
      <div class="absolute right-0 top-full mt-1 w-56 card p-2 z-20 max-h-72 overflow-auto">
        {#each allCols as c}
          <label class="flex items-center gap-2 px-2 py-1 text-sm row-hover rounded"><input type="checkbox" checked={visibleCols.includes(c.key)} onchange={() => toggleCol(c.key)} /> {c.label}</label>
        {/each}
      </div>
    </details>
    <a href={exportUrl} class="btn-outline" data-sveltekit-reload>↓ Export CSV</a>
  </div>

  {#if form?.ok === 'bulk'}<div class="card p-3 mb-3 text-sm text-accent-good">{form.message}</div>{/if}
  {#if form?.error && form?.ok !== 'bulk'}<div class="card p-3 mb-3 text-sm text-accent-bad">{form.error}</div>{/if}

  {#if selectionActive}
    <div class="card p-3 mb-3 flex items-center gap-2 flex-wrap border-brand/40">
      <span class="text-sm font-medium">{targetCount.toLocaleString()} selected</span>
      {#if allPageSelected && !allMatching && data.total > pageIds.length}
        <button class="text-brand-hi text-sm hover:underline" onclick={() => (allMatching = true)} title="Apply the action below to all {data.total.toLocaleString()} prospects matching the current filters, not just this page">Select all {data.total.toLocaleString()}</button>
      {/if}
      <button class="btn-ghost text-xs" onclick={clearSelection} title="Deselect everything">Clear</button>
      <span class="text-xs text-ink-dim">— pick an action:</span>

      <!-- Enrol into a campaign: choosing a campaign enrols immediately -->
      <form method="POST" action="?/bulkEnroll" use:enhance>
        {@render scopeInputs()}
        <select name="campaignId" onchange={submitOnPick} class="input !py-1 !w-52" title="Add the selected prospects into a cold-email campaign sequence (it starts sending once the campaign is running)">
          <option value="">＋ Add to campaign…</option>
          {#each data.campaigns as c}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </form>

      <!-- Move pipeline stage: choosing a stage applies immediately -->
      <form method="POST" action="?/bulkStage" use:enhance>
        {@render scopeInputs()}
        <select name="stage" onchange={submitOnPick} class="input !py-1 !w-44" title="Move the selected prospects to a pipeline stage (New, Contacted, Replied, …)">
          <option value="">⇄ Move to stage…</option>
          {#each STAGES as s}<option value={s}>{STAGE_LABEL[s]}</option>{/each}
        </select>
      </form>

      <!-- Tag -->
      <form method="POST" action="?/bulkTag" use:enhance class="flex gap-1 items-center" title="Label the selected prospects with a tag you can filter by later">
        {@render scopeInputs()}
        <input name="tag" class="input !py-1 !w-28" placeholder="tag name…" required />
        <button class="btn-outline" type="submit">Add tag</button>
      </form>

      <!-- Verify emails (syntax + MX) -->
      <form method="POST" action="?/bulkVerify" use:enhance title="Check the selected addresses (syntax + mail server). Invalid ones are skipped at send to protect your domain.">
        {@render scopeInputs()}
        <button class="btn-outline" type="submit">✓ Verify emails</button>
      </form>

      <div class="flex-1"></div>
      <form method="POST" action="?/bulkDelete" use:enhance onsubmit={(e) => { if (!confirm(`Delete ${targetCount} prospect(s)? This cannot be undone.`)) e.preventDefault(); }}>
        {@render scopeInputs()}
        <button class="btn-ghost text-accent-bad hover:text-accent-bad" type="submit" title="Permanently delete the selected prospects — cannot be undone">Delete</button>
      </form>
    </div>
  {/if}

  <div class="card overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
        <tr>
          <th class="px-3 py-2 w-8"><input type="checkbox" checked={allPageSelected} onchange={toggleAllPage} /></th>
          <th class="text-left px-4 py-2 font-medium"><a href={sortUrl('name')} class="hover:text-ink">Name{sortArrow('name')}</a></th>
          {#each allCols.filter((c) => visibleCols.includes(c.key)) as c}
            <th class="text-left px-4 py-2 font-medium">
              {#if c.sortable}<a href={sortUrl(c.key)} class="hover:text-ink">{c.label}{sortArrow(c.key)}</a>{:else}{c.label}{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each data.prospects as p}
          <tr class="border-t border-bg-border row-hover cursor-pointer {selected.has(p.id) ? 'bg-brand/5' : ''}" onclick={() => (window.location.href = `/prospects/${p.id}`)}>
            <td class="px-3 py-2" onclick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={selected.has(p.id)} onchange={() => toggleRow(p.id)} />
            </td>
            <td class="px-4 py-2 font-medium">{p.name}</td>
            {#each allCols.filter((c) => visibleCols.includes(c.key)) as c}
              <td class="px-4 py-2 text-ink-mute">
                {#if c.key === 'stage'}<span class="chip-mute">{cell(p, 'stage')}</span>
                {:else if c.key === 'tags'}
                  {#each p.tags.split(',').map((t) => t.trim()).filter(Boolean) as t}<span class="chip-mute mr-1">{t}</span>{/each}
                {:else if c.key === 'channels'}<span class="text-xs text-ink-dim">{cell(p, 'channels')}</span>
                {:else}{cell(p, c.key)}{/if}
              </td>
            {/each}
          </tr>
        {:else}
          <tr><td colspan={visibleCols.length + 2} class="px-4 py-10 text-center text-ink-mute">No prospects{activeFilters ? ' match your filters' : ''}.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if pageCount > 1}
    <div class="flex items-center justify-center gap-3 mt-4 text-sm">
      <a href={pageUrl(data.page - 1)} class="btn-outline {data.page <= 1 ? 'pointer-events-none opacity-40' : ''}">← Prev</a>
      <span class="text-ink-mute">Page {data.page} of {pageCount.toLocaleString()}</span>
      <a href={pageUrl(data.page + 1)} class="btn-outline {data.page >= pageCount ? 'pointer-events-none opacity-40' : ''}">Next →</a>
    </div>
  {/if}
</section>
