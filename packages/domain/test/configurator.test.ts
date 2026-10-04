import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_CONFIGURATION,
  MIN_SECTION_CLEAR_WIDTH,
  calculateBom,
  calculateBoundingDimensions,
  calculateDrawingBounds,
  calculateFrontDrawingGeometry,
  calculateParts,
  calculatePrice,
  calculateSectionWidths,
  calculateShelfPositions,
  calculateSideDrawingGeometry,
  fitDrawingToViewport,
  scaleDrawingViewBox,
  validateConfiguration,
  type Configuration,
} from '../src/index'

function makeConfiguration(overrides: Partial<Configuration> = {}): Configuration {
  return { ...DEFAULT_CONFIGURATION, ...overrides }
}

test('rejects 600 mm width split into five physically undersized sections', () => {
  const configuration = makeConfiguration({ width: 600, sections: 5 })
  const issues = validateConfiguration(configuration)

  assert.ok(issues.some((issue) => issue.field === 'sections' && issue.message.includes(`${MIN_SECTION_CLEAR_WIDTH} mm`)))
  assert.throws(() => calculateParts(configuration), /Each section must be at least 120 mm wide/)
})

test('accepts a 600 mm cabinet with four 18 mm board sections', () => {
  const configuration = makeConfiguration({ width: 600, sections: 4, materialThickness: 18 })

  assert.deepEqual(validateConfiguration(configuration), [])
  assert.ok(calculateSectionWidths(configuration).every((width) => width >= MIN_SECTION_CLEAR_WIDTH))
})

test('rejects section count that becomes too narrow with 25 mm boards', () => {
  const configuration = makeConfiguration({ width: 600, sections: 4, materialThickness: 25 })

  assert.ok(validateConfiguration(configuration).some((issue) => issue.field === 'sections'))
})

test('supports 2400 mm width with one section and 2400 mm height', () => {
  const configuration = makeConfiguration({ width: 2400, height: 2400, sections: 1 })
  const parts = calculateParts(configuration)

  assert.deepEqual(validateConfiguration(configuration), [])
  assert.deepEqual(calculateBoundingDimensions(configuration), { width: 2400, height: 2400, depth: 350 })
  assert.equal(calculateSectionWidths(configuration)[0], 2364)
  assert.ok(parts.every((part) => Math.abs(part.position.x) + part.dimensions.width / 2 <= 1200))
})

test('keeps all generated part bounds inside the configured envelope', () => {
  const configurations = [
    makeConfiguration({ width: 600, sections: 3, materialThickness: 18, legs: 'none', backPanel: false }),
    makeConfiguration({ width: 2400, height: 2400, depth: 600, sections: 1, shelves: 8, materialThickness: 25, legs: 'metal' }),
    makeConfiguration({ width: 1200, depth: 600, legs: 'wood', backPanel: true }),
  ]

  for (const configuration of configurations) {
    const parts = calculateParts(configuration)
    for (const part of parts) {
      assert.ok(Math.abs(part.position.x) + part.dimensions.width / 2 <= configuration.width / 2 + 1e-8)
      assert.ok(part.position.y - part.dimensions.height / 2 >= -1e-8)
      assert.ok(part.position.y + part.dimensions.height / 2 <= configuration.height + 1e-8)
      assert.ok(Math.abs(part.position.z) + part.dimensions.depth / 2 <= configuration.depth / 2 + 1e-8)
    }
  }
})

test('part list, BOM, price and front drawing share the same part dimensions', () => {
  const configuration = makeConfiguration({ width: 2400, height: 2400, sections: 1, materialThickness: 25 })
  const parts = calculateParts(configuration)
  const bom = calculateBom(parts)
  const drawing = calculateFrontDrawingGeometry(configuration, parts)
  const shelfPart = parts.find((part) => part.type === 'shelf')
  const shelfBom = bom.find((item) => item.type === 'shelf')
  const shelfDrawing = drawing.parts.find((part) => part.type === 'shelf')

  assert.ok(shelfPart && shelfBom && shelfDrawing)
  assert.equal(shelfDrawing.width, shelfPart.dimensions.width)
  assert.equal(shelfBom.dimensions.width, shelfPart.dimensions.width)
  assert.equal(shelfBom.quantity, configuration.shelves + 2)
  assert.equal(drawing.outline.x, -configuration.width / 2)
  assert.ok(calculatePrice(configuration, parts).total > 0)
})

