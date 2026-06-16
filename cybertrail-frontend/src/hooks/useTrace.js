// src/hooks/useTrace.js
// Custom hook that wraps all trace API calls with unified loading/error state

import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import useStore from '../store/useStore'
import {
  traceWallet, traceUPI, traceShell,
  traceSocial, traceMulti
} from '../services/api'

const TRACERS = {
  crypto: traceWallet,
  upi:    traceUPI,
  shell:  traceShell,
  social: traceSocial,
  multi:  traceMulti,
}

export function useTrace() {
  const { setGraph, setLoading, addToHistory } = useStore()
  const [error, setError] = useState(null)

  const trace = useCallback(async (module, identifier, depth = 2) => {
    if (!identifier?.trim()) {
      toast.error('Please enter an identifier')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const fn = TRACERS[module]
      if (!fn) throw new Error(`Unknown module: ${module}`)

      const res = await fn(identifier.trim(), depth)
      const graph = res.data

      setGraph(graph)
      addToHistory({
        identifier: identifier.trim(),
        module,
        timestamp: new Date().toISOString(),
        flagged_count: graph.flagged_count,
        total_nodes: graph.total_nodes,
        session_id: graph.session_id,
      })

      if (graph.flagged_count > 0) {
        toast(`${graph.flagged_count} flagged entities found`, {
          icon: '⚠️',
          style: {
            background: '#1a0a0a',
            color: '#fca5a5',
            border: '1px solid #450a0a',
          }
        })
      } else {
        toast.success(`Graph built: ${graph.total_nodes} nodes, ${graph.total_edges} edges`)
      }

      return graph
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Trace failed'
      setError(msg)
      // toast already shown by axios interceptor
      return null
    } finally {
      setLoading(false)
    }
  }, [setGraph, setLoading, addToHistory])

  return { trace, error }
}

// ── useEntitySearch hook ────────────────────────────────
import { searchEntities } from '../services/api'

export function useEntitySearch() {
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const r = await searchEntities(q, 10)
      setResults(r.data.results || [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  return { results, searching, search }
}
