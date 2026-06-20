<script lang="ts">
  import { enhance } from '$app/forms';
  import { CHANNEL_LABEL, MODES } from '$lib/types';

  let { data, form } = $props();
</script>

<section class="mx-auto max-w-4xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
    <p class="text-ink-mute">Project narrative, channels, mode switch, and content assets.</p>
  </div>

  {#if !data.project}
    <div class="card p-6 text-ink-mute">Pick or create a project first.</div>
  {:else}
    <!-- Project -->
    <div class="card p-5">
      <h3 class="text-sm font-medium mb-3">Project</h3>
      <form method="POST" action="?/updateProject" use:enhance class="space-y-3">
        <div><label class="label">Name</label><input name="name" class="input" value={data.project.name} /></div>
        <div>
          <label class="label">Narrative (used by composer)</label>
          <textarea name="narrativeMd" rows="4" class="input font-mono text-xs">{data.project.narrativeMd}</textarea>
        </div>
        <div>
          <label class="label">ICP (used by composer)</label>
          <textarea name="icpMd" rows="3" class="input font-mono text-xs">{data.project.icpMd}</textarea>
        </div>
        <div>
          <label class="label">Default mode</label>
          <select name="modeDefault" class="input">
            {#each MODES as m}<option value={m} selected={data.project.modeDefault === m}>{m}</option>{/each}
          </select>
        </div>
        <button class="btn-primary" type="submit">Save project</button>
      </form>
    </div>

    <!-- Channels -->
    <div class="card p-5">
      <h3 class="text-sm font-medium mb-3">Channels</h3>
      <div class="space-y-2">
        {#each data.channels as ch}
          <form method="POST" action="?/updateChannel" use:enhance class="flex items-center gap-3 p-3 rounded-lg bg-bg-elev">
            <input type="hidden" name="id" value={ch.id} />
            <div class="w-28 font-medium">{CHANNEL_LABEL[ch.kind as keyof typeof CHANNEL_LABEL] ?? ch.kind}</div>
            <div class="flex items-center gap-2">
              <label class="label !mb-0 !mr-1">Mode</label>
              <select name="mode" class="input !py-1 !w-28">
                {#each MODES as m}<option value={m} selected={ch.mode === m}>{m}</option>{/each}
              </select>
            </div>
            <div class="flex items-center gap-2">
              <label class="label !mb-0 !mr-1">Status</label>
              <select name="status" class="input !py-1 !w-36">
                {#each ['disconnected', 'connected', 'error'] as s}
                  <option value={s} selected={ch.status === s}>{s}</option>
                {/each}
              </select>
            </div>
            <div class="flex-1"></div>
            <button class="btn-outline" type="submit">Save</button>
          </form>
        {/each}
      </div>
      <p class="text-xs text-ink-dim mt-3">
        Manual = compose drafts only. Semi = 1-click send. Auto = cadences fire without approval.
        Email opens via <code>mailto:</code> in manual; Gmail OAuth wiring lands post-v0.
      </p>
    </div>

    <!-- Custom fields -->
    <div class="card p-5">
      <h3 class="text-sm font-medium mb-1">Custom fields</h3>
      <p class="text-xs text-ink-dim mb-3">Fields specific to this project. They appear on prospects, in the CSV import template, and as <code>{`{{custom.key}}`}</code> snippets in campaigns.</p>
      <div class="space-y-1 mb-3">
        {#each data.fields as field}
          <div class="flex items-center gap-2 py-1 text-sm">
            <span class="chip-mute w-16 justify-center">{field.type}</span>
            <span class="font-medium">{field.label}</span>
            <span class="text-ink-dim text-xs">{`{{custom.${field.key}}}`}</span>
            <div class="flex-1"></div>
            <form method="POST" action="?/deleteField" use:enhance>
              <input type="hidden" name="key" value={field.key} />
              <button class="btn-ghost text-accent-bad hover:text-accent-bad" type="submit">×</button>
            </form>
          </div>
        {:else}
          <div class="text-sm text-ink-dim">No custom fields yet.</div>
        {/each}
      </div>
      <form method="POST" action="?/addField" use:enhance class="grid grid-cols-12 gap-2">
        <input name="label" class="input col-span-12 sm:col-span-5" placeholder="Field label (e.g. Fund type)" />
        <input name="key" class="input col-span-12 sm:col-span-4" placeholder="key (optional)" />
        <select name="type" class="input col-span-8 sm:col-span-2">
          {#each ['text', 'number', 'url'] as t}<option value={t}>{t}</option>{/each}
        </select>
        <div class="col-span-4 sm:col-span-1"><button class="btn-outline w-full" type="submit">+</button></div>
      </form>
    </div>

    <!-- Messaging / AI prompts -->
    <div class="card p-5">
      <h3 class="text-sm font-medium mb-1">Messaging & agent prompts</h3>
      <p class="text-xs text-ink-dim mb-3">Every Claude prompt this project uses — message composer and the AI agents (intelligence, debrief, sourcer, deck, data room). Edit to match your voice; <code>{`{{narrative}}`}</code>, <code>{`{{icp}}`}</code>, <code>{`{{prospect.name}}`}</code> etc. are filled at run time.</p>
      <div class="space-y-3">
        {#each data.prompts as p}
          <details class="border border-bg-border rounded-lg">
            <summary class="px-3 py-2 cursor-pointer text-sm flex items-center gap-2">
              <span class="chip-mute">{p.group}</span>
              <span class="font-medium">{p.label}</span>
              {#if p.isOverride}<span class="chip-brand">custom</span>{:else}<span class="chip-mute">default</span>{/if}
            </summary>
            <form method="POST" action="?/savePrompt" use:enhance class="p-3 pt-0 space-y-2">
              <input type="hidden" name="slot" value={p.slot} />
              <textarea name="body" rows="8" class="input font-mono text-xs">{p.body}</textarea>
              <div class="flex gap-2">
                <button class="btn-outline" type="submit">Save</button>
                <button class="btn-ghost" type="submit" formaction="?/resetPrompt">Reset to default</button>
              </div>
            </form>
          </details>
        {/each}
      </div>
    </div>

    <!-- Content Assets -->
    <div class="card p-5">
      <h3 class="text-sm font-medium mb-3">Content assets</h3>
      <form method="POST" action="?/addAsset" use:enhance class="grid grid-cols-12 gap-2 mb-4">
        <input name="title" class="input col-span-12 sm:col-span-4" placeholder="Title" />
        <input name="url" class="input col-span-12 sm:col-span-6" placeholder="https://…" />
        <select name="kind" class="input col-span-12 sm:col-span-2">
          {#each ['deck', 'dataroom', 'calendar', 'one-pager', 'link'] as k}<option value={k}>{k}</option>{/each}
        </select>
        <div class="col-span-12"><button class="btn-outline" type="submit">+ Add asset</button></div>
      </form>
      <div class="space-y-1 text-sm">
        {#each data.assets as a}
          <div class="flex items-center gap-2 py-1">
            <span class="chip-mute w-20 justify-center">{a.kind}</span>
            <a href={a.url} target="_blank" rel="noopener" class="text-brand-hi hover:underline truncate">{a.title}</a>
            <span class="text-ink-dim text-xs truncate flex-1">{a.url}</span>
            <form method="POST" action="?/deleteAsset" use:enhance>
              <input type="hidden" name="id" value={a.id} />
              <button class="btn-ghost text-accent-bad hover:text-accent-bad" type="submit">×</button>
            </form>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- AI provider -->
  <div class="card p-5">
    <h3 class="text-sm font-medium mb-1">AI provider</h3>
    {#if data.ai.enabled}
      <p class="text-sm text-ink-mute mb-3">Active: <span class="chip-good">{data.ai.active}</span>{#if data.ai.fallbacks.length} · falls back to {data.ai.fallbacks.join(', ')}{/if}. Powers Composer, Lead Finder, Intelligence, Call Debrief &amp; Studio.</p>
    {:else}
      <p class="text-sm text-ink-mute mb-3">No AI provider configured — the agents (Composer, Lead Finder, Intelligence, Call Debrief, Studio) are <strong>dormant</strong>. Add a <strong>free</strong> key to the server <code>.env</code> and restart.</p>
    {/if}
    <div class="flex flex-wrap gap-2 mb-3">
      {#each data.ai.available as p}
        <span class="chip {p.configured ? 'chip-good' : 'chip-mute'}">{p.label}{p.free ? ' · free' : ''}{p.configured ? ' ✓' : ''}</span>
      {/each}
    </div>
    <p class="text-xs text-ink-dim">Free keys: <a class="text-brand-hi hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Gemini</a> · <a class="text-brand-hi hover:underline" href="https://console.groq.com/keys" target="_blank" rel="noopener">Groq</a> · <a class="text-brand-hi hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noopener">OpenRouter</a> · <a class="text-brand-hi hover:underline" href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener">Mistral</a>. Set one in <code>.env</code> and the app auto-uses it (priority + fallback).</p>
  </div>

  <!-- Account (always available when signed in) -->
  {#if data.user}
    <div class="card p-5">
      <h3 class="text-sm font-medium mb-1">Account</h3>
      <p class="text-xs text-ink-dim mb-3">Signed in as <span class="font-medium text-ink">{data.user.email}</span>. Set your own password below.</p>
      <form method="POST" action="?/changePassword" use:enhance class="grid grid-cols-2 gap-3 max-w-lg">
        <div class="col-span-2 sm:col-span-1"><label class="label" for="cpw">Current password</label><input id="cpw" name="currentPassword" type="password" class="input" autocomplete="current-password" /></div>
        <div class="col-span-2 sm:col-span-1"><label class="label" for="npw">New password</label><input id="npw" name="newPassword" type="password" class="input" minlength="8" autocomplete="new-password" placeholder="at least 8 characters" /></div>
        <div class="col-span-2 flex items-center gap-3">
          <button class="btn-primary" type="submit">Change password</button>
          {#if form?.ok === 'password'}<span class="text-sm text-accent-good">Password updated.</span>{/if}
          {#if form?.pwError}<span class="text-sm text-accent-bad">{form.pwError}</span>{/if}
        </div>
      </form>
    </div>
  {/if}

  <!-- Deployment -->
  <div class="card p-5">
    <h3 class="text-sm font-medium mb-1">Deployment</h3>
    <p class="text-xs text-ink-dim mb-3">Pull the latest <code>main</code> from GitHub, rebuild, and reload the app on the server. Takes ~1–2 minutes; the app restarts at the end.</p>
    {#if data.canDeploy}
      <form method="POST" action="?/deploy" use:enhance class="flex items-center gap-3 flex-wrap">
        <button class="btn-primary" type="submit">⬆ Deploy latest from GitHub</button>
        {#if form?.ok === 'deploy-started'}<span class="text-sm text-accent-good">Deploy started — rebuilding &amp; reloading (~1–2 min). Refresh in a minute to see the log.</span>{/if}
        {#if form?.deployError}<span class="text-sm text-accent-bad">{form.deployError}</span>{/if}
      </form>
    {:else}
      <div class="chip-mute inline-flex">Available on the production server only.</div>
    {/if}
    {#if data.deployLog}
      <div class="mt-4">
        <div class="label">Last deploy log</div>
        <pre class="bg-bg-elev rounded-lg p-3 text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">{data.deployLog}</pre>
      </div>
    {/if}
  </div>
</section>
