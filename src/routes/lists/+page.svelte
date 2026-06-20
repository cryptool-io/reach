<script lang="ts">
  let { data } = $props();
</script>

<section class="mx-auto max-w-5xl space-y-5">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Lists</h1>
    <p class="text-ink-mute">Segments of your prospects. A list is a <b>tag</b> — tag prospects on the Prospects page (select → Add tag) and they group here.</p>
  </div>

  <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
    <a href="/prospects" class="card card-hover p-4 block">
      <div class="text-2xl font-semibold tabular-nums">{data.total.toLocaleString()}</div>
      <div class="text-sm text-ink-mute">All prospects</div>
    </a>
    {#each data.lists as l}
      <a href={`/prospects?tag=${encodeURIComponent(l.tag)}`} class="card card-hover p-4 block">
        <div class="text-2xl font-semibold tabular-nums">{l.count.toLocaleString()}</div>
        <div class="text-sm text-ink-mute truncate" title={l.tag}>{l.tag}</div>
      </a>
    {/each}
  </div>

  {#if !data.lists.length}
    <p class="text-sm text-ink-dim">No tags yet — add tags to prospects (Prospects → select rows → Add tag), or import a CSV with a source tag, and your lists appear here.</p>
  {/if}
</section>
