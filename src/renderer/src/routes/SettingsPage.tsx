import React, { useState, useEffect, useMemo } from 'react'
import { Check, X, Eye, EyeOff, Loader2, ExternalLink } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { ai as aiApi } from '@/lib/ipc'
import { DEFAULT_MODEL_BY_PROVIDER } from '../../../shared/constants'
import type { AiProvider } from '../../../shared/types'

interface ProviderConfig {
  id: AiProvider
  label: string
  models: Array<{ value: string; label: string }>
  /** Free-text "model" field for self-hosted endpoints. */
  freeFormModel?: boolean
  /** Show an additional base-URL input. */
  showBaseUrl?: boolean
  /** Whether the API key is required. */
  requireKey: boolean
  /** External page where the user can obtain the key. */
  keyUrl?: string
  /** Placeholder for the key input. */
  keyPlaceholder: string
  /** Placeholder for the base-URL input (where applicable). */
  baseUrlPlaceholder?: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    requireKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    models: [
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (best quality)' },
      { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' }
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    requireKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o mini (fast, low cost)' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' }
    ]
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    requireKey: true,
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
    ]
  },
  {
    id: 'openai-compatible',
    label: 'Custom / Self-hosted (OpenAI-compatible)',
    requireKey: false,
    freeFormModel: true,
    showBaseUrl: true,
    keyPlaceholder: '(optional, leave blank for local servers)',
    baseUrlPlaceholder: 'http://localhost:11434/v1',
    models: [
      { value: 'llama3.2-vision', label: 'llama3.2-vision (Ollama)' },
      { value: 'llava', label: 'llava (LM Studio / Ollama)' },
      { value: 'qwen2-vl-7b-instruct', label: 'qwen2-vl-7b-instruct' }
    ]
  }
]

