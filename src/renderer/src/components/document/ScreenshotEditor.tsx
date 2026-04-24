import React, { useState, useRef, useEffect, useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import { X, Pen, Square, Crop, Trash2, Check, Loader2 } from 'lucide-react'
import { cn, imgSrc } from '@/lib/utils'
import { steps as stepsApi } from '@/lib/ipc'
import { useProjectStore } from '@/store/projectStore'
import { DEFAULT_CROP_RADIUS } from '../../../../shared/constants'
import type { Step, Annotation } from '../../../../shared/types'

type Tool = 'draw' | 'highlight' | 'recrop'

interface HighlightDraft {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface CropDrag {
  startMouseX: number
  startMouseY: number
  startCropX: number
  startCropY: number
}

interface Props {
  step: Step
  onClose: () => void
}

export function ScreenshotEditor({ step, onClose }: Props): React.ReactElement {
  const { refreshStep } = useProjectStore()

  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState('#ef4444')
  const [opacity, setOpacity] = useState(0.8)
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [annotations, setAnnotations] = useState<Annotation[]>(step.annotations)

  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<Array<[number, number]>>([])
  const [highlightDraft, setHighlightDraft] = useState<HighlightDraft | null>(null)

  const [cropRect, setCropRect] = useState({
    x: step.cropX ?? 500,
    y: step.cropY ?? 400,
    radius: step.cropRadius ?? DEFAULT_CROP_RADIUS
  })
  const [cropDragging, setCropDragging] = useState(false)
  const [cropDrag, setCropDrag] = useState<CropDrag | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const showingFull = Boolean(step.fullScreenshotPath)
  const imgUrl = showingFull
    ? imgSrc(step.fullScreenshotPath!)
    : imgSrc(step.screenshotPath ?? '')

  // Convert mouse event → natural image coordinates
  const toImgCoords = useCallback((e: React.MouseEvent): [number, number] => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const img = imgRef.current!
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY
    ]
  }, [])

  // Draw in-progress state on the canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || img.naturalWidth === 0) return

    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (tool === 'draw' && currentStroke.length > 1) {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.globalAlpha = opacity
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      currentStroke.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    if (tool === 'highlight' && highlightDraft) {
      const { startX, startY, currentX, currentY } = highlightDraft
      ctx.globalAlpha = opacity
      ctx.fillStyle = color
      ctx.fillRect(
        Math.min(startX, currentX),
        Math.min(startY, currentY),
        Math.abs(currentX - startX),
        Math.abs(currentY - startY)
      )
      ctx.globalAlpha = 1
    }

    if (tool === 'recrop' && showingFull) {
      const { x, y, radius } = cropRect
      const l = x - radius
      const t = y - radius
      const w = radius * 2
      const h = radius * 2

      // Darken everything outside the crop region
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.clearRect(Math.max(0, l), Math.max(0, t), Math.min(w, canvas.width - l), Math.min(h, canvas.height - t))

      // Crop border
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 3
      ctx.globalAlpha = 1
      ctx.strokeRect(Math.max(0, l), Math.max(0, t), w, h)

      // Corner handles
      const hs = 12
      ;[
        [Math.max(0, l), Math.max(0, t)],
        [Math.min(canvas.width, l + w), Math.max(0, t)],
        [Math.max(0, l), Math.min(canvas.height, t + h)],
        [Math.min(canvas.width, l + w), Math.min(canvas.height, t + h)]
      ].forEach(([hx, hy]) => {
        ctx.fillStyle = '#fff'
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 2
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs)
      })
    }
  }, [tool, currentStroke, highlightDraft, color, opacity, strokeWidth, cropRect, showingFull])

  useEffect(() => {
    redrawCanvas()
  }, [redrawCanvas])

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const [ix, iy] = toImgCoords(e)

    if (tool === 'draw') {
      setIsDrawing(true)
      setCurrentStroke([[ix, iy]])
    } else if (tool === 'highlight') {
      setHighlightDraft({ startX: ix, startY: iy, currentX: ix, currentY: iy })
    } else if (tool === 'recrop' && showingFull) {
      setCropDragging(true)
      setCropDrag({ startMouseX: ix, startMouseY: iy, startCropX: cropRect.x, startCropY: cropRect.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault()
    const [ix, iy] = toImgCoords(e)

    if (tool === 'draw' && isDrawing) {
      setCurrentStroke(prev => [...prev, [ix, iy]])
    } else if (tool === 'highlight' && highlightDraft) {
      setHighlightDraft(prev => prev ? { ...prev, currentX: ix, currentY: iy } : null)
    } else if (tool === 'recrop' && cropDragging && cropDrag) {
      const dx = ix - cropDrag.startMouseX
      const dy = iy - cropDrag.startMouseY
      setCropRect(prev => ({ ...prev, x: cropDrag.startCropX + dx, y: cropDrag.startCropY + dy }))
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault()
    const [ix, iy] = toImgCoords(e)

    if (tool === 'draw' && isDrawing) {
      const finalStroke: Array<[number, number]> = [...currentStroke, [ix, iy]]
      if (finalStroke.length >= 2) {
        const newAnnotation: Annotation = {
          id: uuid(),
          type: 'draw',
          points: finalStroke,
          color,
          opacity,
          strokeWidth
        }
        setAnnotations(prev => [...prev, newAnnotation])
      }
      setIsDrawing(false)
      setCurrentStroke([])
    } else if (tool === 'highlight' && highlightDraft) {
      const { startX, startY } = highlightDraft
      const w = ix - startX
      const h = iy - startY
      if (Math.abs(w) > 4 && Math.abs(h) > 4) {
        const newAnnotation: Annotation = {
          id: uuid(),
          type: 'highlight',
          x: Math.min(startX, ix),
          y: Math.min(startY, iy),
          width: Math.abs(w),
          height: Math.abs(h),
          color,
          opacity
        }
        setAnnotations(prev => [...prev, newAnnotation])
      }
      setHighlightDraft(null)
    } else if (tool === 'recrop') {
      setCropDragging(false)
      setCropDrag(null)
    }
  }

  const handleMouseLeave = (e: React.MouseEvent) => {
    if (isDrawing) handleMouseUp(e)
    if (tool === 'highlight' && highlightDraft) {
      setHighlightDraft(null)
    }
    if (cropDragging) {
      setCropDragging(false)
      setCropDrag(null)
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const removeAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await stepsApi.updateAnnotations(step.id, annotations)
      await refreshStep(step.id)
      onClose()
    } catch (err) {
      setError('Save failed')
      setSaving(false)
    }
  }

  const handleApplyCrop = async () => {
    setSaving(true)
    setError(null)
    const result = await stepsApi.updateCrop({
      stepId: step.id,
      cropX: Math.round(cropRect.x),
      cropY: Math.round(cropRect.y),
      cropRadius: Math.round(cropRect.radius)
    })
    if (result.data) {
      await refreshStep(step.id)
      onClose()
    } else {
      setError(result.error ?? 'Re-crop failed')
      setSaving(false)
    }
  }

  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    cursor: tool === 'recrop' ? (cropDragging ? 'grabbing' : 'grab') : 'crosshair'
  }

  // Annotation list: only user-added draw/highlight (not click_dot)
  const editableAnnotations = annotations.filter(a => a.type === 'draw' || a.type === 'highlight')

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700 flex-wrap flex-shrink-0">
        {/* Tool selector */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setTool('draw')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              tool === 'draw' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700')}
          >
            <Pen className="w-3.5 h-3.5" /> Draw
          </button>
          <button
            onClick={() => setTool('highlight')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              tool === 'highlight' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700')}
          >
            <Square className="w-3.5 h-3.5" /> Highlight
          </button>
          {showingFull && (
            <button
              onClick={() => setTool('recrop')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                tool === 'recrop' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700')}
            >
              <Crop className="w-3.5 h-3.5" /> Re-crop
            </button>
          )}
        </div>

        {/* Color + opacity (not for recrop) */}
        {tool !== 'recrop' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Opacity</label>
              <input
                type="range" min="0.1" max="1" step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-24"
              />
              <span className="text-xs text-slate-400 w-8">{Math.round(opacity * 100)}%</span>
            </div>
            {tool === 'draw' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Width</label>
                <div className="flex gap-1">
                  {[2, 4, 6, 10].map(w => (
                    <button
                      key={w}
                      onClick={() => setStrokeWidth(w)}
                      className={cn('w-8 h-8 rounded flex items-center justify-center text-xs font-medium transition-colors',
                        strokeWidth === w ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600')}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Re-crop radius control */}
        {tool === 'recrop' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Crop size</label>
            <input
              type="range" min="100" max="800" step="10"
              value={cropRect.radius}
              onChange={(e) => setCropRect(prev => ({ ...prev, radius: parseInt(e.target.value) }))}
              className="w-28"
            />
            <span className="text-xs text-slate-400">{cropRect.radius * 2}px</span>
          </div>
        )}

        {error && <span className="text-xs text-red-400 ml-2">{error}</span>}

        <div className="ml-auto flex items-center gap-2">
          {tool === 'recrop' ? (
            <button
              onClick={handleApplyCrop}
              disabled={saving || !showingFull}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Apply Crop
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Canvas / image area */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-6">
          <div ref={containerRef} className="relative inline-block max-w-full max-h-full">
            <img
              ref={imgRef}
              src={imgUrl}
              alt="Screenshot"
              className="block max-h-[75vh] max-w-full object-contain select-none"
              draggable={false}
              onLoad={redrawCanvas}
            />
            {/* Committed annotations overlay (SVG, below the canvas) */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              viewBox={`0 0 ${imgRef.current?.naturalWidth ?? 900} ${imgRef.current?.naturalHeight ?? 600}`}
              preserveAspectRatio="none"
            >
              {annotations.map((a) => {
                if (a.type === 'highlight') {
                  return <rect key={a.id} x={a.x} y={a.y} width={a.width} height={a.height} fill={a.color} opacity={a.opacity} />
                }
                if (a.type === 'draw' && a.points.length >= 2) {
                  const d = a.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
                  return <path key={a.id} d={d} stroke={a.color} strokeWidth={a.strokeWidth} strokeOpacity={a.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                }
                if (a.type === 'click_dot') {
                  return <circle key={a.id} cx={a.x} cy={a.y} r={10} fill={a.color} opacity={a.opacity ?? 0.75} />
                }
                return null
              })}
            </svg>
            {/* Interactive canvas overlay */}
            <canvas
              ref={canvasRef}
              style={canvasStyle}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            />
          </div>
        </div>

        {/* Sidebar: annotation list */}
        {tool !== 'recrop' && editableAnnotations.length > 0 && (
          <div className="w-48 bg-slate-900 border-l border-slate-700 flex flex-col flex-shrink-0">
            <div className="px-3 py-2 border-b border-slate-700">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Annotations</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {editableAnnotations.map((a, i) => (
                <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-slate-800 group">
                  <div
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: (a as { color: string }).color, opacity: (a as { opacity: number }).opacity }}
                  />
                  <span className="text-xs text-slate-300 flex-1 truncate">
                    {a.type === 'draw' ? `Stroke ${i + 1}` : `Highlight ${i + 1}`}
                  </span>
                  <button
                    onClick={() => removeAnnotation(a.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Re-crop no-full-screenshot notice */}
        {tool === 'recrop' && !showingFull && (
          <div className="w-64 bg-slate-900 border-l border-slate-700 flex items-center justify-center p-6">
            <div className="text-center">
              <Crop className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400 leading-relaxed">
                Full screenshot not available for this step.
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Re-record this step in v2.0 to enable re-cropping.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
