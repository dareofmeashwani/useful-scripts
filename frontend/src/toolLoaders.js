// Tools are split into two groups based on their vendor dependency weight:
//
//  TOOL_COMPONENTS — statically imported, bundled into app.js (no large deps)
//  TOOL_LOADERS    — lazily imported, each pulls a large vendor lib (pdf-lib or
//                    pdfjs-dist, 400-430 KB) only when the user opens that tool
//
// Keeping the heavy tools lazy means the initial page load stays light.

import Base64Text      from './tools/Base64Text'
import UuidGenerator   from './tools/UuidGenerator'
import JwtDecoder      from './tools/JwtDecoder'
import ImageConvert    from './tools/ImageConvert'
import ImageResize     from './tools/ImageResize'
import ImageCrop       from './tools/ImageCrop'
import ImageThumbnail  from './tools/ImageThumbnail'
import ImageToIco      from './tools/ImageToIco'
import JsonYamlViewer  from './tools/JsonYamlViewer'
import XmlViewer       from './tools/XmlViewer'
import TextDiff        from './tools/TextDiff'
import TextViewer      from './tools/TextViewer'
import DependencyGraph from './tools/DependencyGraph'
import Paint           from './tools/Paint'
import PdfUnlock       from './tools/PdfUnlock'

export const TOOL_COMPONENTS = {
  'base64-text':     Base64Text,
  'uuid-generate':   UuidGenerator,
  'jwt-decode':      JwtDecoder,
  'image-convert':   ImageConvert,
  'image-resize':    ImageResize,
  'image-crop':      ImageCrop,
  'image-thumbnail': ImageThumbnail,
  'image-to-ico':    ImageToIco,
  'json-viewer':     JsonYamlViewer,
  'xml-viewer':      XmlViewer,
  'text-diff':       TextDiff,
  'text-viewer':     TextViewer,
  'dep-graph':       DependencyGraph,
  'paint':           Paint,
  'pdf-unlock':      PdfUnlock,
}

// Lazy — each pulls a large vendor library on first open
export const TOOL_LOADERS = {
  'pdf-to-images':   () => import('./tools/PdfToImages'),   // pdfjs-dist 430 KB
  'pdf-from-images': () => import('./tools/PdfFromImages'), // pdf-lib    419 KB
  'pdf-split':       () => import('./tools/PdfSplit'),      // pdf-lib    419 KB
  'pdf-merge':       () => import('./tools/PdfMerge'),      // pdf-lib    419 KB
}

/** Warm a lazy tool chunk on link hover. No-op for eagerly bundled tools. */
export function prefetchTool(id) {
  const load = TOOL_LOADERS[id]
  if (load) load()
}
