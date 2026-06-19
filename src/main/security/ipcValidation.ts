/**
 * Zod-backed IPC payload validation. Every ipcMain channel is wrapped in
 * `validatedHandle()` so a malicious or compromised renderer cannot reach the
 * main-process handlers with malformed input. Failures are returned as a
 * structured `IpcResult` and logged with the channel name only — payload values
 * are never logged (to avoid leaking secrets / typed text into log files).
 */

import { ipcMain } from 'electron'
import { z, ZodError, ZodSchema } from 'zod'
import { logger } from '../utils/logger'
import type { IpcChannel } from '../../shared/ipcChannels'
import type { IpcResult } from '../../shared/types'

// ─── Primitive guards ────────────────────────────────────────────────────────

/** UUID v4 — used for project / step identifiers everywhere. */
const Uuid = z.string().uuid()

/** A path-segment safe string (no traversal, no NUL bytes, no absolute prefix). */
const SafePathSegment = z
  .string()
  .min(1)
  .max(256)
  .refine((s) => !s.includes('..') && !s.includes('\0') && !s.startsWith('/') && !s.startsWith('\\'), {
    message: 'unsafe_path'
  })

/** Bounded text — long enough for typed buffers, short enough to defeat memory abuse. */
const BoundedString = (max: number): ZodSchema<string> => z.string().max(max)

const FiniteInt = z.number().int().finite()
const FiniteNumber = z.number().finite()

// ─── Domain primitives ───────────────────────────────────────────────────────

const ActionTypeEnum = z.enum([
  'click',
  'right_click',
  'double_click',
  'type',
  'key',
  'scroll',
  'navigate',
  'custom'
])

const ProjectStatusEnum = z.enum(['draft', 'complete', 'archived'])
const ThemeEnum = z.enum(['light', 'dark', 'system'])

const ColorString = z
  .string()
  .max(32)
  .regex(/^(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]{1,64}\))$/, 'invalid_color')

const AnnotationSchema = z.discriminatedUnion('type', [
  z.object({
    id: BoundedString(64),
    type: z.literal('arrow'),
    x1: FiniteNumber,
    y1: FiniteNumber,
    x2: FiniteNumber,
    y2: FiniteNumber,
    color: ColorString
  }),
  z.object({
    id: BoundedString(64),
    type: z.literal('highlight'),
    x: FiniteNumber,
    y: FiniteNumber,
    width: FiniteNumber.nonnegative(),
    height: FiniteNumber.nonnegative(),
    color: ColorString,
    opacity: z.number().min(0).max(1)
  }),
  z.object({
    id: BoundedString(64),
    type: z.literal('redact'),
    x: FiniteNumber,
    y: FiniteNumber,
    width: FiniteNumber.nonnegative(),
    height: FiniteNumber.nonnegative()
  }),
  z.object({
    id: BoundedString(64),
    type: z.literal('text'),
    x: FiniteNumber,
    y: FiniteNumber,
    content: BoundedString(500),
    fontSize: FiniteNumber.positive().max(200),
    color: ColorString
  }),
  z.object({
    id: BoundedString(64),
    type: z.literal('click_dot'),
    x: FiniteNumber,
    y: FiniteNumber,
    color: ColorString,
    opacity: z.number().min(0).max(1).optional()
  }),
  z.object({
    id: BoundedString(64),
    type: z.literal('draw'),
    points: z.array(z.tuple([FiniteNumber, FiniteNumber])).max(5_000),
    color: ColorString,
    opacity: z.number().min(0).max(1),
    strokeWidth: FiniteNumber.positive().max(64)
  })
])

// ─── Channel schemas ─────────────────────────────────────────────────────────

