<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  let showImport = $state(false);
</script>

<section class="mx-auto max-w-5xl">
  <div class="flex items-center justify-between gap-3 flex-wrap mb-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Network</h1>
      <p class="text-ink-mute">Your connections power the Warm Intro Mapper — on any prospect, Reach surfaces who in your network can introduce you.</p>
    </div>
    <div class="flex gap-2">
      {#if data.count > 0}
        <form method="POST" action="?/clear" use:enhance><button class="btn-ghost text-accent-bad hover:text-accent-bad" onclick={(e) => { if (!confirm('Remove all connections?')) e.preventDefault(); }}>Clear</button></form>
      {/if}
      <button class="btn-primary" onclick={() => (showImport = !showImport)}>{showImport ? 'Cancel' : 'Import connections'}</button>
    </div>
  </div>

  {#if showImport}
    <div class="card p-5 mb-6">
      <p class="text-sm text-ink-mute mb-1">Paste your LinkedIn <code class="text-ink">Connections.csv</code> (Settings → Data Privacy → Get a copy of your data → Connections), or any CSV with name / company / position / email / url columns.</p>
      <p class="text-xs text-ink-dim mb-3">Matching is by company — a connection at the same firm as a prospect shows up as a warm-intro path.</p>
      <form method="POST" action="?/importCsv" use:enhance={() => async ({ update }) => { await update(); showImport = false; }} class="space-y-3">
        <textarea name="csv" rows="8" class="input font-mono text-xs" placeholder={'First Name,Last Name,Company,Position,Email Address,URL\nJane,Roe,Sequoia,Partner,jane@seq.com,https://linkedin.com/in/janeroe'}></textarea>
        <button class="btn-primary" type="submit">Import</button>
      </form>
    </div>
  {/if}

  {#if form?.imported !== undefined}<div class="card p-3 mb-4 text-sm text-accent-good">Imported {form.imported} connections.</div>{/if}
  {#if form?.error}<div class="card p-3 mb-4 text-sm text-accent-bad">{form.error}</div>{/if}

  <div class="card overflow-hidden">
    <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
        <tr><th class="text-left px-4 py-2 font-medium">Name</th><th class="text-left px-4 py-2 font-medium">Company</th><th class="text-left px-4 py-2 font-medium">Title</th></tr>
      </thead>
      <tbody>
        {#each data.connections as c}
          <tr class="border-t border-bg-border">
            <td class="px-4 py-2 font-medium">{c.linkedinUrl ? `${c.name}` : c.name}</td>
            <td class="px-4 py-2 text-ink-mute">{c.company}</td>
            <td class="px-4 py-2 text-ink-mute">{c.title}</td>
          </tr>
        {:else}
          <tr><td colspan="3" class="px-4 py-10 text-center text-ink-mute">No connections yet. Import your LinkedIn export to enable warm-intro paths.</td></tr>
        {/each}
      </tbody>
    </table>
    </div>
  </div>
  {#if data.count > data.connections.length}
    <p class="text-xs text-ink-dim mt-2">Showing {data.connections.length} of {data.count}.</p>
  {/if}
</section>
