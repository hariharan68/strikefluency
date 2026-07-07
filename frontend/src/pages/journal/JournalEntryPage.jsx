import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEntry, updateEntry } from '../../api/journal'
import JournalEntryCard from '../../components/journal/JournalEntryCard'
import Spinner from '../../components/common/Spinner'
import Button from '../../components/common/Button'
import { ArrowLeft } from 'lucide-react'
import { useToast } from '../../components/common/Toast'

export default function JournalEntryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { success } = useToast()
  const [entry, setEntry] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getEntry(id)
      .then(r => setEntry(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const handleSaveReview = async (entryId, data) => {
    await updateEntry(entryId, data)
    success('Review saved!')
    const r = await getEntry(entryId)
    setEntry(r.data)
  }

  if (loading) return <Spinner />
  if (!entry) return <div style={{ color: '#717784' }}>Entry not found</div>

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/journal')} style={{ marginBottom: 12 }}>
          <ArrowLeft size={14} />
          Back to Journal
        </Button>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 500 }}>Trade Review</h1>
      </div>
      <JournalEntryCard entry={entry} onSaveReview={handleSaveReview} />
    </div>
  )
}
