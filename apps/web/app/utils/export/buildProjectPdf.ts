import {
  buildProjectSheetData,
  calculateDrawingBounds,
  fitDrawingToViewport,
  type DrawingDimension,
  type DrawingPoint,
  type DrawingRect,
  type ElevationDrawingGeometry,
  type MaterialId,
  type ProjectSheetData,
} from '@varyform/domain'

const MATERIAL_COLORS: Record<MaterialId, [number, number, number]> = {
  'natural-oak': [229, 212, 189],
  walnut: [213, 198, 184],
  'matte-white': [245, 244, 240],
  graphite: [210, 211, 209],
}

export { buildProjectSheetData }

/** Shrink long titles (project names up to 100 chars) and ellipsize so they stay inside the margins. */
function fitSingleLine(
  doc: InstanceType<typeof import('jspdf')['jsPDF']>,
  text: string,
  maxWidth: number,
  fontSize: number,
  minFontSize: number,
): string {
  let size = fontSize
  doc.setFontSize(size)
  while (size > minFontSize && doc.getTextWidth(text) > maxWidth) {
    size -= 0.5
    doc.setFontSize(size)
  }
  if (doc.getTextWidth(text) <= maxWidth) return text
  let fitted = text
  while (fitted.length > 1 && doc.getTextWidth(`${fitted}…`) > maxWidth) fitted = fitted.slice(0, -1)
  return `${fitted.trimEnd()}…`
}

