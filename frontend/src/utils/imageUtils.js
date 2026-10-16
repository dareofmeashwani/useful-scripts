// Wrap canvas.toBlob() as a Promise
export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error(`Your browser cannot encode ${type}`))),
      type,
      quality,
    )
  })
}

// Build a 24-bit uncompressed BMP Blob from canvas ImageData
export function imageDataToBmp(imageData) {
  const { width, height, data } = imageData
  const rowStride = Math.ceil((width * 3) / 4) * 4  // rows padded to 4 bytes
  const pixelBytes = rowStride * height
  const fileSize = 54 + pixelBytes
  const buf = new ArrayBuffer(fileSize)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)

  // BITMAPFILEHEADER (14 bytes)
  u8[0] = 0x42; u8[1] = 0x4d              // 'BM'
  dv.setUint32(2,  fileSize, true)
  dv.setUint32(10, 54, true)              // pixel data offset

  // BITMAPINFOHEADER (40 bytes)
  dv.setUint32(14, 40, true)
  dv.setInt32(18,  width,  true)
  dv.setInt32(22,  height, true)          // positive = bottom-to-top storage
  dv.setUint16(26, 1, true)              // color planes
  dv.setUint16(28, 24, true)             // bits per pixel (24-bit RGB)
  dv.setUint32(34, pixelBytes, true)
  dv.setInt32(38,  2835, true)            // ~72 DPI
  dv.setInt32(42,  2835, true)

  // Pixel data: bottom-to-top rows, BGR channel order
  for (let y = height - 1; y >= 0; y--) {
    const rowOff = 54 + (height - 1 - y) * rowStride
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4
      u8[rowOff + x * 3]     = data[si + 2]  // B
      u8[rowOff + x * 3 + 1] = data[si + 1]  // G
      u8[rowOff + x * 3 + 2] = data[si + 0]  // R
    }
  }

  return new Blob([buf], { type: 'image/bmp' })
}

// Build an ICO Blob containing multiple PNG-compressed sizes from an image file.
// Modern ICO format: PNG data inside the ICO container (supported by all OS icon renderers).
export async function buildIco(file, sizes) {
  const bitmap = await createImageBitmap(file)
  const sorted = [...sizes].sort((a, b) => a - b)

  const pngBuffers = await Promise.all(sorted.map(async s => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = s
    canvas.getContext('2d').drawImage(bitmap, 0, 0, s, s)
    const blob = await canvasToBlob(canvas, 'image/png')
    return blob.arrayBuffer()
  }))
  bitmap.close()

  const headerBytes = 6
  const dirBytes = 16 * sorted.length
  let imgOffset = headerBytes + dirBytes
  const totalSize = imgOffset + pngBuffers.reduce((s, b) => s + b.byteLength, 0)

  const buf = new ArrayBuffer(totalSize)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)

  // ICONDIR
  dv.setUint16(0, 0, true)                   // reserved
  dv.setUint16(2, 1, true)                   // type: 1 = ICO
  dv.setUint16(4, sorted.length, true)       // image count

  // ICONDIRENTRY for each size
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    const base = 6 + i * 16
    dv.setUint8(base,     s >= 256 ? 0 : s)  // width  (0 encodes 256)
    dv.setUint8(base + 1, s >= 256 ? 0 : s)  // height
    dv.setUint8(base + 2, 0)                  // color count (0 = true color)
    dv.setUint8(base + 3, 0)                  // reserved
    dv.setUint16(base + 4, 1,  true)          // planes
    dv.setUint16(base + 6, 32, true)          // bits per pixel (32 = RGBA)
    dv.setUint32(base + 8,  pngBuffers[i].byteLength, true)
    dv.setUint32(base + 12, imgOffset, true)
    imgOffset += pngBuffers[i].byteLength
  }

  // Append PNG data for each size
  let writeAt = headerBytes + dirBytes
  for (const ab of pngBuffers) {
    u8.set(new Uint8Array(ab), writeAt)
    writeAt += ab.byteLength
  }

  return new Blob([buf], { type: 'image/x-icon' })
}
