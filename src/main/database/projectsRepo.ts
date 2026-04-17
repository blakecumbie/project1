import { v4 as uuid } from 'uuid'
import { getDb } from './connection'
import type { Project, ProjectsListPayload } from '@shared/types'

interface ProjectRow {
  id: string
  title: string
  description: string
  created_at: number
  updated_at: number
  thumbnail_path: string | null
  step_count: number
  status: string
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    thumbnailPath: row.thumbnail_path,
    stepCount: row.step_count,
    status: row.status as Project['status']
  }
}

export const projectsRepo = {
  list(payload: ProjectsListPayload = {}): Project[] {
    const db = getDb()
    const { search, orderBy = 'updatedAt', orderDir = 'desc' } = payload
    const colMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      title: 'title'
    }
    const col = colMap[orderBy] ?? 'updated_at'
    const dir = orderDir === 'asc' ? 'ASC' : 'DESC'

    if (search) {
      const rows = db
        .prepare(
          `SELECT * FROM projects WHERE title LIKE ? ORDER BY ${col} ${dir}`
        )
        .all(`%${search}%`) as ProjectRow[]
      return rows.map(toProject)
    }

    const rows = db
      .prepare(`SELECT * FROM projects ORDER BY ${col} ${dir}`)
      .all() as ProjectRow[]
    return rows.map(toProject)
  },

  get(id: string): Project | null {
    const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | ProjectRow
      | undefined
    return row ? toProject(row) : null
  },

  create(title: string = 'Untitled Guide'): Project {
    const now = Date.now()
    const id = uuid()
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, description, created_at, updated_at, step_count, status)
         VALUES (?, ?, '', ?, ?, 0, 'draft')`
      )
      .run(id, title, now, now)
    return this.get(id)!
  },

  update(id: string, patch: Partial<Pick<Project, 'title' | 'description' | 'status' | 'thumbnailPath'>>): Project | null {
    const now = Date.now()
    const fields: string[] = ['updated_at = ?']
    const values: unknown[] = [now]

    if (patch.title !== undefined) { fields.push('title = ?'); values.push(patch.title) }
    if (patch.description !== undefined) { fields.push('description = ?'); values.push(patch.description) }
    if (patch.status !== undefined) { fields.push('status = ?'); values.push(patch.status) }
    if (patch.thumbnailPath !== undefined) { fields.push('thumbnail_path = ?'); values.push(patch.thumbnailPath) }

    values.push(id)
    getDb().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.get(id)
  },

  updateStepCount(id: string): void {
    const count = (getDb().prepare('SELECT COUNT(*) as c FROM steps WHERE project_id = ?').get(id) as { c: number }).c
    getDb().prepare('UPDATE projects SET step_count = ?, updated_at = ? WHERE id = ?').run(count, Date.now(), id)
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}
