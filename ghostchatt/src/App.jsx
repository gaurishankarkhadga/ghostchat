import { useState, useEffect } from 'react'
import Landing from './components/Landing'
import ChatRoom from './components/ChatRoom'

function App() {
  const [roomId, setRoomId] = useState(null)
  const [myName, setMyName] = useState(null)
  const [partnerName, setPartnerName] = useState(null)

  // Listen for Room ID in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const room = params.get('room')
    if (room) {
      setRoomId(room)
    }
  }, [])

  const handleJoin = (id, me, her) => {
    // Update URL without refreshing the page
    window.history.pushState({}, '', `?room=${id}`)
    setMyName(me)
    setPartnerName(her)
    setRoomId(id)
  }

  const handleExit = () => {
    // Clear URL and go back to landing
    window.history.pushState({}, '', window.location.pathname)
    setRoomId(null)
    setMyName(null)
    setPartnerName(null)
  }

  return (
    <div className="app-container">
      {roomId ? (
        <ChatRoom 
          roomId={roomId} 
          myName={myName} 
          partnerName={partnerName} 
          onExit={handleExit} 
        />
      ) : (
        <Landing onJoin={handleJoin} />
      )}
    </div>
  )
}

export default App
