import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import Peer from 'peerjs'
import { Send, Phone, PhoneOff, Mic, MicOff, XCircle, ShieldCheck, Video, VideoOff } from 'lucide-react'

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

export default function ChatRoom({ roomId, onExit }) {
  const sessionKey = `gc_messages_${roomId}`
  
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(sessionKey)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        return []
      }
    }
    return []
  })
  
  const [inputText, setInputText] = useState('')
  const [isOnline, setIsOnline] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [isVideoCall, setIsVideoCall] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)

  const socketRef = useRef()
  const peerRef = useRef()
  const connRef = useRef()
  const callRef = useRef()
  const localStreamRef = useRef()
  const remoteAudioRef = useRef(new Audio())
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    socketRef.current = io(SOCKET_URL)

    socketRef.current.on('connect', () => {
      peerRef.current = new Peer(socketRef.current.id)

      peerRef.current.on('open', () => {
        socketRef.current.emit('join-room', roomId)
      })

      peerRef.current.on('connection', (connection) => {
        connRef.current = connection
        setupDataListeners(connection)
      })

      peerRef.current.on('call', (call) => {
        setIncomingCall({ call, isVideo: call.metadata?.type === 'video' })
      })
    })

    socketRef.current.on('user-joined', (remotePeerId) => {
      setupP2PConnection(remotePeerId)
    })

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    localStorage.setItem(sessionKey, JSON.stringify(messages))
  }, [messages, sessionKey])

  const setupP2PConnection = (partnerPeerId) => {
    if (connRef.current?.open || !peerRef.current || !peerRef.current.open) return
    const connection = peerRef.current.connect(partnerPeerId, { reliable: true })
    connRef.current = connection
    setupDataListeners(connection)
  }

  const setupDataListeners = (connection) => {
    connection.on('open', () => setIsOnline(true))
    connection.on('data', (data) => {
      if (data.type === 'chat') setMessages(prev => [...prev, { type: 'received', text: data.text }])
    })
    connection.on('close', () => setIsOnline(false))
  }

  const attachVideoStream = (videoRef, stream) => {
    let attempts = 0
    const tryAttach = () => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      } else if (attempts < 20) {
        attempts++
        setTimeout(tryAttach, 50)
      }
    }
    tryAttach()
  }

  const getMediaConstraints = (videoVal) => ({
    audio: {
      echoCancellation: true,
      noiseSuppression: true
    },
    video: videoVal ? {
      width: { ideal: 320, max: 480 }, /* Ultra-low resolution for old devices */
      frameRate: { ideal: 15, max: 20 }, /* Minimal CPU encoding load */
      facingMode: "user"
    } : false
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
      if (isVideo) {
        attachVideoStream(localVideoRef, stream)
      }
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
      if (isVideo) {
        attachVideoStream(remoteVideoRef, remoteStream)
      } else {
        remoteAudioRef.current.srcObject = remoteStream
        remoteAudioRef.current.play()
      }
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
      
      if (video) {
        attachVideoStream(localVideoRef, stream)
      }
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
    if (!inputText || !connRef.current) return
    connRef.current.send({ type: 'chat', text: inputText })
    setMessages(prev => [...prev, { type: 'sent', text: inputText }])
    setInputText('')
  }

  return (
    <div className="app-container">
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
            {isOnline && <span className="connection-badge">Secured P2P</span>}
          </div>
        </div>

        <div className="header-right">
          <button className={`icon-btn ${inCall && isVideoCall ? 'active' : ''}`} onClick={() => toggleCall(true)} title="Video Call">
            {inCall && isVideoCall ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button className={`icon-btn ${inCall && !isVideoCall ? 'active' : ''}`} onClick={() => toggleCall(false)} title="Voice Call">
            {inCall && !isVideoCall && inCall ? <PhoneOff size={20} /> : <Phone size={20} />}
          </button>
          <button className="icon-btn danger" onClick={onExit} title="Exit">
            <XCircle size={20} />
          </button>
        </div>
      </header>

      {inCall && !isVideoCall && (
        <div className="call-status-bar">
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
