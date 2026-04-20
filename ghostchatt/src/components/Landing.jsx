import { useState } from 'react'
import { Ghost, ArrowRight, UserPlus } from 'lucide-react'

export default function Landing({ onJoin }) {
  const [roomCode, setRoomCode] = useState('')

  const handleConnect = (e) => {
    e.preventDefault()
    
    const code = roomCode.toLowerCase().trim()
    if (!code) return
    
    onJoin(code)
  }

  return (
    <div className="landing-shell">
      <div className="landing-card">
        <div className="logo-container">
          <Ghost size={56} className="logo-ghost" />
        </div>
        
        <h1 className="landing-title">Kagati</h1>

        <form onSubmit={handleConnect}>
          <div className="input-field-group" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Enter Room Code (e.g. 1234)" 
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              required
              className="landing-input"
              style={{ width: '100%', paddingRight: '56px' }}
            />
            <button 
              type="submit" 
              className="icon-btn active"
              style={{ 
                position: 'absolute', 
                right: '6px', 
                width: '42px', 
                height: '42px', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '0'
              }}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
