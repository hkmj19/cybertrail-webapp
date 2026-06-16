// src/components/ErrorBoundary.jsx
// Catches any React crash and shows a readable error instead of blank page

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('CyberTrail crash:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', height:'100%', padding:'2rem',
          background:'#0a0d12', color:'#e2e8f0', fontFamily:'monospace'
        }}>
          <div style={{
            background:'#1a0a0a', border:'1px solid #ef4444',
            borderRadius:'12px', padding:'24px 32px', maxWidth:'500px', width:'100%'
          }}>
            <div style={{color:'#ef4444', fontWeight:600, fontSize:'14px', marginBottom:'8px'}}>
              Component error
            </div>
            <div style={{color:'#fca5a5', fontSize:'12px', marginBottom:'16px', lineHeight:1.6}}>
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background:'#185FA5', color:'#fff', border:'none',
                borderRadius:'8px', padding:'8px 20px', fontSize:'12px',
                fontFamily:'monospace', cursor:'pointer'
              }}>
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}