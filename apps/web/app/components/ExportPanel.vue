<script setup lang="ts">
export type ExportFormat = 'pdf' | 'dxf'

defineProps<{
  exporting: ExportFormat | null
  error: string
}>()

const emit = defineEmits<{
  export: [format: ExportFormat]
}>()
</script>

<template>
  <section class="export-panel" aria-label="Export project files">
    <div class="export-panel__heading">
      <span class="eyebrow">PROJECT FILES</span>
      <h2>Export</h2>
    </div>
    <div class="export-panel__actions">
      <button
        type="button"
        :disabled="exporting !== null"
        :aria-busy="exporting === 'pdf'"
        @click="emit('export', 'pdf')"
      >
        <span v-if="exporting === 'pdf'" class="export-spinner" aria-hidden="true" />
        <span v-else class="export-file-icon" aria-hidden="true">PDF</span>
        {{ exporting === 'pdf' ? 'Preparing PDF…' : 'Download PDF' }}
      </button>
      <button
        type="button"
        :disabled="exporting !== null"
        :aria-busy="exporting === 'dxf'"
        @click="emit('export', 'dxf')"
      >
        <span v-if="exporting === 'dxf'" class="export-spinner" aria-hidden="true" />
        <span v-else class="export-file-icon" aria-hidden="true">DXF</span>
        {{ exporting === 'dxf' ? 'Preparing DXF…' : 'Export DXF' }}
      </button>
    </div>
    <p v-if="error" class="export-panel__error" role="alert">{{ error }}</p>
  </section>
</template>
