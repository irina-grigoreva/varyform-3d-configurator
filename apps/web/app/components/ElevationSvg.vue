<script setup lang="ts">
import type { ElevationDrawingGeometry, MaterialId } from '@varyform/domain'
import DimensionLine from './DimensionLine.vue'

const props = defineProps<{
  geometry: ElevationDrawingGeometry
  viewBox: { x: number; y: number; width: number; height: number }
  title: string
  material: MaterialId
}>()

const markerId = `drawing-arrow-${useId().replace(/:/g, '')}`
const viewBoxString = computed(
  () => `${props.viewBox.x} ${props.viewBox.y} ${props.viewBox.width} ${props.viewBox.height}`,
)

const fillColors: Record<MaterialId, string> = {
  'natural-oak': '#e5d4bd',
  walnut: '#d5c6b8',
  'matte-white': '#f5f4f0',
  graphite: '#d2d3d1',
}
</script>

<template>
  <svg
    class="elevation-svg"
    :viewBox="viewBoxString"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="title"
    :data-drawing-width="geometry.outline.width"
    :data-drawing-height="geometry.outline.height"
  >
    <title>{{ title }}</title>
    <defs>
      <marker
        :id="markerId"
        viewBox="0 0 8 8"
        refX="4"
        refY="4"
        markerWidth="7"
        markerHeight="7"
        markerUnits="strokeWidth"
        orient="auto-start-reverse"
      >
        <path d="M 8 1 L 1 4 L 8 7" class="dimension-line__arrow" />
      </marker>
      <pattern id="back-panel-hatch" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M-6 6 L6 -6 M0 24 L24 0 M18 30 L30 18" class="drawing-part__hatch" />
      </pattern>
    </defs>

    <rect
      :x="geometry.outline.x"
      :y="geometry.outline.y"
      :width="geometry.outline.width"
      :height="geometry.outline.height"
      class="drawing-outline"
      fill="none"
    />
    <g class="drawing-parts">
      <rect
        v-for="part in geometry.parts"
        :key="part.id"
        :x="part.x"
        :y="part.y"
        :width="part.width"
        :height="part.height"
        :class="`drawing-part drawing-part--${part.type}`"
        :fill="part.type === 'back' ? 'url(#back-panel-hatch)' : part.type === 'leg' ? '#d8d6cf' : fillColors[material]"
        :fill-opacity="part.type === 'back' ? 0.45 : 1"
      />
    </g>
    <g class="drawing-dimensions">
      <DimensionLine
        v-for="dimension in geometry.dimensions"
        :key="dimension.id"
        :dimension="dimension"
        :marker-id="markerId"
      />
    </g>
  </svg>
</template>
