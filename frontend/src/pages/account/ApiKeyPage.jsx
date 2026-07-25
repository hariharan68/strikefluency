import { KeyRound } from 'lucide-react'

export default function ApiKeyPage() {
  return (
    <section className="sf-empty-workspace" aria-labelledby="api-key-placeholder-title">
      <span className="sf-empty-workspace-icon"><KeyRound size={24} /></span>
      <h2 id="api-key-placeholder-title">API Key workspace</h2>
      <p>API credential management will be available here.</p>
    </section>
  )
}
