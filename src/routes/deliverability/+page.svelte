<script lang="ts">
  import { enhance } from '$app/forms';
  import { diagnoseSmtpError } from '$lib/smtpHelp';
  let { data, form } = $props();
  const scoreColor = (s: number) => (s >= 80 ? 'text-accent-good' : s >= 50 ? 'text-accent-warn' : 'text-accent-bad');
</script>

{#snippet check(label: string, c: { ok: boolean; detail: string })}
  <div class="flex items-start gap-2 py-1">
    <span class="{c.ok ? 'text-accent-good' : 'text-accent-bad'} mt-0.5 shrink-0">{c.ok ? '✓' : '✗'}</span>
    <div class="min-w-0">
      <span class="font-medium text-sm">{label}</span>
      <span class="text-xs text-ink-dim ml-1 break-words">{c.detail}</span>
    </div>
  </div>
{/snippet}

{#snippet domainCard(d: any)}
  <div class="card p-4">
    <div class="flex items-center gap-2 mb-1">
      <span class="font-semibold">{d.domain}</span>
      {#if d.mailboxCount}<span class="chip-mute">{d.mailboxCount} mailbox(es)</span>{/if}
      <div class="flex-1"></div>
      <span class="text-lg font-semibold {scoreColor(d.score)}">{d.score}<span class="text-xs text-ink-dim">/100</span></span>
    </div>
    {@render check('SPF', d.spf)}
    {@render check('DKIM', d.dkim)}
    {@render check('DMARC', d.dmarc)}
    {@render check('MX', d.mx)}
  </div>
{/snippet}

<section class="max-w-4xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Deliverability</h1>
    <p class="text-ink-mute">Domain authentication, mailbox health & bounce rate for <b>{data.project?.name ?? 'this project'}</b>.</p>
  </div>

  <div class="grid md:grid-cols-3 gap-4">
    <div class="stat">
      <div class="stat-label">Domain auth score</div>
      <div class="stat-value {scoreColor(data.score)}">{data.score}<span class="text-base text-ink-dim">/100</span></div>
      <div class="text-xs text-ink-dim">avg across {data.domains.length} domain(s)</div>
    </div>
    <div class="stat">
      <div class="stat-label">Capacity / day</div>
      <div class="stat-value">{data.capacity ? '~' + data.capacity.limit.toLocaleString() : '0'}</div>
      <div class="text-xs text-ink-dim">{data.capacity?.mailboxes ?? 0} mailbox(es)</div>
    </div>
    <div class="stat">
      <div class="stat-label">Bounce rate</div>
      <div class="stat-value {(data.bounce?.rate ?? 0) > 5 ? 'text-accent-bad' : ''}">{data.bounce?.rate ?? 0}%</div>
      <div class="text-xs text-ink-dim">{data.bounce?.bounced ?? 0} bounced / {data.bounce?.sent ?? 0} sent</div>
    </div>
  </div>

  <div class="card p-5">
    <h3 class="text-sm font-medium mb-2">Check a domain</h3>
    <p class="text-xs text-ink-dim mb-3">Run a live DNS check on any domain — handy before you connect a mailbox.</p>
    <form method="POST" action="?/check" use:enhance class="flex gap-2 items-end max-w-lg">
      <div class="flex-1"><input name="domain" class="input" placeholder="cryptool.io" /></div>
      <button class="btn-primary">Check DNS</button>
    </form>
    {#if form?.error}<div class="text-sm text-accent-bad mt-2">{form.error}</div>{/if}
    {#if form?.ok === 'check' && form.result}
      <div class="mt-3">{@render domainCard(form.result)}</div>
    {/if}
  </div>

  <div>
    <h3 class="text-sm font-medium mb-2">Your sending domains</h3>
    {#if data.domains.length}
      <div class="grid md:grid-cols-2 gap-3">
        {#each data.domains as d}{@render domainCard(d)}{/each}
      </div>
    {:else}
      <div class="card p-6 text-center text-ink-mute">No sending domains yet — <a href="/mailboxes" class="text-brand-hi hover:underline">connect a mailbox</a> and its domain is auto-checked here, or check any domain above.</div>
    {/if}
  </div>

  {#if data.mailboxes.length}
    <div>
      <h3 class="text-sm font-medium mb-2">Mailbox health</h3>
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
            <tr><th class="text-left px-4 py-2 font-medium">Mailbox</th><th class="text-left px-4 py-2 font-medium">Status</th><th class="text-left px-4 py-2 font-medium">Warm-up</th><th class="text-left px-4 py-2 font-medium">Today</th></tr>
          </thead>
          <tbody>
            {#each data.mailboxes as mb}
              <tr class="border-t border-bg-border">
                <td class="px-4 py-2 max-w-md">
                  <div class="font-medium">{mb.fromEmail}</div>
                  {#if mb.lastError}
                    {@const help = diagnoseSmtpError(mb.lastError)}
                    <div class="text-xs text-accent-bad break-words">{mb.lastError}</div>
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
                <td class="px-4 py-2 text-ink-mute">{mb.warmupEnabled ? 'ramping' : 'off'}</td>
                <td class="px-4 py-2 text-ink-mute">{mb.sentToday}/{mb.effLimit}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  <p class="text-xs text-ink-dim">SPF + DKIM are the must-haves; add DMARC starting at <code>p=none</code>. Keep bounce rate under ~3–5%, warm up new inboxes, and spread volume across mailboxes/domains. Automatic bounce capture (NDR parsing) + per-mailbox auto-pause are the next additions.</p>
</section>
