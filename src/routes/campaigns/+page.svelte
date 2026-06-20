<script lang="ts">
  import { enhance } from '$app/forms';
  let { data } = $props();

  let q = $state('');
  let statusFilter = $state('all');
  let sendFromFilter = $state('all');
  let folderFilter = $state('all');
  let typeFilter = $state('all');
  let openMenu = $state(''); // status | sendfrom | folder | type | row:<id> | ''
  let showNew = $state(false);

  const CH_LABEL: Record<string, string> = {
    email: 'EMAIL',
    'linkedin-dm': 'LINKEDIN',
    'linkedin-connect': 'LINKEDIN',
    call: 'CALL',
    sms: 'SMS',
    manual: 'TASK'
  };
  const STATUS_CHIP: Record<string, string> = {
    draft: 'chip-mute',
    running: 'chip-good',
    paused: 'chip-warn',
    completed: 'chip-brand'
  };
  const STATUSES = ['all', 'draft', 'running', 'paused', 'completed'];

  function channelsOf(c: any): string[] {
    return [...new Set((c.steps ?? []).map((s: any) => CH_LABEL[s.channel] ?? s.channel.toUpperCase()))] as string[];
  }
  let sendFroms = $derived([...new Set(data.campaigns.map((c: any) => c.mailbox).filter(Boolean))] as string[]);
  let folders = $derived([...new Set(data.campaigns.map((c: any) => c.folder).filter(Boolean))] as string[]);
  let types = $derived([...new Set(data.campaigns.map((c: any) => c.type).filter(Boolean))] as string[]);
  let filtered = $derived(
    data.campaigns.filter(
      (c: any) =>
        (statusFilter === 'all' || c.status === statusFilter) &&
        (sendFromFilter === 'all' || c.mailbox === sendFromFilter) &&
        (folderFilter === 'all' || (c.folder || '') === folderFilter) &&
        (typeFilter === 'all' || (c.type || '') === typeFilter) &&
        (q.trim() === '' || c.name.toLowerCase().includes(q.trim().toLowerCase()))
    )
  );
  const toggle = (m: string) => (openMenu = openMenu === m ? '' : m);
</script>

<svelte:window onclick={() => (openMenu = '')} />