test('front drawing includes outside and section dimensions plus equal shelf pitch', () => {
  const configuration = makeConfiguration({ sections: 3, shelves: 4 })
  const parts = calculateParts(configuration)
  const drawing = calculateFrontDrawingGeometry(configuration, parts)
  const labels = drawing.dimensions.map((dimension) => dimension.label)
  const expectedShelfPitch = calculateShelfPositions(configuration)[1]! - calculateShelfPositions(configuration)[0]!

  assert.ok(labels.includes(`${configuration.width} mm`))
  assert.ok(labels.includes(`${configuration.height} mm`))
  assert.equal(drawing.dimensions.filter((dimension) => dimension.id.startsWith('section-')).length, configuration.sections)
  assert.ok(labels.includes(`${Number(expectedShelfPitch.toFixed(2))} mm`))
})

test('side drawing projects shelf depth, back panel and legs with overall height/depth dimensions', () => {
  const configuration = makeConfiguration({ depth: 600, backPanel: true, legs: 'metal' })
  const parts = calculateParts(configuration)
  const drawing = calculateSideDrawingGeometry(configuration, parts)
  const labels = drawing.dimensions.map((dimension) => dimension.label)

  assert.ok(drawing.parts.some((part) => part.type === 'back'))
  assert.ok(drawing.parts.some((part) => part.type === 'shelf'))
  assert.equal(drawing.parts.filter((part) => part.type === 'leg').length, 2)
  assert.ok(labels.includes('600 mm'))
  assert.ok(labels.includes(`${configuration.height} mm`))
})

test('front and side elevations adapt their viewboxes to small and large cabinets', () => {
  for (const configuration of [
    makeConfiguration({ width: 600, height: 800, sections: 1, legs: 'none' }),
    makeConfiguration({ width: 2400, height: 2400, sections: 1 }),
  ]) {
    const parts = calculateParts(configuration)
    for (const geometry of [
      calculateFrontDrawingGeometry(configuration, parts),
      calculateSideDrawingGeometry(configuration, parts),
    ]) {
      const zoomed = scaleDrawingViewBox(geometry.viewBox, 1.5)
      assert.ok(geometry.viewBox.width > geometry.outline.width)
      assert.ok(geometry.viewBox.height > geometry.outline.height)
      assert.ok(zoomed.width < geometry.viewBox.width)
      assert.ok(zoomed.height < geometry.viewBox.height)
    }
  }
})

test('front drawing dimensions and projected section positions match manufacturing parts', () => {
  const configuration = makeConfiguration({ width: 1600, sections: 4, shelves: 5, materialThickness: 25 })
  const parts = calculateParts(configuration)
  const bom = calculateBom(parts)
  const drawing = calculateFrontDrawingGeometry(configuration, parts)
  const shelfParts = parts.filter((part) => part.type === 'shelf' && part.id.endsWith('-bottom'))
  const sectionDimensions = drawing.dimensions.filter((dimension) => dimension.id.startsWith('section-'))
  const shelfBom = bom.find((item) => item.type === 'shelf')

  assert.equal(drawing.outline.width, 1600)
  assert.equal(drawing.outline.height, configuration.height)
  assert.equal(sectionDimensions.length, 4)
  assert.equal(sectionDimensions[0]?.label, '368.75 mm')
  assert.equal(shelfBom?.dimensions.width, 368.75)
  for (const [index, shelf] of shelfParts.entries()) {
    const projected = drawing.parts.find((part) => part.id === shelf.id)
    assert.ok(projected)
    assert.equal(projected.x, shelf.position.x - shelf.dimensions.width / 2)
    assert.equal(sectionDimensions[index]?.start.x, projected.x)
    assert.equal(sectionDimensions[index]?.end.x, projected.x + shelf.dimensions.width)
    assert.equal(sectionDimensions[index]?.label, `${calculateSectionWidths(configuration)[index]} mm`)
  }
})

