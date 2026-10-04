export type MaterialId = 'natural-oak' | 'walnut' | 'matte-white' | 'graphite'
export type LegType = 'none' | 'metal' | 'wood'
export type PartType = 'side' | 'divider' | 'shelf' | 'back' | 'leg'

export interface Configuration {
  width: number
  height: number
  depth: number
  sections: number
  shelves: number
  materialThickness: 18 | 25
  material: MaterialId
  backPanel: boolean
  legs: LegType
}

export interface Dimensions {
  width: number
  height: number
  depth: number
}

export interface Part {
  id: string
  type: PartType
  label: string
  material: MaterialId | 'back-panel' | 'metal'
  dimensions: Dimensions
  position: { x: number; y: number; z: number }
  quantity: number
}

export interface BomItem {
  type: PartType
  label: string
  material: Part['material']
  dimensions: Dimensions
  quantity: number
}

export interface ConfigurationIssue {
  field: keyof Configuration
  message: string
}

export function isConfiguration(value: unknown): value is Configuration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const expectedFields = [
    'width',
    'height',
    'depth',
    'sections',
    'shelves',
    'materialThickness',
    'material',
    'backPanel',
    'legs',
  ]
  if (Object.keys(candidate).length !== expectedFields.length || !expectedFields.every((field) => field in candidate)) {
    return false
  }
  return typeof candidate.width === 'number'
    && typeof candidate.height === 'number'
    && typeof candidate.depth === 'number'
    && typeof candidate.sections === 'number'
    && typeof candidate.shelves === 'number'
    && typeof candidate.materialThickness === 'number'
    && ['natural-oak', 'walnut', 'matte-white', 'graphite'].includes(String(candidate.material))
    && typeof candidate.backPanel === 'boolean'
    && ['none', 'metal', 'wood'].includes(String(candidate.legs))
}

export interface PriceBreakdown {
  materials: number
  hardware: number
  total: number
  currency: 'EUR'
}

const LEG_HEIGHT = 100
const BACK_THICKNESS = 6
export const MIN_SECTION_CLEAR_WIDTH = 120
const MATERIAL_RATES_PER_SQUARE_METER: Record<MaterialId, number> = {
  'natural-oak': 82,
  walnut: 108,
  'matte-white': 58,
  graphite: 64,
}

export const DEFAULT_CONFIGURATION: Configuration = {
  width: 1200,
  height: 1800,
  depth: 350,
  sections: 3,
  shelves: 4,
  materialThickness: 18,
  material: 'natural-oak',
  backPanel: true,
  legs: 'metal',
}

export function validateConfiguration(configuration: Configuration): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = []
  const checkRange = (field: 'width' | 'height' | 'depth', min: number, max: number) => {
    if (!Number.isFinite(configuration[field]) || configuration[field] < min || configuration[field] > max) {
      issues.push({ field, message: `${field} must be between ${min} and ${max} mm` })
    }
  }

  checkRange('width', 600, 2400)
  checkRange('height', 800, 2400)
  checkRange('depth', 250, 600)

  if (!Number.isInteger(configuration.sections) || configuration.sections < 1 || configuration.sections > 5) {
    issues.push({ field: 'sections', message: 'sections must be an integer between 1 and 5' })
  }
  if (!Number.isInteger(configuration.shelves) || configuration.shelves < 2 || configuration.shelves > 8) {
    issues.push({ field: 'shelves', message: 'shelves must be an integer between 2 and 8' })
  }
  if (configuration.materialThickness !== 18 && configuration.materialThickness !== 25) {
    issues.push({ field: 'materialThickness', message: 'materialThickness must be 18 or 25 mm' })
  }
  if (!(configuration.material in MATERIAL_RATES_PER_SQUARE_METER)) {
    issues.push({ field: 'material', message: 'material is not supported' })
  }
  if (!['none', 'metal', 'wood'].includes(configuration.legs)) {
    issues.push({ field: 'legs', message: 'legs type is not supported' })
  }

  if (
    Number.isFinite(configuration.width)
    && Number.isInteger(configuration.sections)
    && configuration.sections >= 1
    && configuration.materialThickness > 0
  ) {
    const clearSectionWidth = (
      configuration.width - (configuration.sections + 1) * configuration.materialThickness
    ) / configuration.sections
    if (clearSectionWidth < MIN_SECTION_CLEAR_WIDTH) {
      issues.push({
        field: 'sections',
        message: `Each section must be at least ${MIN_SECTION_CLEAR_WIDTH} mm wide`,
      })
    }
  }

  return issues
}

