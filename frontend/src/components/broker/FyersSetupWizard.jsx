import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Link as LinkIcon } from 'lucide-react'
import Modal from '../common/Modal'
import { useToast } from '../common/Toast'
import { getFyersCredentials, getFyersLogin, getFyersStatus, saveFyersCredentials } from '../../api/broker'

const FALLBACK_REDIRECT = 'http://127.0.0.1:8000/api/v1/auth/fyers/callback'
const FYERS_DASHBOARD = 'https://myapi.fyers.in/dashboard'

const STEPS = ['Create App', 'Enter Keys', 'Connect']

function StepIndicator({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 22 }}>
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 92 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
                background: done || active ? 'var(--primary)' : 'var(--primary-bg)',
                color: done || active ? '#fff' : '#93C5FD',
                boxShadow: active ? '0 0 0 4px rgba(37,99,235,0.15)' : 'none',
                transition: 'all 0.2s'
              }}>
                {done ? <Check size={15} strokeWidth={3} /> : n}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--primary)' : '#8B93A7' }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 46, height: 2, borderRadius: 2, marginBottom: 18, background: step > n ? 'var(--primary)' : 'var(--border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function InstructionRow({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: 'var(--primary-bg)', color: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700
      }}>{n}</span>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>{children}</div>
    </div>
  )
}

export default function FyersSetupWizard({ isOpen, onClose, onConnected }) {
  const [step, setStep] = useState(1)
  const [redirectUri, setRedirectUri] = useState(FALLBACK_REDIRECT)
  const [existing, setExisting] = useState(null)     // { configured, app_id_masked }
  const [appId, setAppId] = useState('')
  const [secretId, setSecretId] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollRef = useRef(null)
  const { success, error } = useToast()

  useEffect(() => {
    if (!isOpen) return
    setStep(1)
    setAppId('')
    setSecretId('')
    setFormError('')
    setCopied(false)
    getFyersCredentials()
      .then(({ data }) => {
        if (data.redirect_uri) setRedirectUri(data.redirect_uri)
        setExisting(data)
      })
      .catch(() => setExisting(null))
    return () => clearInterval(pollRef.current)
  }, [isOpen])

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = redirectUri
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const saveKeys = async () => {
    setFormError('')
    if (!appId.trim()) { setFormError('App ID is required'); return }
    if (!secretId.trim()) { setFormError('Secret ID is required'); return }
    setSaving(true)
    try {
      await saveFyersCredentials(appId.trim().toUpperCase(), secretId.trim())
      success('Credentials saved to the server configuration')
      setSecretId('')
      setStep(3)
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save credentials')
    } finally {
      setSaving(false)
    }
  }

  const connect = async () => {
    setConnecting(true)
    // Open synchronously so popup blockers allow it, then navigate.
    const popup = window.open('', 'fyers-connect', 'width=520,height=720')
    if (!popup) {
      setConnecting(false)
      error('Popup blocked. Allow popups for this site and try again.')
      return
    }
    try {
      const res = await getFyersLogin()
      popup.location.href = res.data.login_url || res.data.auth_url
      const startedAt = Date.now()
      pollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > 180000) {
          clearInterval(pollRef.current)
          setConnecting(false)
          error('Fyers connection timed out — try Connect again')
          return
        }
        try {
          const { data } = await getFyersStatus()
          if (data?.connected) {
            clearInterval(pollRef.current)
            try { popup.close() } catch {}
            setConnecting(false)
            success('Fyers connected — live market data is now active')
            onConnected?.()
            onClose?.()
          }
        } catch {}
      }, 3000)
    } catch (err) {
      try { popup.close() } catch {}
      setConnecting(false)
      error(err.response?.data?.detail || 'Unable to generate the Fyers login URL')
    }
  }

  const footerBtn = { height: 38, padding: '0 18px', fontSize: 13 }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Fyers Broker" maxWidth={620}>
      <StepIndicator step={step} />

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 12, color: '#8B93A7', lineHeight: 1.5 }}>
            First, create a (free) API app in your Fyers account. It takes about a minute.
          </p>
          <InstructionRow n={1}>
            Open the Fyers API dashboard and sign in:{' '}
            <a href={FYERS_DASHBOARD} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              myapi.fyers.in/dashboard <ExternalLink size={12} />
            </a>
          </InstructionRow>
          <InstructionRow n={2}>
            Click <b>Create App</b>. Give it any name — e.g. <b>StrikeFluency</b>.
          </InstructionRow>
          <InstructionRow n={3}>
            Paste this exact <b>Redirect URL</b> into the form:
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input className="sf-input" readOnly value={redirectUri}
                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, background: '#F8FBFF', color: 'var(--primary-dark)' }} />
              <button type="button" onClick={copyRedirect} className="sf-btn-outline"
                style={{ height: 40, padding: '0 14px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, color: copied ? 'var(--gain)' : undefined }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </InstructionRow>
          <InstructionRow n={4}>
            Tick the <b>App Permissions</b> you need (Profile Details is enough for market data), accept the API usage terms, and click <b>Create App</b>.
          </InstructionRow>
          <InstructionRow n={5}>
            Fyers will show your new <b>App ID</b> and <b>Secret ID</b> — keep that page open and continue here.
          </InstructionRow>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" className="sf-btn-primary" style={footerBtn} onClick={() => setStep(2)}>
              I created the app — Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 12, color: '#8B93A7', lineHeight: 1.5 }}>
            Paste the keys from your Fyers app. They are stored in the server&apos;s configuration file automatically — you never have to edit anything by hand.
          </p>
          {existing?.configured && (
            <div style={{ background: 'var(--primary-bg)', border: '1px solid #BFDBFE', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--primary-dark)' }}>
              Currently configured: <b>{existing.app_id_masked}</b> — entering new keys will replace it.
            </div>
          )}
          <div>
            <label className="sf-label">App ID</label>
            <input className="sf-input" value={appId}
              onChange={e => setAppId(e.target.value.toUpperCase())}
              placeholder="ABCDE123XY-100"
              style={{ fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          <div>
            <label className="sf-label">Secret ID</label>
            <input className="sf-input" type="password" value={secretId}
              onChange={e => setSecretId(e.target.value)}
              placeholder="Paste the Secret ID" autoComplete="off" />
          </div>
          {formError && (
            <div style={{ background: '#fee2e2', border: '1px solid var(--loss)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--loss-text)' }}>
              {formError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <button type="button" className="sf-btn-outline" style={footerBtn} onClick={() => setStep(1)}>Back</button>
            <button type="button" className="sf-btn-primary" style={footerBtn} disabled={saving} onClick={saveKeys}>
              {saving ? 'Saving…' : 'Save credentials'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'var(--primary-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <LinkIcon size={24} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Credentials saved</div>
            <p style={{ fontSize: 12, color: '#8B93A7', marginTop: 6, lineHeight: 1.55, maxWidth: 380 }}>
              Now sign in with your Fyers trading account. A popup will open; after login the
              access token is generated and stored automatically.
            </p>
          </div>
          <button type="button" className="sf-btn-primary" disabled={connecting} onClick={connect}
            style={{ height: 42, padding: '0 26px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <LinkIcon size={15} />
            {connecting ? 'Waiting for Fyers login…' : 'Connect Fyers Account'}
          </button>
          <p style={{ fontSize: 11, color: '#8B93A7' }}>
            Settings are saved on the server and survive restarts.
          </p>
        </div>
      )}
    </Modal>
  )
}
