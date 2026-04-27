import { desktopCapturer, screen, nativeImage } from 'electron'
import { DEFAULT_CROP_RADIUS, SCREENSHOT_JPEG_QUALITY } from '@shared/constants'

interface CaptureOptions {
  displayId?: string
  cropX?: number
  cropY?: number
  cropRadius?: number
}

export interface CaptureResult {
  croppedBuffer: Buffer
  fullBuffer: Buffer
  cropX: number
  cropY: number
  cropRadius: number
  scaleFactor: number
  displayWidth: number
  displayHeight: number
}

export async function captureScreen(opts: CaptureOptions = {}): Promise<CaptureResult | null> {
  try {
    const { cropX, cropY, cropRadius = DEFAULT_CROP_RADIUS, displayId } = opts

    const displays = screen.getAllDisplays()
    const targetDisplay = displayId
      ? displays.find((d) => String(d.id) === displayId) ?? displays[0]
      : screen.getPrimaryDisplay()

    const { width, height } = targetDisplay.size
    const scaleFactor = targetDisplay.scaleFactor

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.floor(width * scaleFactor),
        height: Math.floor(height * scaleFactor)
      }
    })

    const source = displayId
      ? sources.find((s) => s.display_id === displayId) ?? sources[0]
      : sources[0]

    if (!source) return null

    // Capture full screenshot before any cropping
    const fullBuffer = source.thumbnail.toJPEG(SCREENSHOT_JPEG_QUALITY)

    let image = source.thumbnail

    const effectiveCropX = cropX ?? Math.floor(width / 2)
    const effectiveCropY = cropY ?? Math.floor(height / 2)

    // Crop around the action point if coordinates provided
    if (cropX !== undefined && cropY !== undefined) {
      const physX = Math.floor(cropX * scaleFactor)
      const physY = Math.floor(cropY * scaleFactor)
      const physRadius = Math.floor(cropRadius * scaleFactor)

      const imgSize = image.getSize()
      const x = Math.max(0, physX - physRadius)
      const y = Math.max(0, physY - physRadius)
      const w = Math.min(imgSize.width - x, physRadius * 2)
      const h = Math.min(imgSize.height - y, physRadius * 2)

      if (w > 0 && h > 0) {
        image = image.crop({ x, y, width: w, height: h })
      }
    }

    // Normalize width
    const size = image.getSize()
    if (size.width > 900) {
      image = image.resize({ width: 900 })
    }

    const croppedBuffer = image.toJPEG(SCREENSHOT_JPEG_QUALITY)

    return {
      croppedBuffer,
      fullBuffer,
      cropX: effectiveCropX,
      cropY: effectiveCropY,
      cropRadius,
      scaleFactor,
      displayWidth: width,
      displayHeight: height
    }
  } catch {
    return null
  }
}

export function cropFromFull(
  fullBuffer: Buffer,
  opts: { cropX: number; cropY: number; cropRadius: number; scaleFactor: number }
): Buffer | null {
  try {
    const img = nativeImage.createFromBuffer(fullBuffer)
    const { cropX, cropY, cropRadius, scaleFactor } = opts
    const physX = Math.floor(cropX * scaleFactor)
    const physY = Math.floor(cropY * scaleFactor)
    const physRadius = Math.floor(cropRadius * scaleFactor)
    const size = img.getSize()
    const x = Math.max(0, physX - physRadius)
    const y = Math.max(0, physY - physRadius)
    const w = Math.min(size.width - x, physRadius * 2)
    const h = Math.min(size.height - y, physRadius * 2)
    if (w <= 0 || h <= 0) return null
    let cropped = img.crop({ x, y, width: w, height: h })
    if (cropped.getSize().width > 900) cropped = cropped.resize({ width: 900 })
    return cropped.toJPEG(SCREENSHOT_JPEG_QUALITY)
  } catch {
    return null
  }
}

export async function getDisplayList(): Promise<{ id: string; label: string; isPrimary: boolean }[]> {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  return displays.map((d, i) => ({
    id: String(d.id),
    label: `Display ${i + 1}${d.id === primary.id ? ' (Primary)' : ''} — ${d.size.width}×${d.size.height}`,
    isPrimary: d.id === primary.id
  }))
}

// Returns the click dot position in the cropped image's pixel coordinate space.
// Uses the actual cropped image dimensions and the actual crop bounds (clamped to display)
// so the dot lands correctly even when:
//   - the crop is near a screen edge (clamped)
//   - cropX/cropY differ from eventX/eventY (after a user re-crop)
export function getClickDotPosition(
  eventX: number,
  eventY: number,
  cropX: number,
  cropY: number,
  cropRadius: number,
  displayWidth: number,
  displayHeight: number,
  croppedImageWidth: number,
  croppedImageHeight: number
): { x: number; y: number } {
  const left = Math.max(0, cropX - cropRadius)
  const top = Math.max(0, cropY - cropRadius)
  const right = Math.min(displayWidth, cropX + cropRadius)
  const bottom = Math.min(displayHeight, cropY + cropRadius)
  const cropLogicalWidth = right - left
  const cropLogicalHeight = bottom - top

  if (cropLogicalWidth <= 0 || cropLogicalHeight <= 0 || croppedImageWidth <= 0 || croppedImageHeight <= 0) {
    return { x: 0, y: 0 }
  }

  const dotInCropX = eventX - left
  const dotInCropY = eventY - top

  return {
    x: Math.round((dotInCropX / cropLogicalWidth) * croppedImageWidth),
    y: Math.round((dotInCropY / cropLogicalHeight) * croppedImageHeight)
  }
}

// Quick JPEG dimension parser (reads SOF0 marker)
export function getJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    let i = 2
    while (i < buffer.length) {
      if (buffer[i] !== 0xff) break
      const marker = buffer[i + 1]
      const len = buffer.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xc3) {
        const height = buffer.readUInt16BE(i + 5)
        const width = buffer.readUInt16BE(i + 7)
        return { width, height }
      }
      i += 2 + len
    }
  } catch {}
  return null
}
