<script lang="ts">
  import { enhance } from '$app/forms';
  import '../../app.css';
  import Logo from '$lib/Logo.svelte';
  let { data, form } = $props();
</script>

<div class="min-h-screen grid place-items-center p-6">
  <div class="w-full max-w-sm">
    <div class="flex justify-center mb-6">
      <Logo size={34} wordmarkClass="text-lg" />
    </div>

    <div class="card p-6">
      {#if data.firstRun}
        <h1 class="text-lg font-semibold mb-1">Create your account</h1>
        <p class="text-sm text-ink-mute mb-4">First run — set up the admin login for this workspace.</p>
        <form method="POST" action="?/register" use:enhance class="space-y-3">
          <div><label class="label" for="email">Email</label><input id="email" name="email" type="email" class="input" required autocomplete="username" /></div>
          <div><label class="label" for="password">Password</label><input id="password" name="password" type="password" class="input" required minlength="8" autocomplete="new-password" placeholder="at least 8 characters" /></div>
          {#if form?.error}<div class="text-sm text-accent-bad">{form.error}</div>{/if}
          <button class="btn-primary w-full" type="submit">Create account & sign in</button>
        </form>
      {:else}
        <h1 class="text-lg font-semibold mb-4">Sign in</h1>
        <form method="POST" action="?/login" use:enhance class="space-y-3">
          <div><label class="label" for="email">Email</label><input id="email" name="email" type="email" class="input" value={form?.email ?? ''} required autocomplete="username" /></div>
          <div><label class="label" for="password">Password</label><input id="password" name="password" type="password" class="input" required autocomplete="current-password" /></div>
          {#if form?.error}<div class="text-sm text-accent-bad">{form.error}</div>{/if}
          <button class="btn-primary w-full" type="submit">Sign in</button>
        </form>
      {/if}
    </div>
  </div>
</div>
