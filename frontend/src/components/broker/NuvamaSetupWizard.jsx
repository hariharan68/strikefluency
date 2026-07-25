import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Link as LinkIcon, ShieldAlert } from 'lucide-react'
import Modal from '../common/Modal'
import { useToast } from '../common/Toast'
import {
  exchangeNuvamaRequestId,
  getNuvamaCredentials,
  getNuvamaLogin,
  saveNuvamaCredentials,
} from '../../api/broker'
import { getApiErrorMessage } from '../../utils/apiError'

const FALLBACK_REDIRECT = 'https://127.0.0.1/'
const NUVAMA_CONSOLE = 'https://www.nuvamawealth.com/api-connect/'

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
                color: done || active ? 'var(--on-primary)' : 'var(--primary)',
                boxShadow: active ? '0 0 0 4px rgba(37,99,235,0.15)' : 'none',
                transition: 'all 0.2s'
              }}>
                {done ? <Check size={15} strokeWidth={3} /> : n}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--primary)' : 'var(--text-muted)' }}>{label}</span>
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

export default function NuvamaSetupWizard({ isOpen, onClose, onConnected }) {
  const [step, setStep] = useState(1)
  const [redirectUri, setRedirectUri] = useState(FALLBACK_REDIRECT)
  const [existing, setExisting] = useState(null)     // { configured, api_key_masked, client_id }
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [clientId, setClientId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [copied, setCopied] = useState(false)
  const { success, error } = useToast()

  useEffect(() => {
    if (!isOpen) return
    setStep(1)
    setApiKey('')
    setApiSecret('')
    setClientId('')
    setRequestId('')
    setFormError('')
    setCopied(false)
    getNuvamaCredentials()
      .then(({ data }) => {
        if (data.redirect_uri) setRedirectUri(data.redirect_uri)
        setExisting(data)
        if (data.client_id) setClientId(data.client_id)
        // Credentials already stored → jump straight to the Connect step.
        if (data.configured) setStep(3)
      })
      .catch(() => setExisting(null))
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
    if (!apiKey.trim()) { setFormError('API key is required'); return }
    if (!apiSecret.trim()) { setFormError('API secret is required'); return }
    if (!clientId.trim()) { setFormError('Nuvama Client ID is required'); return }
    setSaving(true)
    try {
      await saveNuvamaCredentials(apiKey.trim(), apiSecret.trim(), clientId.trim())
      success('Credentials saved to the server configuration')
      setApiSecret('')
      setStep(3)
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not save credentials'))
    } finally {
      setSaving(false)
    }
  }

  // Nuvama's redirect is https://127.0.0.1/ with no server behind it, so we
  // can't poll a callback like Fyers. Open the login URL, let the user sign in,
  // then have them copy the request_id out of the redirected address bar.
  const openLogin = async () => {
    try {
      const res = await getNuvamaLogin()
      window.open(res.data.login_url, 'nuvama-connect', 'width=520,height=720')
    } catch (err) {
      error(getApiErrorMessage(err, 'Unable to generate the Nuvama login URL'))
    }
  }

  const connect = async () => {
    setFormError('')
    if (!requestId.trim()) { setFormError('Paste the request_id from the redirected URL'); return }
    setConnecting(true)
    try {
      await exchangeNuvamaRequestId(requestId.trim())
      success('Nuvama connected — live market data active (Fyers disconnected)')
      onConnected?.()
      onClose?.()
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not connect Nuvama — check the request_id and your whitelisted IP'))
    } finally {
      setConnecting(false)
    }
  }

  const footerBtn = { height: 38, padding: '0 18px', fontSize: 13 }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Nuvama Broker" maxWidth={620}>
      <StepIndicator step={step} />

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            First, create an app in your Nuvama API Connect console. It takes about a minute.
          </p>
          <InstructionRow n={1}>
            Open the Nuvama API Connect console and sign in:{' '}
            <a href={NUVAMA_CONSOLE} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              nuvamawealth.com/api-connect <ExternalLink size={12} />
            </a>
          </InstructionRow>
          <InstructionRow n={2}>
            Click <b>Create New App</b>. Give it any name and enter your <b>Nuvama Client ID</b>.
          </InstructionRow>
          <InstructionRow n={3}>
            Paste this exact <b>Redirect URL</b> into the form:
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input className="sf-input" readOnly value={redirectUri}
                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }} />
              <button type="button" onClick={copyRedirect} className="sf-btn-outline"
                style={{ height: 40, padding: '0 14px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, color: copied ? 'var(--gain)' : undefined }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </InstructionRow>
          <InstructionRow n={4}>
            In <b>Static IP Primary</b>, enter the public IP of the server running StrikeFluency.
            Nuvama only answers API calls from that IP.
          </InstructionRow>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--warn-bg)', border: '1px solid color-mix(in srgb, var(--warn) 38%, transparent)', borderRadius: 10, padding: '11px 13px' }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--warn)' }} />
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
              Heads up: Nuvama lets you change the whitelisted IP <b>only once per calendar week</b>. If your
              connection later drops to mock data, it usually means this server&apos;s IP changed and no longer matches.
            </div>
          </div>
          <InstructionRow n={5}>
            Click <b>Create</b>. Nuvama shows your <b>API Key</b> and <b>API Secret</b> — keep that page open and continue here.
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
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Paste the keys from your Nuvama app. They are stored in the server&apos;s configuration file automatically — you never edit anything by hand.
          </p>
          {existing?.configured && (
            <div style={{ background: 'var(--primary-bg)', border: '1px solid var(--primary-border)', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--primary)' }}>
              Currently configured: <b>{existing.api_key_masked}</b> — entering new keys will replace it.
            </div>
          )}
          <div>
            <label className="sf-label">API Key</label>
            <input className="sf-input" value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Paste the API Key"
              style={{ fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          <div>
            <label className="sf-label">API Secret</label>
            <input className="sf-input" type="password" value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
              placeholder="Paste the API Secret" autoComplete="off" />
          </div>
          <div>
            <label className="sf-label">Nuvama Client ID</label>
            <input className="sf-input" value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="e.g. 70194097"
              style={{ fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          {formError && (
            <div style={{ background: 'var(--loss-bg)', border: '1px solid color-mix(in srgb, var(--loss) 40%, transparent)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--loss-text)' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--primary-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <LinkIcon size={24} color="var(--primary)" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {existing?.configured ? 'Credentials ready' : 'Credentials saved'}
            </div>
          </div>

          <InstructionRow n={1}>
            Click <b>Login to Nuvama</b> — a popup opens. Sign in with your Nuvama credentials.
          </InstructionRow>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" className="sf-btn-outline" onClick={openLogin}
              style={{ height: 40, padding: '0 22px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ExternalLink size={15} />
              Login to Nuvama
            </button>
          </div>
          <InstructionRow n={2}>
            After login the browser redirects to <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>{redirectUri}</code> and may show a
            &quot;can&apos;t reach page&quot; — that is expected. Copy the <b>request_id</b> value from that URL&apos;s address bar.
          </InstructionRow>
          <div>
            <label className="sf-label">request_id</label>
            <input className="sf-input" value={requestId}
              onChange={e => setRequestId(e.target.value)}
              placeholder="Paste the request_id from the redirected URL"
              style={{ fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          {formError && (
            <div style={{ background: 'var(--loss-bg)', border: '1px solid color-mix(in srgb, var(--loss) 40%, transparent)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--loss-text)' }}>
              {formError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            {existing?.configured ? (
              <button type="button" onClick={() => setStep(2)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600 }}>
                Use different keys
              </button>
            ) : <span />}
            <button type="button" className="sf-btn-primary" disabled={connecting} onClick={connect}
              style={{ height: 42, padding: '0 26px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <LinkIcon size={15} />
              {connecting ? 'Connecting…' : 'Connect Nuvama'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            Connecting Nuvama disconnects Fyers. Settings are saved on the server and survive restarts.
          </p>
        </div>
      )}
    </Modal>
  )
}
