<script setup lang="ts">
import {
  calculateBom,
  calculateBoundingDimensions,
  calculateParts,
  calculatePrice,
  buildExportFilename,
  buildProjectSheetData,
  validateConfiguration,
  type Configuration,
  type ConfigurationIssue,
  type MaterialId,
  type Part,
} from '@varyform/domain'
import type { CreatedProjectResponse, ProjectResponse } from '@varyform/shared'
import ConfigPanel from '~/components/ConfigPanel.vue'
import ExportPanel, { type ExportFormat } from '~/components/ExportPanel.vue'
import TechnicalDrawing from '~/components/TechnicalDrawing.vue'
import ViewerPlaceholder from '~/components/ViewerPlaceholder.vue'
import { downloadFile } from '~/utils/export/downloadFile'
import { useConfiguratorStore } from '~/stores/configurator'
import { createProject, editTokenStorageKey, updateProject } from '~/utils/api/projects'
import { addProjectToWooCommerce } from '~/utils/api/woocommerce'

defineOptions({ name: 'ConfiguratorWorkspace' })

interface ViewerHandle {
  resetCamera: () => void
  captureSnapshot: () => string
}

// Three.js is the heaviest dependency; load it in its own chunk after hydration.
const ConfiguratorViewer = defineAsyncComponent({
  loader: () => import('~/components/ConfiguratorViewer.vue'),
  loadingComponent: ViewerPlaceholder,
  errorComponent: defineComponent({
    props: { error: { type: Error, default: null } },
    setup: (errorProps) => () => h(ViewerPlaceholder, { error: errorProps.error?.message || 'The 3D viewer could not be loaded.' }),
  }),
  delay: 0,
})

const props = withDefaults(defineProps<{
  project?: ProjectResponse | null
  initialEditToken?: string | null
  canEdit?: boolean
  readOnly?: boolean
}>(), {
  project: null,
  initialEditToken: null,
  canEdit: false,
  readOnly: false,
})

const store = useConfiguratorStore()
const configuration = computed(() => store.configuration)
const parts = computed(() => calculateParts(configuration.value))
const bom = computed(() => calculateBom(parts.value))
const price = computed(() => calculatePrice(configuration.value, parts.value))
const dimensions = computed(() => calculateBoundingDimensions(configuration.value))
const viewer = ref<ViewerHandle | null>(null)
const viewMode = ref<'3d' | 'drawing'>('3d')
const debugOpen = ref(false)
const exporting = ref<ExportFormat | null>(null)
const exportError = ref('')
const validationIssues = ref<ConfigurationIssue[]>([])
const activeProject = ref<ProjectResponse | null>(props.project ?? null)
const projectName = ref(props.project?.projectName ?? '')
const editToken = ref(props.initialEditToken)
const isReadOnly = ref(props.readOnly)
const saving = ref(false)
const addingToCart = ref(false)
const saveError = ref('')
const saveNotice = ref('')
const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl
const wordpressUrl = useRuntimeConfig().public.wordpressUrl
const displayPrice = computed(() => isReadOnly.value && activeProject.value ? activeProject.value.price : price.value.total)
const displayBom = computed(() => isReadOnly.value && activeProject.value ? activeProject.value.bom : bom.value)
const shareUrl = computed(() => {
  if (!activeProject.value) return ''
  const origin = import.meta.client ? window.location.origin : ''
  return `${origin}/project/${encodeURIComponent(activeProject.value.id)}`
})
const materialColors: Record<MaterialId, string> = {
  'natural-oak': '#c79b68',
  walnut: '#70482f',
  'matte-white': '#e9e8e3',
  graphite: '#414548',
}
const materialLabels: Record<Part['material'], string> = {
  'natural-oak': 'Natural oak',
  walnut: 'Walnut',
  'matte-white': 'Matte white',
  graphite: 'Graphite',
  'back-panel': 'Back panel',
  metal: 'Metal',
}

const handleUpdate = <K extends keyof Configuration>(field: K, value: Configuration[K]) => {
  const nextConfiguration = { ...configuration.value, [field]: value } as Configuration
  validationIssues.value = validateConfiguration(nextConfiguration)
  if (validationIssues.value.length === 0) {
    store.update(field, value)
  }
}

