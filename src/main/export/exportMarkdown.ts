import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { resolveImagePath } from '../utils/fileStore'
import type { Project, Step } from '@shared/types'

export function exportMarkdown(project: Project, steps: Step[], outputDir: string): void {
  mkdirSync(outputDir, { recursive: true })
  const imagesDir = join(outputDir, 'images')
  mkdirSync(imagesDir, { recursive: true })

  const lines: string[] = [
    `# ${project.title}`,
    '',
    project.description ? `${project.description}\n` : '',
    `*${steps.length} step${steps.length !== 1 ? 's' : ''} · Generated ${new Date().toLocaleDateString()}*`,
    '',
    '---',
    ''
  ]

  steps.forEach((step, i) => {
    lines.push(`## Step ${i + 1}`)
    lines.push('')

    if (step.screenshotPath) {
      try {
        const src = resolveImagePath(step.screenshotPath)
        const imgName = `step-${String(i + 1).padStart(3, '0')}.jpg`
        copyFileSync(src, join(imagesDir, imgName))
        lines.push(`![Step ${i + 1}](images/${imgName})`)
        lines.push('')
      } catch {}
    }

    lines.push(step.description || '*No description*')
    lines.push('')

    // Metadata as blockquote
    const meta: string[] = []
    if (step.typedText) meta.push(`**Typed:** \`${step.typedText}\``)
    if (step.keyName) meta.push(`**Key:** ${step.keyName}`)
    if (meta.length > 0) {
      lines.push(`> ${meta.join('  ·  ')}`)
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  })

  writeFileSync(join(outputDir, 'README.md'), lines.join('\n'), 'utf-8')
}
