import { readFileSync, writeFileSync } from 'fs'
import { resolveImagePath } from '../utils/fileStore'
import type { Project, Step } from '@shared/types'

export function exportHtml(project: Project, steps: Step[], outputPath: string): void {
  const stepHtml = steps
    .map((step, i) => {
      let imgTag = ''
      if (step.screenshotPath) {
        try {
          const buf = readFileSync(resolveImagePath(step.screenshotPath))
          const b64 = buf.toString('base64')
          imgTag = `<img src="data:image/jpeg;base64,${b64}" alt="Step ${i + 1} screenshot" style="max-width:100%;border-radius:6px;border:1px solid #e2e8f0;display:block;" />`
        } catch {}
      }
      const badge = step.actionType.replace('_', ' ')
      const desc = step.description || '<em style="color:#94a3b8">No description</em>'

      return `
    <div class="step">
      <div class="step-header">
        <span class="step-number">${i + 1}</span>
        <span class="badge">${badge}</span>
      </div>
      ${imgTag ? `<div class="screenshot">${imgTag}</div>` : ''}
      <div class="description">${escapeHtml(typeof desc === 'string' ? desc : '')}</div>
    </div>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(project.title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
    .container { max-width: 860px; margin: 0 auto; padding: 40px 24px; }
    header { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; padding: 40px; border-radius: 12px; margin-bottom: 40px; }
    header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    header p { opacity: 0.85; font-size: 15px; }
    header .meta { margin-top: 16px; font-size: 13px; opacity: 0.7; }
    .step { background: white; border-radius: 12px; padding: 28px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08); border: 1px solid #e2e8f0; }
    .step-header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .step-number { background: #0ea5e9; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
    .badge { background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 100px; text-transform: uppercase; letter-spacing: .05em; }
    .screenshot { margin-bottom: 16px; }
    .description { font-size: 15px; color: #334155; padding: 14px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #0ea5e9; }
    @media print { body { background: white; } .step { box-shadow: none; border-color: #e2e8f0; page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(project.title)}</h1>
      ${project.description ? `<p>${escapeHtml(project.description)}</p>` : ''}
      <div class="meta">${steps.length} step${steps.length !== 1 ? 's' : ''} · Generated ${new Date().toLocaleDateString()}</div>
    </header>
    ${stepHtml}
  </div>
</body>
</html>`

  writeFileSync(outputPath, html, 'utf-8')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
