import { validateConfiguration, type Configuration } from '../index'

export type ExportExtension = 'dxf' | 'pdf'

const materialSlug: Record<Configuration['material'], string> = {
  'natural-oak': 'oak',
  walnut: 'walnut',
  'matte-white': 'white',
  graphite: 'graphite',
}

export function buildExportFilename(
  configuration: Configuration,
  extension: ExportExtension,
): string {
  const issues = validateConfiguration(configuration)
  if (issues.length > 0) {
    throw new RangeError(`Cannot export invalid configuration: ${issues.map((issue) => issue.message).join('; ')}`)
  }

  return `varyform-${configuration.width}x${configuration.height}-${materialSlug[configuration.material]}.${extension}`
}
