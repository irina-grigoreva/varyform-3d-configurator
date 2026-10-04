<script setup lang="ts">
defineProps<{
  label: string
  options: { label: string; value: string; hint?: string }[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="choice-group">
    <p class="control-label">
      {{ label }}
    </p>
    <div class="choice-group__options">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="choice-option"
        :class="{ 'choice-option--active': modelValue === option.value }"
        :aria-pressed="modelValue === option.value"
        @click="emit('update:modelValue', option.value)"
      >
        <span>{{ option.label }}</span>
        <small v-if="option.hint">{{ option.hint }}</small>
      </button>
    </div>
  </div>
</template>