function addHeader(doc: InstanceType<typeof import('jspdf')['jsPDF']>, title: string, subtitle: string): void {
  const pageWidth = doc.internal.pageSize.getWidth()
  doc.setTextColor(48, 51, 47)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('VARYFORM', 16, 20)
  doc.setFontSize(8)
  doc.setTextColor(119, 121, 112)
  doc.setFont('helvetica', 'normal')
  doc.text('CUSTOM SHELVING CONFIGURATION', pageWidth - 16, 19, { align: 'right' })
  doc.setDrawColor(217, 217, 210)
  doc.setLineWidth(0.25)
  doc.line(16, 25, pageWidth - 16, 25)
  doc.setTextColor(48, 51, 47)
  doc.setFont('helvetica', 'bold')
  doc.text(fitSingleLine(doc, title, pageWidth - 32, 15, 11), 16, 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(119, 121, 112)
  doc.text(subtitle, 16, 42)
}

function addCoverPage(
  doc: InstanceType<typeof import('jspdf')['jsPDF']>,
  data: ProjectSheetData,
  snapshot: string,
): void {
  addHeader(
    doc,
    data.projectName ?? 'Custom Shelving Configuration',
    `Project ID: ${data.projectId}`,
  )
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(48, 51, 47)
  doc.text('CONFIGURATION', 16, 55)

  const configurationRows: [string, string][] = [
    ['Width', `${data.configuration.width} mm`],
    ['Height', `${data.configuration.height} mm`],
    ['Depth', `${data.configuration.depth} mm`],
    ['Sections', String(data.configuration.sections)],
    ['Shelves per section', String(data.configuration.shelves)],
    ['Material', data.bom.find((row) => row.material !== 'Metal' && row.material !== 'Back Panel')?.material ?? '—'],
    ['Thickness', `${data.configuration.materialThickness} mm`],
    ['Back panel', data.configuration.backPanel ? 'Yes' : 'No'],
    ['Leg type', data.configuration.legs === 'none' ? 'None' : data.configuration.legs],
  ]
  let y = 64
  for (const [label, value] of configurationRows) {
    doc.setDrawColor(230, 230, 224)
    doc.line(16, y + 3, 105, y + 3)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(119, 121, 112)
    doc.text(label, 16, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(48, 51, 47)
    doc.text(value, 105, y, { align: 'right' })
    y += 11
  }

  doc.setFillColor(246, 245, 241)
  doc.roundedRect(16, 171, 89, 34, 2, 2, 'F')
  doc.setTextColor(119, 121, 112)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('CALCULATED PRICE', 22, 182)
  doc.setTextColor(48, 51, 47)
  doc.setFontSize(20)
  doc.text(
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.price.currency, maximumFractionDigits: 0 }).format(data.price.total),
    22,
    197,
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(119, 121, 112)
  doc.text('Preliminary estimate', 99, 197, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(48, 51, 47)
  doc.text('3D PREVIEW', 117, 55)
  doc.setDrawColor(217, 217, 210)
  doc.roundedRect(117, 61, 77, 100, 2, 2, 'S')
  doc.addImage(snapshot, 'PNG', 119, 63, 73, 96, 'configurator-preview', 'MEDIUM')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(119, 121, 112)
  doc.text(
    `${data.dimensions.width} x ${data.dimensions.height} x ${data.dimensions.depth} mm`,
    194,
    168,
    { align: 'right' },
  )
  doc.setDrawColor(217, 217, 210)
  doc.line(16, 270, 194, 270)
  doc.text('VARYFORM  /  CONFIGURATION PROJECT SHEET', 16, 277)
  doc.text('ALL MANUFACTURING DIMENSIONS IN MM', 194, 277, { align: 'right' })
}

function mapPoint(
  point: DrawingPoint,
  viewBox: { x: number; y: number; width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
): DrawingPoint {
  const scale = region.width / viewBox.width
  return {
    x: region.x + (point.x - viewBox.x) * scale,
    y: region.y + (point.y - viewBox.y) * scale,
  }
}

function drawRect(
  doc: InstanceType<typeof import('jspdf')['jsPDF']>,
  rect: DrawingRect,
  viewBox: { x: number; y: number; width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
  material: MaterialId,
  outline = false,
): void {
  const topLeft = mapPoint({ x: rect.x, y: rect.y }, viewBox, region)
  const bottomRight = mapPoint({ x: rect.x + rect.width, y: rect.y + rect.height }, viewBox, region)
  doc.setDrawColor(68, 70, 64)
  doc.setLineWidth(outline ? 0.45 : 0.25)
  if (outline) {
    doc.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y, 'S')
    return
  }
  const fill = rect.type === 'back' ? [242, 241, 236] : rect.type === 'leg' ? [215, 215, 210] : MATERIAL_COLORS[material]
  doc.setFillColor(fill[0]!, fill[1]!, fill[2]!)
  doc.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y, 'FD')
}

function drawArrow(
  doc: InstanceType<typeof import('jspdf')['jsPDF']>,
  tip: DrawingPoint,
  other: DrawingPoint,
): void {
  const angle = Math.atan2(other.y - tip.y, other.x - tip.x)
  const length = 2.2
  const halfAngle = Math.PI / 7
  for (const side of [-1, 1]) {
    const arrowAngle = angle + Math.PI + side * halfAngle
    doc.line(
      tip.x,
      tip.y,
      tip.x + Math.cos(arrowAngle) * length,
      tip.y + Math.sin(arrowAngle) * length,
    )
  }
}

function drawDimension(
  doc: InstanceType<typeof import('jspdf')['jsPDF']>,
  dimension: DrawingDimension,
  viewBox: { x: number; y: number; width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
): void {
  doc.setDrawColor(104, 107, 101)
  doc.setTextColor(75, 78, 72)
  doc.setLineWidth(0.18)
  for (const extension of dimension.extensions) {
    const start = mapPoint(extension.start, viewBox, region)
    const end = mapPoint(extension.end, viewBox, region)
    doc.line(start.x, start.y, end.x, end.y)
  }
  const start = mapPoint(dimension.start, viewBox, region)
  const end = mapPoint(dimension.end, viewBox, region)
  doc.line(start.x, start.y, end.x, end.y)
  drawArrow(doc, start, end)
  drawArrow(doc, end, start)

  const label = mapPoint(dimension.labelPosition, viewBox, region)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(dimension.label, label.x, label.y, {
    align: 'center',
    angle: dimension.labelRotation,
  })
}

function addElevationPage(
  doc: InstanceType<typeof import('jspdf')['jsPDF']>,
  title: string,
  geometry: ElevationDrawingGeometry,
  material: MaterialId,
): void {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  addHeader(doc, title, 'ORTHOGRAPHIC ELEVATION  /  ALL DIMENSIONS IN MM')
  const region = { x: 20, y: 51, width: pageWidth - 40, height: pageHeight - 79 }
  const bounds = calculateDrawingBounds(geometry)
  const viewBox = fitDrawingToViewport(bounds, region, 10)

  drawRect(doc, geometry.outline, viewBox, region, material, true)
  for (const part of geometry.parts) drawRect(doc, part, viewBox, region, material)
  for (const dimension of geometry.dimensions) drawDimension(doc, dimension, viewBox, region)

  doc.setDrawColor(217, 217, 210)
  doc.setLineWidth(0.25)
  doc.line(16, pageHeight - 14, pageWidth - 16, pageHeight - 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(119, 121, 112)
  doc.text(`PROJECT ${geometry.outline.width} x ${geometry.outline.height} mm`, 16, pageHeight - 9)
  doc.text('VARYFORM  /  TECHNICAL DRAWING', pageWidth - 16, pageHeight - 9, { align: 'right' })
}

function addBomPage(doc: InstanceType<typeof import('jspdf')['jsPDF']>, data: ProjectSheetData): void {
  addHeader(doc, 'BOM / Specification', `Project ID: ${data.projectId}`)
  const pageWidth = doc.internal.pageSize.getWidth()
  const columns = [
    { label: 'PART', width: 57, value: (row: ProjectSheetData['bom'][number]) => row.part },
    { label: 'QTY', width: 18, value: (row: ProjectSheetData['bom'][number]) => String(row.quantity) },
    { label: 'DIMENSIONS', width: 73, value: (row: ProjectSheetData['bom'][number]) => row.dimensions },
    { label: 'MATERIAL', width: 34, value: (row: ProjectSheetData['bom'][number]) => row.material },
  ] as const
  const xStart = 16
  const tableWidth = columns.reduce((total, column) => total + column.width, 0)
  let y = 56
  doc.setFillColor(244, 243, 239)
  doc.rect(xStart, y, tableWidth, 11, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(100, 102, 96)
  let x = xStart
  for (const column of columns) {
    doc.text(column.label, x + 3, y + 7)
    x += column.width
  }

  y += 11
  for (const row of data.bom) {
    x = xStart
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(48, 51, 47)
    for (const column of columns) {
      doc.text(column.value(row), x + 3, y + 8)
      x += column.width
    }
    y += 12
    doc.setDrawColor(230, 230, 224)
    doc.line(xStart, y, xStart + tableWidth, y)
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(119, 121, 112)
  doc.text(`${data.bom.length} grouped part types`, xStart, y + 10)
  doc.text(`TOTAL  ${data.dimensions.width} x ${data.dimensions.height} x ${data.dimensions.depth} mm`, pageWidth - 16, y + 10, { align: 'right' })
  doc.text('Quantity and cut sizes are grouped by type, material and dimensions.', xStart, y + 22)
}

export async function buildProjectPdf(data: ProjectSheetData, snapshot: string): Promise<Blob> {
  if (!snapshot.startsWith('data:image/png;base64,')) {
    throw new TypeError('A PNG snapshot of the configured 3D model is required')
  }
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  doc.setProperties({
    title: `VARYFORM ${data.dimensions.width} x ${data.dimensions.height} Project Sheet`,
    subject: 'Parametric modular shelving project sheet',
    author: 'VARYFORM Configurator',
    creator: 'VARYFORM Configurator',
  })
  addCoverPage(doc, data, snapshot)
  doc.addPage('a3', 'portrait')
  addElevationPage(doc, 'Front elevation', data.front, data.configuration.material)
  doc.addPage('a3', 'portrait')
  addElevationPage(doc, 'Side elevation', data.side, data.configuration.material)
  doc.addPage('a4', 'portrait')
  addBomPage(doc, data)
  return doc.output('blob')
}
