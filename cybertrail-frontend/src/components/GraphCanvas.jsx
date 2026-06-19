// src/components/GraphCanvas.jsx
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import cytoscape from 'cytoscape'
import useStore from '../store/useStore'

const COLORS = {
  wallet_btc:   { bg:'#1e3a5f', border:'#3b82f6', text:'#93c5fd' },
  wallet_eth:   { bg:'#1e3a5f', border:'#60a5fa', text:'#bfdbfe' },
  wallet_tron:  { bg:'#1a3550', border:'#06b6d4', text:'#67e8f9' },
  upi_account:  { bg:'#14532d', border:'#22c55e', text:'#86efac' },
  bank_account: { bg:'#14532d', border:'#16a34a', text:'#86efac' },
  phone:        { bg:'#3b1f6b', border:'#a855f7', text:'#d8b4fe' },
  company:      { bg:'#431407', border:'#f59e0b', text:'#fcd34d' },
  person:       { bg:'#1e2a40', border:'#64748b', text:'#94a3b8' },
  exchange:     { bg:'#1a3040', border:'#06b6d4', text:'#67e8f9' },
  mule:         { bg:'#431407', border:'#f97316', text:'#fdba74' },  // amber - mule/layering account
  flagged:      { bg:'#450a0a', border:'#ef4444', text:'#fca5a5' },
  unknown:      { bg:'#1e2530', border:'#475569', text:'#94a3b8' },
}

function buildElements(graph, showFlaggedOnly) {
  if (!graph?.nodes?.length) return []
  const nc = graph.nodes.length
  const base = nc > 200 ? 14 : nc > 100 ? 18 : nc > 50 ? 24 : 36
  const fw   = nc > 200 ? 18 : nc > 100 ? 22 : nc > 50 ? 28 : 44

  const nodeIds = new Set()
  const nodes = graph.nodes
    .filter(n => !showFlaggedOnly || n.flagged)
    .map(n => {
      const id   = String(n.id)
      const type = String(n.node_type || 'unknown')
      const flag = !!n.flagged
      const isMule = !flag && !!n.metadata?.is_mule
      const c    = COLORS[flag ? 'flagged' : isMule ? 'mule' : type] || COLORS.unknown
      nodeIds.add(id)
      return {
        group: 'nodes',
        data: {
          id,
          label:      String(n.label || id),
          type,
          flagged:    flag,
          risk_level: n.risk_level || 'unknown',
          nodeBg:     c.bg,
          nodeBorder: c.border,
          nodeText:   c.text,
          nodeW:      flag ? fw : (type === 'company' ? base + 14 : base),
          nodeH:      flag ? fw : (type === 'company' ? Math.max(base - 8, 14) : base),
        }
      }
    })

  const seenEdge = new Set()
  const edges = (graph.edges || [])
    .filter(e => {
      const s = String(e.source || '')
      const t = String(e.target || '')
      if (!s || !t || s === t) return false
      if (!nodeIds.has(s) || !nodeIds.has(t)) return false
      const key = `${s}__${t}`
      if (seenEdge.has(key)) return false
      seenEdge.add(key)
      return true
    })
    .map((e, i) => ({
      group: 'edges',
      data: {
        id:     `e${i}`,
        source: String(e.source),
        target: String(e.target),
        label:  String(e.label || ''),
        etype:  String(e.edge_type || ''),
      }
    }))

  return [...nodes, ...edges]
}

