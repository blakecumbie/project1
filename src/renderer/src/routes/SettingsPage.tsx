import React, { useState, useEffect } from 'react'
import { Check, X, Eye, EyeOff, Loader2, ExternalLink } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { ai as aiApi } from '@/lib/ipc'

export function SettingsPage(): React.ReactElement {
  const { settings, loadSettings, updateSettings } = useSettingsStore()
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'valid' | 'invalid' | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { setApiKey(settings.anthropicApiKey ? '••••••••••••••••' : '') }, [settings.anthropicApiKey])

  const handleTestKey = async () => {
    if (!apiKey || apiKey.startsWith('•')) return
    setTesting(true)
    setTestResult(null)
    const res = await aiApi.testKey(apiKey)
    setTestResult(res.data?.valid ? 'valid' : 'invalid')
    setTesting(false)
  }

  const handleSaveKey = async () => {
    if (!apiKey || apiKey.startsWith('•')) return
    setSaving(true)
    await updateSettings({ anthropicApiKey: apiKey })
    await aiApi.setKey(apiKey)
    setSaving(false)
    setTestResult(null)
    setApiKey('••••••••••••••••')
  }

  const handleClearKey = async () => {
    await updateSettings({ anthropicApiKey: '' })
    setApiKey('')
    setTestResult(null)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="space-y-6">

        {/* API Key */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-1">Anthropic API Key</h2>
          <p className="text-sm text-slate-500 mb-4">
            Required for AI-generated step descriptions.{' '}
            <button
              onClick={() => window.api.invoke(window.api.channels.OPEN_EXTERNAL, 'https://console.anthropic.com/settings/keys')}
              className="text-sky-600 hover:underline inline-flex items-center gap-0.5"
            >
              Get your key <ExternalLink className="w-3 h-3" />
            </button>
          </p>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null) }}
                placeholder="sk-ant-…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 pr-9"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button onClick={handleTestKey} disabled={testing || !apiKey || apiKey.startsWith('•')} className="btn-secondary">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
            </button>
            <button onClick={handleSaveKey} disabled={saving || !apiKey || apiKey.startsWith('•')} className="btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>

          {testResult === 'valid' && (
            <p className="text-xs text-green-600 flex items-center gap-1 mt-2"><Check className="w-3.5 h-3.5" /> API key is valid</p>
          )}
          {testResult === 'invalid' && (
            <p className="text-xs text-red-600 flex items-center gap-1 mt-2"><X className="w-3.5 h-3.5" /> Invalid API key</p>
          )}
          {settings.anthropicApiKey && (
            <button onClick={handleClearKey} className="text-xs text-red-500 hover:underline mt-2 block">Remove saved key</button>
          )}
        </div>

        {/* AI Model */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-1">AI Model</h2>
          <p className="text-sm text-slate-500 mb-4">Model used for generating step descriptions</p>
          <select
            value={settings.aiModel}
            onChange={(e) => updateSettings({ aiModel: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400"
          >
            <option value="claude-haiku-4-5-20251001">Claude Haiku (Fastest, lowest cost)</option>
            <option value="claude-sonnet-4-5">Claude Sonnet (Best quality)</option>
          </select>
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
