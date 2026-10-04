import {
  calculateBom,
  calculateBoundingDimensions,
  calculateFrontDrawingGeometry,
  calculateParts,
  calculatePrice,
  calculateSideDrawingGeometry,
  type Configuration,
  type ElevationDrawingGeometry,
  type MaterialId,
  type PriceBreakdown,
} from '../../index'

export interface ProjectSheetBomRow {
  part: string
  quantity: number
  dimensions: string
  material: string
}

export interface ProjectSheetData {
  projectId: string
  projectName: string | null
  configuration: Configuration
  dimensions: { width: number; height: number; depth: number }
  price: PriceBreakdown
  bom: ProjectSheetBomRow[]
  front: ElevationDrawingGeometry
  side: ElevationDrawingGeometry
}

const materialLabel: Record<MaterialId | 'back-panel' | 'metal', string> = {
  'natural-oak': 'Natural Oak',
  walnut: 'Walnut',
  'matte-white': 'Matte White',
  graphite: 'Graphite',
  'back-panel': 'Back Panel',
  metal: 'Metal',
}

function formatDimension(value: number): string {
  return `${Number(value.toFixed(2))}`
}

export function buildProjectSheetData(
  configuration: Configuration,
  projectId: string,
  projectName: string | null = null,
): ProjectSheetData {
  if (!projectId.trim()) throw new RangeError('Project ID is required for the PDF project sheet')
  if (projectName !== null && projectName.length > 100) {
    throw new RangeError('Project name must be 100 characters or fewer')
  }

  const dimensions = calculateBoundingDimensions(configuration)
  const parts = calculateParts(configuration)
  const bom = calculateBom(parts).map((item) => ({
    part: item.label,
    quantity: item.quantity,
    dimensions: `${formatDimension(item.dimensions.width)} x ${formatDimension(item.dimensions.height)} x ${formatDimension(item.dimensions.depth)} mm`,
    material: materialLabel[item.material],
  }))

  return {
    projectId,
    projectName,
    configuration: { ...configuration },
    dimensions,
    price: calculatePrice(configuration, parts),
    bom,
    front: calculateFrontDrawingGeometry(configuration, parts),
    side: calculateSideDrawingGeometry(configuration, parts),
  }
}
