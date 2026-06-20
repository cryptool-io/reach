<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  let tab = $state<'deck' | 'dataroom'>('deck');
  let buildingDeck = $state(false);
  let buildingDr = $state(false);

  function download(title: string, body: string) {
    const blob = new Blob([body], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<section class="mx-auto max-w-4xl">
  <div class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight">Studio</h1>
    <p class="text-ink-mute">Claude builds fundraising assets from your project narrative — a pitch deck and a data-room structure. Outputs are drafts to refine, never invented facts.</p>
  </div>

  {#if !data.project}
    <div class="card p-6 text-ink-mute">Pick or create a project first.</div>
  {:else}
    <div class="flex gap-1 border-b border-bg-border mb-5">
      <button class="px-4 py-2 text-sm border-b-2 -mb-px {tab === 'deck' ? 'border-brand text-ink' : 'border-transparent text-ink-mute'}" onclick={() => (tab = 'deck')}>Pitch Deck Builder</button>
      <button class="px-4 py-2 text-sm border-b-2 -mb-px {tab === 'dataroom' ? 'border-brand text-ink' : 'border-transparent text-ink-mute'}" onclick={() => (tab = 'dataroom')}>Data Room Architect</button>
    </div>

    {#if form?.error}<div class="card p-3 mb-4 text-sm text-accent-bad">{form.error}</div>{/if}

    {#if tab === 'deck'}
      <div class="card p-5 mb-5">
        <form method="POST" action="?/buildDeck" use:enhance={() => { buildingDeck = true; return async ({ update }) => { await update(); buildingDeck = false; }; }} class="space-y-3">
          <label class="label" for="di">Extra input (optional — metrics, the ask, anything to weave in)</label>
          <textarea id="di" name="input" rows="3" class="input text-xs" placeholder="e.g. raising £2M seed, 3 pilots signed, target close in Q3"></textarea>
          <button class="btn-primary" type="submit" disabled={buildingDeck}>{buildingDeck ? 'Building…' : '✨ Build deck'}</button>
          <p class="text-xs text-ink-dim">Generates 10–12 slides (title · bullets · speaker notes). Missing numbers become [PLACEHOLDER] for you to fill — Claude won't invent them.</p>
        </form>
      </div>

      <div class="space-y-3">
        {#each data.decks as d}
          <div class="card p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium">{d.title}</span>
              <div class="flex gap-2">
                <button class="btn-ghost text-xs" onclick={() => download(d.title, d.body)}>↓ .md</button>
                <form method="POST" action="?/deleteAsset" use:enhance><input type="hidden" name="id" value={d.id} /><button class="btn-ghost text-accent-bad hover:text-accent-bad text-xs">Delete</button></form>
              </div>
            </div>
            <pre class="whitespace-pre-wrap text-xs text-ink-mute max-h-72 overflow-auto bg-bg-elev rounded-lg p-3">{d.body}</pre>
          </div>
        {:else}
          <div class="card p-6 text-center text-ink-mute">No decks yet.</div>
        {/each}
      </div>
    {:else}
      <div class="card p-5 mb-5">
        <form method="POST" action="?/buildDataroom" use:enhance={() => { buildingDr = true; return async ({ update }) => { await update(); buildingDr = false; }; }} class="space-y-3">
          <label class="label" for="dri">Stage / context (optional)</label>
          <textarea id="dri" name="input" rows="3" class="input text-xs" placeholder="e.g. seed round, UK Ltd, SaaS, 18 months runway"></textarea>
          <button class="btn-primary" type="submit" disabled={buildingDr}>{buildingDr ? 'Building…' : '✨ Build data-room plan'}</button>
          <p class="text-xs text-ink-dim">Generates a recommended folder structure + a document checklist investors expect.</p>
        </form>
      </div>

      <div class="space-y-3">
        {#each data.plans as d}
          <div class="card p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium">{d.title}</span>
              <div class="flex gap-2">
                <button class="btn-ghost text-xs" onclick={() => download(d.title, d.body)}>↓ .md</button>
                <form method="POST" action="?/deleteAsset" use:enhance><input type="hidden" name="id" value={d.id} /><button class="btn-ghost text-accent-bad hover:text-accent-bad text-xs">Delete</button></form>
              </div>
            </div>
            <pre class="whitespace-pre-wrap text-xs text-ink-mute max-h-72 overflow-auto bg-bg-elev rounded-lg p-3">{d.body}</pre>
          </div>
        {:else}
          <div class="card p-6 text-center text-ink-mute">No data-room plans yet.</div>
        {/each}
      </div>
    {/if}
  {/if}
</section>