test('side drawing uses manufacturing depth and displays back panel/leg options', () => {
  for (const [backPanel, legs] of [[true, 'wood'], [false, 'none']] as const) {
    const configuration = makeConfiguration({ depth: 600, backPanel, legs })
    const parts = calculateParts(configuration)
    const drawing = calculateSideDrawingGeometry(configuration, parts)
    const labels = drawing.dimensions.map((dimension) => dimension.label)

    assert.equal(drawing.outline.width, 600)
    assert.equal(drawing.outline.height, configuration.height)
    assert.equal(drawing.parts.some((part) => part.type === 'back'), backPanel)
    assert.equal(drawing.parts.filter((part) => part.type === 'leg').length, legs === 'none' ? 0 : 2)
    assert.ok(labels.includes('600 mm'))
    assert.ok(labels.includes(`${configuration.height} mm`))
  }
})

test('drawing bounds include dimension labels and fit completely in responsive viewports', () => {
  const viewport = { width: 640, height: 420 }
  for (const configuration of [
    makeConfiguration({ width: 600, height: 800, sections: 1, legs: 'none' }),
    makeConfiguration({ width: 2400, height: 2400, sections: 1, legs: 'wood' }),
  ]) {
    const parts = calculateParts(configuration)
    for (const geometry of [
      calculateFrontDrawingGeometry(configuration, parts),
      calculateSideDrawingGeometry(configuration, parts),
    ]) {
      const bounds = calculateDrawingBounds(geometry)
      const fitted = fitDrawingToViewport(bounds, viewport, 32)
      const unitsPerPixel = fitted.width / viewport.width

      assert.ok(fitted.x <= bounds.x)
      assert.ok(fitted.y <= bounds.y)
      assert.ok(fitted.x + fitted.width >= bounds.x + bounds.width)
      assert.ok(fitted.y + fitted.height >= bounds.y + bounds.height)
      assert.ok((bounds.x - fitted.x) / unitsPerPixel >= 31.9)
      assert.ok((bounds.y - fitted.y) / unitsPerPixel >= 31.9)
      assert.ok((fitted.x + fitted.width - bounds.x - bounds.width) / unitsPerPixel >= 31.9)
      assert.ok((fitted.y + fitted.height - bounds.y - bounds.height) / unitsPerPixel >= 31.9)
    }
  }
})

test('18/25 mm, back panel and each leg type stay consistent across parts, BOM and drawing', () => {
  for (const materialThickness of [18, 25] as const) {
    for (const backPanel of [false, true]) {
      for (const legs of ['none', 'metal', 'wood'] as const) {
        const configuration = makeConfiguration({ materialThickness, backPanel, legs })

        const parts = calculateParts(configuration)
        const bom = calculateBom(parts)
        const front = calculateFrontDrawingGeometry(configuration, parts)
        const side = calculateSideDrawingGeometry(configuration, parts)
        assert.equal(front.parts.some((part) => part.type === 'back'), backPanel)
        assert.equal(side.parts.some((part) => part.type === 'back'), backPanel)
        assert.equal(bom.some((item) => item.type === 'back'), backPanel)
        assert.equal(parts.filter((part) => part.type === 'leg').length, legs === 'none' ? 0 : 4)
        assert.equal(bom.find((item) => item.type === 'shelf')?.dimensions.height, materialThickness)
        assert.equal(front.parts.find((part) => part.type === 'shelf')?.height, materialThickness)
      }
    }
  }
})

test('back panel and leg selection change 3D parts, BOM, and side drawing together', () => {
  const configuration = makeConfiguration({ backPanel: false, legs: 'none' })
  const parts = calculateParts(configuration)
  const bom = calculateBom(parts)
  const sideDrawing = calculateSideDrawingGeometry(configuration, parts)

  assert.equal(parts.some((part) => part.type === 'back'), false)
  assert.equal(parts.some((part) => part.type === 'leg'), false)
  assert.equal(bom.some((item) => item.type === 'back' || item.type === 'leg'), false)
  assert.equal(sideDrawing.parts.some((part) => part.type === 'back' || part.type === 'leg'), false)
  assert.equal(calculateParts(makeConfiguration({ legs: 'wood' })).filter((part) => part.type === 'leg').length, 4)
})

test('groups same-sized sides and shelves in BOM instead of emitting per-part rows', () => {
  const configuration = makeConfiguration({ sections: 5, shelves: 5 })
  const bom = calculateBom(calculateParts(configuration))

  assert.equal(bom.filter((item) => item.type === 'side').length, 1)
  assert.equal(bom.find((item) => item.type === 'side')?.quantity, 2)
  assert.equal(bom.find((item) => item.type === 'shelf')?.quantity, 35)
})
