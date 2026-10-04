<script setup lang="ts">
import {
  calculateDrawingBounds,
  calculateFrontDrawingGeometry,
  calculateSideDrawingGeometry,
  fitDrawingToViewport,
  scaleDrawingViewBox,
  type Configuration,
  type Dimensions,
  type DrawingViewportSize,
  type ElevationDrawingGeometry,
  type Part,
} from '@varyform/domain'
import FrontElevation from './FrontElevation.vue'
import SideElevation from './SideElevation.vue'

const props = defineProps<{
  configuration: Configuration
  parts: Part[]
  dimensions: Dimensions
}>()

type Elevation = 'front' | 'side'

const elevation = ref<Elevation>('front')
const zoom = ref(1)
const stage = ref<HTMLDivElement | null>(null)
const viewportSize = ref<DrawingViewportSize | null>(null)
let resizeObserver: ResizeObserver | undefined
const frontGeometry = computed(() => calculateFrontDrawingGeometry(props.configuration, props.parts))
const sideGeometry = computed(() => calculateSideDrawingGeometry(props.configuration, props.parts))
const geometry = computed<ElevationDrawingGeometry>(() =>
  elevation.value === 'front' ? frontGeometry.value : sideGeometry.value,
)
const fittedViewBox = computed(() => {
  if (!viewportSize.value) return geometry.value.viewBox
  return fitDrawingToViewport(
    calculateDrawingBounds(geometry.value),
    viewportSize.value,
  )
})
const viewBox = computed(() => scaleDrawingViewBox(fittedViewBox.value, zoom.value))
const scale = (factor: number) => {
  zoom.value = Math.min(3, Math.max(0.5, zoom.value * factor))
}

onMounted(() => {
  if (!stage.value) return
  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry || entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return
    viewportSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  resizeObserver.observe(stage.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="technical-drawing model-stage">
    <header class="drawing-toolbar">
      <div class="elevation-tabs" role="tablist" aria-label="Drawing elevation">
        <button
          type="button"
          role="tab"
          :aria-selected="elevation === 'front'"
          :class="{ 'elevation-tab--active': elevation === 'front' }"
          @click="elevation = 'front'; zoom = 1"
        >
          Front
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="elevation === 'side'"
          :class="{ 'elevation-tab--active': elevation === 'side' }"
          @click="elevation = 'side'; zoom = 1"
        >
          Side
        </button>
      </div>
      <div class="drawing-actions">
        <button type="button" aria-label="Zoom out" :disabled="zoom <= 0.5" @click="scale(0.8)">−</button>
        <button type="button" aria-label="Zoom in" :disabled="zoom >= 3" @click="scale(1.25)">+</button>
        <button class="fit-drawing" type="button" @click="zoom = 1">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4M3 3l5 5m9-5-5 5m5 9-5-5m-9 5 5-5" /></svg>
          Fit drawing
        </button>
      </div>
    </header>
    <div ref="stage" class="elevation-stage">
      <FrontElevation
        v-if="elevation === 'front'"
        :geometry="frontGeometry"
        :view-box="viewBox"
        :material="configuration.material"
      />
      <SideElevation
        v-else
        :geometry="sideGeometry"
        :view-box="viewBox"
        :material="configuration.material"
      />
      <div class="drawing-stamp">
        <span class="caption-line" />
        <span>VARYFORM / {{ elevation === 'front' ? 'FRONT ELEVATION' : 'SIDE ELEVATION' }}</span>
      </div>
    </div>
    <footer class="drawing-footer">
      <span>ALL DIMENSIONS IN MM</span>
      <span>{{ dimensions.width }} × {{ dimensions.height }} × {{ dimensions.depth }}</span>
    </footer>
  </div>
</template>
