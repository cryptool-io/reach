<script lang="ts">
  // Reach mark: a rising NE arrow (reach / growth / outreach) in a brand-green badge.
  // Badge uses currentColor (text-brand-hi) so it themes light/dark; arrow stays white.
  let { size = 28, wordmark = true, wordmarkClass = '' } = $props();
</script>

<span class="inline-flex items-center gap-2">
  <svg width={size} height={size} viewBox="0 0 32 32" class="text-brand-hi shrink-0" role="img" aria-label="Reach">
    <rect width="32" height="32" rx="7" fill="currentColor" />
    <path d="M9 23 L21 11 M21 11 L14.5 11 M21 11 L21 17.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  {#if wordmark}<span class="font-semibold tracking-tight {wordmarkClass}">Reach</span>{/if}
</span>
