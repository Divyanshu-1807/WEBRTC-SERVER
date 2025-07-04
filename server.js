const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
  },
});

const rooms = {};

const handleUserLeaveRoom = (socket, roomId, reason = 'left') => {
  if (roomId && rooms[roomId]) {
    // Remove user from room
    rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
    console.log(`User ${socket.id} ${reason} room ${roomId}`);

    // Leave the socket room
    socket.leave(roomId);
    
    // Clear room reference
    socket.roomId = null;

    // Notify other users about user leaving
    socket.to(roomId).emit('user-left', socket.id);
    
    // Clean up empty rooms
    if (rooms[roomId].length === 0) {
      delete rooms[roomId];
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      console.log(`Room ${roomId} now has users:`, rooms[roomId]);
    }
  }
};


io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
   
  socket.on('create', (roomId) => {
    console.log(`User ${socket.id} creating room ${roomId}`);
    
    // Initialize room if it doesn't exist
    if (rooms[roomId]) {
      socket.emit('error', `Room ${roomId} already exists. Please join the room instead.`);
      return;
    }

    rooms[roomId] = [];
    rooms[roomId].push(socket.id);
    socket.join(roomId);
    socket.roomId = roomId;
    console.log(`User ${socket.id} created room ${roomId}`);
    
    // Emit success confirmation
    socket.emit('room-created', { roomId });
  });

  socket.on('join', (roomId) => {
    console.log(`User ${socket.id} joining room ${roomId}`);
    
    // If room doesn't exist
    if (!rooms[roomId]) {
      socket.emit('error', `Room ${roomId} does not exist. Please create the room first.`);
      return;
    }
    
    // If room is full (10 users max)
    if (rooms[roomId].length >= 10) {
      socket.emit('error', `Room ${roomId} is full. Please join another room.`);
      return;
    }

    // Get existing users before adding new user
    const existingUsers = [...rooms[roomId]];
    
    // Add user to room if not already present
    if (!rooms[roomId].includes(socket.id)) {
      rooms[roomId].push(socket.id);
      socket.join(roomId);
      socket.roomId = roomId;
      
      console.log(`User ${socket.id} joined room ${roomId}`);
      console.log(`Room ${roomId} now has users:`, rooms[roomId]);
      
      // Emit success confirmation
      socket.emit('room-joined', { roomId });
      
      // Send existing users to the newly joined user
      // This triggers offers from new user to existing users
      if (existingUsers.length > 0) {
        console.log(`Sending existing users to ${socket.id}:`, existingUsers);
        socket.emit('all-users', existingUsers);
      }
      
      // Notify existing users about new user
      // This prepares them to receive offers from new user
      if (existingUsers.length > 0) {
        console.log(`Notifying existing users about new user ${socket.id}`);
        socket.to(roomId).emit('user-joined', socket.id);
      }
    } else {
      console.log(`User ${socket.id} already in room ${roomId}`);
      // Still emit success if user is already in room
      socket.emit('room-joined', { roomId });
    }
  });

  socket.on('offer', ({ target, sdp }) => {
    console.log(`Relaying offer from ${socket.id} to ${target}`);
    io.to(target).emit('offer', { sdp, caller: socket.id });
  });

  socket.on('answer', ({ target, sdp }) => {
    console.log(`Relaying answer from ${socket.id} to ${target}`);
    io.to(target).emit('answer', { sdp, caller: socket.id });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    console.log(`Relaying ICE candidate from ${socket.id} to ${target}`);
    io.to(target).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('leave-room', (roomId) => {
    console.log(`User ${socket.id} leaving room ${roomId}`);
    handleUserLeaveRoom(socket, roomId, 'left');
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    console.log(`User ${socket.id} disconnecting from room ${roomId}`);
    handleUserLeaveRoom(socket, roomId, 'disconnected from');
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT,'0.0.0.0',() => {
  console.log(`Signaling server running on port ${PORT}`);
});