// src/components/DevErrorBoundary.jsx
import React from 'react';

export default class DevErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { err: null, info: null }; }
  componentDidCatch(err, info){ this.setState({ err, info }); console.error('[App crash]', err, info); }
  render(){
    const { err, info } = this.state;
    if (!err) return this.props.children;
    return (
      <div style={{ padding: 16, fontFamily: 'system-ui' }}>
        <h3 style={{color:'#b00020', marginTop:0}}>App crash</h3>
        <pre style={{ whiteSpace:'pre-wrap' }}>{String(err && (err.stack || err))}</pre>
        {info?.componentStack && (
          <>
            <h4>Component stack</h4>
            <pre style={{ whiteSpace:'pre-wrap' }}>{info.componentStack}</pre>
          </>
        )}
      </div>
    );
  }
}
