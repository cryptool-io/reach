<script lang="ts">
  let { data } = $props();
  const W = 720, H = 200, P = 18;
  const SERIES = [
    ['sent', 'Sent', '#16a34a'],
    ['opened', 'Opened', '#0ea5e9'],
    ['clicked', 'Clicked', '#d97706'],
    ['replied', 'Replied', '#7c3aed']
  ] as const;
  let maxY = $derived(Math.max(1, ...data.series.flatMap((d: any) => [d.sent, d.opened, d.clicked, d.replied])));
  const x = (i: number) => P + (i / Math.max(1, data.series.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / maxY) * (H - 2 * P);
  const pts = (key: string) => data.series.map((d: any, i: number) => `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  const statusChip: Record<string, string> = { draft: 'chip-mute', running: 'chip-good', paused: 'chip-warn', completed: 'chip-brand' };
</script>

<section class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Reports</h1>
    <p class="text-ink-mute">Performance across all campaigns in <b>{data.project?.name ?? 'this project'}</b>.</p>
  </div>

  {#if data.totals}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      {#each [['Enrolled', data.totals.enrolled], ['Sent', data.totals.sent], ['Open rate', data.totals.openRate + '%'], ['Reply rate', data.totals.replyRate + '%'], ['Opened', data.totals.opened], ['Clicked', data.totals.clicked], ['Replied', data.totals.replied], ['Interested', data.totals.interested]] as [label, val]}
        <div class="stat"><div class="stat-label">{label}</div><div class="stat-value">{val}</div></div>
      {/each}
    </div>

    <div class="card p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium">Last 30 days</h3>
        <div class="flex gap-3 text-xs">
          {#each SERIES as [key, label, color]}
            <span class="flex items-center gap-1"><span class="w-3 h-0.5 rounded" style="background:{color}"></span>{label}</span>
          {/each}
        </div>
      </div>
      <svg viewBox="0 0 {W} {H}" class="w-full" role="img" aria-label="Activity over the last 30 days">
        {#each [0, 0.5, 1] as g}
          <line x1={P} x2={W - P} y1={H - P - g * (H - 2 * P)} y2={H - P - g * (H - 2 * P)} stroke="rgb(var(--c-bg-border))" stroke-width="1" />
        {/each}
        {#each SERIES as [key, label, color]}
          <polyline fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points={pts(key)} />
        {/each}
      </svg>
      {#if data.totals.sent === 0}
        <p class="text-xs text-ink-dim text-center mt-2">No activity yet — the chart fills in once campaigns start sending.</p>
      {/if}
    </div>

    <div>
      <h3 class="text-sm font-medium mb-2">Campaign comparison</h3>
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
            <tr>
              <th class="text-left px-4 py-2 font-medium">Campaign</th>
              <th class="text-right px-4 py-2 font-medium">Enrolled</th>
              <th class="text-right px-4 py-2 font-medium">Sent</th>
              <th class="text-right px-4 py-2 font-medium">Open</th>
              <th class="text-right px-4 py-2 font-medium">Click</th>
              <th class="text-right px-4 py-2 font-medium">Reply</th>
              <th class="text-right px-4 py-2 font-medium">Interested</th>
            </tr>
          </thead>
          <tbody>
            {#each data.campaigns as c}
              <tr class="border-t border-bg-border row-hover">
                <td class="px-4 py-2"><a href={`/campaigns/${c.id}?tab=stats`} class="font-medium hover:text-brand-hi">{c.name}</a> <span class="{statusChip[c.status] ?? 'chip-mute'} ml-1">{c.status}</span></td>
                <td class="px-4 py-2 text-right tabular-nums">{c.stats.enrolled}</td>
                <td class="px-4 py-2 text-right tabular-nums">{c.stats.sent}</td>
                <td class="px-4 py-2 text-right tabular-nums">{c.stats.openRate}%</td>
                <td class="px-4 py-2 text-right tabular-nums">{rate(c.stats.clicked, c.stats.sent)}%</td>
                <td class="px-4 py-2 text-right tabular-nums">{c.stats.replyRate}%</td>
                <td class="px-4 py-2 text-right tabular-nums">{c.stats.interested}</td>
              </tr>
            {:else}
              <tr><td colspan="7" class="px-4 py-10 text-center text-ink-mute">No campaigns yet.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <div class="card p-6 text-ink-mute">Pick or create a project to see reports.</div>
  {/if}
</section>
