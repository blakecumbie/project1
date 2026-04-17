import { PDFDocument, StandardFonts, rgb, PDFPage } from 'pdf-lib'
import { readFileSync, writeFileSync } from 'fs'
import { resolveImagePath } from '../utils/fileStore'
import type { Project, Step } from '@shared/types'

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 48
const IMG_MAX_W = PAGE_W - MARGIN * 2
const IMG_MAX_H = 340

export async function exportPdf(project: Project, steps: Step[], outputPath: string): Promise<void> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // Cover page
  const cover = doc.addPage([PAGE_W, PAGE_H])
  cover.drawRectangle({ x: 0, y: PAGE_H - 120, width: PAGE_W, height: 120, color: rgb(0.055, 0.647, 0.914) })
  cover.drawText('SOP Builder', { x: MARGIN, y: PAGE_H - 50, size: 13, font, color: rgb(1, 1, 1) })
  cover.drawText(project.title, { x: MARGIN, y: PAGE_H - 160, size: 22, font: fontBold, color: rgb(0.1, 0.1, 0.1), maxWidth: PAGE_W - MARGIN * 2 })
  if (project.description) {
    cover.drawText(project.description, { x: MARGIN, y: PAGE_H - 200, size: 11, font, color: rgb(0.4, 0.4, 0.4), maxWidth: PAGE_W - MARGIN * 2 })
  }
  cover.drawText(`${steps.length} step${steps.length !== 1 ? 's' : ''}  ·  Generated ${new Date().toLocaleDateString()}`, {
    x: MARGIN, y: MARGIN, size: 10, font, color: rgb(0.6, 0.6, 0.6)
  })

  // Step pages
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const page = doc.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H - MARGIN

    // Step number header bar
    page.drawRectangle({ x: 0, y: PAGE_H - 36, width: PAGE_W, height: 36, color: rgb(0.055, 0.647, 0.914) })
    page.drawText(`Step ${i + 1}`, { x: MARGIN, y: PAGE_H - 24, size: 13, font: fontBold, color: rgb(1, 1, 1) })
    page.drawText(project.title, { x: PAGE_W / 2, y: PAGE_H - 24, size: 10, font, color: rgb(0.8, 0.9, 1) })

    y -= 50

    // Screenshot
    if (step.screenshotPath) {
      try {
        const imgBuf = readFileSync(resolveImagePath(step.screenshotPath))
        const img = await doc.embedJpg(imgBuf)
        const imgDims = img.scaleToFit(IMG_MAX_W, IMG_MAX_H)
        const imgX = (PAGE_W - imgDims.width) / 2

        // Image border
        page.drawRectangle({
          x: imgX - 1, y: y - imgDims.height - 1,
          width: imgDims.width + 2, height: imgDims.height + 2,
          color: rgb(0.87, 0.87, 0.87)
        })
        page.drawImage(img, { x: imgX, y: y - imgDims.height, width: imgDims.width, height: imgDims.height })
        y -= imgDims.height + 20
      } catch {}
    }

    // Action badge
    const badgeText = step.actionType.replace('_', ' ').toUpperCase()
    page.drawRectangle({ x: MARGIN, y: y - 18, width: badgeText.length * 6 + 16, height: 18, color: rgb(0.93, 0.95, 1) })
    page.drawText(badgeText, { x: MARGIN + 8, y: y - 13, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.8) })
    y -= 28

    // Description
    const desc = step.description || 'No description available.'
    const lines = wrapText(desc, font, 11, PAGE_W - MARGIN * 2)
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) })
      y -= 18
      if (y < MARGIN) break
    }

    // Page number footer
    page.drawLine({ start: { x: MARGIN, y: MARGIN + 18 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 18 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
    page.drawText(`${i + 1} / ${steps.length}`, { x: PAGE_W - MARGIN - 30, y: MARGIN + 6, size: 9, font, color: rgb(0.6, 0.6, 0.6) })
  }

  const pdfBytes = await doc.save()
  writeFileSync(outputPath, pdfBytes)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapText(text: string, _font: any, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    // Approximate width check — pdf-lib font.widthOfTextAtSize is async, use char estimate
    if (test.length * size * 0.55 > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}
