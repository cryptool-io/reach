<script lang="ts">
  import { enhance } from '$app/forms';
  import { CHANNEL_LABEL, STAGES, STAGE_LABEL } from '$lib/types';

  let { data, form } = $props();
  let { campaign, enrollments, prospects, queue, stats, tab } = $derived(data);

  const STEP_CHANNELS = [
    { v: 'email', l: 'Email' },
    { v: 'linkedin-connect', l: 'LinkedIn — connect' },
    { v: 'linkedin-dm', l: 'LinkedIn — message' },
    { v: 'call', l: 'Call (task)' },
    { v: 'sms', l: 'SMS' },
    { v: 'manual', l: 'Manual task' }
  ];
  const CONDITIONS = [
    { v: 'always', l: 'Always send' },
    { v: 'if-no-reply', l: 'If no reply' },
    { v: 'if-no-open', l: 'If not opened' },
    { v: 'if-opened', l: 'If opened' },
    { v: 'if-clicked', l: 'If clicked' }
  ];
  const DAYS = [
    { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' },
    { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' }
  ];

  let sendDays = $derived(JSON.parse(campaign.sendDaysJson) as number[]);
  const tabs = ['sequence', 'delivery', 'prospects', 'queue', 'stats'];

  function copy(s: string) {
    navigator.clipboard.writeText(s);
  }

  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  let stepFunnel = $derived(
    campaign.steps.map((s) => {
      const agg = s.versions.reduce(
        (a, v) => ({ sent: a.sent + v.sent, opened: a.opened + v.opened, clicked: a.clicked + v.clicked, replied: a.replied + v.replied }),
        { sent: 0, opened: 0, clicked: 0, replied: 0 }
      );
      let winner: string | null = null;
      if (s.versions.length > 1) {
        const ranked = s.versions
          .filter((v) => v.sent > 0)
          .sort((a, b) => b.replied / b.sent - a.replied / a.sent || b.opened / b.sent - a.opened / a.sent);
        winner = ranked[0]?.label ?? null;
      }
      return { order: s.order, channel: s.channel, condition: s.condition, waitForCondition: s.waitForCondition, waitTimeoutHours: s.waitTimeoutHours, onTimeout: s.onTimeout, agg, versions: s.versions, winner };
    })
  );
  const SNIPPETS = [
    '{{first_name}}',
    '{{name}}',
    '{{company}}',
    '{{role}}',
    '{{email}}',
    ...data.fieldKeys.map((k: string) => `{{custom.${k}}}`)
  ];
</script>

<section>
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <a href="/campaigns" class="text-xs text-ink-dim hover:text-ink-mute">← Campaigns</a>
      <h1 class="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
    </div>
    <div class="flex items-center gap-2">
      <span class="chip-mute">{campaign.status}</span>
      <form method="POST" action="?/setStatus" use:enhance class="flex gap-1">
        {#if campaign.status !== 'running'}
          <button name="status" value="running" class="btn-primary">▶ Start</button>
        {/if}
        {#if campaign.status === 'running'}
          <button name="status" value="paused" class="btn-outline">⏸ Pause</button>
        {/if}
        {#if campaign.status !== 'draft'}
          <button name="status" value="draft" class="btn-ghost">Draft</button>
        {/if}
      </form>
    </div>
  </div>

  {#if campaign.status === 'running'}
    <div class="chip-good mb-4 inline-flex">Manual mode — sending is human-confirmed from the Queue. Flip the channel to Auto in Settings to let cadences fire.</div>
  {/if}

  <!-- Tabs -->
  <div class="flex gap-1 border-b border-bg-border mb-5">
    {#each tabs as t}
      <a href={`?tab=${t}`} class="px-4 py-2 text-sm capitalize border-b-2 -mb-px {tab === t ? 'border-brand text-ink' : 'border-transparent text-ink-mute hover:text-ink'}">{t}</a>
    {/each}
  </div>

  {#if form?.error}<div class="card p-3 mb-4 text-sm text-accent-bad">{form.error}</div>{/if}
  {#if form?.ok === 'enroll'}<div class="card p-3 mb-4 text-sm text-accent-good">Enrolled {form.added}{form.skipped ? `, skipped ${form.skipped} duplicate(s)` : ''}.</div>{/if}
  {#if form?.ok === 'sent'}<div class="card p-3 mb-4 text-sm text-accent-good">Step sent / drafted and sequence advanced.</div>{/if}

  <!-- ── SEQUENCE ─────────────────────────────────────────────── -->
  {#if tab === 'sequence'}
    <div class="mb-3 text-xs text-ink-dim">
      Snippets: {#each SNIPPETS as s}<button class="chip-mute mr-1 mb-1" onclick={() => copy(s)}>{s}</button>{/each} · click to copy ·
      add a fallback with <code>{`{{first_name|there}}`}</code> so blank fields read cleanly.
    </div>
    <div class="space-y-4">
      {#each campaign.steps as step, i}
        <div class="card p-4">
          <div class="flex items-center gap-3 mb-3">
            <span class="chip-brand">Step {step.order}</span>
            <form method="POST" action="?/updateStep" use:enhance class="flex items-center gap-2 flex-wrap">
              <input type="hidden" name="stepId" value={step.id} />
              <select name="channel" class="input !py-1 !w-auto" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}>
                {#each STEP_CHANNELS as c}<option value={c.v} selected={step.channel === c.v}>{c.l}</option>{/each}
              </select>
              {#if i > 0}
                <span class="text-xs text-ink-mute">wait</span>
                <input name="delayDays" type="number" min="0" value={step.delayDays} class="input !py-1 !w-16" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()} />
                <span class="text-xs text-ink-mute">days ·</span>
                <select name="condition" class="input !py-1 !w-auto" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}>
                  {#each CONDITIONS as c}<option value={c.v} selected={step.condition === c.v}>{c.l}</option>{/each}
                </select>
                {#if step.condition === 'if-opened' || step.condition === 'if-clicked'}
                  <label class="flex items-center gap-1 text-xs text-ink-mute" title="Park the prospect on this step until the condition is met, instead of skipping it.">
                    <input type="checkbox" name="waitForCondition" checked={step.waitForCondition} onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()} />
                    wait for it
                  </label>
                  {#if step.waitForCondition}
                    <span class="text-xs text-ink-mute">up to</span>
                    <input name="waitTimeoutDays" type="number" min="0" value={Math.round(step.waitTimeoutHours / 24)} class="input !py-1 !w-14" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()} />
                    <span class="text-xs text-ink-mute">days, else</span>
                    <select name="onTimeout" class="input !py-1 !w-auto" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}>
                      <option value="skip" selected={step.onTimeout === 'skip'}>skip step</option>
                      <option value="send" selected={step.onTimeout === 'send'}>send anyway</option>
                    </select>
                  {:else}
                    <input type="hidden" name="waitTimeoutDays" value={Math.round(step.waitTimeoutHours / 24)} />
                    <input type="hidden" name="onTimeout" value={step.onTimeout} />
                  {/if}
                {/if}
              {:else}
                <input type="hidden" name="delayDays" value={step.delayDays} />
                <input type="hidden" name="condition" value="always" />
                <span class="text-xs text-ink-dim">sent first</span>
              {/if}
            </form>
            <div class="flex-1"></div>
            <form method="POST" action="?/deleteStep" use:enhance><input type="hidden" name="stepId" value={step.id} /><button class="btn-ghost text-accent-bad hover:text-accent-bad text-xs">Delete step</button></form>
          </div>

          <!-- A/B versions -->
          <div class="space-y-3 pl-2 border-l-2 border-bg-border">
            {#each step.versions as v}
              <form method="POST" action="?/updateVersion" use:enhance class="space-y-2">
                <input type="hidden" name="versionId" value={v.id} />
                <div class="flex items-center gap-2">
                  <span class="chip-mute">Version {v.label}</span>
                  <span class="text-xs text-ink-dim">{v.sent} sent · {v.opened} opened · {v.replied} replied</span>
                  <div class="flex-1"></div>
                  {#if step.versions.length > 1}
                    <button formaction="?/deleteVersion" class="btn-ghost text-accent-bad hover:text-accent-bad text-xs">Remove</button>
                  {/if}
                  <button class="btn-outline text-xs">Save</button>
                </div>
                {#if step.channel === 'email'}
                  <input name="subject" class="input" placeholder={'Subject — use {{snippets}}'} value={v.subject} />
                {:else}
                  <input type="hidden" name="subject" value={v.subject} />
                {/if}
                <textarea name="body" rows="4" class="input font-mono text-xs" placeholder={'Message body — Hi {{first_name}}, …'}>{v.body}</textarea>
              </form>
            {/each}
            {#if step.versions.length < 5}
              <form method="POST" action="?/addVersion" use:enhance>
                <input type="hidden" name="stepId" value={step.id} />
                <button class="btn-ghost text-xs">+ Add A/B version ({step.versions.length}/5)</button>
              </form>
            {/if}
          </div>
        </div>
      {/each}

      {#if campaign.steps.length < 16}
        <form method="POST" action="?/addStep" use:enhance>
          <button class="btn-outline w-full">+ Add step ({campaign.steps.length}/16)</button>
        </form>
      {/if}
    </div>
  {/if}

  <!-- ── DELIVERY ─────────────────────────────────────────────── -->
  {#if tab === 'delivery'}
    <div class="chip-brand inline-flex mb-4">Sending uses your connected mailboxes (inbox rotation) — add/manage them in <a href="/connections" class="underline ml-1">Connections</a>. Settings below tune cadence + compliance.</div>
    <form method="POST" action="?/updateSettings" use:enhance class="space-y-5 max-w-3xl">
      <div class="card p-5 space-y-4">
        <h3 class="text-sm font-medium">Sending</h3>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="mailbox">Mailbox / sending identity</label><input id="mailbox" name="mailbox" class="input" value={campaign.mailbox} placeholder="jane@acme.com" /></div>
          <div><label class="label" for="dailyLimit">Daily sending limit</label><input id="dailyLimit" name="dailyLimit" type="number" class="input" value={campaign.dailyLimit} /></div>
          <div><label class="label" for="iMin">Interval min (minutes)</label><input id="iMin" name="intervalMinMinutes" type="number" class="input" value={campaign.intervalMinMinutes} /></div>
          <div><label class="label" for="iMax">Interval max (minutes)</label><input id="iMax" name="intervalMaxMinutes" type="number" class="input" value={campaign.intervalMaxMinutes} /></div>
        </div>
        <div>
          <span class="label">Send days</span>
          <div class="flex gap-3 flex-wrap">
            {#each DAYS as d}
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="sendDays" value={d.v} checked={sendDays.includes(d.v)} /> {d.l}</label>
            {/each}
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div><label class="label" for="sf">From</label><input id="sf" name="sendFrom" type="time" class="input" value={campaign.sendFrom} /></div>
          <div><label class="label" for="st">To</label><input id="st" name="sendTo" type="time" class="input" value={campaign.sendTo} /></div>
          <div><label class="label" for="tz">Timezone</label><input id="tz" name="timezone" class="input" value={campaign.timezone} /></div>
        </div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="perProspectTimezone" checked={campaign.perProspectTimezone} /> Match each prospect's timezone</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="adaptiveSending" checked={campaign.adaptiveSending} /> Adaptive sending (detect provider limits, randomize)</label>
      </div>

      <div class="card p-5 space-y-3">
        <h3 class="text-sm font-medium">Conditions</h3>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="stopOnReply" checked={campaign.stopOnReply} /> Stop sequence when a prospect replies</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="stopOnClick" checked={campaign.stopOnClick} /> Stop sequence when a link is clicked</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="autoreplyReschedule" checked={campaign.autoreplyReschedule} /> Reschedule follow-ups on auto-reply (out-of-office)</label>
      </div>

      <div class="card p-5 space-y-3">
        <h3 class="text-sm font-medium">Tracking</h3>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="trackOpens" checked={campaign.trackOpens} /> Track opens</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="trackClicks" checked={campaign.trackClicks} /> Track clicks</label>
        <div><label class="label" for="td">Custom tracking domain</label><input id="td" name="trackingDomain" class="input" value={campaign.trackingDomain} placeholder="track.acme.com" /></div>
        <p class="text-xs text-ink-dim">Open/click tracking activates once a sending integration is wired (post-v0). In manual mode counters stay at 0.</p>
      </div>

      <div class="card p-5 space-y-3">
        <h3 class="text-sm font-medium">Deliverability & compliance</h3>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="warmupEnabled" checked={campaign.warmupEnabled} /> Mailbox warm-up</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="spamCheck" checked={campaign.spamCheck} /> Spam-word & link check before send</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="detectEmptyFields" checked={campaign.detectEmptyFields} /> Don't send if a snippet is empty</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="detectDuplicates" checked={campaign.detectDuplicates} /> Warn on duplicate prospects</label>
        <div><label class="label" for="unsub">Unsubscribe line</label><input id="unsub" name="unsubMessage" class="input" value={campaign.unsubMessage} placeholder="Reply STOP to opt out." /></div>
      </div>

      <button class="btn-primary">Save delivery settings</button>
      {#if form?.ok === 'settings'}<span class="text-sm text-accent-good ml-3">Saved.</span>{/if}
    </form>
  {/if}

  <!-- ── PROSPECTS ────────────────────────────────────────────── -->
  {#if tab === 'prospects'}
    <div class="card p-5 mb-5">
      <h3 class="text-sm font-medium mb-3">Enroll prospects</h3>
      <div class="flex gap-2 flex-wrap items-end">
        <form method="POST" action="?/enroll" use:enhance><input type="hidden" name="mode" value="all" /><button class="btn-outline">Enroll all prospects</button></form>
        <form method="POST" action="?/enroll" use:enhance class="flex gap-2 items-end">
          <input type="hidden" name="mode" value="stage" />
          <div><label class="label" for="es">By stage</label>
            <select id="es" name="stage" class="input !py-1">
              {#each STAGES as s}<option value={s}>{STAGE_LABEL[s]}</option>{/each}
            </select>
          </div>
          <button class="btn-outline">Enroll stage</button>
        </form>
      </div>
    </div>

    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-bg-elev text-ink-mute text-xs uppercase tracking-wider">
          <tr><th class="text-left px-4 py-2 font-medium">Prospect</th><th class="text-left px-4 py-2 font-medium">Status</th><th class="text-left px-4 py-2 font-medium">Interest</th><th class="text-left px-4 py-2 font-medium">Step</th><th class="text-left px-4 py-2 font-medium">Next action</th></tr>
        </thead>
        <tbody>
          {#each enrollments as e}
            <tr class="border-t border-bg-border">
              <td class="px-4 py-2"><a href={`/prospects/${e.prospectId}`} class="font-medium hover:text-brand-hi">{e.prospect.name}</a><div class="text-xs text-ink-dim">{e.prospect.company}</div></td>
              <td class="px-4 py-2"><span class="chip-mute">{e.status}</span>{#if e.status === 'active' && e.waitingSince}<span class="chip-warn ml-1" title="Parked on a wait-step until its condition is met or it times out.">waiting</span>{/if}</td>
              <td class="px-4 py-2"><span class="chip-mute">{e.interest}</span></td>
              <td class="px-4 py-2 text-ink-mute">{e.currentStep}</td>
              <td class="px-4 py-2 text-xs text-ink-dim">{e.nextActionAt ? new Date(e.nextActionAt).toLocaleString() : '—'}</td>
            </tr>
          {:else}
            <tr><td colspan="5" class="px-4 py-10 text-center text-ink-mute">No one enrolled yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- ── QUEUE ────────────────────────────────────────────────── -->
  {#if tab === 'queue'}
    <p class="text-ink-mute mb-4 text-sm">{queue.length} step(s) due now. Review the snippet-rendered message, then send (manual). Sending advances the sequence.</p>
    <div class="space-y-3">
      {#each queue as item}
        <div class="card p-4">
          <div class="flex items-center gap-2 mb-2">
            <a href={`/prospects/${item.prospect.id}`} class="font-medium hover:text-brand-hi">{item.prospect.name}</a>
            <span class="text-ink-dim text-xs">{item.prospect.company}</span>
            <span class="chip-brand">Step {item.stepOrder}</span>
            <span class="chip-mute">{CHANNEL_LABEL[item.channel as keyof typeof CHANNEL_LABEL] ?? item.channel}</span>
            <span class="chip-mute">Version {item.versionLabel}</span>
          </div>
          {#if item.subject}<div class="text-sm font-medium mb-1">{item.subject}</div>{/if}
          <pre class="whitespace-pre-wrap text-sm font-sans text-ink-mute mb-3">{item.body}</pre>
          {#if item.missing.length}
            <div class="chip-warn mb-3 inline-flex">Missing: {item.missing.join(', ')}</div>
          {/if}
          <div class="flex gap-2">
            <button class="btn-ghost" onclick={() => copy(item.subject ? item.subject + '\n\n' + item.body : item.body)}>Copy</button>
            <form method="POST" action="?/sendStep" use:enhance>
              <input type="hidden" name="enrollmentId" value={item.enrollmentId} />
              <input type="hidden" name="versionId" value={item.versionId} />
              <button class="btn-primary">Send & advance</button>
            </form>
            <form method="POST" action="?/markEvent" use:enhance>
              <input type="hidden" name="enrollmentId" value={item.enrollmentId} />
              <input type="hidden" name="event" value="replied" />
              <button class="btn-outline">Mark replied</button>
            </form>
            <form method="POST" action="?/markEvent" use:enhance>
              <input type="hidden" name="enrollmentId" value={item.enrollmentId} />
              <input type="hidden" name="event" value="opted-out" />
              <button class="btn-ghost text-accent-bad hover:text-accent-bad">Opt out</button>
            </form>
          </div>
        </div>
      {:else}
        <div class="card p-6 text-center text-ink-mute">Queue is empty — nothing due. Enroll prospects or wait for follow-up delays.</div>
      {/each}
    </div>
  {/if}

  <!-- ── STATS ────────────────────────────────────────────────── -->
  {#if tab === 'stats'}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {#each [['Enrolled', stats.enrolled], ['Sent', stats.sent], ['Open rate', stats.openRate + '%'], ['Reply rate', stats.replyRate + '%'], ['Opened', stats.opened], ['Clicked', stats.clicked], ['Replied', stats.replied], ['Bounced', stats.bounced], ['Waiting', stats.waiting]] as [label, val]}
        <div class="card p-4"><div class="text-xs uppercase tracking-wider text-ink-mute">{label}</div><div class="text-2xl font-semibold mt-1">{val}</div></div>
      {/each}
    </div>
    <div class="card p-5 mb-6">
      <h3 class="text-sm font-medium mb-3">Per-step funnel</h3>
      <div class="space-y-4">
        {#each stepFunnel as s}
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="chip-brand">Step {s.order}</span>
              <span class="text-xs text-ink-mute">{s.channel}{s.condition !== 'always' ? ` · ${s.condition}` : ''}{s.waitForCondition ? ` · waits up to ${Math.round(s.waitTimeoutHours / 24)}d then ${s.onTimeout === 'send' ? 'sends' : 'skips'}` : ''}</span>
            </div>
            <div class="flex items-center gap-1 text-sm">
              {#each [['Sent', s.agg.sent, null], ['Opened', s.agg.opened, rate(s.agg.opened, s.agg.sent)], ['Clicked', s.agg.clicked, rate(s.agg.clicked, s.agg.sent)], ['Replied', s.agg.replied, rate(s.agg.replied, s.agg.sent)]] as [label, n, pct], i}
                {#if i > 0}<span class="text-ink-dim">→</span>{/if}
                <div class="flex-1 bg-bg-elev rounded-lg px-3 py-2 text-center">
                  <div class="text-lg font-semibold">{n}</div>
                  <div class="text-[10px] uppercase tracking-wider text-ink-dim">{label}{pct !== null ? ` · ${pct}%` : ''}</div>
                </div>
              {/each}
            </div>
            {#if s.versions.length > 1}
              <div class="mt-2 space-y-1">
                {#each s.versions as v}
                  <div class="flex items-center gap-2 text-xs pl-1">
                    <span class="chip-mute">{v.label}</span>
                    {#if s.winner === v.label}<span class="chip-good">winning</span>{/if}
                    <span class="text-ink-dim">{v.sent} sent · {rate(v.opened, v.sent)}% open · {rate(v.clicked, v.sent)}% click · {rate(v.replied, v.sent)}% reply</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <p class="text-xs text-ink-dim mt-3">A/B winner = highest reply rate (tiebreak: open rate), once a step has sends.</p>
    </div>

    <div class="card p-5">
      <h3 class="text-sm font-medium mb-3">Interest (centralized inbox sorting)</h3>
      <div class="flex gap-3 flex-wrap">
        <span class="chip-good">Interested {stats.interested}</span>
        <span class="chip-warn">Maybe {stats.maybe}</span>
        <span class="chip-bad">Not interested {stats.notInterested}</span>
        <span class="chip-mute">Opted out {stats.optedOut}</span>
        <span class="chip-mute">Completed {stats.completed}</span>
        <span class="chip-mute">Active {stats.active}</span>
      </div>
    </div>
  {/if}
</section>
