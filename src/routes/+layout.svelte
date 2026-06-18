<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import Logo from '$lib/Logo.svelte';

  let { data, children } = $props();

  let isDark = $state(false);
  onMount(() => {
    isDark = document.documentElement.classList.contains('dark');
  });
  function toggleTheme() {
    isDark = !isDark;
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('reach-theme', isDark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }

  const nav = [
    { href: '/pipeline', label: 'Pipeline', icon: '⏃' },
    { href: '/prospects', label: 'Prospects', icon: '◴' },
    { href: '/sourcer', label: 'Sourcer', icon: '✷' },
    { href: '/campaigns', label: 'Campaigns', icon: '➤' },
    { href: '/conversations', label: 'Inbox', icon: '✉' },
    { href: '/cadences', label: 'Cadences', icon: '⟳' },
    { href: '/network', label: 'Network', icon: '☍' },
    { href: '/studio', label: 'Studio', icon: '◳' },
    { href: '/mailboxes', label: 'Mailboxes', icon: '@' },
    { href: '/connections', label: 'Connections', icon: '⇆' },
    { href: '/settings', label: 'Settings', icon: '⚙' }
  ];

  async function switchProject(slug: string) {
    await fetch('/api/active-project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug })
    });
    await invalidateAll();
  }

  function isActive(href: string) {
    if (href === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(href);
  }
</script>

{#if $page.url.pathname === '/login'}
  {@render children()}
{:else}
  <div class="min-h-screen flex flex-col">
    <!-- Top bar (Woodpecker-style) -->
    <header class="border-b border-bg-border bg-bg-elev/40">
      <div class="flex items-center gap-3 px-4 h-14">
        <a href="/" class="shrink-0">
          <Logo size={28} />
        </a>

        <!-- Project switcher -->
        <div class="relative group">
          <button class="btn-outline">
            <span class="text-ink-mute text-xs uppercase tracking-wider mr-1">Project</span>
            <span class="font-medium">{data.active?.name ?? 'No project'}</span>
            <span class="text-ink-dim">▾</span>
          </button>
          <div class="absolute left-0 top-full mt-1 w-64 card p-1 hidden group-hover:block group-focus-within:block z-30">
            {#each data.projects as p}
              <button
                class="w-full text-left px-3 py-2 rounded-lg text-sm row-hover {p.id === data.active?.id ? 'bg-bg-elev text-ink' : 'text-ink-mute'}"
                onclick={() => switchProject(p.slug)}
              >
                <div class="font-medium">{p.name}</div>
                <div class="text-xs text-ink-dim">{p.slug} · mode {p.modeDefault}</div>
              </button>
            {/each}
            {#if data.projects.length === 0}
              <div class="px-3 py-2 text-sm text-ink-dim">No projects yet.</div>
            {/if}
            <div class="border-t border-bg-border my-1"></div>
            <a href="/projects" class="block px-3 py-2 rounded-lg text-sm row-hover text-brand-hi">+ New project</a>
          </div>
        </div>

        <div class="flex-1"></div>

        <button onclick={toggleTheme} class="btn-ghost" title="Toggle light / dark" aria-label="Toggle theme">
          {isDark ? '☀' : '☾'}
        </button>
        {#if data.user}
          <span class="text-xs text-ink-dim hidden md:inline" title={data.user.email}>{data.user.email}</span>
          <form method="POST" action="/logout"><button class="btn-ghost text-xs" type="submit">Sign out</button></form>
        {/if}
      </div>

      <!-- Horizontal nav -->
      <nav class="flex items-center gap-1 px-3 overflow-x-auto">
        {#each nav as n}
          <a
            href={n.href}
            class="flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors {isActive(n.href) ? 'border-brand text-ink font-medium' : 'border-transparent text-ink-mute hover:text-ink'}"
          >
            <span class="opacity-60">{n.icon}</span>
            <span>{n.label}</span>
          </a>
        {/each}
      </nav>
    </header>

    <main class="flex-1 overflow-auto p-6">
      {@render children()}
    </main>
  </div>
{/if}