function assertValidConfiguration(configuration: Configuration): void {
  const issues = validateConfiguration(configuration)
  if (issues.length > 0) {
    throw new RangeError(`Invalid shelving configuration: ${issues.map((issue) => issue.message).join('; ')}`)
  }
}

export function calculateSectionWidths(configuration: Configuration): number[] {
  assertValidConfiguration(configuration)
  const clearWidth = (configuration.width - (configuration.sections + 1) * configuration.materialThickness) / configuration.sections
  return Array.from({ length: configuration.sections }, () => clearWidth)
}

export function calculateShelfPositions(configuration: Configuration): number[] {
  assertValidConfiguration(configuration)
  const bodyHeight = configuration.height - (configuration.legs === 'none' ? 0 : LEG_HEIGHT)
  const usableHeight = bodyHeight - 2 * configuration.materialThickness
  return Array.from(
    { length: configuration.shelves },
    (_, index) => configuration.materialThickness + (usableHeight * (index + 1)) / (configuration.shelves + 1),
  )
}

export function calculateBoundingDimensions(configuration: Configuration): Dimensions {
  assertValidConfiguration(configuration)
  return { width: configuration.width, height: configuration.height, depth: configuration.depth }
}

export function calculateParts(configuration: Configuration): Part[] {
  assertValidConfiguration(configuration)
  const thickness = configuration.materialThickness
  const bodyHeight = configuration.height - (configuration.legs === 'none' ? 0 : LEG_HEIGHT)
  const bodyBottom = configuration.height - bodyHeight
  const sectionWidths = calculateSectionWidths(configuration)
  const shelfPositions = calculateShelfPositions(configuration)
  const parts: Part[] = []
  const addPart = (
    id: string,
    type: PartType,
    label: string,
    material: Part['material'],
    dimensions: Dimensions,
    position: Part['position'],
  ) => parts.push({ id, type, label, material, dimensions, position, quantity: 1 })

  for (const [index, x] of [
    [-configuration.width / 2 + thickness / 2, 'left'],
    [configuration.width / 2 - thickness / 2, 'right'],
  ] as const) {
    addPart(
      `side-${x}`,
      'side',
      `${x === 'left' ? 'Left' : 'Right'} side`,
      configuration.material,
      { width: thickness, height: bodyHeight, depth: configuration.depth },
      { x: index, y: bodyBottom + bodyHeight / 2, z: 0 },
    )
  }

  const clearWidth = sectionWidths[0] ?? 0
  for (let section = 0; section < configuration.sections; section += 1) {
    const sectionStart = -configuration.width / 2 + thickness + section * (clearWidth + thickness)
    const x = sectionStart + clearWidth / 2
    const shelfDimensions = { width: clearWidth, height: thickness, depth: configuration.depth }
    const bottomY = bodyBottom + thickness / 2
    const topY = bodyBottom + bodyHeight - thickness / 2

    addPart(`shelf-${section + 1}-bottom`, 'shelf', 'Shelf board', configuration.material, shelfDimensions, { x, y: bottomY, z: 0 })
    addPart(`shelf-${section + 1}-top`, 'shelf', 'Shelf board', configuration.material, shelfDimensions, { x, y: topY, z: 0 })
    shelfPositions.forEach((relativeY, shelfIndex) => {
      addPart(
        `shelf-${section + 1}-${shelfIndex + 1}`,
        'shelf',
        'Shelf board',
        configuration.material,
        shelfDimensions,
        { x, y: bodyBottom + relativeY, z: 0 },
      )
    })
  }

  for (let divider = 1; divider < configuration.sections; divider += 1) {
    const x = -configuration.width / 2 + thickness + divider * clearWidth + (divider - 0.5) * thickness
    addPart(
      `divider-${divider}`,
      'divider',
      'Vertical divider',
      configuration.material,
      { width: thickness, height: bodyHeight, depth: configuration.depth },
      { x, y: bodyBottom + bodyHeight / 2, z: 0 },
    )
  }

  if (configuration.backPanel) {
    addPart(
      'back-panel',
      'back',
      'Back panel',
      'back-panel',
      { width: configuration.width, height: bodyHeight, depth: BACK_THICKNESS },
      { x: 0, y: bodyBottom + bodyHeight / 2, z: -configuration.depth / 2 + BACK_THICKNESS / 2 },
    )
  }

  if (configuration.legs !== 'none') {
    const legWidth = configuration.legs === 'metal' ? 28 : 45
    const inset = Math.max(legWidth / 2, 35)
    let legIndex = 1
    for (const x of [-configuration.width / 2 + inset, configuration.width / 2 - inset]) {
      for (const z of [-configuration.depth / 2 + inset, configuration.depth / 2 - inset]) {
        addPart(
          `leg-${legIndex}`,
          'leg',
          configuration.legs === 'metal' ? 'Metal leg' : 'Wood leg',
          configuration.legs === 'metal' ? 'metal' : configuration.material,
          { width: legWidth, height: LEG_HEIGHT, depth: legWidth },
          { x, y: LEG_HEIGHT / 2, z },
        )
        legIndex += 1
      }
    }
  }

  return parts
}

