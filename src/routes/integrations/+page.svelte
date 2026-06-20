<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  let { webhooks, tokens, events, baseUrl } = $derived(data);

  const api = $derived(baseUrl || 'https://reach.cryptool.io');
  function copy(s: string) {
    navigator.clipboard?.writeText(s);
  }
  const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString() : '—');
</script>

<section class="max-w-4xl">
  <h1 class="text-2xl font-semibold tracking-tight mb-1">API &amp; Webhooks</h1>
  <p class="text-ink-mute text-sm mb-6">Connect Reach to your CRM, Zapier/Make, or your own code — push events out with webhooks, pull/push data with the REST API.</p>

  {#if form?.error}<div class="card p-3 mb-4 text-sm text-accent-bad">{form.error}</div>{/if}
  {#if form?.ok === 'webhook-test'}<div class="card p-3 mb-4 text-sm text-accent-good">{form.detail}</div>{/if}

  <!-- ── API TOKENS ─────────────────────────────────────── -->
  <div class="card p-5 mb-6">
    <h2 class="text-sm font-medium mb-3">API tokens</h2>

    {#if form?.ok === 'token-add' && form.token}
      <div class="card p-3 mb-3 bg-bg-elev border-brand/40">
        <div class="text-xs text-ink-mute mb-1">Copy this token now — it won't be shown again:</div>
        <div class="flex items-center gap-2">
          <code class="text-sm break-all flex-1">{form.token}</code>
          <button class="btn-outline btn-sm" onclick={() => copy(form.token)}>Copy</button>
        </div>
      </div>
    {/if}

    {#if tokens.length}
      <table class="w-full text-sm mb-3">
        <thead class="text-ink-mute text-xs uppercase tracking-wider">
          <tr><th class="text-left py-1 font-medium">Label</th><th class="text-left py-1 font-medium">Token</th><th class="text-left py-1 font-medium">Last used</th><th></th></tr>
        </thead>
        <tbody>
          {#each tokens as t}
            <tr class="border-t border-bg-border">
              <td class="py-2">{t.label}</td>
              <td class="py-2 text-ink-dim">rk_…{t.tail}</td>
              <td class="py-2 text-ink-dim text-xs">{fmt(t.lastUsedAt)}</td>
              <td class="py-2 text-right">
                <form method="POST" action="?/removeToken" use:enhance class="inline">
                  <input type="hidden" name="id" value={t.id} />
                  <button class="btn-ghost btn-sm text-accent-bad hover:text-accent-bad">Revoke</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="text-sm text-ink-dim mb-3">No tokens yet.</p>
    {/if}

    <form method="POST" action="?/addToken" use:enhance class="flex items-end gap-2">
      <div><label class="label" for="tl">New token label</label><input id="tl" name="label" class="input !py-1 !w-56" placeholder="Zapier, CRM sync…" /></div>
      <button class="btn-primary btn-sm">Generate token</button>
    </form>
  </div>

  <!-- ── REST API DOCS ──────────────────────────────────── -->
  <div class="card p-5 mb-6">
    <h2 class="text-sm font-medium mb-3">REST API</h2>
    <p class="text-xs text-ink-dim mb-3">Authenticate with <code>Authorization: Bearer &lt;token&gt;</code> (or <code>x-api-key</code>). Scoped to the active project.</p>
    <div class="space-y-2 text-xs font-mono bg-bg-elev rounded-lg p-3 overflow-x-auto">
      <div><span class="chip-good">GET</span> {api}/api/v1/campaigns <span class="text-ink-dim">— list campaigns + stats</span></div>
      <div><span class="chip-good">GET</span> {api}/api/v1/prospects?limit=100 <span class="text-ink-dim">— list prospects</span></div>
      <div><span class="chip-brand">POST</span> {api}/api/v1/prospects <span class="text-ink-dim">— upsert &#123;name,email,company,role,tags&#125;</span></div>
      <div><span class="chip-brand">POST</span> {api}/api/v1/campaigns/&lt;id&gt;/enroll <span class="text-ink-dim">— body &#123;emails:[…]&#125;</span></div>
      <div><span class="chip-brand">POST</span> {api}/api/v1/suppress <span class="text-ink-dim">— body &#123;email,reason&#125;</span></div>
    </div>
    <button class="btn-ghost btn-sm mt-2" onclick={() => copy(`curl -H "Authorization: Bearer YOUR_TOKEN" ${api}/api/v1/campaigns`)}>Copy example curl</button>
  </div>

  <!-- ── WEBHOOKS ───────────────────────────────────────── -->
  <div class="card p-5">
    <h2 class="text-sm font-medium mb-1">Webhooks</h2>
    <p class="text-xs text-ink-dim mb-3">We POST a JSON event to your URL on each selected event. If you set a secret, we sign the body as <code>x-reach-signature: sha256=…</code> (HMAC).</p>

    {#if webhooks.length}
      <div class="space-y-2 mb-4">
        {#each webhooks as w}
          <div class="border border-bg-border rounded-lg p-3 flex items-center gap-3 flex-wrap">
            <span class="chip-{w.active ? 'good' : 'mute'}">{w.active ? 'active' : 'paused'}</span>
            <span class="text-sm font-mono break-all flex-1 min-w-0">{w.url}</span>
            <span class="chip-mute text-xs">{w.events}</span>
            {#if w.lastStatus}<span class="text-xs text-ink-dim" title="last delivery">↳ {w.lastStatus}</span>{/if}
            <form method="POST" action="?/testWebhook" use:enhance class="inline"><input type="hidden" name="id" value={w.id} /><button class="btn-ghost btn-sm">Test</button></form>
            <form method="POST" action="?/toggleWebhook" use:enhance class="inline"><input type="hidden" name="id" value={w.id} /><button class="btn-ghost btn-sm">{w.active ? 'Pause' : 'Resume'}</button></form>
            <form method="POST" action="?/removeWebhook" use:enhance class="inline"><input type="hidden" name="id" value={w.id} /><button class="btn-ghost btn-sm text-accent-bad hover:text-accent-bad">Remove</button></form>
          </div>
        {/each}
      </div>
    {/if}

    <form method="POST" action="?/addWebhook" use:enhance class="space-y-3 border-t border-bg-border pt-4">
      <div><label class="label" for="wu">Endpoint URL</label><input id="wu" name="url" class="input" placeholder="https://hooks.zapier.com/…" /></div>
      <div>
        <span class="label">Events <span class="text-ink-dim font-normal">(none = all)</span></span>
        <div class="flex gap-3 flex-wrap">
          {#each events as e}
            <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="events" value={e} /> {e}</label>
          {/each}
        </div>
      </div>
      <div><label class="label" for="ws">Signing secret <span class="text-ink-dim font-normal">(optional)</span></label><input id="ws" name="secret" class="input !w-72" placeholder="whsec_…" /></div>
      <button class="btn-primary btn-sm">Add webhook</button>
    </form>
  </div>
</section>