const onViewModeKeydown = (event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  viewMode.value = event.key === 'Home' ? '3d' : event.key === 'End' ? 'drawing' : viewMode.value === '3d' ? 'drawing' : '3d'
  nextTick(() => document.getElementById(`preview-tab-${viewMode.value}`)?.focus())
}

const formatPrice = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.value.currency, maximumFractionDigits: 0 }).format(value)

const millimetreFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2, useGrouping: false })
const formatMm = (value: number) => `${millimetreFormat.format(value)} mm`

const dimensionsLabel = computed(() =>
  `${dimensions.value.width} × ${dimensions.value.height} × ${dimensions.value.depth} mm`,
)

const exportProject = async (format: ExportFormat) => {
  if (exporting.value !== null) return
  exporting.value = format
  exportError.value = ''

  try {
    await nextTick()
    const filename = buildExportFilename(configuration.value, format)
    if (format === 'dxf') {
      // Export libraries are loaded on first use; the browser caches the module for repeat exports.
      const { buildDxfDocument } = await import('@varyform/domain/dxf')
      const drawing = buildDxfDocument(configuration.value)
      downloadFile(
        new Blob([drawing.content], { type: 'application/dxf;charset=utf-8' }),
        filename,
      )
    } else {
      const snapshot = viewer.value?.captureSnapshot()
      if (!snapshot) throw new Error('The 3D preview is not ready. Wait for the model to finish loading and try again.')
      const projectId = activeProject.value?.id ?? `TMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      const project = buildProjectSheetData(configuration.value, projectId, projectName.value.trim() || null)
      const { buildProjectPdf } = await import('~/utils/export/buildProjectPdf')
      downloadFile(await buildProjectPdf(project, snapshot), filename)
    }
  } catch (error) {
    exportError.value = error instanceof Error
      ? `Export failed: ${error.message}`
      : 'Export failed. Please try again.'
  } finally {
    exporting.value = null
  }
}

const persistProject = async (): Promise<boolean> => {
  if (saving.value || isReadOnly.value) return false
  saving.value = true
  saveError.value = ''
  saveNotice.value = ''
  try {
    if (activeProject.value) {
      if (!editToken.value) throw new Error('This browser does not have an edit token for this project.')
      activeProject.value = await updateProject(apiBaseUrl, activeProject.value.id, {
        configuration: { ...configuration.value },
        projectName: projectName.value,
        editToken: editToken.value,
      })
      saveNotice.value = 'Changes saved.'
    } else {
      const created: CreatedProjectResponse = await createProject(apiBaseUrl, {
        configuration: { ...configuration.value },
        projectName: projectName.value,
      })
      const { editToken: token, ...project } = created
      activeProject.value = project
      editToken.value = token
      localStorage.setItem(editTokenStorageKey(project.id), token)
      saveNotice.value = 'Project saved. Keep this browser to continue editing.'
    }
    return true
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : 'Unable to save this project.'
    return false
  } finally {
    saving.value = false
  }
}

const addToCart = async () => {
  if (addingToCart.value || saving.value || isReadOnly.value) return
  addingToCart.value = true
  saveError.value = ''
  saveNotice.value = ''
  try {
    if (!await persistProject() || !activeProject.value) {
      throw new Error(saveError.value || 'Save the project before adding it to your cart.')
    }
    saveNotice.value = 'Project saved. Adding to cart…'
    const result = await addProjectToWooCommerce(wordpressUrl, activeProject.value.id)
    window.location.assign(result.cartUrl)
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : 'Unable to add this project to the WooCommerce cart.'
  } finally {
    addingToCart.value = false
  }
}

const copyShareUrl = async () => {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    saveNotice.value = 'Share link copied.'
    saveError.value = ''
  } catch (error) {
    saveError.value = error instanceof Error ? `Could not copy link: ${error.message}` : 'Could not copy the share link.'
  }
}

const continueEditing = () => {
  if (!props.canEdit || !editToken.value) {
    saveError.value = 'This browser does not have an edit token for this project.'
    return
  }
  isReadOnly.value = false
  saveError.value = ''
  saveNotice.value = 'Editing enabled in this browser.'
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="VARYFORM home">
        <span class="brand-mark"><span /><span /><span /></span>
        <span class="brand-name">varyform<span>.</span></span>
      </a>
      <div class="topbar-center">
        <span class="breadcrumb-muted">Furniture</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        <span>Modular shelving</span>
      </div>
      <div class="topbar-right">
        <span v-if="activeProject" class="save-status"><span /> Project {{ activeProject.id }}</span>
        <button
          v-if="activeProject"
          class="share-button"
          type="button"
          aria-label="Copy project share link"
          title="Copy project share link"
          @click="copyShareUrl"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <line x1="7" y1="10" x2="13" y2="6.5" />
            <line x1="7" y1="10" x2="13" y2="13.5" />
            <circle cx="15" cy="5.5" r="1.7" />
            <circle cx="5.7" cy="10" r="1.7" />
            <circle cx="13.3" cy="14.5" r="1.7" />
          </svg>
        </button>
      </div>
    </header>

    <div class="workspace">
      <div v-if="isReadOnly" class="shared-project-card">
        <span class="eyebrow">SHARED PROJECT</span>
        <h2>{{ activeProject?.projectName || 'Modular shelving' }}</h2>
        <p>{{ dimensionsLabel }}</p>
        <button v-if="props.canEdit" type="button" class="project-save-button" @click="continueEditing">Continue editing</button>
        <p v-else class="shared-project-card__note">Read-only link · Configuration cannot be changed here.</p>
      </div>
      <ConfigPanel
        v-else
        :configuration="configuration"
        :validation-issues="validationIssues"
        @update="handleUpdate"
      />

      <section class="preview-area" aria-label="Product preview">
        <div class="preview-toolbar">
          <div class="preview-title">
            <span class="live-indicator" />
            <span>Live preview</span>
            <span class="toolbar-divider" />
            <div class="view-mode" role="tablist" aria-label="Preview mode" @keydown="onViewModeKeydown">
              <button
                id="preview-tab-3d"
                type="button"
                role="tab"
                aria-controls="preview-panel-3d"
                :tabindex="viewMode === '3d' ? 0 : -1"
                :aria-selected="viewMode === '3d'"
                :class="{ 'view-mode__tab--active': viewMode === '3d' }"
                @click="viewMode = '3d'"
              >
                3D
              </button>
              <button
                id="preview-tab-drawing"
                type="button"
                role="tab"
                aria-controls="preview-panel-drawing"
                :tabindex="viewMode === 'drawing' ? 0 : -1"
                :aria-selected="viewMode === 'drawing'"
                :class="{ 'view-mode__tab--active': viewMode === 'drawing' }"
                @click="viewMode = 'drawing'"
              >
                Drawing
              </button>
            </div>
          </div>
          <div class="preview-tools">
            <span class="dimension-pill">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5.5h14M3 14.5h14M5 3v5m10-5v5m-10 3v5m10-5v5" /></svg>
              {{ dimensionsLabel }}
            </span>
            <button v-if="viewMode === '3d'" class="icon-button" type="button" aria-label="Reset camera" @click="viewer?.resetCamera()">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 9.8a6.5 6.5 0 1 0 1.7-4.4L3.5 7m0-3.8V7h3.8" /></svg>
            </button>
          </div>
        </div>

        <div
          v-show="viewMode === '3d'"
          id="preview-panel-3d"
          class="model-stage"
          role="tabpanel"
          aria-labelledby="preview-tab-3d"
        >
          <ClientOnly>
            <ConfiguratorViewer ref="viewer" :configuration="configuration" :parts="parts" :dimensions="dimensions" />
            <template #fallback>
              <ViewerPlaceholder />
            </template>
          </ClientOnly>
          <div class="model-caption">
            <span class="caption-line" />
            <span>VARYFORM / SERIES 01</span>
          </div>
          <div class="stage-corner stage-corner--left" />
          <div class="stage-corner stage-corner--right" />
        </div>
        <TechnicalDrawing
          v-show="viewMode === 'drawing'"
          id="preview-panel-drawing"
          role="tabpanel"
          aria-labelledby="preview-tab-drawing"
          :configuration="configuration"
          :parts="parts"
          :dimensions="dimensions"
        />

        <div class="preview-footer">
          <div class="material-note">
            <span class="material-note__swatch" :style="{ backgroundColor: materialColors[configuration.material] }" />
            <span>{{ materialLabels[configuration.material] }}</span>
            <span class="footer-dot">·</span>
            <span>{{ configuration.materialThickness }} mm board</span>
          </div>
          <button class="bom-toggle" type="button" :aria-expanded="debugOpen" @click="debugOpen = !debugOpen">
            {{ debugOpen ? 'Hide' : 'View' }} parts list
            <svg :class="{ 'bom-toggle__chevron--open': debugOpen }" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
        </div>

        <div v-if="debugOpen" class="bom-panel">
          <div class="bom-panel__heading">
            <div><span class="eyebrow">PRODUCTION PREVIEW</span><h3>Parts list</h3></div>
            <span>{{ parts.length }} parts · {{ bom.length }} unique</span>
          </div>
          <div class="bom-table-wrap">
            <table class="bom-table">
              <thead><tr><th>Part</th><th>Qty</th><th>Width</th><th>Height</th><th>Depth / thickness</th><th>Material</th></tr></thead>
              <tbody>
                <tr v-for="item in displayBom" :key="`${item.type}-${item.material}-${item.dimensions.width}-${item.dimensions.height}-${item.dimensions.depth}`">
                  <td>{{ item.label }}</td>
                  <td>{{ item.quantity }}</td>
                  <td>{{ formatMm(item.dimensions.width) }}</td>
                  <td>{{ formatMm(item.dimensions.height) }}</td>
                  <td>{{ formatMm(item.dimensions.depth) }}</td>
                  <td>{{ materialLabels[item.material] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside class="order-summary">
        <section class="project-save-panel" aria-label="Save project">
          <label for="project-name" class="eyebrow">PROJECT NAME</label>
          <input
            id="project-name"
            v-model="projectName"
            type="text"
            maxlength="100"
            placeholder="e.g. Living Room Shelving"
            :disabled="isReadOnly || saving"
          >
          <button
            v-if="!isReadOnly"
            type="button"
            class="project-save-button"
            :disabled="saving"
            @click="persistProject"
          >
            {{ saving ? 'Saving…' : activeProject ? 'Save changes' : 'Save project' }}
          </button>
          <button
            v-if="activeProject && !isReadOnly"
            type="button"
            class="project-cart-button"
            :disabled="saving || addingToCart || !wordpressUrl"
            :aria-busy="addingToCart || saving"
            @click="addToCart"
          >
            {{ saving ? 'Saving…' : addingToCart ? 'Adding to cart…' : 'Add to cart' }}
          </button>
          <p v-if="activeProject && !wordpressUrl && !isReadOnly" class="project-save-panel__hint">
            Set NUXT_PUBLIC_WORDPRESS_URL to connect the WooCommerce shop.
          </p>
          <div v-if="activeProject" class="project-share-info">
            <span class="eyebrow">PROJECT ID</span>
            <strong>{{ activeProject.id }}</strong>
            <a :href="`/project/${encodeURIComponent(activeProject.id)}`">/project/{{ activeProject.id }}</a>
            <button type="button" class="copy-project-link" @click="copyShareUrl">Copy link</button>
          </div>
          <p v-if="saveNotice" class="project-save-panel__success" role="status">{{ saveNotice }}</p>
          <p v-if="saveError" class="project-save-panel__error" role="alert">{{ saveError }}</p>
        </section>
        <div class="summary-top">
          <div><span class="eyebrow">ESTIMATED TOTAL</span><div class="price">{{ formatPrice(displayPrice) }}</div></div>
          <span
            class="price-info"
            role="img"
            aria-label="Preliminary estimate based on materials and hardware"
            title="Preliminary estimate based on materials and hardware"
          >i</span>
        </div>
        <div class="summary-meta">
          <span>Made to order</span>
          <span class="footer-dot">·</span>
          <span>Ships in 3–4 weeks</span>
        </div>
        <ExportPanel :exporting="exporting" :error="exportError" @export="exportProject" />
      </aside>
    </div>
  </main>
</template>
