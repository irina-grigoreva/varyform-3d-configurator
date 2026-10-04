<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Configuration, Dimensions, MaterialId, Part } from '@varyform/domain'

const props = defineProps<{
  configuration: Configuration
  parts: Part[]
  dimensions: Dimensions
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const isReady = ref(false)
const viewError = ref<string | null>(null)
let renderer: THREE.WebGLRenderer | undefined
let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let controls: OrbitControls | undefined
let productGroup: THREE.Group | undefined
let floor: THREE.Mesh | undefined
let resizeObserver: ResizeObserver | undefined
let lastVisibleAspect: number | undefined

const palette: Record<MaterialId, string> = {
  'natural-oak': '#c89d6c',
  walnut: '#70482f',
  'matte-white': '#eae9e5',
  graphite: '#45484a',
}

const mmToMeters = (value: number) => value / 1000

const disposeProduct = () => {
  if (!productGroup || !scene) return
  scene.remove(productGroup)
  productGroup.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

const buildProduct = () => {
  if (!scene || !productGroup) return
  disposeProduct()
  productGroup = new THREE.Group()
  productGroup.position.y = -mmToMeters(props.dimensions.height) / 2

  for (const part of props.parts) {
    const width = mmToMeters(part.dimensions.width)
    const height = mmToMeters(part.dimensions.height)
    const depth = mmToMeters(part.dimensions.depth)
    const materialColor = part.material === 'back-panel'
      ? '#b5a992'
      : part.material === 'metal'
        ? '#777d82'
        : palette[part.material]
    const material = new THREE.MeshStandardMaterial({
      color: materialColor,
      roughness: part.material === 'metal' ? 0.34 : 0.72,
      metalness: part.material === 'metal' ? 0.72 : 0,
    })
    const geometry = part.type === 'leg' && props.configuration.legs === 'metal'
      ? new THREE.CylinderGeometry(width * 0.42, width * 0.5, height, 20)
      : new THREE.BoxGeometry(width, height, depth)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(
      mmToMeters(part.position.x),
      mmToMeters(part.position.y),
      mmToMeters(part.position.z),
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    productGroup.add(mesh)
  }
  scene.add(productGroup)
}

const fitCamera = () => {
  if (!camera || !controls) return
  const { width, height, depth } = props.dimensions
  const maxSize = mmToMeters(Math.max(width, height, depth))
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
  const distance = (maxSize / 2) / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.18
  const target = new THREE.Vector3(0, 0, 0)
  camera.position.set(1.25, 0.82, 1.7).normalize().multiplyScalar(distance)
  camera.lookAt(target)
  camera.near = Math.max(0.01, distance / 100)
  camera.far = distance * 100
  camera.updateProjectionMatrix()
  controls.target.copy(target)
  controls.minDistance = Math.max(0.3, maxSize * 0.55)
  controls.maxDistance = maxSize * 7
  controls.update()
  if (floor) floor.position.y = -mmToMeters(height) / 2 - 0.012
}

const resize = () => {
  if (!canvas.value || !renderer || !camera) return
  const { width, height } = canvas.value.getBoundingClientRect()
  if (!width || !height) return
  const aspect = width / height
  renderer.setSize(width, height, false)
  camera.aspect = aspect
  camera.updateProjectionMatrix()
  // Mode switches keep the aspect unchanged; retaining the camera avoids resetting the user's orbit.
  if (lastVisibleAspect === undefined || Math.abs(aspect - lastVisibleAspect) > 0.02) {
    fitCamera()
  }
  lastVisibleAspect = aspect
}

const resetCamera = () => fitCamera()

const captureSnapshot = (): string => {
  if (!scene || !camera || !renderer || !isReady.value) {
    throw new Error('The 3D preview is not ready to capture yet')
  }

  const snapshotRenderer = new THREE.WebGLRenderer({
    canvas: document.createElement('canvas'),
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  })
  try {
    snapshotRenderer.setPixelRatio(1)
    snapshotRenderer.setSize(1600, 2000, false)
    snapshotRenderer.outputColorSpace = THREE.SRGBColorSpace
    snapshotRenderer.toneMapping = THREE.ACESFilmicToneMapping
    snapshotRenderer.toneMappingExposure = 1.18
    snapshotRenderer.shadowMap.enabled = true
    snapshotRenderer.shadowMap.type = THREE.PCFSoftShadowMap

    const snapshotCamera = camera.clone()
    snapshotCamera.aspect = 0.8
    snapshotCamera.updateProjectionMatrix()
    snapshotRenderer.render(scene, snapshotCamera)
    const image = snapshotRenderer.domElement.toDataURL('image/png')
    if (image === 'data:,') throw new Error('The browser could not encode the 3D preview image')
    return image
  } finally {
    snapshotRenderer.dispose()
    // dispose() keeps the WebGL context alive; release it so repeated PDF exports
    // never accumulate contexts (browsers cap them at ~16).
    snapshotRenderer.forceContextLoss()
  }
}

onMounted(() => {
  if (!canvas.value) return
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18

    scene = new THREE.Scene()
    scene.background = new THREE.Color('#f1f0ec')
    camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100)
    const hemisphere = new THREE.HemisphereLight('#ffffff', '#b8b1a7', 2.1)
    scene.add(hemisphere)
    const keyLight = new THREE.DirectionalLight('#fff6e8', 3.1)
    keyLight.position.set(3, 5, 4)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.bias = -0.0002
    keyLight.shadow.normalBias = 0.02
    keyLight.shadow.camera.left = -4
    keyLight.shadow.camera.right = 4
    keyLight.shadow.camera.top = 4
    keyLight.shadow.camera.bottom = -4
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight('#e3eaf5', 1.2)
    fillLight.position.set(-4, 2, -3)
    scene.add(fillLight)
    productGroup = new THREE.Group()
    scene.add(productGroup)

    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#f1f0ec', roughness: 0.95 })
    floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    controls = new OrbitControls(camera, canvas.value)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.enablePan = false
    controls.minPolarAngle = 0.25
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    renderer.setAnimationLoop(() => {
      controls?.update()
      if (scene && camera && renderer) renderer.render(scene, camera)
    })
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas.value)
    resize()
    buildProduct()
    isReady.value = true
  } catch (error) {
    viewError.value = error instanceof Error ? error.message : 'Unable to start the 3D viewer.'
  }
})