function pickLayout(nodeCount, userChoice) {
  // If user explicitly chose a layout, always respect it
  if (userChoice && userChoice !== 'auto') {
    switch (userChoice) {
      case 'concentric':
        return {
          name: 'concentric', animate: false, padding: 60, fit: true,
          startAngle: (3 / 2) * Math.PI, clockwise: true,
          equidistant: false, minNodeSpacing: 8,
          concentric: (node) => node.degree(),
          levelWidth: (nodes) => Math.max(1, nodes.maxDegree() / 4),
        }
      case 'breadthfirst':
        return {
          name: 'breadthfirst', animate: false, padding: 60,
          fit: true, directed: false, spacingFactor: 1.5, avoidOverlap: true,
        }
      case 'circle':
        return { name: 'circle', animate: false, padding: 60, fit: true }
      case 'grid':
        return { name: 'grid', animate: false, padding: 60, fit: true, avoidOverlap: true }
      case 'cose':
      default:
        return {
          name: 'cose', animate: false, randomize: true, padding: 80, fit: true,
          idealEdgeLength: () => 120, nodeOverlap: 20,
          componentSpacing: 80, nodeRepulsion: () => 600000,
        }
    }
  }

  // Auto layout based on node count
  if (nodeCount > 150) {
    return {
      name: 'concentric', animate: false, padding: 60, fit: true,
      startAngle: (3 / 2) * Math.PI, clockwise: true,
      equidistant: false, minNodeSpacing: 8,
      concentric: (node) => node.degree(),
      levelWidth: (nodes) => Math.max(1, nodes.maxDegree() / 4),
    }
  }
  if (nodeCount > 50) {
    return {
      name: 'cose', animate: false, randomize: true, padding: 80, fit: true,
      idealEdgeLength: () => 120, nodeOverlap: 20,
      componentSpacing: 80, nodeRepulsion: () => 600000,
    }
  }
  return {
    name: 'cose', animate: false, randomize: false, padding: 60, fit: true,
    idealEdgeLength: () => 150, nodeOverlap: 20, componentSpacing: 100,
  }
}

