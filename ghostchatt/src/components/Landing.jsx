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
        
        <h1 className="landing-title">Ghost Chat</h1>

        <form onSubmit={handleConnect}>
          <div className="input-field-group">
            <input 
              type="text" 
              placeholder="Enter Room Code (e.g. 1234)" 
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              required
              className="landing-input"
              style={{ width: '100%' }}
            />
            <button type="submit" className="primary-btn" style={{ marginTop: '15px' }}>
              <span>Join Room</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
