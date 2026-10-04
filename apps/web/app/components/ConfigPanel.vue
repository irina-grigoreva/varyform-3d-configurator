<script setup lang="ts">
import type { Configuration, ConfigurationIssue, LegType, MaterialId } from '@varyform/domain'
import ChoiceGroup from './ChoiceGroup.vue'
import MaterialPicker from './MaterialPicker.vue'
import RangeField from './RangeField.vue'

const props = defineProps<{
  configuration: Configuration
  validationIssues: ConfigurationIssue[]
}>()

const emit = defineEmits<{
  update: [field: keyof Configuration, value: Configuration[keyof Configuration]]
}>()

const updateNumber = (field: 'width' | 'height' | 'depth' | 'sections' | 'shelves', value: number) => {
  emit('update', field, value)
}

const updateCount = (field: 'sections' | 'shelves', min: number, max: number, event: Event) => {
  const input = event.target as HTMLInputElement
  const parsedValue = input.value.trim() ? Number(input.value) : props.configuration[field]
  const value = Number.isFinite(parsedValue) ? Math.round(parsedValue) : props.configuration[field]
  const boundedValue = Math.min(max, Math.max(min, value))
  input.value = String(boundedValue)
  updateNumber(field, boundedValue)
}
</script>

<template>
  <aside class="config-panel">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">YOUR CONFIGURATION</span>
        <h1>Modular shelving</h1>
        <p>Make it yours, down to the millimetre.</p>
      </div>
      <span class="product-code">VF—01</span>
    </div>

    <section class="control-section">
      <div class="section-heading">
        <span class="section-index">01</span>
        <h2>Dimensions</h2>
        <span class="section-unit">MM</span>
      </div>
      <div class="dimension-fields">
        <RangeField label="Width" :model-value="configuration.width" :min="600" :max="2400" :step="10" unit="mm" @update:model-value="updateNumber('width', $event)" />
        <RangeField label="Height" :model-value="configuration.height" :min="800" :max="2400" :step="10" unit="mm" @update:model-value="updateNumber('height', $event)" />
        <RangeField label="Depth" :model-value="configuration.depth" :min="250" :max="600" :step="10" unit="mm" @update:model-value="updateNumber('depth', $event)" />
      </div>
    </section>

    <section class="control-section">
      <div class="section-heading">
        <span class="section-index">02</span>
        <h2>Layout</h2>
      </div>
      <div class="split-fields">
        <div class="stepper-field">
          <label for="section-count">Sections</label>
          <div class="stepper">
            <button type="button" aria-label="Remove section" :disabled="configuration.sections <= 1" @click="updateNumber('sections', configuration.sections - 1)">−</button>
            <input id="section-count" type="number" min="1" max="5" :value="configuration.sections" @change="updateCount('sections', 1, 5, $event)">
            <button type="button" aria-label="Add section" :disabled="configuration.sections >= 5" @click="updateNumber('sections', configuration.sections + 1)">+</button>
          </div>
        </div>
        <div class="stepper-field">
          <label for="shelf-count">Shelves per section</label>
          <div class="stepper">
            <button type="button" aria-label="Remove shelf" :disabled="configuration.shelves <= 2" @click="updateNumber('shelves', configuration.shelves - 1)">−</button>
            <input id="shelf-count" type="number" min="2" max="8" :value="configuration.shelves" @change="updateCount('shelves', 2, 8, $event)">
            <button type="button" aria-label="Add shelf" :disabled="configuration.shelves >= 8" @click="updateNumber('shelves', configuration.shelves + 1)">+</button>
          </div>
        </div>
      </div>
      <p v-if="validationIssues.some(issue => issue.field === 'sections')" class="validation-message" role="alert">
        {{ validationIssues.find(issue => issue.field === 'sections')?.message }}
      </p>
      <ChoiceGroup
        label="Board thickness"
        :options="[{ label: '18 mm', value: '18' }, { label: '25 mm', value: '25', hint: 'Heavy duty' }]"
        :model-value="String(configuration.materialThickness)"
        @update:model-value="emit('update', 'materialThickness', Number($event) as Configuration['materialThickness'])"
      />
    </section>

    <section class="control-section">
      <div class="section-heading">
        <span class="section-index">03</span>
        <h2>Finish & details</h2>
      </div>
      <MaterialPicker
        :model-value="configuration.material"
        @update:model-value="emit('update', 'material', $event as MaterialId)"
      />
      <div class="back-panel-toggle">
        <div>
          <strong>Back panel</strong>
          <small>Clean finish & added stability</small>
        </div>
        <button
          type="button"
          class="switch"
          :class="{ 'switch--on': configuration.backPanel }"
          role="switch"
          :aria-checked="configuration.backPanel"
          aria-label="Back panel"
          @click="emit('update', 'backPanel', !configuration.backPanel)"
        >
          <span />
        </button>
      </div>
      <ChoiceGroup
        label="Leg style"
        :options="[{ label: 'None', value: 'none' }, { label: 'Metal', value: 'metal' }, { label: 'Wood', value: 'wood' }]"
        :model-value="configuration.legs"
        @update:model-value="emit('update', 'legs', $event as LegType)"
      />
    </section>

    <div class="panel-footnote">
      <span class="footnote-dot" />
      Made to order · Designed in Copenhagen
    </div>
  </aside>
</template>
