import { Colors, DxfWriter, LWPolylineFlags, Units, point3d } from '@tarikjabiri/dxf'
import {
  calculateParts,
  type ElevationDrawingGeometry,
  type DrawingDimension,
  type DrawingPoint,
  type DrawingRect,
  type Configuration,
  type Part,
} from '../../index'
import { calculateDrawingBounds, calculateFrontDrawingGeometry, calculateSideDrawingGeometry } from '../../drawing'
import type { DxfExportDocument, DxfViewBounds } from './dxfTypes'

const LAYERS = ['OUTLINE', 'PANELS', 'SHELVES', 'DIMENSIONS', 'TEXT'] as const
const DXF_TEXT_HEIGHT = 18
const DXF_ARROW_LENGTH = 12
const DXF_ARROW_ANGLE = Math.PI / 7

export function buildFrontDxf(
  configuration: Configuration,
  parts: Part[],
): ElevationDrawingGeometry {
  return calculateFrontDrawingGeometry(configuration, parts)
}

export function buildSideDxf(
  configuration: Configuration,
  parts: Part[],
): ElevationDrawingGeometry {
  return calculateSideDrawingGeometry(configuration, parts)
}

function cadPoint(point: DrawingPoint, height: number, xOffset = 0) {
  return { x: point.x + xOffset, y: height - point.y }
}

function viewBounds(
  geometry: ElevationDrawingGeometry,
  height: number,
  xOffset = 0,
): DxfViewBounds {
  const bounds = calculateDrawingBounds(geometry)
  const x = bounds.x + xOffset
  const y = height - bounds.y - bounds.height
  return {
    x,
    y,
    width: bounds.width,
    height: bounds.height,
    maxX: x + bounds.width,
    maxY: y + bounds.height,
  }
}

function outlineBounds(
  geometry: ElevationDrawingGeometry,
  height: number,
  xOffset = 0,
): DxfViewBounds {
  const outline = geometry.outline
  const x = outline.x + xOffset
  const y = height - outline.y - outline.height
  return {
    x,
    y,
    width: outline.width,
    height: outline.height,
    maxX: x + outline.width,
    maxY: y + outline.height,
  }
}

function addRectangle(writer: DxfWriter, rect: DrawingRect, height: number, xOffset: number, layer: string): void {
  const x1 = rect.x + xOffset
  const x2 = x1 + rect.width
  const y1 = height - rect.y - rect.height
  const y2 = height - rect.y
  writer.setCurrentLayerName(layer)
  writer.addLWPolyline(
    [
      { point: { x: x1, y: y1 } },
      { point: { x: x2, y: y1 } },
      { point: { x: x2, y: y2 } },
      { point: { x: x1, y: y2 } },
    ],
    { flags: LWPolylineFlags.Closed },
  )
}

function addArrow(writer: DxfWriter, tip: DrawingPoint, other: DrawingPoint): void {
  const deltaX = other.x - tip.x
  const deltaY = other.y - tip.y
  const angle = Math.atan2(deltaY, deltaX)
  for (const side of [-1, 1]) {
    const angleAtTip = angle + side * DXF_ARROW_ANGLE
    writer.addLine(
      point3d(tip.x, tip.y),
      point3d(
        tip.x + Math.cos(angleAtTip) * DXF_ARROW_LENGTH,
        tip.y + Math.sin(angleAtTip) * DXF_ARROW_LENGTH,
      ),
      { layerName: 'DIMENSIONS' },
    )
  }
}

function addDimension(writer: DxfWriter, dimension: DrawingDimension, height: number, xOffset: number): void {
  const start = cadPoint(dimension.start, height, xOffset)
  const end = cadPoint(dimension.end, height, xOffset)
  writer.setCurrentLayerName('DIMENSIONS')
  for (const extension of dimension.extensions) {
    const extensionStart = cadPoint(extension.start, height, xOffset)
    const extensionEnd = cadPoint(extension.end, height, xOffset)
    writer.addLine(point3d(extensionStart.x, extensionStart.y), point3d(extensionEnd.x, extensionEnd.y))
  }
  writer.addLine(point3d(start.x, start.y), point3d(end.x, end.y))
  addArrow(writer, start, end)
  addArrow(writer, end, start)

  const label = cadPoint(dimension.labelPosition, height, xOffset)
  writer.setCurrentLayerName('TEXT')
  writer.addText(point3d(label.x, label.y), DXF_TEXT_HEIGHT, dimension.label, {
    rotation: -dimension.labelRotation,
  })
}

function addElevation(
  writer: DxfWriter,
  title: string,
  geometry: ElevationDrawingGeometry,
  height: number,
  xOffset: number,
): void {
  const outline = geometry.outline
  addRectangle(writer, outline, height, xOffset, 'OUTLINE')
  for (const part of geometry.parts) {
    addRectangle(writer, part, height, xOffset, part.type === 'shelf' ? 'SHELVES' : 'PANELS')
  }
  for (const dimension of geometry.dimensions) addDimension(writer, dimension, height, xOffset)

  const bounds = calculateDrawingBounds(geometry)
  writer.setCurrentLayerName('TEXT')
  writer.addText(
    point3d(bounds.x + xOffset, height - bounds.y + 45),
    DXF_TEXT_HEIGHT,
    title,
  )
}

export function buildDxfDocument(configuration: Configuration, parts?: Part[]): DxfExportDocument {
  const drawingParts = parts ?? calculateParts(configuration)
  const front = buildFrontDxf(configuration, drawingParts)
  const side = buildSideDxf(configuration, drawingParts)
  const frontBounds = viewBounds(front, configuration.height)
  const sideBounds = viewBounds(side, configuration.height)
  const sideXOffset = frontBounds.maxX + Math.max(250, configuration.width * 0.15) - sideBounds.x
  const translatedSideBounds = viewBounds(side, configuration.height, sideXOffset)

  const writer = new DxfWriter()
  writer.setUnits(Units.Millimeters)
  writer.addLayer('OUTLINE', Colors.White, 'Continuous')
  writer.addLayer('PANELS', Colors.Cyan, 'Continuous')
  writer.addLayer('SHELVES', Colors.Yellow, 'Continuous')
  writer.addLayer('DIMENSIONS', Colors.Green, 'Continuous')
  writer.addLayer('TEXT', Colors.White, 'Continuous')
  addElevation(writer, 'FRONT ELEVATION', front, configuration.height, 0)
  addElevation(writer, 'SIDE ELEVATION', side, configuration.height, sideXOffset)

  return {
    content: writer.stringify(),
    units: 'millimeters',
    layers: LAYERS,
    views: {
      front: {
        bounds: frontBounds,
        outline: outlineBounds(front, configuration.height),
      },
      side: {
        bounds: translatedSideBounds,
        outline: outlineBounds(side, configuration.height, sideXOffset),
      },
    },
  }
}