export const Schemas = {
  // Recording
  recordingStart: z.tuple([
    z.object({
      projectId: Uuid,
      // Up to 16 displays may be selected for simultaneous capture.
      displayIds: z.array(BoundedString(64)).max(16).optional(),
      captureMouseClicks: z.boolean(),
      captureTyping: z.boolean(),
      captureScrolling: z.boolean(),
      captureVoice: z.boolean().optional(),
      screenshotDelay: FiniteInt.min(0).max(10_000),
      cropRadius: FiniteInt.min(50).max(4_096)
    })
  ]),
  recordingStop: z.tuple([]),
  recordingPause: z.tuple([]),
  recordingResume: z.tuple([]),
  getDisplays: z.tuple([]),

  // Projects
  projectsList: z.tuple([
    z
      .object({
        search: BoundedString(200).optional(),
        orderBy: z.enum(['createdAt', 'updatedAt', 'title']).optional(),
        orderDir: z.enum(['asc', 'desc']).optional()
      })
      .optional()
  ]),
  projectsGet: z.tuple([Uuid]),
  projectsCreate: z.tuple([BoundedString(200).optional()]),
  projectsUpdate: z.tuple([
    Uuid,
    z.object({
      title: BoundedString(200).optional(),
      description: BoundedString(5_000).optional(),
      status: ProjectStatusEnum.optional(),
      thumbnailPath: SafePathSegment.optional()
    })
  ]),
  projectsDelete: z.tuple([Uuid]),

  // Steps
  stepsList: z.tuple([Uuid]),
  stepsGet: z.tuple([Uuid]),
  stepsUpdate: z.tuple([
    Uuid,
    z.object({
      description: BoundedString(5_000).optional()
    })
  ]),
  stepsUpdateAnnotations: z.tuple([Uuid, z.array(AnnotationSchema).max(500)]),
  stepsUpdateCrop: z.tuple([
    z.object({
      stepId: Uuid,
      cropX: FiniteInt.nonnegative().max(50_000),
      cropY: FiniteInt.nonnegative().max(50_000),
      cropRadius: FiniteInt.min(50).max(4_096)
    })
  ]),
  stepsReorder: z.tuple([
    z.object({
      projectId: Uuid,
      orderedIds: z.array(Uuid).max(10_000)
    })
  ]),
  stepsDelete: z.tuple([Uuid]),

  // AI
  aiGenerateAll: z.tuple([Uuid]),
  aiRegenerateStep: z.tuple([Uuid, BoundedString(200)]),
  aiCancel: z.tuple([Uuid]),
  aiTestKey: z.tuple([BoundedString(512)]),
  aiSetKey: z.tuple([BoundedString(512)]),
  aiTranscribe: z.tuple([Uuid]),
  audioRecordingStop: z.tuple([z.object({
    projectId: Uuid,
    startedAt: FiniteInt.positive()
  })]),

  // Export
  exportPayload: z.tuple([
    z.object({
      projectId: Uuid,
      // outputPath comes from the OS save-dialog, which the main process
      // controls — we still bound it to defeat any renderer-side spoof.
      outputPath: BoundedString(4_096).refine((p) => !p.includes('\0'), 'unsafe_path'),
      options: z.object({
        includeStepNumbers: z.boolean(),
        screenshotMaxWidth: FiniteInt.min(100).max(8_000),
        stepsPerPage: FiniteInt.min(1).max(4).optional()
      })
    })
  ]),
  showSaveDialog: z.tuple([
    z.object({
      title: BoundedString(200),
      defaultPath: BoundedString(4_096),
      filters: z
        .array(
          z.object({
            name: BoundedString(100),
            extensions: z.array(BoundedString(20)).max(20)
          })
        )
        .max(20)
    })
  ]),
  openItem: z.tuple([BoundedString(4_096)]),

  // Settings
  settingsGet: z.tuple([]),
  settingsSet: z.tuple([
    z
      .object({
        aiProvider: z.enum(['anthropic', 'openai', 'google', 'openai-compatible']).optional(),
        aiApiKey: BoundedString(512).optional(),
        // Larger cap on model since some local-LLM identifiers are long.
        aiModel: BoundedString(200).optional(),
        // Base URL only meaningful for openai-compatible providers.
        aiBaseUrl: z
          .string()
          .max(2_048)
          .refine(
            (v) => v === '' || /^https?:\/\//i.test(v),
            'must_be_http_or_https'
          )
          .optional(),
        // Legacy alias — accepted on `set` so old clients keep working;
        // the repo migrates the value into `aiApiKey`.
        anthropicApiKey: BoundedString(512).optional(),
        defaultCropRadius: FiniteInt.min(50).max(4_096).optional(),
        defaultScreenshotDelay: FiniteInt.min(0).max(10_000).optional(),
        captureTyping: z.boolean().optional(),
        captureScrolling: z.boolean().optional(),
        autoGenerateDescriptions: z.boolean().optional(),
        theme: ThemeEnum.optional(),
        transcriptionApiKey: BoundedString(512).optional(),
        transcriptionBaseUrl: z
          .string()
          .max(2_048)
          .refine((v) => v === '' || /^https?:\/\//i.test(v), 'must_be_http_or_https')
          .optional()
      })
      .strict()
  ]),
  openExternal: z.tuple([
    z
      .string()
      .max(2_048)
      .url()
      .refine((u) => /^https:\/\//i.test(u), 'must_be_https')
  ])
} as const

export type SchemaKey = keyof typeof Schemas

// ─── Wrapper ─────────────────────────────────────────────────────────────────

type Handler<TArgs extends unknown[], TResult> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<IpcResult<TResult>> | IpcResult<TResult>

/**
 * Register an IPC handler whose payload is parsed by Zod before delegation.
 *
 * Invariants enforced here:
 *   - rejects events whose senderFrame is not the main top-level frame
 *   - returns `{ error: 'invalid_payload' }` on validation failure
 *   - never logs payload values (only the channel + zod path)
 */
export function validatedHandle<K extends SchemaKey, T>(
  channel: IpcChannel,
  schemaKey: K,
  handler: Handler<z.infer<(typeof Schemas)[K]>, T>
): void {
  const schema = Schemas[schemaKey]
  ipcMain.handle(channel, async (event, ...args) => {
    // Frame check: refuse messages from sub-frames or detached web contents.
    if (event.senderFrame && event.senderFrame.parent !== null) {
      logger.warn(`IPC ${channel}: rejected sub-frame sender`)
      return { error: 'frame_not_allowed' } satisfies IpcResult<T>
    }

    let parsed: z.infer<typeof schema>
    try {
      parsed = schema.parse(args) as z.infer<typeof schema>
    } catch (err) {
      const path = err instanceof ZodError ? err.issues.map((i) => i.path.join('.')).join(',') : 'unknown'
      logger.warn(`IPC ${channel}: invalid_payload at [${path}]`)
      return { error: 'invalid_payload' } satisfies IpcResult<T>
    }

    try {
      return await handler(event, ...(parsed as z.infer<(typeof Schemas)[K]>))
    } catch (err) {
      logger.error(`IPC ${channel}: handler error`, String(err))
      return { error: 'internal_error' } satisfies IpcResult<T>
    }
  })
}

/** Exposed for tests. */
export const __test__ = { Schemas }
