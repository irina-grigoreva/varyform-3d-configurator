import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_CONFIGURATION,
  buildExportFilename,
  buildProjectSheetData,
  type Configuration,
} from '../src/index'
import { buildDxfDocument } from '../src/export/dxf/buildDxf'

function makeConfiguration(overrides: Partial<Configuration> = {}): Configuration {
  return { ...DEFAULT_CONFIGURATION, ...overrides }
}

type DxfPair = { code: number; value: string }

function dxfPairs(content: string): DxfPair[] {
  const lines = content.trim().split(/\r?\n/)
  const pairs: DxfPair[] = []
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index])
    const value = lines[index + 1]
    if (Number.isFinite(code) && value !== undefined) pairs.push({ code, value })
  }
  return pairs
}

function outlinePolylineBounds(content: string): { width: number; height: number }[] {
  const pairs = dxfPairs(content)
  const entities: DxfPair[][] = []
  let active: DxfPair[] | undefined
  for (const pair of pairs) {
    if (pair.code === 0) {
      if (active) entities.push(active)
      active = [pair]
    } else {
      active?.push(pair)
    }
  }
  if (active) entities.push(active)

  return entities
    .filter((entity) => entity[0]?.value === 'LWPOLYLINE' && entity.some((pair) => pair.code === 8 && pair.value === 'OUTLINE'))
    .map((entity) => {
      const xs = entity.filter((pair) => pair.code === 10).map((pair) => Number(pair.value))
      const ys = entity.filter((pair) => pair.code === 20).map((pair) => Number(pair.value))
      return {
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      }
    })
}

test('DXF uses millimeter units, standard entities and required layers', () => {
  const configuration = makeConfiguration({ width: 1400, height: 1900, depth: 400, sections: 4, shelves: 5 })
  const dxf = buildDxfDocument(configuration)

  assert.equal(dxf.units, 'millimeters')
  assert.match(dxf.content, /\$INSUNITS\r?\n70\r?\n4/)
  assert.match(dxf.content, /\r?\n0\r?\nLWPOLYLINE\r?\n/)
  assert.match(dxf.content, /\r?\n0\r?\nLINE\r?\n/)
  assert.match(dxf.content, /\r?\n0\r?\nTEXT\r?\n/)
  for (const layer of ['OUTLINE', 'PANELS', 'SHELVES', 'DIMENSIONS', 'TEXT']) {
    assert.ok(dxf.content.includes(`\n${layer}\n`), `DXF should include ${layer} layer`)
  }
})

test('DXF front and side outline polylines retain manufacturing millimeter dimensions', () => {
  const configurations = [
    makeConfiguration({ width: 1400, height: 1900, depth: 400, sections: 4, shelves: 5 }),
    makeConfiguration({ width: 600, height: 800, depth: 250, sections: 1, shelves: 2, backPanel: false, legs: 'none' }),
    makeConfiguration({ width: 2400, height: 2400, depth: 600, sections: 1, shelves: 8, materialThickness: 25, legs: 'metal' }),
    makeConfiguration({ width: 1200, height: 1600, depth: 450, sections: 5, shelves: 3, materialThickness: 25, backPanel: false, legs: 'wood' }),
  ]

  for (const configuration of configurations) {
    const dxf = buildDxfDocument(configuration)
    const outlines = outlinePolylineBounds(dxf.content)
    assert.equal(outlines.length, 2)
    assert.deepEqual(outlines[0], { width: configuration.width, height: configuration.height })
    assert.deepEqual(outlines[1], { width: configuration.depth, height: configuration.height })
    assert.equal(dxf.views.front.outline.width, configuration.width)
    assert.equal(dxf.views.front.outline.height, configuration.height)
    assert.equal(dxf.views.side.outline.width, configuration.depth)
    assert.equal(dxf.views.side.outline.height, configuration.height)
  }
})

test('DXF dimensions and panel geometry reflect board thickness, shelves and panel options', () => {
  const thin = buildDxfDocument(makeConfiguration({
    width: 1600,
    sections: 4,
    shelves: 2,
    materialThickness: 18,
    backPanel: false,
    legs: 'none',
  }))
  const thick = buildDxfDocument(makeConfiguration({
    width: 1600,
    sections: 4,
    shelves: 7,
    materialThickness: 25,
    backPanel: true,
    legs: 'wood',
  }))

  assert.notEqual(thin.content, thick.content)
  assert.match(thin.content, /1600 mm/)
  assert.match(thick.content, /1600 mm/)
  assert.ok(thick.content.includes('368.75 mm'))
  assert.ok(thin.content.includes('377.5 mm'))
})

test('DXF and PDF export reject physically invalid narrow-section configurations', () => {
  const invalid = makeConfiguration({ width: 600, sections: 5 })
  assert.throws(() => buildDxfDocument(invalid), /Invalid shelving configuration/)
  assert.throws(() => buildProjectSheetData(invalid, 'TMP-INVALID'), /Invalid shelving configuration/)
  assert.throws(() => buildExportFilename(invalid, 'pdf'), /Cannot export invalid configuration/)
})

test('filename helper creates safe material-specific DXF and PDF names', () => {
  const configuration = makeConfiguration({ width: 1400, height: 1900, material: 'natural-oak' })
  assert.equal(buildExportFilename(configuration, 'dxf'), 'varyform-1400x1900-oak.dxf')
  assert.equal(buildExportFilename(configuration, 'pdf'), 'varyform-1400x1900-oak.pdf')
  assert.equal(
    buildExportFilename({ ...configuration, material: 'matte-white' }, 'pdf'),
    'varyform-1400x1900-white.pdf',
  )
})

test('PDF sheet mapping uses canonical dimensions, price, drawing geometry and grouped BOM', () => {
  const configuration = makeConfiguration({
    width: 1600,
    height: 1900,
    depth: 400,
    sections: 4,
    shelves: 5,
    materialThickness: 25,
    backPanel: false,
    legs: 'wood',
    material: 'walnut',
  })
  const sheet = buildProjectSheetData(configuration, 'TMP-A1B2C3D4', 'Living Room Shelving')
  const shelfRow = sheet.bom.find((row) => row.part === 'Shelf board')

  assert.equal(sheet.projectId, 'TMP-A1B2C3D4')
  assert.equal(sheet.projectName, 'Living Room Shelving')
  assert.deepEqual(sheet.dimensions, { width: 1600, height: 1900, depth: 400 })
  assert.equal(sheet.configuration.materialThickness, 25)
  assert.ok(sheet.price.total > 0)
  assert.equal(sheet.front.outline.width, configuration.width)
  assert.equal(sheet.front.outline.height, configuration.height)
  assert.equal(sheet.side.outline.width, configuration.depth)
  assert.equal(shelfRow?.quantity, configuration.sections * (configuration.shelves + 2))
  assert.equal(shelfRow?.dimensions, '368.75 x 25 x 400 mm')
  assert.equal(shelfRow?.material, 'Walnut')
  assert.equal(sheet.bom.some((row) => row.part === 'Back panel'), false)
})

test('PDF project sheet requires a temporary project identifier', () => {
  assert.throws(() => buildProjectSheetData(DEFAULT_CONFIGURATION, '  '), /Project ID is required/)
})
