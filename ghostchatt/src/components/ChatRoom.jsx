import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import Peer from 'peerjs'
import { Send, Phone, PhoneOff, Mic, MicOff, XCircle, ShieldCheck, PhoneIncoming } from 'lucide-react'

const SOCKET_URL = 'http://localhost:5000'

export default function ChatRoom({ roomId, myName, partnerName, onExit }) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [peerId, setPeerId] = useState(null)
  const [isOnline, setIsOnline] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null) 

  const socketRef = useRef()
  const peerRef = useRef()
  const connRef = useRef()
  const callRef = useRef()
  const localStreamRef = useRef()
  const remoteAudioRef = useRef(new Audio())

  useEffect(() => {
    socketRef.current = io(SOCKET_URL)
    socketRef.current.emit('join-room', roomId)

    socketRef.current.on('room-full', () => {
      alert('This room is full (2 people max).')
      onExit()
    })

    const pId = myName ? `${roomId}-${myName}` : `ghost-${roomId}-${Math.random().toString(36).substring(7)}`
    setPeerId(pId)
    peerRef.current = new Peer(pId)

    peerRef.current.on('open', (id) => {
        if (partnerName) {
            setupP2PConnection(`${roomId}-${partnerName}`)
        }
    })

    peerRef.current.on('connection', (connection) => {
      connRef.current = connection
      setupDataListeners(connection)
    })

    peerRef.current.on('call', (call) => {
      setIncomingCall(call)
    })

    return () => {
      socketRef.current.disconnect()
      peerRef.current.destroy()
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [roomId, myName, partnerName])

  useEffect(() => {
    const retryInterval = setInterval(() => {
        if (!isOnline && partnerName && peerRef.current?.open) {
            setupP2PConnection(`${roomId}-${partnerName}`)
        }
    }, 3000)
    return () => clearInterval(retryInterval)
  }, [isOnline, partnerName, roomId])

  const setupP2PConnection = (partnerPeerId) => {
    if (connRef.current?.open || !peerRef.current || !peerRef.current.open) return
    const connection = peerRef.current.connect(partnerPeerId, { reliable: true })
    connRef.current = connection
    setupDataListeners(connection)
  }

  const setupDataListeners = (connection) => {
    connection.on('open', () => {
      setIsOnline(true)
    })
    connection.on('data', (data) => {
      if (data.type === 'chat') setMessages(prev => [...prev, { type: 'received', text: data.text }])
    })
    connection.on('close', () => {
      setIsOnline(false)
    })
  }

  const acceptCall = async () => {
    if (!incomingCall) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      incomingCall.answer(stream)
      setupCallListeners(incomingCall)
      setIncomingCall(null)
    } catch (err) {
      alert('Microphone access denied.')
      setIncomingCall(null)
    }
  }

  const declineCall = () => {
    if (incomingCall) {
      incomingCall.close()
      setIncomingCall(null)
    }
  }

  const setupCallListeners = (call) => {
    callRef.current = call
    setInCall(true)
    call.on('stream', (remoteStream) => {
      remoteAudioRef.current.srcObject = remoteStream
      remoteAudioRef.current.play()
    })
    call.on('close', () => terminateCall(false))
  }

  const toggleCall = async () => {
    if (inCall) {
      terminateCall()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const partnerPeerId = connRef.current.peer
      const call = peerRef.current.call(partnerPeerId, stream)
      setupCallListeners(call)
    } catch (err) {
      alert('Mic access denied.')
    }
  }

  const terminateCall = (propagate = true) => {
    if (callRef.current) callRef.current.close()
    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
    }
    setInCall(false)
  }

  const sendMessage = (e) => {
    e.preventDefault()
    if (!inputText || !connRef.current) return
    connRef.current.send({ type: 'chat', text: inputText })
    setMessages(prev => [...prev, { type: 'sent', text: inputText }])
    setInputText('')
  }

  return (
    <div className="chat-container">
      {incomingCall && (
        <div className="call-overlay">
          <div className="call-card glass-card">
            <div className="call-icon-container">
                <PhoneIncoming size={48} className="pulse-icon" />
            </div>
            <h2>Incoming Audio Call</h2>
            <p>Your partner is calling you...</p>
            <div className="call-actions">
              <button className="accept-btn" onClick={acceptCall}>Accept</button>
              <button className="decline-btn" onClick={declineCall}>Decline</button>
            </div>
          </div>
        </div>
      )}

      <header className="chat-header">
        <div className="partner-info">
          <div className={`status-dot ${isOnline ? 'online' : ''}`}></div>
          <span className="status-text">{isOnline ? 'Partner Online' : 'Waiting...'}</span>
        </div>
        <div className="header-badge"><ShieldCheck size={14} /> <span>P2P Secured</span></div>
        <div className="actions">
          <button className={`icon-btn ${inCall ? 'active' : ''}`} onClick={toggleCall} title="Audio Call">
            {inCall ? <PhoneOff size={20} /> : <Phone size={20} />}
          </button>
          <button className="icon-btn danger" onClick={onExit} title="End Session">
            <XCircle size={20} />
          </button>
        </div>
      </header>

      <div className="messages-area">
        {messages.map((m, i) => <div key={i} className={`msg ${m.type}`}>{m.text}</div>)}
      </div>

      {inCall && (
        <div className="call-status">
          <div className="call-pulse"></div>
          <span>On Call</span>
          <button className="icon-btn small" onClick={() => {
              const e = localStreamRef.current.getAudioTracks()[0].enabled
              localStreamRef.current.getAudioTracks()[0].enabled = !e
              setIsMuted(e)
          }}>
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        </div>
      )}

      <form className="chat-input-area" onSubmit={sendMessage}>
        <input type="text" placeholder="Message..." value={inputText} onChange={(e) => setInputText(e.target.value)} autoComplete="off" />
        <button type="submit" className="icon-btn active"><Send size={20} /></button>
      </form>

      <style>{`
        .chat-container { position: relative; height: 100vh; display: flex; flex-direction: column; }
        .call-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .call-card { text-align: center; max-width: 320px; }
        .call-icon-container { margin-bottom: 20px; }
        .pulse-icon { color: var(--accent-primary); animation: glow-pulse 1.5s infinite; }
        .call-actions { display: flex; gap: 15px; margin-top: 30px; }
        .accept-btn { flex: 1; padding: 12px; border-radius: 12px; background: var(--success); color: #000; font-weight: 600; border: none; cursor: pointer; }
        .decline-btn { flex: 1; padding: 12px; border-radius: 12px; background: var(--danger); color: #fff; font-weight: 600; border: none; cursor: pointer; }
        
        .partner-info { display: flex; align-items: center; gap: 8px; }
        .status-text { font-size: 0.85rem; font-weight: 600; }
        .header-badge { display: flex; align-items: center; gap: 5px; font-size: 0.65rem; color: #00ff88; background: rgba(0,255,136,0.1); padding: 4px 8px; border-radius: 20px; text-transform: uppercase; }
        .call-status { margin: 0 20px 10px; padding: 8px 15px; background: rgba(0, 242, 255, 0.1); border: 1px solid var(--accent-primary); border-radius: 12px; display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--accent-primary); }
        .call-pulse { width: 8px; height: 8px; background: var(--accent-primary); border-radius: 50%; animation: glow-pulse 1s infinite alternate; }
        @keyframes glow-pulse { from { opacity: 0.4; filter: drop-shadow(0 0 0px var(--accent-primary)); } to { opacity: 1; filter: drop-shadow(0 0 10px var(--accent-primary)); } }
      `}</style>
    </div>
  )
}
