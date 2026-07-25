import { useState } from 'react'
import * as disciplineApi from '../api/discipline'

export default function useDiscipline() {
  const [rules, setRules] = useState([])
  const [score, setScore] = useState(null)
  const [violations, setViolations] = useState([])
  const [mode, setMode] = useState(null)   // { enabled, capital_unlocked, tier, balance }
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadRules = async () => {
    try {
      const r = await disciplineApi.getRules()
      setRules(r.data.rules || r.data || [])
    } catch {}
  }

  const loadScore = async () => {
    try {
      const r = await disciplineApi.getScore()
      setScore(r.data)
    } catch {}
  }

  const loadViolations = async (limit = 100) => {
    try {
      const r = await disciplineApi.getViolations(limit)
      setViolations(r.data.violations || r.data || [])
    } catch {}
  }

  const loadProgress = async () => {
    try {
      const r = await disciplineApi.getProgress()
      setProgress(r.data)
    } catch {}
  }

  const updateRule = async (ruleCode, changes) => {
    await disciplineApi.updateRule(ruleCode, changes)
    await loadRules()
  }

  const applyRuleChanges = async (changes) => {
    await Promise.all(changes.map(({ ruleCode, ...payload }) => (
      disciplineApi.updateRule(ruleCode, payload)
    )))
    await loadRules()
  }

  const loadMode = async () => {
    try {
      const r = await disciplineApi.getMode()
      setMode(r.data)
    } catch {}
  }

  const toggleMode = async (enabled) => {
    setLoading(true)
    try {
      const r = await disciplineApi.setMode(enabled)
      setMode(r.data)
      window.dispatchEvent(new CustomEvent('sf:discipline-mode-changed', { detail: r.data }))
      return r.data
    } finally {
      setLoading(false)
    }
  }

  const loadAll = async () => {
    setLoading(true)
    setError('')
    const requests = await Promise.allSettled([
      disciplineApi.getRules(),
      disciplineApi.getScore(),
      disciplineApi.getViolations(100),
      disciplineApi.getMode(),
      disciplineApi.getProgress(),
    ])
    const [rulesResult, scoreResult, violationResult, modeResult, progressResult] = requests
    if (rulesResult.status === 'fulfilled') setRules(rulesResult.value.data.rules || rulesResult.value.data || [])
    if (scoreResult.status === 'fulfilled') setScore(scoreResult.value.data)
    if (violationResult.status === 'fulfilled') setViolations(violationResult.value.data.violations || violationResult.value.data || [])
    if (modeResult.status === 'fulfilled') setMode(modeResult.value.data)
    if (progressResult.status === 'fulfilled') setProgress(progressResult.value.data)
    if (requests.some(result => result.status === 'rejected')) {
      setError('Some discipline data could not be loaded. Showing the latest available information.')
    }
    setLoading(false)
  }

  return {
    rules, score, violations, mode, progress, loading, error,
    loadRules, loadScore, loadViolations, loadMode, loadProgress, loadAll,
    updateRule, applyRuleChanges, toggleMode,
  }
}
