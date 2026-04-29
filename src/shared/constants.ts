export const DEFAULT_CROP_RADIUS = 420
export const DEFAULT_SCREENSHOT_DELAY_MS = 350
export const DEFAULT_AI_PROVIDER = 'anthropic' as const
export const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001'

/** Default model per provider — used when the user switches provider. */
export const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
  'openai-compatible': 'llama3.2-vision'
}
export const SCREENSHOT_JPEG_QUALITY = 88
export const SCREENSHOT_MAX_WIDTH = 900
export const AI_RATE_LIMIT_DELAY_MS = 1500
export const MAX_TYPED_TEXT_LENGTH = 300
export const OVERLAY_WIDTH = 340
export const OVERLAY_HEIGHT = 80
export const IMG_PROTOCOL = 'sopimg'
