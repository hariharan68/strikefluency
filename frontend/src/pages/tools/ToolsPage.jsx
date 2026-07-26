import { Wrench } from 'lucide-react'

// Placeholder shell for the Tools section — routed and reachable from the
// sidebar, with nothing in it yet.
export default function ToolsPage() {
  return (
    <div style={{
      minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: 48, textAlign: 'center',
      background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 14,
    }}>
      <span style={{
        display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12,
        background: 'var(--primary-bg)', border: '1px solid var(--primary-border)', color: 'var(--primary)',
      }}>
        <Wrench size={20} />
      </span>
      <strong style={{ fontSize: 16, fontWeight: 750, color: 'var(--text)' }}>Tools</strong>
      <p style={{ maxWidth: 360, fontSize: 13, color: 'var(--text-muted)' }}>
        This page is empty for now.
      </p>
    </div>
  )
}
