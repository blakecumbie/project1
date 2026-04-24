import { v4 as uuid } from 'uuid'
import { getDb } from './connection'
import type { Step, ActionType, AiStatus, Annotation } from '@shared/types'

interface StepRow {
  id: string
  project_id: string
  order_index: number
  action_type: string
  x: number | null
  y: number | null
  scroll_delta_x: number | null
  scroll_delta_y: number | null
  typed_text: string | null
  key_name: string | null
  app_name: string | null
  window_title: string | null
  url: string | null
  screenshot_path: string | null
  screenshot_width: number | null
  screenshot_height: number | null
  full_screenshot_path: string | null
  crop_x: number | null
  crop_y: number | null
  crop_radius: number | null
  scale_factor: number | null
  description: string
  ai_raw_response: string | null
  ai_status: string
  ai_error: string | null
  annotations: string
  captured_at: number
  created_at: number
  updated_at: number
}

function toStep(row: StepRow): Step {
  return {
    id: row.id,
    projectId: row.project_id,
    orderIndex: row.order_index,
    actionType: row.action_type as ActionType,
    x: row.x,
    y: row.y,
    scrollDeltaX: row.scroll_delta_x,
    scrollDeltaY: row.scroll_delta_y,
    typedText: row.typed_text,
    keyName: row.key_name,
    appName: row.app_name,
    windowTitle: row.window_title,
    url: row.url,
    screenshotPath: row.screenshot_path,
    screenshotWidth: row.screenshot_width,
    screenshotHeight: row.screenshot_height,
    fullScreenshotPath: row.full_screenshot_path ?? null,
    cropX: row.crop_x ?? null,
    cropY: row.crop_y ?? null,
    cropRadius: row.crop_radius ?? null,
    scaleFactor: row.scale_factor ?? null,
    description: row.description,
    aiStatus: row.ai_status as AiStatus,
    aiError: row.ai_error,
    annotations: JSON.parse(row.annotations || '[]') as Annotation[],
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const stepsRepo = {
  listForProject(projectId: string): Step[] {
    const rows = getDb()
      .prepare('SELECT * FROM steps WHERE project_id = ? ORDER BY order_index ASC')
      .all(projectId) as StepRow[]
    return rows.map(toStep)
  },

  get(id: string): Step | null {
    const row = getDb().prepare('SELECT * FROM steps WHERE id = ?').get(id) as StepRow | undefined
    return row ? toStep(row) : null
  },

  getNextOrderIndex(projectId: string): number {
    const result = getDb()
      .prepare('SELECT MAX(order_index) as m FROM steps WHERE project_id = ?')
      .get(projectId) as { m: number | null }
    return (result.m ?? -1) + 1
  },

  create(data: {
    projectId: string
    actionType: ActionType
    x?: number | null
    y?: number | null
    scrollDeltaX?: number | null
    scrollDeltaY?: number | null
    typedText?: string | null
    keyName?: string | null
    appName?: string | null
    windowTitle?: string | null
    screenshotPath?: string | null
    screenshotWidth?: number | null
    screenshotHeight?: number | null
    fullScreenshotPath?: string | null
    cropX?: number | null
    cropY?: number | null
    cropRadius?: number | null
    scaleFactor?: number | null
    capturedAt: number
  }): Step {
    const now = Date.now()
    const id = uuid()
    const orderIndex = this.getNextOrderIndex(data.projectId)

    getDb()
      .prepare(
        `INSERT INTO steps (
          id, project_id, order_index, action_type,
          x, y, scroll_delta_x, scroll_delta_y,
          typed_text, key_name, app_name, window_title,
          screenshot_path, screenshot_width, screenshot_height,
          full_screenshot_path, crop_x, crop_y, crop_radius, scale_factor,
          description, ai_status, annotations,
          captured_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          '', 'pending', '[]',
          ?, ?, ?
        )`
      )
      .run(
        id, data.projectId, orderIndex, data.actionType,
        data.x ?? null, data.y ?? null, data.scrollDeltaX ?? null, data.scrollDeltaY ?? null,
        data.typedText ?? null, data.keyName ?? null, data.appName ?? null, data.windowTitle ?? null,
        data.screenshotPath ?? null, data.screenshotWidth ?? null, data.screenshotHeight ?? null,
        data.fullScreenshotPath ?? null, data.cropX ?? null, data.cropY ?? null, data.cropRadius ?? null, data.scaleFactor ?? null,
        data.capturedAt, now, now
      )

    return this.get(id)!
  },

  update(id: string, patch: Partial<Pick<Step, 'description' | 'aiStatus' | 'aiError' | 'screenshotPath' | 'fullScreenshotPath'>> & { aiRawResponse?: string }): Step | null {
    const now = Date.now()
    const fields: string[] = ['updated_at = ?']
    const values: unknown[] = [now]

    if (patch.description !== undefined) { fields.push('description = ?'); values.push(patch.description) }
    if (patch.aiStatus !== undefined) { fields.push('ai_status = ?'); values.push(patch.aiStatus) }
    if (patch.aiError !== undefined) { fields.push('ai_error = ?'); values.push(patch.aiError) }
    if (patch.aiRawResponse !== undefined) { fields.push('ai_raw_response = ?'); values.push(patch.aiRawResponse) }
    if (patch.screenshotPath !== undefined) { fields.push('screenshot_path = ?'); values.push(patch.screenshotPath) }
    if (patch.fullScreenshotPath !== undefined) { fields.push('full_screenshot_path = ?'); values.push(patch.fullScreenshotPath) }

    values.push(id)
    getDb().prepare(`UPDATE steps SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.get(id)
  },

  updateAnnotations(id: string, annotations: Annotation[]): void {
    getDb()
      .prepare('UPDATE steps SET annotations = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(annotations), Date.now(), id)
  },

  updateCrop(id: string, patch: {
    screenshotPath: string
    cropX: number
    cropY: number
    cropRadius: number
    annotations?: Annotation[]
  }): Step | null {
    getDb()
      .prepare(
        `UPDATE steps SET screenshot_path = ?, crop_x = ?, crop_y = ?, crop_radius = ?,
         annotations = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        patch.screenshotPath, patch.cropX, patch.cropY, patch.cropRadius,
        JSON.stringify(patch.annotations ?? []), Date.now(), id
      )
    return this.get(id)
  },

  reorder(projectId: string, orderedIds: string[]): void {
    const update = getDb().prepare('UPDATE steps SET order_index = ?, updated_at = ? WHERE id = ? AND project_id = ?')
    const now = Date.now()
    const tx = getDb().transaction(() => {
      orderedIds.forEach((id, idx) => update.run(idx, now, id, projectId))
    })
    tx()
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM steps WHERE id = ?').run(id)
  },

  getPendingForProject(projectId: string): Step[] {
    const rows = getDb()
      .prepare("SELECT * FROM steps WHERE project_id = ? AND ai_status = 'pending' ORDER BY order_index ASC")
      .all(projectId) as StepRow[]
    return rows.map(toStep)
  }
}
