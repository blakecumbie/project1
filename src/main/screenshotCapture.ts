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

// Returns the click dot position in the cropped image's coordinate space
export function getClickDotPosition(
  eventX: number,
  eventY: number,
  cropX: number,
  cropY: number,
  scaleFactor: number,
  cropRadius: number
): { x: number; y: number } {
  const physX = eventX * scaleFactor
  const physY = eventY * scaleFactor
  const physCropX = Math.max(0, physX - cropRadius * scaleFactor)
  const physCropY = Math.max(0, physY - cropRadius * scaleFactor)

  const dotX = physX - physCropX
  const dotY = physY - physCropY

  const physWidth = cropRadius * 2 * scaleFactor
  const scale = physWidth > 900 ? 900 / physWidth : 1

  return { x: Math.round(dotX * scale), y: Math.round(dotY * scale) }
}
