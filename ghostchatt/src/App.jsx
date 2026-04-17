import { useState, useEffect } from 'react'
import Landing from './components/Landing'
import ChatRoom from './components/ChatRoom'

function App() {
  const [roomId, setRoomId] = useState(localStorage.getItem('gc_roomId') || null)

  // Listen for Room ID in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const room = params.get('room')
    if (room && !roomId) {
      setRoomId(room)
    }
  }, [roomId])

  const handleJoin = (id) => {
    // Update URL without refreshing the page
    window.history.pushState({}, '', `?room=${id}`)
    setRoomId(id)
    localStorage.setItem('gc_roomId', id)
  }

  const handleExit = () => {
    // Clear URL and go back to landing
    window.history.pushState({}, '', window.location.pathname)
    setRoomId(null)
    
    localStorage.removeItem('gc_roomId')
    localStorage.removeItem(`gc_messages_${roomId}`)
  }

  return (
    <div className="app-container">
      {roomId ? (
        <ChatRoom 
          roomId={roomId} 
          onExit={handleExit} 
        />
      ) : (
        <Landing onJoin={handleJoin} />
      )}
    </div>
  )
}

export default App
