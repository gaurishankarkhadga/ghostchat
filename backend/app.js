require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

const rooms = new Map(); // roomId => Map(deviceId => socketId)

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (payload) => {
        const roomId = typeof payload === 'string' ? payload : payload.roomId;
        const deviceId = typeof payload === 'string' ? socket.id : payload.deviceId;

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }
        
        const roomUsers = rooms.get(roomId);

        // If this exact phone/device tries to join again (e.g., duplicated tab), forcibly disconnect the ghost tab to free the slot immediately.
        if (roomUsers.has(deviceId)) {
            const oldSocketId = roomUsers.get(deviceId);
            roomUsers.delete(deviceId);
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) oldSocket.disconnect(true);
        }

        if (roomUsers.size >= 2) {
            socket.emit('room-full');
            return;
        }

        roomUsers.set(deviceId, socket.id);
        socket.join(roomId);
        
        // Tag socket for fast teardown
        socket.roomId = roomId;
        socket.deviceId = deviceId;

        console.log(`User ${socket.id} joined room ${roomId}. Size: ${roomUsers.size}`);
        socket.to(roomId).emit('user-joined', socket.id);
    });

    socket.on('disconnect', () => {
        if (socket.roomId && socket.deviceId) {
            const roomUsers = rooms.get(socket.roomId);
            if (roomUsers && roomUsers.get(socket.deviceId) === socket.id) {
                roomUsers.delete(socket.deviceId);
                console.log(`User ${socket.id} left room ${socket.roomId}. Size: ${roomUsers.size}`);
                socket.to(socket.roomId).emit('user-left', socket.id);
                if (roomUsers.size === 0) {
                    rooms.delete(socket.roomId);
                }
            }
        }
    });

    // Signaling for WebRTC (though PeerJS is used, we might need this for extra coordination)
    socket.on('signal', ({ roomId, signal }) => {
        socket.to(roomId).emit('signal', signal);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Ghost Signaling Server running on port ${PORT}`);
});