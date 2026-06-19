<script lang="ts">
  import { enhance } from '$app/forms';
  import { CHANNEL_KINDS, CHANNEL_LABEL } from '$lib/types';
  let { data, form } = $props();
  let replyText = $state('');
  const dot: Record<string, string> = { interested: 'bg-accent-good', maybe: 'bg-sky-500', 'not-interested': 'bg-accent-bad' };
  const chLabel = (k: string) => CHANNEL_LABEL[k as keyof typeof CHANNEL_LABEL] ?? k;
  const qs = (id: string) => `/conversations?c=${id}${data.filter ? '&channel=' + data.filter : ''}`;
</script>

<section>
  <div class="mb-4">
    <h1 class="text-2xl font-semibold tracking-tight">Inbox</h1>
    <p class="text-ink-mute">Replies across all channels — read, tag interest, respond.</p>
  </div>

  <div class="flex gap-2 mb-4 flex-wrap">
    <a href="/conversations" class="chip {data.filter === null ? 'chip-brand' : 'chip-mute'}">All</a>
    {#each CHANNEL_KINDS as c}
      <a href={`/conversations?channel=${c}`} class="chip {data.filter === c ? 'chip-brand' : 'chip-mute'}">{CHANNEL_LABEL[c]}</a>
    {/each}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-[20rem_1fr] gap-4 items-start">
    <!-- conversation list -->
    <div class="card overflow-hidden divide-y divide-bg-border max-h-[72vh] overflow-y-auto">
      {#each data.conversations as c}
        <a href={qs(c.id)} class="block px-3 py-3 row-hover {data.selected?.id === c.id ? 'bg-bg-elev' : ''}">
          <div class="flex items-center gap-2">
            {#if dot[c.interest]}<span class="w-2 h-2 rounded-full shrink-0 {dot[c.interest]}"></span>{/if}
            <span class="font-medium truncate">{c.prospect.name}</span>
            <div class="flex-1"></div>
            <span class="text-[10px] text-ink-dim shrink-0">{new Date(c.lastAt).toLocaleDateString()}</span>
          </div>
          <div class="text-xs text-ink-dim truncate mt-0.5">{c.messages[0]?.body ?? '(no messages)'}</div>
        </a>
      {:else}
        <div class="px-4 py-12 text-center text-ink-mute text-sm">No conversations yet. They appear here when prospects reply (IMAP sync) or you message them.</div>
      {/each}
    </div>

    <!-- thread -->
    {#if data.selected}
      {@const s = data.selected}
      <div class="card flex flex-col max-h-[72vh]">
        <div class="flex items-center gap-2 p-4 border-b border-bg-border">
          <a href={`/prospects/${s.prospectId}`} class="font-semibold hover:text-brand-hi">{s.prospect.name}</a>
          <span class="text-xs text-ink-dim truncate">{s.prospect.company}</span>
          <span class="chip-mute">{chLabel(s.channel.kind)}</span>
          <div class="flex-1"></div>
          <form method="POST" action="?/setInterest" use:enhance class="flex gap-1">
            <input type="hidden" name="prospectId" value={s.prospectId} />
            {#each [['interested', '🙂'], ['maybe', '😐'], ['not-interested', '☹']] as [val, emoji]}
              <button name="interest" value={val} title={val} class="w-8 h-8 rounded-lg text-base border {s.interest === val ? 'border-brand bg-brand/10' : 'border-bg-border hover:bg-bg-elev'}">{emoji}</button>
            {/each}
          </form>
        </div>

        <!-- messages = activity timeline -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3 min-h-[30vh]">
          {#each s.messages as m}
            <div class="flex {m.direction === 'out' ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[80%] rounded-xl px-3 py-2 {m.direction === 'out' ? 'bg-brand/10 border border-brand/20' : 'bg-bg-elev border border-bg-border'}">
                <pre class="whitespace-pre-wrap font-sans text-sm">{m.body}</pre>
                <div class="text-[10px] text-ink-dim mt-1 flex gap-2 flex-wrap">
                  <span>{m.direction === 'out' ? 'sent' : 'received'} · {new Date(m.sentAt ?? m.createdAt).toLocaleString()}</span>
                  {#if m.openedAt}<span class="text-accent-good">opened</span>{/if}
                  {#if m.clickedAt}<span class="text-accent-good">clicked</span>{/if}
                  {#if m.status === 'failed'}<span class="text-accent-bad">failed</span>{/if}
                  {#if m.status === 'draft'}<span class="text-accent-warn">draft</span>{/if}
                </div>
              </div>
            </div>
          {:else}
            <div class="text-center text-ink-mute text-sm py-8">No messages in this conversation yet.</div>
          {/each}
        </div>

        <!-- reply -->
        <div class="border-t border-bg-border p-3">
          {#if form?.error}<div class="text-xs text-accent-bad mb-2">{form.error}</div>{/if}
          {#if form?.ok === 'reply'}<div class="text-xs text-accent-good mb-2">Reply sent.</div>{/if}
          {#if form?.ok === 'reply-draft'}<div class="text-xs text-accent-warn mb-2">Saved as draft — send manually for this channel.</div>{/if}
          <form method="POST" action="?/reply" use:enhance={() => async ({ update }) => { await update(); replyText = ''; }} class="flex gap-2 items-end">
            <input type="hidden" name="conversationId" value={s.id} />
            <textarea name="body" bind:value={replyText} rows="2" class="input flex-1 text-sm" placeholder={s.channel.kind === 'email' ? 'Write a reply…' : 'Draft a reply (send manually for this channel)…'}></textarea>
            <button class="btn-primary">{s.channel.kind === 'email' ? 'Send' : 'Save draft'}</button>
          </form>
          {#if s.channel.kind === 'email' && !data.mailboxCount}<div class="text-[10px] text-accent-warn mt-1">Connect a mailbox under Mailboxes to send replies.</div>{/if}
        </div>
      </div>
    {:else}
      <div class="card grid place-items-center text-ink-mute h-[72vh]">Select a conversation to read &amp; reply.</div>
    {/if}
  </div>
</section>