export function calculateBom(parts: Part[]): BomItem[] {
  const grouped = new Map<string, BomItem>()
  for (const part of parts) {
    const key = [part.type, part.material, part.dimensions.width, part.dimensions.height, part.dimensions.depth].join(':')
    const existing = grouped.get(key)
    if (existing) {
      existing.quantity += part.quantity
    } else {
      grouped.set(key, {
        type: part.type,
        label: part.label,
        material: part.material,
        dimensions: part.dimensions,
        quantity: part.quantity,
      })
    }
  }
  return [...grouped.values()]
}

export function calculatePrice(configuration: Configuration, parts = calculateParts(configuration)): PriceBreakdown {
  const areaInSquareMeters = parts
    .filter((part) => part.type !== 'leg')
    .reduce((total, part) => total + (2 * (
      part.dimensions.width * part.dimensions.height
      + part.dimensions.width * part.dimensions.depth
      + part.dimensions.height * part.dimensions.depth
    )) / 1_000_000, 0)
  const materials = Math.round(areaInSquareMeters * MATERIAL_RATES_PER_SQUARE_METER[configuration.material] * 1.65)
  const hardware = configuration.legs === 'none' ? 24 : 68
  return { materials, hardware, total: materials + hardware, currency: 'EUR' }
}

export {
  calculateDrawingBounds,
  calculateFrontDrawingGeometry,
  calculateHorizontalDimension,
  calculateSideDrawingGeometry,
  scaleDrawingViewBox,
  fitDrawingToViewport,
  calculateVerticalDimension,
} from './drawing'
// DXF builders live behind the `@varyform/domain/dxf` entry so the DXF writer
// library is only bundled into the lazily loaded export chunk.
export {
  buildExportFilename,
  buildProjectSheetData,
} from './export'
export type {
  DxfExportDocument,
  DxfViewBounds,
  ExportExtension,
  ProjectSheetBomRow,
  ProjectSheetData,
} from './export'
export type {
  DrawingDimension,
  DrawingPoint,
  DrawingRect,
  DrawingViewBox,
  DrawingViewportSize,
  ElevationDrawingGeometry,
} from './drawing'
