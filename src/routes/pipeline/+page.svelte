<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { STAGE_LABEL } from '$lib/types';

  let { data } = $props();
  let dragging: string | null = null;

  function onDragStart(e: DragEvent, id: string) {
    dragging = id;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }
  async function onDrop(stage: string) {
    if (!dragging) return;
    const form = new FormData();
    form.set('id', dragging);
    form.set('stage', stage);
    await fetch('?/moveStage', { method: 'POST', body: form });
    dragging = null;
    await invalidateAll();
  }
</script>

<section class="mx-auto max-w-7xl">
  <div class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight">Pipeline</h1>
    <p class="text-ink-mute">Drag prospects across stages.</p>
  </div>

  <div class="flex gap-3 overflow-x-auto pb-4">
    {#each data.columns as col}
      <div
        class="w-64 shrink-0 card p-3"
        ondragover={onDragOver}
        ondrop={() => onDrop(col.stage)}
        role="list"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium">{STAGE_LABEL[col.stage]}</h3>
          <span class="chip-mute">{col.total.toLocaleString()}</span>
        </div>
        {#if col.total > col.items.length}
          <div class="text-[10px] text-ink-dim mb-2">showing first {col.items.length}</div>
        {/if}
        <div class="space-y-2 min-h-[60px]">
          {#each col.items as p}
            <a
              href={`/prospects/${p.id}`}
              draggable="true"
              ondragstart={(e) => onDragStart(e, p.id)}
              class="block card p-2 bg-bg-elev hover:border-brand/40 transition-colors cursor-grab active:cursor-grabbing"
            >
              <div class="text-sm font-medium truncate">{p.name}</div>
              <div class="text-xs text-ink-dim truncate">{p.role}{p.role && p.company ? ' · ' : ''}{p.company}</div>
            </a>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>
