import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import Peer from 'peerjs'
import { Send, Phone, PhoneOff, Mic, MicOff, XCircle, ShieldCheck, Video, VideoOff, Bell } from 'lucide-react'

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

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
  const [isOnline, setIsOnline] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [isVideoCall, setIsVideoCall] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
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
  const connRef = useRef()
  const callRef = useRef()
  const localStreamRef = useRef()
  const remoteAudioRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const messagesEndRef = useRef(null)

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

      peerRef.current.on('connection', (connection) => {
        if (connRef.current && connRef.current.peer !== connection.peer) {
          connRef.current.close()
        }
        connRef.current = connection
        setupDataListeners(connection)
      })

      peerRef.current.on('call', (call) => {
        setIncomingCall({ call, isVideo: call.metadata?.type === 'video' })
      })
    })

    socketRef.current.on('connect_error', () => setIsOffline(true))
    socketRef.current.on('disconnect', () => {
      setIsOffline(true)
      setIsOnline(false)
    })

    socketRef.current.on('user-joined', (remotePeerId) => {
      setIsOnline(true)
      setupP2PConnection(remotePeerId)
    })

    socketRef.current.on('user-left', () => {
      setIsOnline(false)
      if (connRef.current) connRef.current.close()
    })

    socketRef.current.on('chat-message', (data) => {
      if (data.type === 'chat') {
        setMessages(prev => [...prev, { type: 'received', text: data.text }])
      }
    })

    socketRef.current.on('room-status', ({ count }) => {
      setIsOnline(count > 1)
    })

    // Auto-request peer on initial mount if socket is ready
    if (socketRef.current.connected) {
      socketRef.current.emit('request-peer')
    }

    socketRef.current.on('room-full', () => {
      alert('Room is full (max 2 users).')
      onExit()
    })

    return () => {
      if (socketRef.current) socketRef.current.disconnect()
      if (peerRef.current) peerRef.current.destroy()
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [roomId])

  const setupP2PConnection = (partnerPeerId) => {
    if (!peerRef.current || !peerRef.current.open) return
    if (connRef.current && connRef.current.peer === partnerPeerId) return

    if (connRef.current) connRef.current.close()
    const connection = peerRef.current.connect(partnerPeerId, { reliable: true })
    connRef.current = connection
    setupDataListeners(connection)
  }

  const setupDataListeners = (connection) => {
    if (connection.open) setIsOnline(true)
    connection.on('open', () => setIsOnline(true))
    connection.on('data', (data) => {
      if (data.type === 'chat') {
        setMessages(prev => [...prev, { type: 'received', text: data.text }])
      }
    })
    connection.on('close', () => setIsOnline(false))
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

  // Auto-Healer: Reboot P2P connection if tab was suspended by mobile OS or network switched
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isOnline && socketRef.current) {
        socketRef.current.emit('request-peer')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isOnline])

  // Sync Heartbeat: Periodically request peer if not online to ensure sync
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isOnline && socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('request-peer')
      }
    }, 5000) // Every 5 seconds
    return () => clearInterval(interval)
  }, [isOnline])

  const attachVideoStream = (videoRef, stream) => {
    let attempts = 0
    const tryAttach = () => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(e => console.log('Auto-play was prevented', e))
      } else if (attempts < 20) {
        attempts++
        setTimeout(tryAttach, 50)
      }
    }
    tryAttach()
  }

  const getMediaConstraints = (videoVal) => ({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: videoVal ? { width: { ideal: 320, max: 480 }, frameRate: { ideal: 15, max: 20 }, facingMode: "user" } : false
  })

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
      if (isVideo) attachVideoStream(localVideoRef, stream)
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
    callRef.current = call
    setInCall(true)
    call.on('stream', (remoteStream) => {
      if (isVideo) attachVideoStream(remoteVideoRef, remoteStream)
      else attachVideoStream(remoteAudioRef, remoteStream)
    })
    call.on('close', () => terminateCall())
  }

  const toggleCall = async (video = false) => {
    if (inCall) {
      terminateCall()
      return
    }
    setIsVideoCall(video)
    try {
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(video))
      localStreamRef.current = stream
      const call = peerRef.current.call(connRef.current.peer, stream, { metadata: { type: video ? 'video' : 'audio' } })
      setupCallListeners(call, video)
      if (video) attachVideoStream(localVideoRef, stream)
    } catch (err) {
      alert('Media access denied.')
    }
  }

  const terminateCall = () => {
    if (callRef.current) callRef.current.close()
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
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'chat', text: inputText })
    } else if (socketRef.current && isOnline) {
      socketRef.current.emit('chat-message', { type: 'chat', text: inputText })
    } else {
      return
    }
    setMessages(prev => [...prev, { type: 'sent', text: inputText }])
    setInputText('')
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    localStorage.setItem(sessionKey, JSON.stringify(messages))
  }, [messages, sessionKey])

  return (
    <div className="app-container">
      {showPermissionModal && (
        <div className="overlay" style={{ zIndex: 1000 }}>
          <div className="glass-card" style={{ maxWidth: '320px', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '20px' }}>Setup Device</h2>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '30px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Video size={14} color="var(--primary)" />
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Camera</span>
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mic size={14} color="var(--primary)" />
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Mic</span>
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bell size={14} color="var(--primary)" />
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Alerts</span>
               </div>
            </div>
            <button 
              className="primary-btn" 
              onClick={requestPermissions} 
              style={{ 
                width: '100%', 
                padding: '18px', 
                borderRadius: '24px', 
                fontSize: '1.1rem', 
                fontWeight: 700, 
                boxShadow: '0 8px 25px rgba(37, 211, 102, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <ShieldCheck size={20} />
              Allow Access
            </button>
          </div>
        </div>
      )}

      {incomingCall && (
        <div className="overlay">
          <div className="glass-card">
            <h2 style={{ marginBottom: '10px' }}>Inbound {incomingCall.isVideo ? 'Video' : 'Voice'} Call</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Your partner is calling you...</p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button className="primary-btn" onClick={acceptCall} style={{ background: 'var(--status-online)' }}>Accept</button>
              <button className="primary-btn" onClick={declineCall} style={{ background: 'var(--danger)', color: '#fff' }}>Decline</button>
            </div>
          </div>
        </div>
      )}

      {inCall && isVideoCall && (
        <div className="centered-video-container">
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video-pip" />
        </div>
      )}

      <header className="app-header">
        <div className="header-left">
          <div className={`status-ring ${isOnline ? 'online' : ''}`}></div>
          <div className="user-title">
            <span className="user-name">Partner</span>
            <span className="connection-badge" style={{ color: isOnline ? 'var(--status-online)' : 'var(--text-muted)' }}>
              {isOnline ? 'Online' : 'Waiting...'}
            </span>
          </div>
        </div>
        <div className="header-right">
          <button className={`icon-btn ${inCall && isVideoCall ? 'active' : ''}`} onClick={() => toggleCall(true)} title="Video Call">
            {inCall && isVideoCall ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button className={`icon-btn ${inCall && !isVideoCall ? 'active' : ''}`} onClick={() => toggleCall(false)} title="Voice Call">
            {inCall && !isVideoCall ? <PhoneOff size={20} /> : <Phone size={20} />}
          </button>
          <button className="icon-btn danger" onClick={onExit} title="Exit">
            <XCircle size={20} />
          </button>
        </div>
      </header>

      {inCall && !isVideoCall && (
        <div className="call-status-bar">
          <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="call-pulse"></div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Call</span>
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
