import {
  calculateBoundingDimensions,
  calculateSectionWidths,
  type Configuration,
  type Dimensions,
  type Part,
  type PartType,
} from './index'

export interface DrawingPoint {
  x: number
  y: number
}

export interface DrawingRect {
  id: string
  type: PartType
  material: Part['material']
  x: number
  y: number
  width: number
  height: number
}

export interface DrawingDimension {
  id: string
  start: DrawingPoint
  end: DrawingPoint
  extensions: { start: DrawingPoint; end: DrawingPoint }[]
  label: string
  labelPosition: DrawingPoint
  labelRotation: number
}

export interface DrawingViewBox {
  x: number
  y: number
  width: number
  height: number
}

export interface DrawingViewportSize {
  width: number
  height: number
}

export interface ElevationDrawingGeometry {
  outline: DrawingRect
  parts: DrawingRect[]
  dimensions: DrawingDimension[]
  viewBox: DrawingViewBox
}

type HorizontalDimensionInput = {
  id: string
  x1: number
  x2: number
  objectY: number
  dimensionY: number
  value: number
}

type VerticalDimensionInput = {
  id: string
  objectX: number
  dimensionX: number
  y1: number
  y2: number
  value: number
}

function dimensionsFor(configuration: Configuration): Dimensions {
  return calculateBoundingDimensions(configuration)
}

function dimensionLabel(value: number): string {
  return `${Number(value.toFixed(2))} mm`
}

export function calculateHorizontalDimension({
  id,
  x1,
  x2,
  objectY,
  dimensionY,
  value,
}: HorizontalDimensionInput): DrawingDimension {
  const aboveObject = dimensionY < objectY
  return {
    id,
    start: { x: x1, y: dimensionY },
    end: { x: x2, y: dimensionY },
    extensions: [
      { start: { x: x1, y: objectY }, end: { x: x1, y: dimensionY } },
      { start: { x: x2, y: objectY }, end: { x: x2, y: dimensionY } },
    ],
    label: dimensionLabel(value),
    labelPosition: { x: (x1 + x2) / 2, y: dimensionY + (aboveObject ? -22 : 55) },
    labelRotation: 0,
  }
}

export function calculateVerticalDimension({
  id,
  objectX,
  dimensionX,
  y1,
  y2,
  value,
}: VerticalDimensionInput): DrawingDimension {
  return {
    id,
    start: { x: dimensionX, y: y1 },
    end: { x: dimensionX, y: y2 },
    extensions: [
      { start: { x: objectX, y: y1 }, end: { x: dimensionX, y: y1 } },
      { start: { x: objectX, y: y2 }, end: { x: dimensionX, y: y2 } },
    ],
    label: dimensionLabel(value),
    labelPosition: { x: dimensionX + 55, y: (y1 + y2) / 2 },
    labelRotation: -90,
  }
}

function projectFrontPart(height: number, part: Part): DrawingRect {
  return {
    id: part.id,
    type: part.type,
    material: part.material,
    x: part.position.x - part.dimensions.width / 2,
    y: height - part.position.y - part.dimensions.height / 2,
    width: part.dimensions.width,
    height: part.dimensions.height,
  }
}

function projectSidePart(dimensions: Dimensions, part: Part): DrawingRect {
  return {
    id: part.id,
    type: part.type,
    material: part.material,
    x: dimensions.depth / 2 - part.position.z - part.dimensions.depth / 2,
    y: dimensions.height - part.position.y - part.dimensions.height / 2,
    width: part.dimensions.depth,
    height: part.dimensions.height,
  }
}

function makeOutline(width: number, height: number, x = 0): DrawingRect {
  return { id: 'overall-outline', type: 'side', material: 'back-panel', x, y: 0, width, height }
}

function uniqueProjectedParts(parts: DrawingRect[]): DrawingRect[] {
  const unique = new Map<string, DrawingRect>()
  for (const part of parts) {
    const key = [part.type, part.x, part.y, part.width, part.height].join(':')
    if (!unique.has(key)) unique.set(key, part)
  }
  return [...unique.values()]
}

export function calculateFrontDrawingGeometry(
  configuration: Configuration,
  parts: Part[],
): ElevationDrawingGeometry {
  const dimensions = dimensionsFor(configuration)
  const halfWidth = dimensions.width / 2
  const frontParts = uniqueProjectedParts(parts
    .filter((part) => ['back', 'side', 'divider', 'shelf', 'leg'].includes(part.type))
    .map((part) => projectFrontPart(dimensions.height, part))
    .sort((first, second) => {
      const order: Record<PartType, number> = { back: 0, leg: 1, side: 2, divider: 2, shelf: 3 }
      return order[first.type] - order[second.type]
    }))

  const shelfGroups = frontParts
    .filter((part) => part.type === 'shelf')
    .reduce((groups, part) => {
      if (!groups.some((group) => Math.abs(group.x - part.x) < 0.01)) groups.push(part)
      return groups
    }, [] as DrawingRect[])
    .sort((first, second) => first.x - second.x)
  const sectionWidths = calculateSectionWidths(configuration)
  const sectionDimensions = shelfGroups.map((shelf, index) =>
    calculateHorizontalDimension({
      id: `section-${index + 1}-width`,
      x1: shelf.x,
      x2: shelf.x + shelf.width,
      objectY: 0,
      dimensionY: -105,
      value: sectionWidths[index] ?? shelf.width,
    }),
  )

  const drawingDimensions = [
    ...sectionDimensions,
    calculateHorizontalDimension({
      id: 'overall-width',
      x1: -halfWidth,
      x2: halfWidth,
      objectY: dimensions.height,
      dimensionY: dimensions.height + 205,
      value: dimensions.width,
    }),
    calculateVerticalDimension({
      id: 'overall-height',
      objectX: halfWidth,
      dimensionX: halfWidth + 190,
      y1: 0,
      y2: dimensions.height,
      value: dimensions.height,
    }),
  ]

  const allShelfPositions = frontParts
    .filter((part) => part.type === 'shelf')
    .map((part) => part.y + part.height / 2)
    .sort((first, second) => first - second)
  const distinctShelfPositions = [...new Set(allShelfPositions)]
  const internalShelfYs = distinctShelfPositions.slice(1, -1)
  const [firstInternalShelfY, secondInternalShelfY] = internalShelfYs
  if (firstInternalShelfY !== undefined && secondInternalShelfY !== undefined) {
    drawingDimensions.push(
      calculateVerticalDimension({
        id: 'shelf-spacing',
        objectX: halfWidth,
        dimensionX: halfWidth + 78,
        y1: firstInternalShelfY,
        y2: secondInternalShelfY,
        value: secondInternalShelfY - firstInternalShelfY,
      }),
    )
  }

  const geometry = {
    outline: makeOutline(dimensions.width, dimensions.height, -halfWidth),
    parts: frontParts,
    dimensions: drawingDimensions,
    viewBox: { x: 0, y: 0, width: dimensions.width, height: dimensions.height },
  }
  geometry.viewBox = calculateDrawingBounds(geometry)
  return geometry
}

