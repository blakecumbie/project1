import { desktopCapturer, screen } from 'electron'
import { NativeImage } from 'electron'
import { DEFAULT_CROP_RADIUS, SCREENSHOT_JPEG_QUALITY } from '@shared/constants'

interface CaptureOptions {
  displayId?: string
  cropX?: number
  cropY?: number
  cropRadius?: number
}

export async function captureScreen(opts: CaptureOptions = {}): Promise<Buffer | null> {
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

    let image: NativeImage = source.thumbnail

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

    return image.toJPEG(SCREENSHOT_JPEG_QUALITY)
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

  // Position within the cropped image
  const dotX = physX - physCropX
  const dotY = physY - physCropY

  // Scale to normalized width (900px)
  const physWidth = cropRadius * 2 * scaleFactor
  const scale = physWidth > 900 ? 900 / physWidth : 1

  return { x: Math.round(dotX * scale), y: Math.round(dotY * scale) }
}
