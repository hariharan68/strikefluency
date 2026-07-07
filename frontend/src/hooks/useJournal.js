import { useState } from 'react'
import * as journalApi from '../api/journal'
import { useToast } from '../components/common/Toast'

export default function useJournal() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const { success } = useToast()

  const loadJournal = async (page = 1, filters = {}) => {
    setLoading(true)
    try {
      const r = await journalApi.getJournal(page, filters)
      setEntries(r.data.entries || r.data || [])
      setTotal(r.data.total || 0)
    } catch {} finally {
      setLoading(false)
    }
  }

  const saveReview = async (id, data) => {
    await journalApi.updateEntry(id, data)
    success('Review saved!')
    await loadJournal()
  }

  return { entries, total, loading, loadJournal, saveReview }
}
