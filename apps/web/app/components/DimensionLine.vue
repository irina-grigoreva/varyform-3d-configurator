<script setup lang="ts">
import type { DrawingDimension } from '@varyform/domain'

defineProps<{
  dimension: DrawingDimension
  markerId: string
}>()
</script>

<template>
  <g class="dimension-line">
    <line
      v-for="(extension, index) in dimension.extensions"
      :key="`${dimension.id}-extension-${index}`"
      class="dimension-line__extension"
      :x1="extension.start.x"
      :y1="extension.start.y"
      :x2="extension.end.x"
      :y2="extension.end.y"
    />
    <line
      class="dimension-line__measure"
      :x1="dimension.start.x"
      :y1="dimension.start.y"
      :x2="dimension.end.x"
      :y2="dimension.end.y"
      :marker-start="`url(#${markerId})`"
      :marker-end="`url(#${markerId})`"
    />
    <text
      class="dimension-line__label"
      :x="dimension.labelPosition.x"
      :y="dimension.labelPosition.y"
      :transform="dimension.labelRotation ? `rotate(${dimension.labelRotation}, ${dimension.labelPosition.x}, ${dimension.labelPosition.y})` : undefined"
      text-anchor="middle"
    >{{ dimension.label }}</text>
  </g>
</template>
