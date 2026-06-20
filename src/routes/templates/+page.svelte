<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  let showNew = $state(false);
  const SNIPPETS = ['{{first_name}}', '{{name}}', '{{company}}', '{{role}}', '{{email}}', ...data.fieldKeys.map((k: string) => `{{custom.${k}}}`)];
  function copy(t: { subject: string; body: string }) {
    navigator.clipboard.writeText(t.subject ? t.subject + '\n\n' + t.body : t.body);
  }
</script>

<section class="mx-auto max-w-4xl space-y-5">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Templates</h1>
      <p class="text-ink-mute">Reusable email copy — write once, copy into any campaign step.</p>
    </div>
    <button class="btn-primary" onclick={() => (showNew = !showNew)}>{showNew ? 'Cancel' : 'New template'}</button>
  </div>

  <div class="text-xs text-ink-dim">Snippets: {#each SNIPPETS as s}<span class="chip-mute mr-1 mb-1 inline-block">{s}</span>{/each} · fallback: <code>{`{{first_name|there}}`}</code></div>

  {#if showNew}
    <div class="card p-4">
      <form method="POST" action="?/create" use:enhance={() => async ({ update }) => { await update(); showNew = false; }} class="space-y-2">
        <input name="name" class="input" placeholder="Template name (e.g. Cold intro — investors)" required />
        <input name="subject" class="input" placeholder={'Subject — e.g. A cleaner way to run {{company}}'} />
        <textarea name="body" rows="6" class="input text-sm" placeholder={'Hi {{first_name}},\n\n…'}></textarea>
        <button class="btn-primary">Create template</button>
      </form>
    </div>
  {/if}

  {#each data.templates as t}
    <div class="card p-4">
      <form method="POST" action="?/update" use:enhance class="space-y-2">
        <input type="hidden" name="id" value={t.id} />
        <div class="flex items-center gap-2">
          <input name="name" class="input !py-1 font-medium" value={t.name} />
          <button type="button" class="btn-ghost btn-sm" onclick={() => copy(t)}>Copy</button>
          <button formaction="?/delete" class="btn-ghost btn-sm text-accent-bad hover:text-accent-bad" onclick={(e) => { if (!confirm('Delete this template?')) e.preventDefault(); }}>Delete</button>
          <button class="btn-outline btn-sm">Save</button>
        </div>
        <input name="subject" class="input" value={t.subject} placeholder="Subject" />
        <textarea name="body" rows="5" class="input text-sm">{t.body}</textarea>
      </form>
    </div>
  {:else}
    <div class="card p-8 text-center text-ink-mute">No templates yet. Create one, then copy it into a campaign step.</div>
  {/each}
</section>
