<script setup lang="ts">
import type { MaterialId } from '@varyform/domain'

defineProps<{ modelValue: MaterialId }>()
const emit = defineEmits<{ 'update:modelValue': [value: MaterialId] }>()

const materials: { id: MaterialId; label: string; color: string }[] = [
  { id: 'natural-oak', label: 'Natural oak', color: '#c79b68' },
  { id: 'walnut', label: 'Walnut', color: '#70482f' },
  { id: 'matte-white', label: 'Matte white', color: '#e9e8e3' },
  { id: 'graphite', label: 'Graphite', color: '#414548' },
]
</script>

<template>
  <div class="material-picker">
    <p class="control-label">
      Material & finish
    </p>
    <div class="material-picker__options">
      <button
        v-for="material in materials"
        :key="material.id"
        type="button"
        class="material-swatch"
        :class="{ 'material-swatch--active': modelValue === material.id }"
        :aria-label="material.label"
        :aria-pressed="modelValue === material.id"
        @click="emit('update:modelValue', material.id)"
      >
        <span class="material-swatch__color" :style="{ backgroundColor: material.color }" />
        <span class="material-swatch__label">{{ material.label }}</span>
      </button>
    </div>
  </div>
</template>