watch(() => [props.parts, props.configuration.material, props.configuration.legs], buildProduct)
watch(() => props.dimensions, fitCamera, { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  controls?.dispose()
  renderer?.setAnimationLoop(null)
  disposeProduct()
  if (floor) {
    floor.geometry.dispose()
    const materials = Array.isArray(floor.material) ? floor.material : [floor.material]
    materials.forEach((material) => material.dispose())
  }
  renderer?.dispose()
  renderer?.forceContextLoss()
})

defineExpose({ resetCamera, captureSnapshot })
</script>

<template>
  <div class="viewer-canvas">
    <canvas ref="canvas" aria-label="Interactive 3D model of your modular shelving" />
    <div v-if="!isReady && !viewError" class="viewer-loading">
      <span class="loading-mark" />
      Preparing your model
    </div>
    <div v-if="viewError" class="viewer-error">
      3D preview unavailable: {{ viewError }}
    </div>
    <div class="viewer-controls-hint">
      <span class="mouse-icon" />
      Drag to rotate <span class="hint-separator">·</span> Scroll to zoom
    </div>
    <button class="reset-camera" type="button" aria-label="Reset camera" @click="resetCamera">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 9.8a6.5 6.5 0 1 0 1.7-4.4L3.5 7m0-3.8V7h3.8" /></svg>
      Reset view
    </button>
  </div>
</template>
