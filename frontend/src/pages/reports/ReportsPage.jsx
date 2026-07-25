import { FileBarChart } from 'lucide-react'

export default function ReportsPage() {
  return (
    <section className="sf-empty-workspace" aria-labelledby="reports-placeholder-title">
      <span className="sf-empty-workspace-icon"><FileBarChart size={24} /></span>
      <h2 id="reports-placeholder-title">Reports workspace</h2>
      <p>Generated trading and account reports will appear here.</p>
    </section>
  )
}
