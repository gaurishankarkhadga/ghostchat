import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import Peer from 'peerjs'
import { Send, Phone, PhoneOff, Mic, MicOff, XCircle, ShieldCheck, Video, VideoOff, Bell } from 'lucide-react'

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

// Helper component to render individual remote video/audio streams dynamically
function RemoteMedia({ stream, isVideo }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
      const playPromise = ref.current.play()
      if (playPromise !== undefined) {
        playPromise.catch(error => console.log('Auto-play was prevented', error))
      }
    }
  }, [stream])

  if (!isVideo) {
    return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />
  }

  return <video ref={ref} autoPlay playsInline className="remote-video" />
}

export default function ChatRoom({ roomId, onExit, setIsOffline }) {
  const sessionKey = `gc_messages_${roomId}`
  
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(sessionKey)
    if (saved) {
      try { return JSON.parse(saved) } catch (e) { return [] }
    }
    return []
  })
  
  const [inputText, setInputText] = useState('')
  const [connectedPeers, setConnectedPeers] = useState(new Set()) // Tracks peer IDs we are connected to
  const [inCall, setInCall] = useState(false)
  const [isVideoCall, setIsVideoCall] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  
  // Maps to hold multiple connections for mesh network
  const connsRef = useRef(new Map())
  const callsRef = useRef(new Map())
  const [remoteStreams, setRemoteStreams] = useState({}) // { peerId: { stream, isVideo } }
  
  const [incomingCall, setIncomingCall] = useState(null)
  const [showPermissionModal, setShowPermissionModal] = useState(() => {
    return localStorage.getItem('gc_perms_granted') !== 'true'
  })

  const requestPermissions = async () => {
    setShowPermissionModal(false)
    localStorage.setItem('gc_perms_granted', 'true')
    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission()
      }
    } catch (e) { console.log('Notification permission error:', e) }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stream.getTracks().forEach(t => t.stop())
    } catch (e) { console.log('Media permission error:', e) }
  }

  const socketRef = useRef()
  const peerRef = useRef()
  const localStreamRef = useRef()
  const localVideoRef = useRef(null)
  const messagesEndRef = useRef(null)

  const isOnline = connectedPeers.size > 0

  useEffect(() => {
    let deviceId = localStorage.getItem('gc_deviceId')
    if (!deviceId) {
      deviceId = Math.random().toString(36).substring(2)
      localStorage.setItem('gc_deviceId', deviceId)
    }

    socketRef.current = io(SOCKET_URL)

    socketRef.current.on('connect', () => {
      setIsOffline(false)
      if (peerRef.current) peerRef.current.destroy()
      
      peerRef.current = new Peer(socketRef.current.id, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
          ]
        }
      })

      peerRef.current.on('open', () => {
        socketRef.current.emit('join-room', { roomId, deviceId })
      })

      // When another peer connects to us via data channel
      peerRef.current.on('connection', (connection) => {
        setupDataListeners(connection)
      })

      // When another peer calls us
      peerRef.current.on('call', (call) => {
        setIncomingCall({ call, isVideo: call.metadata?.type === 'video' })
      })
    })

    socketRef.current.on('connect_error', () => setIsOffline(true))
    socketRef.current.on('disconnect', () => {
      setIsOffline(true)
      setConnectedPeers(new Set())
    })

    // Mesh connection logic: when someone joins, connect to them
    socketRef.current.on('user-joined', (remotePeerId) => {
      setupP2PConnection(remotePeerId)
    })

    socketRef.current.on('user-left', (remotePeerId) => {
      setConnectedPeers(prev => {
        const newSet = new Set(prev)
        newSet.delete(remotePeerId)
        return newSet
      })
      if (connsRef.current.has(remotePeerId)) {
        connsRef.current.get(remotePeerId).close()
        connsRef.current.delete(remotePeerId)
      }
      if (callsRef.current.has(remotePeerId)) {
        callsRef.current.get(remotePeerId).close()
        callsRef.current.delete(remotePeerId)
      }
      setRemoteStreams(prev => {
        const newState = { ...prev }
        delete newState[remotePeerId]
        return newState
      })
    })

    socketRef.current.on('chat-message', (data) => {
      if (data.type === 'chat') {
        handleIncomingMessage(data.text)
      }
    })

    socketRef.current.on('room-full', () => {
      alert('Room is full (max 10 users).')
      onExit()
    })

    return () => {
      if (socketRef.current) socketRef.current.disconnect()
      if (peerRef.current) peerRef.current.destroy()
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [roomId])

  const handleIncomingMessage = (text) => {
    setMessages(prev => [...prev, { type: 'received', text }])
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification('New Message', {
            body: text, icon: '/vite.svg', vibrate: [200, 100, 200], data: { url: `/?room=${roomId}` }
          })
        })
      } else {
        new Notification('New Message', { body: text })
      }
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    localStorage.setItem(sessionKey, JSON.stringify(messages))
  }, [messages, sessionKey])

  const setupP2PConnection = (partnerPeerId) => {
    if (!peerRef.current || !peerRef.current.open) return
    if (connsRef.current.has(partnerPeerId)) return // Already connected

    const connection = peerRef.current.connect(partnerPeerId, { reliable: true })
    setupDataListeners(connection)
  }

  const setupDataListeners = (connection) => {
    connection.on('open', () => {
      connsRef.current.set(connection.peer, connection)
      setConnectedPeers(prev => new Set(prev).add(connection.peer))
    })
    
    connection.on('data', (data) => {
      if (data.type === 'chat') {
        handleIncomingMessage(data.text)
      }
    })
    
    connection.on('close', () => {
      connsRef.current.delete(connection.peer)
      setConnectedPeers(prev => {
        const newSet = new Set(prev)
        newSet.delete(connection.peer)
        return newSet
      })
    })
  }

  const ringAudioRef = useRef(new Audio('https://upload.wikimedia.org/wikipedia/commons/c/c4/Phone_ringing.ogg'))
  ringAudioRef.current.loop = true

  useEffect(() => {
    let vibInterval;
    if (incomingCall) {
      ringAudioRef.current.play().catch(e => console.log('Audio autoplay blocked', e))
      if (navigator.vibrate) {
        navigator.vibrate([1000, 500, 1000])
        vibInterval = setInterval(() => navigator.vibrate([1000, 500, 1000]), 2000)
      }
    } else {
      ringAudioRef.current.pause()
      ringAudioRef.current.currentTime = 0
      if (navigator.vibrate) navigator.vibrate(0)
      if (vibInterval) clearInterval(vibInterval)
    }
    return () => { if (vibInterval) clearInterval(vibInterval) }
  }, [incomingCall])

  const getMediaConstraints = (videoVal) => ({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: videoVal ? { width: { ideal: 320, max: 480 }, frameRate: { ideal: 15, max: 20 }, facingMode: "user" } : false
  })

  const attachLocalVideo = (stream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
      localVideoRef.current.play().catch(e => console.log('Local video play blocked', e))
    }
  }

  const acceptCall = async () => {
    if (!incomingCall) return
    const isVideo = incomingCall.isVideo
    setIsVideoCall(isVideo)
    try {
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(isVideo))
      localStreamRef.current = stream
      incomingCall.call.answer(stream)
      setupCallListeners(incomingCall.call, isVideo)
      setIncomingCall(null)
      setInCall(true)
      if (isVideo) attachLocalVideo(stream)
    } catch (err) {
      alert('Media access denied.')
      setIncomingCall(null)
    }
  }

  const declineCall = () => {
    if (incomingCall) incomingCall.call.close()
    setIncomingCall(null)
  }

  const setupCallListeners = (call, isVideo) => {
    callsRef.current.set(call.peer, call)
    call.on('stream', (remoteStream) => {
      setRemoteStreams(prev => ({
        ...prev,
        [call.peer]: { stream: remoteStream, isVideo }
      }))
    })
    call.on('close', () => {
      callsRef.current.delete(call.peer)
      setRemoteStreams(prev => {
        const newState = { ...prev }
        delete newState[call.peer]
        return newState
      })
      // If no calls left, end call mode
      if (callsRef.current.size === 0) terminateCall()
    })
  }

  const toggleCall = async (video = false) => {
    if (inCall) {
      terminateCall()
      return
    }
    
    if (connectedPeers.size === 0) {
      alert("No one is in the room to call.")
      return
    }

    setIsVideoCall(video)
    try {
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(video))
      localStreamRef.current = stream
      setInCall(true)
      
      if (video) attachLocalVideo(stream)

      // Call all connected peers
      connectedPeers.forEach(peerId => {
        const call = peerRef.current.call(peerId, stream, { metadata: { type: video ? 'video' : 'audio' } })
        setupCallListeners(call, video)
      })
    } catch (err) {
      alert('Media access denied.')
      setInCall(false)
    }
  }

  const terminateCall = () => {
    callsRef.current.forEach(call => call.close())
    callsRef.current.clear()
    setRemoteStreams({})
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    setInCall(false)
    setIsVideoCall(false)
  }

  const sendMessage = (e) => {
    e.preventDefault()
    if (!inputText) return
    
    // Broadcast to all P2P Data Channels
    let sentViaP2P = false
    connsRef.current.forEach(conn => {
      if (conn.open) {
        conn.send({ type: 'chat', text: inputText })
        sentViaP2P = true
      }
    })

    // If P2P failed or not fully connected, fallback to Socket.io Relay
    if (!sentViaP2P && socketRef.current && isOnline) {
      socketRef.current.emit('chat-message', { type: 'chat', text: inputText })
    }
    
    setMessages(prev => [...prev, { type: 'sent', text: inputText }])
    setInputText('')
  }

  return (
    <div className="app-container">
      {showPermissionModal && (
        <div className="overlay" style={{ zIndex: 1000 }}>
          <div className="glass-card" style={{ maxWidth: '320px', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '20px' }}>Setup Device</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '25px', textAlign: 'left' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px' }}>
                  <Video size={18} color="var(--primary)" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Camera</span>
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px' }}>
                  <Mic size={18} color="var(--primary)" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Microphone</span>
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px' }}>
                  <Bell size={18} color="var(--primary)" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Notifications</span>
               </div>
            </div>
            <button className="primary-btn" onClick={requestPermissions} style={{ width: '100%', marginBottom: '10px' }}>Allow Access</button>
            <button className="icon-btn" onClick={() => setShowPermissionModal(false)} style={{ width: '100%', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '10px' }}>Skip</button>
          </div>
        </div>
      )}

      {incomingCall && (
        <div className="overlay">
          <div className="glass-card">
            <h2 style={{ marginBottom: '10px' }}>Inbound {incomingCall.isVideo ? 'Video' : 'Voice'} Call</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Someone is calling the room...</p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button className="primary-btn" onClick={acceptCall} style={{ background: 'var(--status-online)' }}>Accept</button>
              <button className="primary-btn" onClick={declineCall} style={{ background: 'var(--danger)', color: '#fff' }}>Decline</button>
            </div>
          </div>
        </div>
      )}

      {inCall && isVideoCall && (
        <div className="centered-video-container">
          {Object.entries(remoteStreams).map(([peerId, data]) => (
             data.isVideo ? <RemoteMedia key={peerId} stream={data.stream} isVideo={true} /> : null
          ))}
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video-pip" />
        </div>
      )}

      <header className="app-header">
        <div className="header-left">
          <div className={`status-ring ${isOnline ? 'online' : ''}`}></div>
          <div className="user-title">
            <span className="user-name">{connectedPeers.size > 0 ? `Room (${connectedPeers.size + 1})` : 'Waiting...'}</span>
            <span className="connection-badge" style={{ color: isOnline ? 'var(--status-online)' : 'var(--text-muted)' }}>
              {isOnline ? `${connectedPeers.size} Peers Connected` : 'Offline'}
            </span>
          </div>
        </div>

        <div className="header-right">
          <button className={`icon-btn ${inCall && isVideoCall ? 'active' : ''}`} onClick={() => toggleCall(true)} title="Group Video Call">
            {inCall && isVideoCall ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button className={`icon-btn ${inCall && !isVideoCall ? 'active' : ''}`} onClick={() => toggleCall(false)} title="Group Voice Call">
            {inCall && !isVideoCall && inCall ? <PhoneOff size={20} /> : <Phone size={20} />}
          </button>
          <button className="icon-btn danger" onClick={onExit} title="Exit">
            <XCircle size={20} />
          </button>
        </div>
      </header>

      {inCall && !isVideoCall && (
        <div className="call-status-bar">
          {Object.entries(remoteStreams).map(([peerId, data]) => (
             !data.isVideo ? <RemoteMedia key={peerId} stream={data.stream} isVideo={false} /> : null
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="call-pulse"></div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Call ({Object.keys(remoteStreams).length + 1})</span>
          </div>
          <button className="icon-btn" onClick={() => {
              if (!localStreamRef.current) return;
              const e = localStreamRef.current.getAudioTracks()[0].enabled
              localStreamRef.current.getAudioTracks()[0].enabled = !e
              setIsMuted(e)
          }} style={{ padding: '6px', borderRadius: '10px' }}>
            {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
        </div>
      )}

      <main className="app-main">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.type}`}>
            {m.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="app-footer">
        <form className="input-wrapper" onSubmit={sendMessage}>
          <input 
            type="text" 
            placeholder="Message..." 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)} 
            autoComplete="off" 
          />
          <button type="submit" className="icon-btn active" disabled={!isOnline}>
            <Send size={20} />
          </button>
        </form>
      </footer>
    </div>
  )
}
