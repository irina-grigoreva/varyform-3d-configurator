<script setup lang="ts">
import type { ElevationDrawingGeometry, MaterialId } from '@varyform/domain'
import ElevationSvg from './ElevationSvg.vue'

defineProps<{
  geometry: ElevationDrawingGeometry
  viewBox: { x: number; y: number; width: number; height: number }
  material: MaterialId
}>()
</script>

<template>
  <ElevationSvg
    :geometry="geometry"
    :view-box="viewBox"
    :material="material"
    title="Side elevation technical drawing"
  />
</template>
