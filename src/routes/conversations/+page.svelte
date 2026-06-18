<script lang="ts">
  import { CHANNEL_KINDS, CHANNEL_LABEL } from '$lib/types';
  let { data } = $props();
</script>

<section>
  <div class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight">Conversations</h1>
    <p class="text-ink-mute">Unified inbox across all channels.</p>
  </div>

  <div class="flex gap-2 mb-4 flex-wrap">
    <a href="/conversations" class="chip {data.filter === null ? 'chip-brand' : 'chip-mute'}">All</a>
    {#each CHANNEL_KINDS as c}
      <a href={`/conversations?channel=${c}`} class="chip {data.filter === c ? 'chip-brand' : 'chip-mute'}">{CHANNEL_LABEL[c]}</a>
    {/each}
  </div>

  <div class="card overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
        <tr>
          <th class="text-left px-4 py-2 font-medium">Prospect</th>
          <th class="text-left px-4 py-2 font-medium">Channel</th>
          <th class="text-left px-4 py-2 font-medium">Last message</th>
          <th class="text-left px-4 py-2 font-medium">When</th>
        </tr>
      </thead>
      <tbody>
        {#each data.conversations as c}
          <tr class="border-t border-bg-border row-hover cursor-pointer" onclick={() => (window.location.href = `/prospects/${c.prospectId}`)}>
            <td class="px-4 py-2 font-medium">{c.prospect.name}</td>
            <td class="px-4 py-2"><span class="chip-mute">{CHANNEL_LABEL[c.channel.kind as keyof typeof CHANNEL_LABEL] ?? c.channel.kind}</span></td>
            <td class="px-4 py-2 text-ink-mute truncate max-w-md">{c.messages[0]?.body ?? '(empty)'}</td>
            <td class="px-4 py-2 text-xs text-ink-dim">{new Date(c.lastAt).toLocaleString()}</td>
          </tr>
        {:else}
          <tr><td colspan="4" class="px-4 py-10 text-center text-ink-mute">No conversations yet. Draft a message from a prospect detail page.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