export function calculateSideDrawingGeometry(
  configuration: Configuration,
  parts: Part[],
): ElevationDrawingGeometry {
  const dimensions = dimensionsFor(configuration)
  const sideParts = uniqueProjectedParts(parts
    .filter((part) => ['back', 'side', 'shelf', 'leg'].includes(part.type))
    .filter((part) => part.type !== 'side' || part.id === 'side-left')
    .map((part) => projectSidePart(dimensions, part))
    .sort((first, second) => {
      const order: Record<PartType, number> = { back: 0, leg: 1, side: 2, divider: 2, shelf: 3 }
      return order[first.type] - order[second.type]
    }))
  const drawingDimensions = [
    calculateHorizontalDimension({
      id: 'overall-depth',
      x1: 0,
      x2: dimensions.depth,
      objectY: dimensions.height,
      dimensionY: dimensions.height + 205,
      value: dimensions.depth,
    }),
    calculateVerticalDimension({
      id: 'overall-height',
      objectX: dimensions.depth,
      dimensionX: dimensions.depth + 190,
      y1: 0,
      y2: dimensions.height,
      value: dimensions.height,
    }),
  ]
  const geometry = {
    outline: makeOutline(dimensions.depth, dimensions.height),
    parts: sideParts,
    dimensions: drawingDimensions,
    viewBox: { x: 0, y: 0, width: dimensions.depth, height: dimensions.height },
  }
  geometry.viewBox = calculateDrawingBounds(geometry)
  return geometry
}

export function calculateDrawingBounds(
  geometry: Pick<ElevationDrawingGeometry, 'outline' | 'parts' | 'dimensions'>,
): DrawingViewBox {
  const xs: number[] = []
  const ys: number[] = []
  const includePoint = ({ x, y }: DrawingPoint) => {
    xs.push(x)
    ys.push(y)
  }
  const includeRect = (rect: DrawingRect) => {
    xs.push(rect.x, rect.x + rect.width)
    ys.push(rect.y, rect.y + rect.height)
  }

  includeRect(geometry.outline)
  geometry.parts.forEach(includeRect)
  for (const dimension of geometry.dimensions) {
    includePoint(dimension.start)
    includePoint(dimension.end)
    dimension.extensions.forEach(({ start, end }) => {
      includePoint(start)
      includePoint(end)
    })

    const textWidth = dimension.label.length * 30
    const textHeight = 65
    const rotated = Math.abs(dimension.labelRotation % 180) === 90
    const halfWidth = (rotated ? textHeight : textWidth) / 2
    const halfHeight = (rotated ? textWidth : textHeight) / 2
    xs.push(dimension.labelPosition.x - halfWidth, dimension.labelPosition.x + halfWidth)
    ys.push(dimension.labelPosition.y - halfHeight, dimension.labelPosition.y + halfHeight)
  }

  const padding = 24
  const minX = Math.min(...xs) - padding
  const maxX = Math.max(...xs) + padding
  const minY = Math.min(...ys) - padding
  const maxY = Math.max(...ys) + padding
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function fitDrawingToViewport(
  bounds: DrawingViewBox,
  viewport: DrawingViewportSize,
  margin = 32,
): DrawingViewBox {
  if (
    !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || viewport.width <= 0
    || viewport.height <= 0
    || !Number.isFinite(margin)
    || margin < 0
    || viewport.width <= margin * 2
    || viewport.height <= margin * 2
  ) {
    throw new RangeError('Drawing viewport must have positive dimensions larger than its margins')
  }
  if (
    !Number.isFinite(bounds.x)
    || !Number.isFinite(bounds.y)
    || !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
    || bounds.width <= 0
    || bounds.height <= 0
  ) {
    throw new RangeError('Drawing bounds must have finite positive dimensions')
  }

  const scale = Math.min(
    (viewport.width - margin * 2) / bounds.width,
    (viewport.height - margin * 2) / bounds.height,
  )
  const width = viewport.width / scale
  const height = viewport.height / scale
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  }
}

export function scaleDrawingViewBox(viewBox: DrawingViewBox, scale: number): DrawingViewBox {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  const width = viewBox.width / safeScale
  const height = viewBox.height / safeScale
  return {
    x: viewBox.x + (viewBox.width - width) / 2,
    y: viewBox.y + (viewBox.height - height) / 2,
    width,
    height,
  }
}
