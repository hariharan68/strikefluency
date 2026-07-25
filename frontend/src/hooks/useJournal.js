import { useCallback, useState } from 'react'
import * as journalApi from '../api/journal'
import { useToast } from '../components/common/Toast'

export default function useJournal() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { success, error: toastError } = useToast()

  const loadJournal = useCallback(async (page = 1, filters = {}, pageSize = 100) => {
    setLoading(true)
    setError('')
    try {
      const r = await journalApi.getJournal(page, filters, pageSize)
      setEntries(r.data.entries || r.data || [])
      setTotal(r.data.total || 0)
      setSummary({
        winRate: Number(r.data.win_rate || 0),
        avgPnl: Number(r.data.avg_pnl || 0),
        totalPnl: Number(r.data.total_pnl || 0),
        grossProfit: Number(r.data.gross_profit || 0),
        grossLoss: Number(r.data.gross_loss || 0),
        profitFactor: r.data.profit_factor == null ? null : Number(r.data.profit_factor),
        winners: Number(r.data.winners || 0),
        losers: Number(r.data.losers || 0),
        breakeven: Number(r.data.breakeven || 0),
        reviewedCount: Number(r.data.reviewed_count || 0),
        ruleAdherence: Number(r.data.rule_adherence || 0),
        totalBrokerage: Number(r.data.total_brokerage || 0),
        avgDurationMinutes: r.data.avg_duration_minutes == null
          ? null
          : Number(r.data.avg_duration_minutes),
      })
    } catch {
      setError('Could not load your journal. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveReview = async (id, data) => {
    try {
      const response = await journalApi.updateEntry(id, data)
      setEntries(current => current.map(entry => entry.id === id ? response.data : entry))
      success(data.is_reviewed ? 'Review completed' : 'Review saved')
      return response.data
    } catch (requestError) {
      toastError('Could not save this review')
      throw requestError
    }
  }

  return { entries, total, summary, loading, error, loadJournal, saveReview }
}
