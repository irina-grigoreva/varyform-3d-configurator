import { defineStore } from 'pinia'
import { DEFAULT_CONFIGURATION, type Configuration } from '@varyform/domain'

export const useConfiguratorStore = defineStore('configurator', {
  state: (): { configuration: Configuration } => ({
    configuration: { ...DEFAULT_CONFIGURATION },
  }),
  actions: {
    update<K extends keyof Configuration>(field: K, value: Configuration[K]) {
      this.configuration[field] = value
    },
  },
})
