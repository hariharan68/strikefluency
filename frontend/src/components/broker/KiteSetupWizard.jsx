import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, KeyRound, Radio } from 'lucide-react'
import {
  getKiteLogin, getKiteStatus, saveKiteCredentials, syncKiteInstruments,
} from '../../api/broker'
import { useToast } from '../common/Toast'
import Modal from '../common/Modal'
import { getApiErrorMessage } from '../../utils/apiError'

const REDIRECT_URI = 'http://127.0.0.1:8000/api/v1/auth/kite/callback'

export default function KiteSetupWizard({ isOpen, onClose, onConnected }) {
  const [step, setStep] = useState(1)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const pollRef = useRef(null)
  const { success, error } = useToast()

  useEffect(() => {
    if (!isOpen) {
      clearInterval(pollRef.current)
      return
    }
    setBusy(true)
    getKiteStatus()
      .then(response => {
        const next = response.data
        setStatus(next)
        setStep(next?.configured ? 3 : 1)
      })
      .catch(() => setStep(1))
      .finally(() => setBusy(false))
    return () => clearInterval(pollRef.current)
  }, [isOpen])
  if (!isOpen) return null

  const copyRedirect = async () => {
    await navigator.clipboard.writeText(REDIRECT_URI)
    success('Redirect URL copied')
  }

  const save = async () => {
    setBusy(true)
    try {
      await saveKiteCredentials(apiKey.trim(), apiSecret.trim())
      setStep(3)
      success('Kite app credentials saved securely')
    } catch (err) {
      error(getApiErrorMessage(err, 'Could not save Kite credentials'))
    } finally {
      setBusy(false)
    }
  }

  const poll = () => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const next = (await getKiteStatus()).data
        setStatus(next)
        if (next.state === 'live') {
          clearInterval(pollRef.current)
          setStep(4)
          await onConnected?.()
        } else if (next.state === 'connected') {
          setStatus({ ...next, message: 'Authentication complete — waiting for the KiteTicker worker' })
        }
      } catch {}
    }, 1800)
  }

  const connect = async () => {
    setBusy(true)
    try {
      const response = await getKiteLogin()
      const popup = window.open(response.data.login_url, 'kite-connect', 'width=520,height=720')
      if (!popup) throw new Error('Allow popups for StrikeFluency, then try again')
      setStatus({ state: 'connecting', message: 'Complete Zerodha login in the popup' })
      poll()
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not start Zerodha login')
      setStatus({ state: 'unavailable', message })
      error(message)
    } finally {
      setBusy(false)
    }
  }

  const sync = async () => {
    setBusy(true)
    try {
      const response = await syncKiteInstruments()
      success(`${response.data.synced?.toLocaleString() || ''} Kite instruments synced`)
    } catch (err) {
      error(getApiErrorMessage(err, 'Instrument sync failed; previous catalog kept'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Zerodha Broker" maxWidth={640}>
      <div role="dialog" aria-label="Connect Zerodha">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 19 }}>Connect Zerodha</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              Shared, read-only Kite Connect market data
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 7, marginBottom: 18 }}>
          {[1, 2, 3, 4].map(value => (
            <span key={value} style={{
              height: 4, flex: 1, borderRadius: 4,
              background: value <= step ? 'var(--primary)' : 'var(--border)',
            }} />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: 14 }}>1. Create a Kite Connect app</h3>
            <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.75 }}>
              <div><strong>Type:</strong> Connect</div>
              <div><strong>App name:</strong> StrikeFluency</div>
              <div><strong>Zerodha Client ID:</strong> your Zerodha login ID (for example AB1234)</div>
              <div><strong>Postback URL:</strong> leave blank</div>
              <div><strong>Description:</strong> StrikeFluency virtual options trading simulator using Zerodha Kite Connect for read-only live and historical market data. No live order placement.</div>
            </div>
            <label style={{ display: 'block', marginTop: 14, color: 'var(--text-muted)', fontSize: 11 }}>Redirect URL</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
              <code style={{ flex: 1, padding: 10, borderRadius: 8, background: 'var(--color-surface2)', color: 'var(--text)', fontSize: 11, overflowWrap: 'anywhere' }}>{REDIRECT_URI}</code>
              <button className="sf-btn-outline" onClick={copyRedirect}><Copy size={14} /></button>
            </div>
            <button className="sf-btn-primary" onClick={() => setStep(2)} style={{ marginTop: 18 }}>
              I created the app <ExternalLink size={14} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: 14 }}><KeyRound size={16} /> Enter app credentials</h3>
            <label className="sf-field-label">API key</label>
            <input className="sf-input" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" />
            <p style={{ color: 'var(--text-muted)', fontSize: 10.5, margin: '5px 0 10px' }}>
              Use the 16-character API key from the active Connect app—not your Zerodha Client ID or app name.
            </p>
            <label className="sf-field-label" style={{ marginTop: 12 }}>API secret</label>
            <input className="sf-input" type="password" value={apiSecret} onChange={event => setApiSecret(event.target.value)} autoComplete="new-password" />
            <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>The secret is stored server-side and is never returned to this browser.</p>
            <button className="sf-btn-primary" disabled={busy || !apiKey.trim() || !apiSecret.trim()} onClick={save}>
              {busy ? 'Saving…' : 'Save credentials'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: 14 }}><Radio size={16} /> Daily Zerodha login</h3>
            <p style={{ color: 'var(--text-sub)', fontSize: 12, lineHeight: 1.6 }}>
              Zerodha will open in a popup. Complete the login and TOTP yourself. StrikeFluency never receives your password or TOTP.
            </p>
            {status?.message && <div style={{ padding: 11, borderRadius: 8, background: 'var(--warn-bg)', color: 'var(--warn)', fontSize: 12 }}>{status.message}</div>}
            <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="sf-btn-primary" disabled={busy} onClick={connect}>
                Open Zerodha login <ExternalLink size={14} />
              </button>
              <button className="sf-btn-outline" disabled={busy} onClick={() => {
                setApiKey('')
                setApiSecret('')
                setStatus(null)
                setStep(2)
              }}>
                Change API credentials
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <CheckCircle2 size={34} color="var(--gain)" />
            <h3 style={{ color: 'var(--text)', fontSize: 15 }}>Zerodha connected</h3>
            <p style={{ color: 'var(--text-sub)', fontSize: 12 }}>
              {status?.profile?.user_name || status?.profile?.user_id || 'The shared account is authenticated.'}
            </p>
            <div style={{ display: 'flex', gap: 9 }}>
              <button className="sf-btn-outline" disabled={busy} onClick={sync}>Sync instruments</button>
              <button className="sf-btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
