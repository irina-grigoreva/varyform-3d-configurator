<script setup lang="ts">
import type { ProjectResponse } from '@varyform/shared'
import { editTokenStorageKey, getProject } from '~/utils/api/projects'
import { useConfiguratorStore } from '~/stores/configurator'
import ConfiguratorWorkspace from '~/components/ConfiguratorWorkspace.vue'

const route = useRoute()
const store = useConfiguratorStore()
const project = ref<ProjectResponse | null>(null)
const editToken = ref<string | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl
const projectId = computed(() =>
  Array.isArray(route.params.id) ? route.params.id[0] ?? '' : route.params.id ?? '',
)

useHead(() => ({
  title: project.value?.projectName
    ? `${project.value.projectName} · VARYFORM`
    : 'Shared project · VARYFORM',
}))

onMounted(async () => {
  try {
    const loaded = await getProject(apiBaseUrl, projectId.value)
    store.configuration = { ...loaded.configuration }
    project.value = loaded
    editToken.value = localStorage.getItem(editTokenStorageKey(loaded.id))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load this project.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main v-if="loading" class="project-route-state" aria-live="polite">
    <span class="eyebrow">VARYFORM PROJECT</span>
    <h1>Loading configuration…</h1>
  </main>
  <main v-else-if="errorMessage" class="project-route-state" role="alert">
    <span class="eyebrow">PROJECT UNAVAILABLE</span>
    <h1>We could not open this project.</h1>
    <p>{{ errorMessage }}</p>
    <NuxtLink to="/">Start a new configuration</NuxtLink>
  </main>
  <ConfiguratorWorkspace
    v-else-if="project"
    :project="project"
    :initial-edit-token="editToken"
    :can-edit="Boolean(editToken)"
    read-only
  />
</template>
