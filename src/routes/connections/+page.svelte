<script lang="ts">
  import { enhance } from '$app/forms';
  import { CHANNEL_LABEL, type ChannelKind } from '$lib/types';

  let { data, form } = $props();

  let openCard = $state<string | null>(null);
  let testTo = $state('');

  const statusChip: Record<string, string> = {
    connected: 'chip-good',
    error: 'chip-bad',
    disconnected: 'chip-mute'
  };

  function presetApply(e: Event, channelId: string) {
    const id = (e.target as HTMLSelectElement).value;
    const p = data.presets.find((x) => x.id === id);
    if (!p) return;
    const form = (e.target as HTMLElement).closest('form');
    if (!form) return;
    (form.querySelector('[name=host]') as HTMLInputElement).value = p.host;
    (form.querySelector('[name=port]') as HTMLInputElement).value = String(p.port);
    (form.querySelector('[name=secure]') as HTMLInputElement).checked = p.secure;
    const imapHost = form.querySelector('[name=imapHost]') as HTMLInputElement | null;
    const imapPort = form.querySelector('[name=imapPort]') as HTMLInputElement | null;
    if (imapHost) imapHost.value = p.imapHost;
    if (imapPort) imapPort.value = String(p.imapPort);
  }
</script>

<section class="max-w-3xl">
  <div class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight">Connections</h1>
    <p class="text-ink-mute">Connect this project's own sending accounts. Each client/project sets up their own — credentials are encrypted at rest.</p>
  </div>

  {#if data.channels.length === 0}
    <div class="card p-6 text-ink-mute">Pick or create a project first.</div>
  {/if}

  <!-- Sending mailboxes live on their own page now -->
  {#if data.channels.length > 0}
    <a href="/mailboxes" class="card p-4 mb-5 flex items-center gap-3 hover:border-brand/40 transition-colors">
      <span class="inline-block w-8 h-8 rounded-lg bg-brand/15 border border-brand/30 grid place-items-center text-brand-hi">@</span>
      <div class="flex-1">
        <div class="font-medium text-sm">Sending mailboxes <span class="text-ink-dim font-normal">· inbox rotation</span></div>
        <div class="text-xs text-ink-dim">{data.capacity ? `${data.capacity.mailboxes} connected · ~${data.capacity.limit.toLocaleString()} emails/day` : 'Connect inboxes to send at volume'} — add, bulk-import & test on the Mailboxes page.</div>
      </div>
      <span class="text-ink-dim">→</span>
    </a>
  {/if}

  <div class="space-y-3">
    {#each data.channels as ch}
      {@const setup = data.setup[ch.kind as ChannelKind]}
      {@const isOpen = openCard === ch.id}
      <div class="card overflow-hidden">
        <!-- header -->
        <button class="w-full flex items-center gap-3 p-4 text-left row-hover" onclick={() => (openCard = isOpen ? null : ch.id)}>
          <span class="font-medium w-32">{CHANNEL_LABEL[ch.kind as ChannelKind]}</span>
          <span class={statusChip[ch.status] ?? 'chip-mute'}>{ch.status}</span>
          {#if ch.connLabel}<span class="text-xs text-ink-dim truncate">{ch.connLabel}</span>{/if}
          <div class="flex-1"></div>
          {#if ch.lastTestedAt}<span class="text-xs text-ink-dim">tested {new Date(ch.lastTestedAt).toLocaleDateString()}</span>{/if}
          <span class="text-ink-dim">{isOpen ? '▴' : '▾'}</span>
        </button>

        {#if ch.lastTestError && ch.status === 'error'}
          <div class="px-4 pb-2 -mt-1 text-xs text-accent-bad">{ch.lastTestError}</div>
        {/if}

        {#if isOpen}
          <div class="border-t border-bg-border p-4 space-y-4">
            <!-- instructions -->
            <div>
              <h4 class="text-xs uppercase tracking-wider text-ink-mute mb-2">{setup.title} — setup</h4>
              <ol class="list-decimal list-inside text-sm text-ink-mute space-y-1">
                {#each setup.steps as s}<li>{s}</li>{/each}
              </ol>
              {#if setup.note}<p class="text-xs text-ink-dim mt-2">{setup.note}</p>{/if}
            </div>

            <!-- email provider preset -->
            {#if ch.kind === 'email'}
              <div>
                <span class="label">Provider preset</span>
                <select class="input" onchange={(e) => presetApply(e, ch.id)}>
                  <option value="">— choose to auto-fill host/port —</option>
                  {#each data.presets as p}<option value={p.id}>{p.label}</option>{/each}
                </select>
              </div>
            {/if}

            <!-- credential form -->
            <form method="POST" action="?/save" use:enhance class="space-y-3">
              <input type="hidden" name="channelId" value={ch.id} />
              <input type="hidden" name="kind" value={ch.kind} />
              <div class="grid grid-cols-2 gap-3">
                {#each setup.fields as field}
                  <div class={field.type === 'checkbox' ? 'col-span-2 flex items-center gap-2' : 'col-span-2 sm:col-span-1'}>
                    {#if field.type === 'checkbox'}
                      <input type="checkbox" name={field.key} checked={ch.values[field.key] === 'on'} />
                      <label class="text-sm">{field.label}</label>
                    {:else}
                      <label class="label" for={`${ch.id}-${field.key}`}>{field.label}</label>
                      <input
                        id={`${ch.id}-${field.key}`}
                        name={field.key}
                        type={field.type ?? 'text'}
                        class="input"
                        placeholder={field.placeholder ?? ''}
                        value={ch.values[field.key] ?? ''}
                      />
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="flex gap-2 flex-wrap">
                <button class="btn-primary" type="submit">Save</button>
                <button class="btn-outline" type="submit" formaction="?/test">Test connection</button>
                {#if ch.hasCreds}
                  <button class="btn-ghost text-accent-bad hover:text-accent-bad" type="submit" formaction="?/disconnect">Disconnect</button>
                {/if}
              </div>
            </form>

            <!-- send test email -->
            {#if ch.kind === 'email'}
              <form method="POST" action="?/sendTest" use:enhance class="flex gap-2 items-end border-t border-bg-border pt-3">
                <input type="hidden" name="channelId" value={ch.id} />
                <div class="flex-1">
                  <label class="label" for={`${ch.id}-testto`}>Send a test email to</label>
                  <input id={`${ch.id}-testto`} name="to" class="input" placeholder="you@yourcompany.com" bind:value={testTo} />
                </div>
                <button class="btn-outline" type="submit">Send test</button>
              </form>
            {/if}

            <!-- per-card result -->
            {#if form?.kind === ch.kind || form?.ok === 'send-pass' || form?.ok === 'send-fail'}
              {#if form?.ok === 'saved'}<div class="text-sm text-accent-good">Saved.</div>{/if}
              {#if form?.ok === 'test-pass'}<div class="text-sm text-accent-good">✓ {form.detail}</div>{/if}
              {#if form?.ok === 'test-fail'}<div class="text-sm text-accent-bad">✗ {form.detail}</div>{/if}
              {#if form?.ok === 'send-pass'}<div class="text-sm text-accent-good">✓ Test email sent — {form.detail}</div>{/if}
              {#if form?.ok === 'send-fail'}<div class="text-sm text-accent-bad">✗ {form.detail}</div>{/if}
            {/if}
            {#if form?.error}<div class="text-sm text-accent-bad">{form.error}</div>{/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</section>
