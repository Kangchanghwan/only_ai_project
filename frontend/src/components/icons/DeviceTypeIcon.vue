<script setup>
/** 기기 종류(휴대폰/태블릿/노트북) 선 아이콘 */
defineProps({ type: { type: String, default: '' } })
</script>

<template>
  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="type === 'mobile'">
      <rect x="7" y="2" width="10" height="20" rx="0" />
      <path d="M11 18h2" />
    </template>
    <template v-else-if="type === 'tablet'">
      <rect x="4" y="3" width="16" height="18" rx="0" />
      <path d="M11 17h2" />
    </template>
    <template v-else>
      <rect x="4" y="5" width="16" height="11" rx="0" />
      <path d="M2 20h20" />
    </template>
  </svg>
</template>
