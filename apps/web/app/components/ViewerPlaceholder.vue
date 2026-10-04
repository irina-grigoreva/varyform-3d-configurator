<script setup lang="ts">
// Lightweight stand-in shown during SSR and while the Three.js viewer chunk downloads.
defineProps<{ error?: string }>()
</script>

<template>
  <div class="viewer-canvas">
    <div v-if="error" class="viewer-error" role="alert">
      3D preview unavailable: {{ error }}
    </div>
    <div v-else class="viewer-loading" role="status">
      <span class="loading-mark" aria-hidden="true" />
      Preparing your model
    </div>
  </div>
</template>