const GraphCanvas = forwardRef(function GraphCanvas({ graph, onNodeClick }, ref) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)
  const cyRef        = useRef(null)
  const { showLabels, showFlaggedOnly, graphLayout } = useStore()

  useImperativeHandle(ref, () => ({
    fit: () => {
      try {
        if (!cyRef.current) return
        cyRef.current.resize()
        setTimeout(() => { cyRef.current?.fit(undefined, 50); cyRef.current?.center() }, 50)
      } catch(e) {}
    },
    reset: () => {
      try { cyRef.current?.elements().removeClass('hi faded'); onNodeClick?.(null) } catch(e) {}
    },
    reLayout: () => {
      try {
        if (!cyRef.current) return
        const nc     = cyRef.current.nodes().length
        const layout = useStore.getState().graphLayout  // always fresh from store
        cyRef.current.layout({ ...pickLayout(nc, layout), animate: true, animationDuration: 500 }).run()
      } catch(e) {}
    },
    exportPNG: (filename = 'cybertrail_graph.png') => {
      try {
        if (!cyRef.current) return false
        cyRef.current.fit(undefined, 30)
        const pngData = cyRef.current.png({ output: 'blob', bg: '#0a0d12', full: true, scale: 2 })
        const url = URL.createObjectURL(pngData)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
        return true
      } catch(e) { return false }
    },
  }), [graphLayout])

  useEffect(() => {
    if (!canvasRef.current || !graph?.nodes?.length) return
    try { cyRef.current?.destroy() } catch {}
    cyRef.current = null

    const elements = buildElements(graph, showFlaggedOnly)
    if (!elements.some(el => el.group === 'nodes')) return

    const nc = elements.filter(el => el.group === 'nodes').length
    const autoLabels     = showLabels  // always show when toggle is ON
    const autoEdgeLabels = showLabels && nc <= 60
    // Font size scales down for large graphs so labels don't overlap
    const labelFontSize  = nc > 150 ? 7 : nc > 80 ? 8 : nc > 40 ? 9 : 10

    try {
      cyRef.current = cytoscape({
        container: canvasRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'data(nodeBg)',
              'border-color':     'data(nodeBorder)',
              'border-width':     2,
              'color':            'data(nodeText)',
              'width':            'data(nodeW)',
              'height':           'data(nodeH)',
              'label':            autoLabels ? 'data(label)' : '',
              'font-size':        labelFontSize,
              'font-family':      'monospace',
              'text-valign':      'bottom',
              'text-halign':      'center',
              'text-margin-y':    5,
              'text-max-width':   160,
              'text-wrap':        'wrap',
            }
          },
          { selector: 'node[type = "company"]', style: { 'shape': 'round-rectangle' } },
          { selector: 'node:selected',          style: { 'border-color': '#06b6d4', 'border-width': 3 } },
          { selector: '.hi',    style: { 'border-color': '#06b6d4', 'border-width': 3, 'z-index': 99 } },
          { selector: '.faded', style: { 'opacity': 0.12 } },
          {
            selector: 'edge',
            style: {
              'width':                    1.2,
              'line-color':               '#2a3240',
              'target-arrow-color':       '#2a3240',
              'target-arrow-shape':       'triangle',
              'arrow-scale':              0.7,
              'curve-style':              'bezier',
              'label':                    autoEdgeLabels ? 'data(label)' : '',
              'font-size':                9,
              'font-family':              'monospace',
              'color':                    '#64748b',
              'text-background-color':    '#0a0d12',
              'text-background-opacity':  0.9,
              'text-background-padding':  '2px',
            }
          },
          { selector: 'edge[etype = "crypto_transaction"]', style: { 'line-color': '#1e4080', 'target-arrow-color': '#1e4080' } },
          { selector: 'edge[etype = "upi_transaction"]',    style: { 'line-color': '#14532d', 'target-arrow-color': '#14532d' } },
          { selector: 'edge.hi', style: { 'line-color': '#06b6d4', 'target-arrow-color': '#06b6d4', 'width': 2 } },
        ],
        layout: pickLayout(nc, graphLayout),
        minZoom:          0.05,
        maxZoom:          5,
        wheelSensitivity: 0.2,
      })

      cyRef.current.ready(() => {
        setTimeout(() => {
          try { cyRef.current?.resize(); cyRef.current?.fit(undefined, 50); cyRef.current?.center() } catch {}
        }, 200)
      })

      cyRef.current.on('tap', 'node', evt => {
        const nd = evt.target
        cyRef.current.elements().removeClass('hi faded')
        const hood = nd.closedNeighborhood()
        cyRef.current.elements().not(hood).addClass('faded')
        hood.addClass('hi')

        // Build enriched node data with connected edges and neighbours
        const nodeData    = nd.data()
        const connEdges   = nd.connectedEdges()
        const neighbours  = nd.neighborhood().nodes()

        const connections = connEdges.map(e => ({
          source:    e.data('source'),
          target:    e.data('target'),
          label:     e.data('label') || '',
          etype:     e.data('etype') || '',
          direction: e.data('source') === nodeData.id ? 'outgoing' : 'incoming',
        }))

        const neighbourList = neighbours.map(n => ({
          id:       n.data('id'),
          label:    n.data('label'),
          type:     n.data('type'),
          flagged:  n.data('flagged'),
        }))

        onNodeClick?.({ ...nodeData, connections, neighbours: neighbourList })
      })

      // Edge click - show edge details
      cyRef.current.on('tap', 'edge', evt => {
        const ed = evt.target
        cyRef.current.elements().removeClass('hi faded')
        ed.addClass('hi')
        ed.source().addClass('hi')
        ed.target().addClass('hi')
        cyRef.current.elements().not(ed.union(ed.source()).union(ed.target())).addClass('faded')

        onNodeClick?.({
          id:       `${ed.data('source')} → ${ed.data('target')}`,
          type:     'edge',
          label:    ed.data('label') || 'Connection',
          etype:    ed.data('etype') || '',
          source:   ed.data('source'),
          target:   ed.data('target'),
          amount:   ed.data('label') || '',
          isEdge:   true,
        })
      })

      cyRef.current.on('tap', evt => {
        if (evt.target === cyRef.current) {
          cyRef.current.elements().removeClass('hi faded')
          onNodeClick?.(null)
        }
      })

      cyRef.current.on('mouseover', 'node', evt => evt.target.style('cursor', 'pointer'))

    } catch(err) {
      console.error('Cytoscape error:', err)
    }
  }, [graph, showLabels, showFlaggedOnly, graphLayout])

  useEffect(() => {
    return () => { try { cyRef.current?.destroy() } catch {} }
  }, [])

  return (
    <div ref={containerRef} style={{ position:'absolute', inset:0, background:'#0a0d12', overflow:'hidden' }}>
      <div ref={canvasRef} style={{ position:'absolute', inset:0 }} />
    </div>
  )
})

export default GraphCanvas


