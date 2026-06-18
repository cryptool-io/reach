<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();

  let mode = $state<'list' | 'add' | 'bulk'>('list');

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

  function presetApply(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    const p = data.presets.find((x) => x.id === id);
    if (!p) return;
    const fm = (e.target as HTMLElement).closest('form');
    if (!fm) return;
    (fm.querySelector('[name=host]') as HTMLInputElement).value = p.host;
    (fm.querySelector('[name=port]') as HTMLInputElement).value = String(p.port);
    (fm.querySelector('[name=secure]') as HTMLInputElement).checked = p.secure;
    (fm.querySelector('[name=imapHost]') as HTMLInputElement).value = p.imapHost;
    (fm.querySelector('[name=imapPort]') as HTMLInputElement).value = String(p.imapPort);
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
      <button class="btn-primary" onclick={() => (mode = mode === 'add' ? 'list' : 'add')}>{mode === 'add' ? 'Cancel' : '+ Add mailbox'}</button>
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

  {#if mode === 'add'}
    <div class="card p-5 mb-5">
      <form method="POST" action="?/add" use:enhance={() => async ({ update }) => { await update(); mode = 'list'; }} class="space-y-3">
        <div><span class="label">Provider preset</span>
          <select class="input" onchange={presetApply}><option value="">— auto-fill host/port —</option>{#each data.presets as p}<option value={p.id}>{p.label}</option>{/each}</select>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div><span class="label">Label</span><input name="label" class="input" placeholder="Inbox 1" /></div>
          <div><span class="label">From name</span><input name="fromName" class="input" placeholder="Ron at Cryptool" /></div>
          <div><span class="label">From email</span><input name="fromEmail" class="input" required /></div>
          <div><span class="label">Username</span><input name="user" class="input" required /></div>
          <div><span class="label">SMTP host</span><input name="host" class="input" required /></div>
          <div><span class="label">Port</span><input name="port" type="number" class="input" value="465" /></div>
          <div class="col-span-2 flex items-center gap-2"><input type="checkbox" name="secure" checked /> <span class="text-sm">SSL/TLS (465)</span></div>
          <div><span class="label">App password</span><input name="pass" type="password" class="input" required /></div>
          <div></div>
          <div><span class="label">IMAP host</span><input name="imapHost" class="input" /></div>
          <div><span class="label">IMAP port</span><input name="imapPort" type="number" class="input" value="993" /></div>
          <div><span class="label">Daily limit</span><input name="dailyLimit" type="number" class="input" value="40" /></div>
          <div class="flex items-end"><label class="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="warmupEnabled" checked /> Warm-up</label></div>
        </div>
        <button class="btn-primary" type="submit">Add & test</button>
      </form>
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

  <div class="card overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
        <tr><th class="text-left px-4 py-2 font-medium">Mailbox</th><th class="text-left px-4 py-2 font-medium">Status</th><th class="text-left px-4 py-2 font-medium">Today</th><th class="text-left px-4 py-2 font-medium">Limit</th><th class="px-4 py-2"></th></tr>
      </thead>
      <tbody>
        {#each data.mailboxes as mb}
          <tr class="border-t border-bg-border">
            <td class="px-4 py-2"><div class="font-medium">{mb.fromEmail}</div><div class="text-xs text-ink-dim">{mb.label}{mb.lastError ? ` · ${mb.lastError}` : ''}</div></td>
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
