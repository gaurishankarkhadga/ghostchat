const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');


const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
 
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId) => {
        const roomSize = rooms.get(roomId) || 0;

        if (roomSize >= 2) {
            socket.emit('room-full');
            return;
        }

        rooms.set(roomId, roomSize + 1);
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}. Size: ${roomSize + 1}`);

        socket.to(roomId).emit('user-joined', socket.id);

        socket.on('disconnect', () => {
            const currentSize = rooms.get(roomId);
            if (currentSize > 0) {
                rooms.set(roomId, currentSize - 1);
            }
            console.log(`User ${socket.id} left room ${roomId}. Size: ${rooms.get(roomId)}`);
            socket.to(roomId).emit('user-left', socket.id);
        });
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