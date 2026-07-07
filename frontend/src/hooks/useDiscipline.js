import { useState } from 'react'
import * as disciplineApi from '../api/discipline'

export default function useDiscipline() {
  const [rules, setRules] = useState([])
  const [score, setScore] = useState(null)
  const [violations, setViolations] = useState([])
  const [loading, setLoading] = useState(false)

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

  const loadViolations = async (page = 1) => {
    try {
      const r = await disciplineApi.getViolations(page)
      setViolations(r.data.violations || r.data || [])
    } catch {}
  }

  const updateRule = async (ruleCode, value) => {
    await disciplineApi.updateRule(ruleCode, value)
    await loadRules()
  }

  return { rules, score, violations, loading, loadRules, loadScore, loadViolations, updateRule }
}