export function SettingsPage(): React.ReactElement {
  const { settings, loadSettings, updateSettings } = useSettingsStore()
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'valid' | 'invalid' | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])
  useEffect(() => {
    setApiKey(settings.aiApiKey ? '••••••••••••••••' : '')
  }, [settings.aiApiKey])
  useEffect(() => {
    setBaseUrl(settings.aiBaseUrl ?? '')
  }, [settings.aiBaseUrl])

  const provider = useMemo(
    () => PROVIDERS.find((p) => p.id === settings.aiProvider) ?? PROVIDERS[0],
    [settings.aiProvider]
  )

  const handleProviderChange = async (id: AiProvider): Promise<void> => {
    // When the provider changes, also reset the model to the provider's default
    // so the user isn't sending e.g. an Anthropic model name to OpenAI.
    const nextModel = DEFAULT_MODEL_BY_PROVIDER[id] ?? settings.aiModel
    await updateSettings({ aiProvider: id, aiModel: nextModel })
    setTestResult(null)
  }

  const handleTestKey = async (): Promise<void> => {
    // Local servers may not need a key — allow testing without one.
    if (!provider.requireKey ? false : !apiKey || apiKey.startsWith('•')) return
    setTesting(true)
    setTestResult(null)
    // Persist the URL/provider/model first so the test call uses them.
    if (provider.showBaseUrl) await updateSettings({ aiBaseUrl: baseUrl })
    const res = await aiApi.testKey(apiKey.startsWith('•') ? settings.aiApiKey : apiKey)
    setTestResult(res.data?.valid ? 'valid' : 'invalid')
    setTesting(false)
  }

  const handleSaveKey = async (): Promise<void> => {
    if (provider.requireKey && (!apiKey || apiKey.startsWith('•'))) return
    setSaving(true)
    if (provider.showBaseUrl) await updateSettings({ aiBaseUrl: baseUrl })
    if (!apiKey.startsWith('•')) {
      await updateSettings({ aiApiKey: apiKey })
      await aiApi.setKey(apiKey)
    }
    setSaving(false)
    setTestResult(null)
    if (apiKey) setApiKey('••••••••••••••••')
  }

  const handleClearKey = async (): Promise<void> => {
    await updateSettings({ aiApiKey: '' })
    await aiApi.setKey('')
    setApiKey('')
    setTestResult(null)
  }

  const modelInForm = settings.aiModel
  const modelKnown = provider.models.some((m) => m.value === modelInForm)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="space-y-6">

        {/* Provider */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-1">AI Provider</h2>
          <p className="text-sm text-slate-500 mb-4">
            Choose which LLM service generates step descriptions. The same API key
            field is reused across providers — only the value changes.
          </p>
          <select
            value={settings.aiProvider}
            onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-1">
            {provider.requireKey ? 'API Key' : 'API Key (optional)'}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {provider.requireKey
              ? 'Required for AI-generated step descriptions.'
              : 'Most local servers (Ollama, LM Studio) accept unauthenticated requests — leave blank if so.'}
            {provider.keyUrl && (
              <>
                {' '}
                <button
                  onClick={() => window.api.invoke(window.api.channels.OPEN_EXTERNAL, provider.keyUrl!)}
                  className="text-sky-600 hover:underline inline-flex items-center gap-0.5"
                >
                  Get your key <ExternalLink className="w-3 h-3" />
                </button>
              </>
            )}
          </p>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null) }}
                placeholder={provider.keyPlaceholder}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 pr-9"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleTestKey}
              disabled={testing || (provider.requireKey && (!apiKey || apiKey.startsWith('•')))}
              className="btn-secondary"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
            </button>
            <button
              onClick={handleSaveKey}
              disabled={saving || (provider.requireKey && (!apiKey || apiKey.startsWith('•')))}
              className="btn-primary"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>

          {provider.showBaseUrl && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={provider.baseUrlPlaceholder}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Any OpenAI-Chat-Completions-compatible endpoint: Ollama, LM Studio, vLLM,
                OpenRouter, Together, Groq, etc.
              </p>
            </div>
          )}

          {testResult === 'valid' && (
            <p className="text-xs text-green-600 flex items-center gap-1 mt-2"><Check className="w-3.5 h-3.5" /> Credentials valid</p>
          )}
          {testResult === 'invalid' && (
            <p className="text-xs text-red-600 flex items-center gap-1 mt-2"><X className="w-3.5 h-3.5" /> Test request failed</p>
          )}
          {settings.aiApiKey && (
            <button onClick={handleClearKey} className="text-xs text-red-500 hover:underline mt-2 block">Remove saved key</button>
          )}
        </div>

        {/* Model */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-1">Model</h2>
          <p className="text-sm text-slate-500 mb-4">Model used for generating step descriptions</p>
          {provider.freeFormModel ? (
            <input
              type="text"
              value={settings.aiModel}
              onChange={(e) => updateSettings({ aiModel: e.target.value })}
              placeholder={provider.models[0]?.value}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 font-mono"
              list="known-models"
            />
          ) : (
            <select
              value={modelKnown ? modelInForm : ''}
              onChange={(e) => updateSettings({ aiModel: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400"
            >
              {!modelKnown && <option value="">{modelInForm} (current)</option>}
              {provider.models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}
          <datalist id="known-models">
            {provider.models.map((m) => <option key={m.value} value={m.value} />)}
          </datalist>
        </div>

        {/* Voice Transcription */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-1">Voice Transcription</h2>
          <p className="text-sm text-slate-500 mb-4">
            OpenAI Whisper API is used to transcribe voice recordings. Leave the key blank to reuse
            your main API key (only works when the provider above is OpenAI).
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Whisper API Key (optional)</label>
              <input
                type="password"
                value={settings.transcriptionApiKey ?? ''}
                onChange={(e) => updateSettings({ transcriptionApiKey: e.target.value })}
                placeholder="sk-… (leave blank to reuse main AI key)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Transcription Base URL (optional)</label>
              <input
                type="text"
                value={settings.transcriptionBaseUrl ?? ''}
                onChange={(e) => updateSettings({ transcriptionBaseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use Groq, Deepgram, or any Whisper-compatible endpoint. Leave blank for OpenAI.
              </p>
            </div>
          </div>
        </div>

        {/* Recording */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-4">Recording Defaults</h2>
          <div className="space-y-4">
            <ToggleSetting
              label="Auto-generate AI descriptions"
              desc="Automatically generate descriptions after recording stops"
              checked={settings.autoGenerateDescriptions}
              onChange={(v) => updateSettings({ autoGenerateDescriptions: v })}
            />
            <ToggleSetting
              label="Capture keyboard input"
              desc="Record what you type (disable for sensitive workflows)"
              checked={settings.captureTyping}
              onChange={(v) => updateSettings({ captureTyping: v })}
            />
            <ToggleSetting
              label="Capture scroll events"
              desc="Record when you scroll through content"
              checked={settings.captureScrolling}
              onChange={(v) => updateSettings({ captureScrolling: v })}
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Screenshot delay: <span className="text-sky-600">{settings.defaultScreenshotDelay}ms</span>
              </label>
              <p className="text-xs text-slate-500 mb-2">Wait time after action before taking screenshot (increase if UI is slow)</p>
              <input
                type="range" min="100" max="1000" step="50"
                value={settings.defaultScreenshotDelay}
                onChange={(e) => updateSettings({ defaultScreenshotDelay: Number(e.target.value) })}
                className="w-full accent-sky-500"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function ToggleSetting({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <div
        className={`w-10 h-6 rounded-full relative cursor-pointer flex-shrink-0 transition-colors ${checked ? 'bg-sky-500' : 'bg-slate-200'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? 'left-5' : 'left-1'}`} />
      </div>
    </div>
  )
}
