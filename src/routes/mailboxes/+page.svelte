<script lang="ts">
  import { enhance } from '$app/forms';
  import { diagnoseSmtpError } from '$lib/smtpHelp';
  let { data, form } = $props();

  let mode = $state<'list' | 'choose' | 'add' | 'bulk'>('list');
  let chosenPreset = $state('');
  const presetObj = $derived(data.presets.find((p) => p.id === chosenPreset));
  function chooseProvider(id: string) { chosenPreset = id; mode = 'add'; }
  const GRAPH_STEPS = [
    'portal.azure.com → Microsoft Entra ID → App registrations → New registration. Name it "Reach", single tenant, Register.',
    'On the Overview page, copy the Application (client) ID and the Directory (tenant) ID.',
    'Certificates & secrets → New client secret → copy the secret VALUE (shown only once).',
    'API permissions → Add a permission → Microsoft Graph → Application permissions → Mail.Send → Add, then click "Grant admin consent".',
    '(Recommended) Limit which mailboxes it can send as with an Application Access Policy (New-ApplicationAccessPolicy in Exchange Online PowerShell).',
    'Enter the Tenant ID, Client ID, Client secret and a From email (a real mailbox in your tenant) below, then Add & test.'
  ];
  let domains = $derived(
    Object.entries(
      (data.mailboxes as any[]).reduce((acc: Record<string, number>, mb) => {
        const d = (mb.fromEmail.split('@')[1] || '').toLowerCase();
        if (d) acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {})
    ).map(([domain, count]) => ({ domain, count }))
  );

  const bulkTemplate = `label,fromName,fromEmail,host,port,secure,user,pass,imapHost,imapPort,dailyLimit,warmup
Inbox 1,Ron at Cryptool,ron@cryptool.io,smtp.gmail.com,465,true,ron@cryptool.io,APP_PASSWORD,imap.gmail.com,993,40,true
Inbox 2,Ron at Cryptool,ron@cryptool.co,smtp.gmail.com,465,true,ron@cryptool.co,APP_PASSWORD,imap.gmail.com,993,40,true`;

  let csvText = $state('');
  function useTemplate() { csvText = bulkTemplate; }
  function copyTemplate() { navigator.clipboard.writeText(bulkTemplate); }
  function downloadTemplate() {
    const b = new Blob([bulkTemplate], { type: 'text/csv' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = 'mailboxes-template.csv'; a.click();
    URL.revokeObjectURL(u);
  }

</script>

<section class="max-w-4xl">
  <div class="flex items-center justify-between mb-2">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Mailboxes</h1>
      <p class="text-ink-mute">Sending inboxes for <b>{data.project?.name ?? 'this project'}</b> — rotated to send at volume. Each project/company connects its own.</p>
    </div>
    <div class="flex gap-2">
      {#if data.mailboxes.length}
        <form method="POST" action="?/testAll" use:enhance><button class="btn-outline" type="submit">Test all</button></form>
      {/if}
      <button class="btn-outline" onclick={() => (mode = mode === 'bulk' ? 'list' : 'bulk')}>{mode === 'bulk' ? 'Cancel' : 'Bulk import'}</button>
      <button class="btn-primary" onclick={() => (mode = mode === 'choose' || mode === 'add' ? 'list' : 'choose')}>{mode === 'choose' || mode === 'add' ? 'Cancel' : '+ Add mailbox'}</button>
    </div>
  </div>

  {#if data.capacity}
    <div class="card p-4 mb-4 flex items-center gap-6 text-sm">
      <div><span class="text-2xl font-semibold">{data.capacity.mailboxes}</span> <span class="text-ink-dim">mailboxes</span></div>
      <div><span class="text-2xl font-semibold">~{data.capacity.limit.toLocaleString()}</span> <span class="text-ink-dim">emails/day capacity</span></div>
      <div><span class="text-2xl font-semibold">{data.capacity.remaining.toLocaleString()}</span> <span class="text-ink-dim">remaining today</span></div>
      <div class="flex-1"></div>
      <span class="text-xs text-ink-dim">Capacity = sum of each mailbox's daily limit (after warm-up ramp).</span>
    </div>
  {/if}

  {#if form?.error}<div class="card p-3 mb-3 text-sm text-accent-bad">{form.error}</div>{/if}
  {#if form?.ok === 'add' || form?.ok === 'bulk' || form?.ok === 'testall' || form?.ok === 'test-pass' || form?.ok === 'test-fail'}
    <div class="card p-3 mb-3 text-sm {form.ok === 'test-fail' ? 'text-accent-bad' : 'text-accent-good'}">{form.detail}</div>
  {/if}
  {#if form?.ok === 'test-fail' || (form?.ok === 'add' && /fail/i.test(form.detail ?? ''))}
    {@const help = diagnoseSmtpError(form.detail)}
    {#if help}
      <div class="card p-4 mb-3 text-xs">
        <div class="font-medium text-accent-bad mb-1">How to fix — {help.summary}</div>
        <ol class="list-decimal pl-4 space-y-0.5 text-ink-mute">{#each help.steps as s}<li>{s}</li>{/each}</ol>
      </div>
    {/if}
  {/if}

  {#if mode === 'choose'}
    <div class="card p-6 mb-5">
      <h3 class="text-base font-semibold mb-1">Connect a sending mailbox</h3>
      <p class="text-sm text-ink-mute mb-4">Pick how you'll connect. Gmail / Outlook use an <b>app password</b> — one-click OAuth lands when you add Google/Microsoft OAuth keys.</p>
      <div class="grid sm:grid-cols-2 gap-3">
        {#each data.presets as p}
          <button class="card card-hover p-4 text-left flex items-center gap-3" onclick={() => chooseProvider(p.id)}>
            <div class="w-10 h-10 rounded-xl bg-bg-elev border border-bg-border grid place-items-center text-xl">{p.id === 'gmail' ? '✉' : p.id === 'outlook' ? '✉' : p.id === 'ses' ? '☁' : '⚙'}</div>
            <div><div class="font-medium">{p.id === 'custom' ? 'Connect via SMTP / IMAP' : p.label}</div><div class="text-xs text-ink-dim">{p.host || 'Any provider — enter host/port'}</div></div>
          </button>
        {/each}
        <button class="card card-hover p-4 text-left flex items-center gap-3" onclick={() => chooseProvider('graph')}>
          <div class="w-10 h-10 rounded-xl bg-bg-elev border border-bg-border grid place-items-center text-xl">🪟</div>
          <div><div class="font-medium">Microsoft 365 (Graph API)</div><div class="text-xs text-ink-dim">Durable M365 sending — no SMTP</div></div>
        </button>
        <button class="card card-hover p-4 text-left flex items-center gap-3" onclick={() => (mode = 'bulk')}>
          <div class="w-10 h-10 rounded-xl bg-bg-elev border border-bg-border grid place-items-center text-xl">⇪</div>
          <div><div class="font-medium">Add in bulk (CSV)</div><div class="text-xs text-ink-dim">Connect dozens at once</div></div>
        </button>
      </div>
    </div>
  {:else if mode === 'add'}
    <div class="card p-5 mb-5">
      <button type="button" class="text-xs text-ink-mute hover:text-ink mb-3" onclick={() => (mode = 'choose')}>← back to providers</button>
      {#if chosenPreset === 'graph'}
        <div class="rounded-lg bg-bg-elev/50 border border-bg-border p-3 mb-4">
          <div class="text-xs font-semibold mb-1.5">How to set up Microsoft 365 (Graph API)</div>
          <ol class="list-decimal pl-4 space-y-1 text-xs text-ink-mute">{#each GRAPH_STEPS as s}<li>{s}</li>{/each}</ol>
        </div>
        <form method="POST" action="?/addGraph" use:enhance={() => async ({ update }) => { await update(); mode = 'list'; }} class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div><span class="label">Label</span><input name="label" class="input" placeholder="M365 — Ron" /></div>
            <div><span class="label">From name</span><input name="fromName" class="input" placeholder="Ron at Cryptool" /></div>
            <div class="col-span-2"><span class="label">From email (a mailbox in your tenant)</span><input name="fromEmail" class="input" placeholder="ron@cryptool.io" required /></div>
            <div class="col-span-2"><span class="label">Directory (tenant) ID</span><input name="tenantId" class="input" required /></div>
            <div><span class="label">Application (client) ID</span><input name="clientId" class="input" required /></div>
            <div><span class="label">Client secret</span><input name="clientSecret" type="password" class="input" required /></div>
            <div><span class="label">Daily limit</span><input name="dailyLimit" type="number" class="input" value="40" /></div>
            <div class="flex items-end"><label class="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="warmupEnabled" checked /> Warm-up</label></div>
          </div>
          <button class="btn-primary" type="submit">Add &amp; test</button>
        </form>
      {:else}
      {#if presetObj?.steps?.length}
        <div class="rounded-lg bg-bg-elev/50 border border-bg-border p-3 mb-4">
          <div class="text-xs font-semibold mb-1.5">How to set up {presetObj.label}</div>
          <ol class="list-decimal pl-4 space-y-1 text-xs text-ink-mute">{#each presetObj.steps as s}<li>{s}</li>{/each}</ol>
        </div>
      {/if}
      <form method="POST" action="?/add" use:enhance={() => async ({ update }) => { await update(); mode = 'list'; }} class="space-y-3">
        <div><span class="label">Provider</span>
          <select class="input" bind:value={chosenPreset}>{#each data.presets as p}<option value={p.id}>{p.label}</option>{/each}</select>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div><span class="label">Label</span><input name="label" class="input" placeholder="Inbox 1" /></div>
          <div><span class="label">From name</span><input name="fromName" class="input" placeholder="Ron at Cryptool" /></div>
          <div><span class="label">From email</span><input name="fromEmail" class="input" required /></div>
          <div><span class="label">Username</span><input name="user" class="input" required /></div>
          <div><span class="label">SMTP host</span><input name="host" class="input" value={presetObj?.host ?? ''} required /></div>
          <div><span class="label">Port</span><input name="port" type="number" class="input" value={presetObj?.port ?? 465} /></div>
          <div class="col-span-2 flex items-center gap-2"><input type="checkbox" name="secure" checked={presetObj?.secure ?? true} /> <span class="text-sm">SSL/TLS</span></div>
          <div><span class="label">App password</span><input name="pass" type="password" class="input" required /></div>
          <div></div>
          <div><span class="label">IMAP host</span><input name="imapHost" class="input" value={presetObj?.imapHost ?? ''} /></div>
          <div><span class="label">IMAP port</span><input name="imapPort" type="number" class="input" value={presetObj?.imapPort ?? 993} /></div>
          <div><span class="label">Daily limit</span><input name="dailyLimit" type="number" class="input" value="40" /></div>
          <div class="flex items-end"><label class="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="warmupEnabled" checked /> Warm-up</label></div>
        </div>
        <button class="btn-primary" type="submit">Add &amp; test</button>
      </form>
      {/if}
    </div>
  {:else if mode === 'bulk'}
    <div class="card p-5 mb-5">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-medium">Bulk import mailboxes</h3>
        <div class="flex gap-2">
          <button type="button" class="btn-outline" onclick={downloadTemplate}>↓ Template</button>
          <button type="button" class="btn-outline" onclick={copyTemplate}>Copy</button>
          <button type="button" class="btn-ghost" onclick={useTemplate}>Use example</button>
        </div>
      </div>
      <p class="text-xs text-ink-dim mb-3">One mailbox per row. Required columns: <code>fromEmail, host, user, pass</code>. Optional: <code>label, fromName, port, secure, imapHost, imapPort, dailyLimit, warmup</code>. Connect dozens at once, then <b>Test all</b>.</p>
      <form method="POST" action="?/bulkImport" use:enhance={() => async ({ update }) => { await update(); mode = 'list'; }} class="space-y-3">
        <textarea name="csv" bind:value={csvText} rows="10" class="input font-mono text-xs" placeholder={bulkTemplate}></textarea>
        <button class="btn-primary" type="submit">Import mailboxes</button>
      </form>
    </div>
  {/if}

  {#if data.mailboxes.length}
    <form method="POST" action="?/sendTestAll" use:enhance class="flex gap-2 items-end mb-4">
      <div class="flex-1 max-w-sm"><span class="label">Send a test from every mailbox to</span><input name="to" class="input !py-1" placeholder="you@yourcompany.com" required /></div>
      <button class="btn-outline" type="submit">Send tests</button>
    </form>
    {#if form?.ok === 'sendtest'}
      <div class="mb-4 space-y-1 text-xs">{#each form.results as r}<div class="{r.ok ? 'text-accent-good' : 'text-accent-bad'}">{r.ok ? '✓' : '✗'} {r.from} — {r.detail}</div>{/each}</div>
    {/if}
  {/if}

  {#if domains.length}
    <div class="card p-4 mb-4">
      <h3 class="text-sm font-medium mb-2">Sending domains</h3>
      <div class="flex flex-wrap gap-2">
        {#each domains as d}<span class="chip-mute" title="{d.count} mailbox(es)">{d.domain} · {d.count}</span>{/each}
      </div>
      <p class="text-xs text-ink-dim mt-2">Spread sending across a few domains, set SPF/DKIM/DMARC per domain, warm up gradually. Per-domain DNS checks land with the Deliverability dashboard.</p>
    </div>
  {/if}

  <div class="card overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
        <tr><th class="text-left px-4 py-2 font-medium">Mailbox</th><th class="text-left px-4 py-2 font-medium">Status</th><th class="text-left px-4 py-2 font-medium">Today</th><th class="text-left px-4 py-2 font-medium">Limit</th><th class="px-4 py-2"></th></tr>
      </thead>
      <tbody>
        {#each data.mailboxes as mb}
          <tr class="border-t border-bg-border">
            <td class="px-4 py-2 max-w-md">
              <div class="font-medium">{mb.fromEmail}{#if mb.provider === 'graph'} <span class="chip-mute align-middle">Graph</span>{/if}</div>
              <div class="text-xs text-ink-dim">{mb.label}</div>
              {#if mb.lastError}
                {@const help = diagnoseSmtpError(mb.lastError)}
                <div class="text-xs text-accent-bad mt-1 break-words">{mb.lastError}</div>
                {#if help}
                  <details class="mt-1">
                    <summary class="text-xs text-brand-hi cursor-pointer select-none">How to fix →</summary>
                    <div class="mt-1.5 p-2 rounded-lg bg-bg-elev/60 border border-bg-border">
                      <div class="text-xs font-medium mb-1">{help.summary}</div>
                      <ol class="list-decimal pl-4 space-y-0.5 text-xs text-ink-mute">{#each help.steps as s}<li>{s}</li>{/each}</ol>
                    </div>
                  </details>
                {/if}
              {/if}
            </td>
            <td class="px-4 py-2"><span class={mb.status === 'active' ? 'chip-good' : mb.status === 'error' ? 'chip-bad' : 'chip-mute'}>{mb.status}</span></td>
            <td class="px-4 py-2 text-ink-mute">{mb.sentToday}/{mb.effLimit}</td>
            <td class="px-4 py-2 text-ink-mute">{mb.dailyLimit}{mb.warmupEnabled ? ' · warming' : ''}</td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
              <form method="POST" action="?/testOne" use:enhance class="inline"><input type="hidden" name="id" value={mb.id} /><button class="btn-ghost text-xs">Test</button></form>
              <form method="POST" action="?/toggle" use:enhance class="inline"><input type="hidden" name="id" value={mb.id} /><button class="btn-ghost text-xs">{mb.status === 'active' ? 'Pause' : 'Resume'}</button></form>
              <form method="POST" action="?/remove" use:enhance class="inline"><input type="hidden" name="id" value={mb.id} /><button class="btn-ghost text-accent-bad hover:text-accent-bad text-xs">×</button></form>
            </td>
          </tr>
        {:else}
          <tr><td colspan="5" class="px-4 py-10 text-center text-ink-mute">No mailboxes yet. Add one, or bulk-import several to send at volume.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