<section class="max-w-6xl mx-auto">
  <!-- Breadcrumb -->
  <div class="flex items-center gap-3 mb-6 text-sm font-semibold tracking-wide">
    <span class="flex items-center gap-2 text-ink">
      <svg viewBox="0 0 24 24" class="w-4 h-4 text-brand" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
      CAMPAIGNS
    </span>
    <span class="text-ink-dim font-normal">|</span>
    <span class="flex items-center gap-2 text-ink-dim">
      <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
      FOLDERS
    </span>
  </div>

  <!-- Toolbar: search + filter-by + Add campaign -->
  <div class="flex items-center gap-4 mb-8 flex-wrap">
    <div class="relative">
      <svg viewBox="0 0 24 24" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" stroke-linecap="round" /></svg>
      <input class="input !w-72 !pl-9" placeholder="search…" bind:value={q} />
    </div>

    <div class="flex items-center gap-3 text-sm">
      <span class="text-ink-dim">or filter by</span>

      <!-- Status -->
      <div class="relative">
        <button class="font-medium underline-offset-4 hover:underline {statusFilter !== 'all' ? 'text-brand-hi' : 'text-ink-mute'}" onclick={(e) => { e.stopPropagation(); toggle('status'); }}>
          Status{statusFilter !== 'all' ? `: ${statusFilter}` : ''}
        </button>
        {#if openMenu === 'status'}
          <div class="absolute left-0 top-full mt-2 w-40 card shadow-pop p-1 z-30">
            {#each STATUSES as s}
              <button class="w-full text-left px-3 py-1.5 rounded-lg text-sm capitalize row-hover {statusFilter === s ? 'text-brand-hi font-medium' : 'text-ink-mute'}" onclick={() => { statusFilter = s; openMenu = ''; }}>{s}</button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Send from -->
      <div class="relative">
        <button class="font-medium underline-offset-4 hover:underline {sendFromFilter !== 'all' ? 'text-brand-hi' : 'text-ink-mute'}" onclick={(e) => { e.stopPropagation(); toggle('sendfrom'); }}>Send from</button>
        {#if openMenu === 'sendfrom'}
          <div class="absolute left-0 top-full mt-2 w-56 card shadow-pop p-1 z-30 max-h-64 overflow-auto">
            <button class="w-full text-left px-3 py-1.5 rounded-lg text-sm row-hover {sendFromFilter === 'all' ? 'text-brand-hi font-medium' : 'text-ink-mute'}" onclick={() => { sendFromFilter = 'all'; openMenu = ''; }}>All mailboxes</button>
            {#each sendFroms as m}
              <button class="w-full text-left px-3 py-1.5 rounded-lg text-sm truncate row-hover {sendFromFilter === m ? 'text-brand-hi font-medium' : 'text-ink-mute'}" onclick={() => { sendFromFilter = m; openMenu = ''; }}>{m}</button>
            {:else}
              <div class="px-3 py-1.5 text-sm text-ink-dim">No mailbox set on any campaign</div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Folder -->
      <div class="relative">
        <button class="font-medium underline-offset-4 hover:underline {folderFilter !== 'all' ? 'text-brand-hi' : 'text-ink-mute'}" onclick={(e) => { e.stopPropagation(); toggle('folder'); }}>Folder{folderFilter !== 'all' ? `: ${folderFilter || 'none'}` : ''}</button>
        {#if openMenu === 'folder'}
          <div class="absolute left-0 top-full mt-2 w-56 card shadow-pop p-1 z-30 max-h-64 overflow-auto">
            <button class="w-full text-left px-3 py-1.5 rounded-lg text-sm row-hover {folderFilter === 'all' ? 'text-brand-hi font-medium' : 'text-ink-mute'}" onclick={() => { folderFilter = 'all'; openMenu = ''; }}>All folders</button>
            {#each folders as fdr}
              <button class="w-full text-left px-3 py-1.5 rounded-lg text-sm truncate row-hover {folderFilter === fdr ? 'text-brand-hi font-medium' : 'text-ink-mute'}" onclick={() => { folderFilter = fdr; openMenu = ''; }}>{fdr}</button>
            {:else}
              <div class="px-3 py-1.5 text-sm text-ink-dim">No folders yet — set one in a campaign's Delivery tab</div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Campaign type -->
      <div class="relative">
        <button class="font-medium underline-offset-4 hover:underline {typeFilter !== 'all' ? 'text-brand-hi' : 'text-ink-mute'}" onclick={(e) => { e.stopPropagation(); toggle('type'); }}>Campaign type{typeFilter !== 'all' ? `: ${typeFilter}` : ''}</button>
        {#if openMenu === 'type'}
          <div class="absolute left-0 top-full mt-2 w-52 card shadow-pop p-1 z-30">
            <button class="w-full text-left px-3 py-1.5 rounded-lg text-sm row-hover {typeFilter === 'all' ? 'text-brand-hi font-medium' : 'text-ink-mute'}" onclick={() => { typeFilter = 'all'; openMenu = ''; }}>All types</button>
            {#each types as tp}
              <button class="w-full text-left px-3 py-1.5 rounded-lg text-sm row-hover {typeFilter === tp ? 'text-brand-hi font-medium' : 'text-ink-mute'}" onclick={() => { typeFilter = tp; openMenu = ''; }}>{tp}</button>
            {:else}
              <div class="px-3 py-1.5 text-sm text-ink-dim">No types set yet</div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="flex-1"></div>
    <a href="/sourcer" class="btn-outline !px-2.5" title="AI assistant" aria-label="AI assistant">
      <svg viewBox="0 0 24 24" class="w-4 h-4 text-brand-hi" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="2.2" /><ellipse cx="12" cy="12" rx="10" ry="4.2" /><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)" /></svg>
    </a>
    <button class="btn-primary" onclick={() => (showNew = true)}>Add campaign</button>
  </div>

  <!-- Column headers -->
  {#if filtered.length}
    <div class="hidden lg:flex items-center px-4 mb-1 text-xs font-medium text-ink-mute">
      <div class="flex-1"></div>
      <div class="grid grid-cols-[76px_76px_72px_84px_156px] text-center">
        <span>Prospects</span><span>Delivered</span><span>Opened</span><span>Responded</span><span>Interest level</span>
      </div>
      <div class="w-28"></div>
    </div>
  {/if}

  <!-- Rows -->
  <div class="border-y border-bg-border divide-y divide-bg-border">
    {#each filtered as c (c.id)}
      <div class="flex items-center gap-4 px-4 py-4 row-hover">
        <div class="w-11 h-11 rounded-xl bg-bg-elev border border-bg-border grid place-items-center text-ink-dim shrink-0">
          <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
        </div>

        <div class="flex-1 min-w-0">
          <a href={`/campaigns/${c.id}`} class="font-semibold text-ink hover:text-brand-hi truncate block">{c.name}</a>
          <div class="text-sm text-ink-dim">send from: {c.mailbox || 'no email chosen'}</div>
          <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {#each channelsOf(c) as ch}<span class="px-2 py-0.5 rounded-full bg-bg-elev border border-bg-border text-[10px] font-semibold tracking-wide text-ink-mute">{ch}</span>{/each}
            <span class="{STATUS_CHIP[c.status] ?? 'chip-mute'} capitalize">{c.status}</span>
            {#if c.folder}<span class="px-2 py-0.5 rounded-full bg-bg-elev border border-bg-border text-[10px] font-semibold tracking-wide text-ink-mute" title="Folder">🗂 {c.folder}</span>{/if}
            {#if c.type}<span class="px-2 py-0.5 rounded-full bg-bg-elev border border-bg-border text-[10px] font-semibold tracking-wide text-ink-mute">{c.type}</span>{/if}
          </div>
        </div>

        <!-- Stats -->
        <div class="hidden lg:grid grid-cols-[76px_76px_72px_84px_156px] items-center">
          <div class="flex flex-col items-center gap-0.5 text-ink-dim">
            <svg viewBox="0 0 24 24" class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.2 3.2 0 0 1 0 6.3" /><path d="M17 13.6A6.5 6.5 0 0 1 21.5 20" /></svg>
            <span class="text-sm font-semibold text-ink tabular-nums">{c.stats.enrolled}</span>
          </div>
          <div class="flex flex-col items-center gap-0.5 text-ink-dim">
            <svg viewBox="0 0 24 24" class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
            <span class="text-sm font-semibold text-ink tabular-nums">{c.stats.sent}</span>
          </div>
          <div class="flex flex-col items-center gap-0.5 text-ink-dim">
            <svg viewBox="0 0 24 24" class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 12 3l9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m3 9 9 6 9-6" /></svg>
            <span class="text-sm font-semibold text-ink tabular-nums">{c.stats.openRate}%</span>
          </div>
          <div class="flex flex-col items-center gap-0.5 text-ink-dim">
            <svg viewBox="0 0 24 24" class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17 4 12l5-5" /><path d="M4 12h11a5 5 0 0 1 5 5v1" /></svg>
            <span class="text-sm font-semibold text-ink tabular-nums">{c.stats.replyRate}%</span>
          </div>
          <div class="flex items-center justify-center gap-3">
            <div class="flex flex-col items-center gap-0.5 text-accent-good">
              <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01" /><path d="M8.5 14c1 1.4 5 1.4 7 0" /></svg>
              <span class="text-xs font-semibold text-ink tabular-nums">{c.stats.interested}</span>
            </div>
            <div class="flex flex-col items-center gap-0.5 text-sky-500">
              <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01" /><path d="M9 15h6" /></svg>
              <span class="text-xs font-semibold text-ink tabular-nums">{c.stats.maybe}</span>
            </div>
            <div class="flex flex-col items-center gap-0.5 text-accent-bad">
              <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01" /><path d="M8.5 15c1-1.4 5-1.4 7 0" /></svg>
              <span class="text-xs font-semibold text-ink tabular-nums">{c.stats.notInterested}</span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="w-28 flex items-center justify-end gap-1 shrink-0">
          <a href={`/campaigns/${c.id}`} class="btn-outline btn-sm">Edit</a>
          <div class="relative">
            <button class="btn-ghost !px-2" aria-label="More" onclick={(e) => { e.stopPropagation(); toggle('row:' + c.id); }}>
              <svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
            </button>
            {#if openMenu === 'row:' + c.id}
              <div class="absolute right-0 top-full mt-1 w-44 card shadow-pop p-1 z-30">
                <a href={`/campaigns/${c.id}`} class="block px-3 py-1.5 rounded-lg text-sm row-hover text-ink-mute">Open / edit</a>
                {#if c.status !== 'running'}
                  <form method="POST" action="?/setStatus" use:enhance><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="running" /><button class="w-full text-left px-3 py-1.5 rounded-lg text-sm row-hover text-ink-mute">▶ Start</button></form>
                {:else}
                  <form method="POST" action="?/setStatus" use:enhance><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="paused" /><button class="w-full text-left px-3 py-1.5 rounded-lg text-sm row-hover text-ink-mute">⏸ Pause</button></form>
                {/if}
                <form method="POST" action="?/duplicate" use:enhance><input type="hidden" name="id" value={c.id} /><button class="w-full text-left px-3 py-1.5 rounded-lg text-sm row-hover text-ink-mute">⎘ Duplicate</button></form>
                <div class="border-t border-bg-border my-1"></div>
                <form method="POST" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm('Delete this campaign?')) e.preventDefault(); }}><input type="hidden" name="id" value={c.id} /><button class="w-full text-left px-3 py-1.5 rounded-lg text-sm row-hover text-accent-bad">Delete</button></form>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div class="py-16 text-center">
        <div class="text-lg font-semibold mb-1">No campaigns yet</div>
        <p class="text-ink-mute mb-4">Create a multichannel sequence to start your outreach.</p>
        <button class="btn-primary" onclick={() => (showNew = true)}>Add campaign</button>
      </div>
    {/each}
  </div>
</section>

<!-- Add campaign modal -->
{#if showNew}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onclick={() => (showNew = false)}>
    <div class="w-full max-w-md card shadow-pop p-6 animate-fade-in-up" onclick={(e) => e.stopPropagation()}>
      <h2 class="text-lg font-semibold mb-1">Add campaign</h2>
      <p class="text-sm text-ink-mute mb-4">Name it — you'll build the sequence next.</p>
      <form method="POST" action="?/create" use:enhance class="space-y-4">
        <div>
          <label class="label" for="cname">Campaign name</label>
          <input id="cname" name="name" class="input" placeholder="Investor cold outreach — Seed round" required />
        </div>
        <div>
          <label class="label" for="cfolder2">Folder <span class="text-ink-dim font-normal">(optional)</span></label>
          <input id="cfolder2" name="folder" class="input" placeholder="e.g. Q3 Seed round" />
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" onclick={() => (showNew = false)}>Cancel</button>
          <button type="submit" class="btn-primary">Create campaign</button>
        </div>
      </form>
    </div>
  </div>
{/if}
