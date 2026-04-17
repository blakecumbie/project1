import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ts))
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function actionTypeLabel(type: string): string {
  const map: Record<string, string> = {
    click: 'Click',
    right_click: 'Right Click',
    double_click: 'Double Click',
    type: 'Type',
    key: 'Key Press',
    scroll: 'Scroll',
    navigate: 'Navigate',
    custom: 'Action'
  }
  return map[type] ?? type
}

export function imgSrc(relativePath: string | null): string {
  if (!relativePath) return ''
  return `sopimg://${relativePath}`
}
