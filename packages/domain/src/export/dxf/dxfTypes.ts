import type { DrawingViewBox } from '../../drawing'

export interface DxfViewBounds extends DrawingViewBox {
  maxX: number
  maxY: number
}

export interface DxfExportDocument {
  content: string
  units: 'millimeters'
  layers: readonly ['OUTLINE', 'PANELS', 'SHELVES', 'DIMENSIONS', 'TEXT']
  views: {
    front: { bounds: DxfViewBounds; outline: DxfViewBounds }
    side: { bounds: DxfViewBounds; outline: DxfViewBounds }
  }
}
