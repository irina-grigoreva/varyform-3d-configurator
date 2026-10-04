<script setup lang="ts">
const props = defineProps<{
  label: string
  modelValue: number
  min: number
  max: number
  step?: number
  unit: string
}>()

const inputId = useId()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const onNumberChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const parsedValue = input.value.trim() ? Number(input.value) : props.modelValue
  const value = Number.isFinite(parsedValue)
    ? Math.min(props.max, Math.max(props.min, parsedValue))
    : props.modelValue
  input.value = String(value)
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="range-field">
    <div class="range-field__top">
      <label :for="inputId">{{ label }}</label>
      <div class="range-field__value">
        <input
          :id="inputId"
          type="number"
          :value="modelValue"
          :min="min"
          :max="max"
          :step="step ?? 1"
          :aria-label="`${label} in ${unit}`"
          @change="onNumberChange"
        >
        <span>{{ unit }}</span>
      </div>
    </div>
    <input
      class="range-field__slider"
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step ?? 1"
      :aria-label="label"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    >
    <div class="range-field__limits">
      <span>{{ min }} {{ unit }}</span>
      <span>{{ max }} {{ unit }}</span>
    </div>
  </div>
</template>
