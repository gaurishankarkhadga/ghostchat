import { useState, useEffect } from 'react'
import { Ghost, Sparkles, UserPlus } from 'lucide-react'

export default function Landing({ onJoin }) {
  const [partnerName, setPartnerName] = useState('')

  const handleConnect = (e) => {
    e.preventDefault()
    const partner = partnerName.toLowerCase().trim()
    if (!partner) return

    let combinedId = partner
    let me = 'userA' 
    let her = partner
    
    if (partner === 'kagati' || partner === 'gshankar') {
      combinedId = 'gshankar-kagati'
      me = (partner === 'kagati') ? 'gshankar' : 'kagati'
      her = partner
    }
    
    onJoin(combinedId, me, her)
  }

  return (
    <div className="glass-card main-card">
      <div className="logo-section">
        <Ghost size={64} className="ghost-logo" />
        <h1>Ghost Chat</h1>
        <p className="subtitle">Private, P2P, Zero-Persistence.</p>
      </div>

      <form className="landing-actions" onSubmit={handleConnect}>
        <div className="input-group-vertical">
          <div className="field">
            <label><UserPlus size={14} /> Partner's Name</label>
            <input 
              type="text" 
              placeholder="" 
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              required
              autoFocus
            />
          </div>
        </div>

        <button type="submit" className="primary-btn magic-btn">
          <Sparkles size={18} /> Connect
        </button>
      </form>

      <div className="privacy-badge">
        <p>No extra code. No garbage. Just your partner's name.</p>
      </div>

      <style>{`
        .logo-section { text-align: center; margin-bottom: 30px; }
        .ghost-logo { color: var(--accent-primary); filter: drop-shadow(0 0 10px var(--accent-primary)); margin-bottom: 10px; }
        .subtitle { color: var(--text-dim); font-size: 0.9rem; margin-top: 5px; }
        
        .input-group-vertical { display: flex; flex-direction: column; gap: 20px; margin-bottom: 30px; text-align: left; }
        .field { display: flex; flex-direction: column; gap: 8px; }
        .field label { font-size: 0.75rem; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        
        .magic-btn { display: flex; align-items: center; justify-content: center; gap: 10px; }
        
        .privacy-badge { margin-top: 30px; font-size: 0.7rem; color: var(--text-dim); opacity: 0.6; }
      `}</style>
    </div>
  )
}
