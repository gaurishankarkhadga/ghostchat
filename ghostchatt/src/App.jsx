import { useState, useEffect } from 'react'
import Landing from './components/Landing'
import ChatRoom from './components/ChatRoom'

function App() {
  const [roomId, setRoomId] = useState(localStorage.getItem('gc_roomId') || null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

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
      {isOffline && (
        <div className="network-banner">
          ⚠️ No Internet Connection. Check Wi-Fi or Mobile Data.
        </div>
      )}
      {roomId ? (
        <ChatRoom 
          roomId={roomId} 
          onExit={handleExit} 
          setIsOffline={setIsOffline}
        />
      ) : (
        <Landing onJoin={handleJoin} />
      )}
    </div>
  )
}

export default App
