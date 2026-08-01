import { useEffect, useRef, useState } from 'react'
import {
  Mail, Phone, BadgeCheck, CalendarDays, ShieldCheck, UserRound,
  Wallet, Activity, TrendingUp, Pencil, KeyRound, LogOut, Camera, Trash2, Images, Check,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import { getMe, updateProfile, changePassword, logout as logoutApi } from '../../api/auth'
import {
  getProfileOverview, updateAvatar, removeAvatar, setAvatarPreset, removeAvatarPreset,
} from '../../api/profile'
import { fileToAvatarDataUri } from '../../utils/avatarImage'
import { presetSrc, MEN, WOMEN } from '../../utils/presetAvatars'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatCurrency } from '../../utils/formatters'
import { signedMoney, asNumber } from '../../utils/chartFormat'
import Avatar from '../../components/common/Avatar'
import Spinner from '../../components/common/Spinner'
import Modal from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import './ProfilePage.css'

const titleCase = s => String(s || '').replace(/^\w/, c => c.toUpperCase())
const dateOnly = iso => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const toneOf = v => (asNumber(v) > 0 ? 'gain' : asNumber(v) < 0 ? 'loss' : 'flat')

export default function ProfilePage() {
  const user = useAuthStore(s => s.user)
  const setUser = useAuthStore(s => s.setUser)
  const clearAuth = useAuthStore(s => s.clearAuth)
  const { success, error } = useToast()

  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const fileInputRef = useRef(null)

  // Refresh the full profile (brings the new phone / created_at / password
  // fields the cached store copy may lack) alongside the lifetime stats.
  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled([getMe(), getProfileOverview(controller.signal)])
      .then(([me, ov]) => {
        if (me.status === 'fulfilled') setUser(me.value.data)
        if (ov.status === 'fulfilled') setOverview(ov.value.data)
        else if (ov.reason?.code !== 'ERR_CANCELED') error(getApiErrorMessage(ov.reason, 'Could not load account stats.'))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const name = user?.full_name || user?.email || 'Trader'
  const canChangePassword = user?.has_usable_password !== false

  const stats = overview?.stats
  const account = overview?.account

  const handleLogout = async () => {
    try { await logoutApi() } catch (_) { /* offline — local clear still signs out */ }
    clearAuth()
    window.location.href = '/login'
  }

  const onPickPhoto = async e => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked later
    if (!file) return
    setAvatarBusy(true)
    try {
      const dataUri = await fileToAvatarDataUri(file)
      const r = await updateAvatar(dataUri)
      setUser(r.data)
      success('Profile photo updated')
    } catch (err) {
      error(getApiErrorMessage(err, err?.message || 'Could not update photo'))
    } finally {
      setAvatarBusy(false)
    }
  }

  const onRemovePhoto = async () => {
    setAvatarBusy(true)
    try {
      const r = await removeAvatar()
      setUser(r.data)
      success('Profile photo removed')
    } catch (err) {
      error(getApiErrorMessage(err, 'Could not remove photo'))
    } finally {
      setAvatarBusy(false)
    }
  }

  const onChoosePreset = async key => {
    setAvatarBusy(true)
    try {
      const r = await setAvatarPreset(key)
      setUser(r.data)
      setPickerOpen(false)
      success('Avatar selected')
    } catch (err) {
      error(getApiErrorMessage(err, 'Could not set avatar'))
    } finally {
      setAvatarBusy(false)
    }
  }

  const onRemovePreset = async () => {
    setAvatarBusy(true)
    try {
      const r = await removeAvatarPreset()
      setUser(r.data)
      success('Avatar removed')
    } catch (err) {
      error(getApiErrorMessage(err, 'Could not remove avatar'))
    } finally {
      setAvatarBusy(false)
    }
  }

  if (loading && !user) return <Spinner />

  return (
    <div className="profile-page">
      {/* ── Identity hero ─────────────────────────────────────── */}
      <section className="sf-card profile-hero">
        <div className="profile-hero-main">
          <div className="profile-avatar-wrap">
            <Avatar
              name={name}
              photoSrc={user?.avatar_url}
              presetSrc={presetSrc(user?.avatar_preset)}
              className="profile-avatar"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={onPickPhoto}
            />
            <div className="profile-avatar-controls">
              <button type="button" className="sf-btn-outline" onClick={() => setPickerOpen(true)} disabled={avatarBusy}>
                <Images size={14} /> Choose avatar
              </button>
              <button type="button" className="sf-btn-outline" onClick={() => fileInputRef.current?.click()} disabled={avatarBusy}>
                <Camera size={14} /> Upload photo
              </button>
            </div>
            {(user?.avatar_url || user?.avatar_preset) && (
              <div className="profile-avatar-removes">
                {user?.avatar_url && (
                  <button type="button" className="profile-avatar-remove" onClick={onRemovePhoto} disabled={avatarBusy}>
                    <Trash2 size={11} /> Remove photo
                  </button>
                )}
                {user?.avatar_preset && (
                  <button type="button" className="profile-avatar-remove" onClick={onRemovePreset} disabled={avatarBusy}>
                    <Trash2 size={11} /> Remove avatar
                  </button>
                )}
              </div>
            )}
            {user?.avatar_url && user?.avatar_preset && (
              <p className="profile-avatar-hint">Showing photo &amp; avatar in rotation</p>
            )}
          </div>
          <div className="profile-hero-id">
            <h2>{name}</h2>
            <p className="profile-hero-email"><Mail size={14} /> {user?.email}</p>
            <div className="profile-hero-badges">
              <span className="profile-badge plan"><BadgeCheck size={13} /> {titleCase(user?.plan || 'free')} plan</span>
              <span className={`profile-badge ${user?.is_active ? 'active' : 'inactive'}`}>
                <ShieldCheck size={13} /> {user?.is_active ? 'Active' : 'Inactive'}
              </span>
              <span className="profile-badge muted"><CalendarDays size={13} /> Since {dateOnly(user?.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="profile-hero-actions">
          <button type="button" className="sf-btn-outline" onClick={() => setEditOpen(true)}>
            <Pencil size={15} /> Edit Profile
          </button>
          {canChangePassword ? (
            <button type="button" className="sf-btn-outline" onClick={() => setPwdOpen(true)}>
              <KeyRound size={15} /> Change Password
            </button>
          ) : (
            <span className="profile-oauth-note">Signed in with Google</span>
          )}
          <button type="button" className="profile-logout" onClick={handleLogout}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </section>

      <div className="profile-columns">
        {/* ── Account details ─────────────────────────────────── */}
        <section className="sf-card profile-details">
          <h3 className="profile-section-title">Account details</h3>
          <dl className="profile-detail-list">
            <Detail icon={UserRound} label="Full name" value={user?.full_name || '—'} />
            <Detail icon={Mail} label="Email address" value={user?.email || '—'} />
            <Detail icon={Phone} label="Mobile number" value={user?.phone || 'Not added'} muted={!user?.phone} />
            <Detail icon={BadgeCheck} label="Current plan" value={`${titleCase(user?.plan || 'free')} · ₹0 / month`} />
            <Detail icon={ShieldCheck} label="Account status" value={user?.is_active ? 'Active' : 'Inactive'} />
            <Detail icon={CalendarDays} label="Member since" value={dateOnly(user?.created_at)} />
          </dl>
        </section>

        {/* ── Paper-trading snapshot ──────────────────────────── */}
        <section className="profile-stats-wrap">
          <h3 className="profile-section-title">Paper-trading snapshot</h3>
          <div className="profile-stats">
            <StatCard icon={Wallet} label="Virtual balance" value={formatCurrency(account?.balance)} tone="flat" strong />
            <StatCard icon={Activity} label="Total paper trades" value={stats ? String(stats.total_trades) : '—'} tone="flat" />
            <StatCard icon={TrendingUp} label="Overall simulated P&L" value={stats ? signedMoney(stats.net_realized) : '—'} tone={toneOf(stats?.net_realized)} />
            <StatCard icon={TrendingUp} label="Unrealised P&L" value={stats ? signedMoney(stats.unrealized) : '—'} tone={toneOf(stats?.unrealized)} />
            <StatCard icon={Activity} label="Win rate" value={stats != null ? `${stats.win_rate}%` : '—'} tone="flat" />
            <StatCard icon={Wallet} label="Starting capital" value={formatCurrency(account?.initial_capital)} tone="flat" />
          </div>
        </section>
      </div>

      <EditProfileModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        user={user}
        onSaved={u => { setUser(u); success('Profile updated'); setEditOpen(false) }}
        onError={err => error(getApiErrorMessage(err, 'Could not update profile'))}
      />
      <ChangePasswordModal
        isOpen={pwdOpen}
        onClose={() => setPwdOpen(false)}
        onDone={() => { success('Password changed'); setPwdOpen(false) }}
      />
      <AvatarPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        current={user?.avatar_preset}
        busy={avatarBusy}
        onSelect={onChoosePreset}
      />
    </div>
  )
}

// ── Avatar picker (Men / Women, 5 each) ──────────────────────────
function AvatarPickerModal({ isOpen, onClose, current, busy, onSelect }) {
  const [gender, setGender] = useState('men')
  const options = gender === 'men' ? MEN : WOMEN

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose an avatar">
      <div className="avatar-picker">
        <div className="avatar-picker-tabs">
          <button type="button" className={gender === 'men' ? 'active' : ''} onClick={() => setGender('men')}>Men</button>
          <button type="button" className={gender === 'women' ? 'active' : ''} onClick={() => setGender('women')}>Women</button>
        </div>
        <div className="avatar-picker-grid">
          {options.map(opt => (
            <button
              key={opt.key}
              type="button"
              className={`avatar-picker-item${current === opt.key ? ' selected' : ''}`}
              onClick={() => onSelect(opt.key)}
              disabled={busy}
              aria-label={`Select ${opt.key.replace('_', ' ')}`}
            >
              <img src={opt.src} alt="" draggable="false" />
              {current === opt.key && <span className="avatar-picker-check"><Check size={14} /></span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function Detail({ icon: Icon, label, value, muted }) {
  return (
    <div className="profile-detail">
      <dt><Icon size={15} /> {label}</dt>
      <dd className={muted ? 'muted' : ''}>{value}</dd>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, tone, strong }) {
  return (
    <div className={`sf-card profile-stat ${strong ? 'strong' : ''}`}>
      <span className="profile-stat-icon"><Icon size={16} /></span>
      <span className="profile-stat-label">{label}</span>
      <strong className={`profile-stat-value ${tone}`}>{value}</strong>
    </div>
  )
}

// ── Edit Profile ─────────────────────────────────────────────────
function EditProfileModal({ isOpen, onClose, user, onSaved, onError }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setFullName(user?.full_name || '')
      setPhone(user?.phone || '')
    }
  }, [isOpen, user])

  const submit = async e => {
    e.preventDefault()
    if (!fullName.trim()) { onError(new Error('Full name cannot be empty')); return }
    setSaving(true)
    try {
      // Always send phone so an emptied field clears the stored number.
      const r = await updateProfile({ full_name: fullName.trim(), phone: phone.trim() })
      onSaved(r.data)
    } catch (err) {
      onError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Profile">
      <form className="profile-form" onSubmit={submit}>
        <label className="profile-field">
          <span>Full name</span>
          <input className="sf-input" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={100} autoFocus />
        </label>
        <label className="profile-field">
          <span>Email address</span>
          <input className="sf-input" value={user?.email || ''} readOnly />
        </label>
        <label className="profile-field">
          <span>Mobile number</span>
          <input className="sf-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" maxLength={20} />
        </label>
        <div className="profile-form-actions">
          <button type="button" className="sf-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="sf-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ── Change Password ──────────────────────────────────────────────
function ChangePasswordModal({ isOpen, onClose, onDone }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (isOpen) { setCurrent(''); setNext(''); setConfirm(''); setErr('') }
  }, [isOpen])

  const submit = async e => {
    e.preventDefault()
    setErr('')
    if (next.length < 8) { setErr('New password must be at least 8 characters'); return }
    if (next !== confirm) { setErr('New passwords do not match'); return }
    setSaving(true)
    try {
      await changePassword(current, next)
      onDone()
    } catch (error_) {
      setErr(getApiErrorMessage(error_, 'Could not change password'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Password">
      <form className="profile-form" onSubmit={submit}>
        <label className="profile-field">
          <span>Current password</span>
          <input type="password" className="sf-input" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
        </label>
        <label className="profile-field">
          <span>New password</span>
          <input type="password" className="sf-input" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="profile-field">
          <span>Confirm new password</span>
          <input type="password" className="sf-input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {err && <p className="profile-form-error">{err}</p>}
        <div className="profile-form-actions">
          <button type="button" className="sf-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="sf-btn-primary" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</button>
        </div>
      </form>
    </Modal>
  )
}
