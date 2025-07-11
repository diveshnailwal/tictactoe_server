const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const mongoose = require('mongoose');

const http = require('http');
const socketIo = require('socket.io');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Import models
const Game = require('./models/Game');
const User = require('./models/User');

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6] // diagonals
  ];
  
  for (let line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  
  return board.includes(null) ? null : 'draw';
}

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/game')); // Add this line

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Add Socket.IO logic here (I'll provide this next)

const onlineUsers = new Map();
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_lobby', (userData) => {
    console.log('User joined lobby:', userData);
    const { userId, username } = userData;
    onlineUsers.set(userId, { socketId: socket.id, username, userId });
    socket.join('lobby');
    io.to('lobby').emit('online_users_updated', Array.from(onlineUsers.values()));
  });

  socket.on('create_room', (roomData) => {
    const { roomId, creatorId } = roomData;
    rooms.set(roomId, { players: [creatorId], status: 'waiting' });
    socket.join(roomId);
    io.to('lobby').emit('rooms_updated', Array.from(rooms.entries()));
  });

  // Handle game invitations
  socket.on('invite_to_play', (data) => {
    const { from, to } = data;
    const opponent = Array.from(onlineUsers.values()).find(u => u.userId === to);
    const inviter = onlineUsers.get(from);
    
    if (opponent && inviter) {
      io.to(opponent.socketId).emit('game_invitation', {
        from,
        fromUsername: inviter.username
      });
    }
  });

  // Handle invitation response
  socket.on('invitation_response', async (data) => {
    const { from, to, accepted } = data;
    const inviter = Array.from(onlineUsers.values()).find(u => u.userId === from);
    
    if (accepted && inviter) {
      const roomId = `game_${Date.now()}`;
      const gameRoom = {
        players: [from, to],
        status: 'playing',
        board: Array(9).fill(null),
        currentTurn: from,
        winner: null,
        startTime: Date.now(),
        moveHistory: []
      };
      
      rooms.set(roomId, gameRoom);
      
      // Create game record in database
      try {
        const newGame = new Game({
         player1: new mongoose.Types.ObjectId(from),
player2: new mongoose.Types.ObjectId(to),
          roomId: roomId,
          moveHistory: [],
          finalBoard: Array(9).fill(null),
          result: 'player1_wins', // Will be updated when game ends
          status: 'active'
        });
        
        await newGame.save();
        console.log('Game record created:', newGame._id);
      } catch (error) {
        console.error('Error creating game record:', error);
      }
      
      io.sockets.sockets.get(socket.id).join(roomId);
      io.sockets.sockets.get(inviter.socketId).join(roomId);
      
      io.to(roomId).emit('game_started', {
        roomId,
        players: [from, to],
        currentTurn: from,
        board: gameRoom.board
      });
    } else if (inviter) {
      io.to(inviter.socketId).emit('invitation_declined', { from: to });
    }
  });

  // Handle player moves
  socket.on('player_move', async (data) => {
    const { roomId, position, playerId } = data;
    const room = rooms.get(roomId);
    
    if (room && room.currentTurn === playerId && room.board[position] === null) {
      const symbol = room.players.indexOf(playerId) === 0 ? 'X' : 'O';
      room.board[position] = symbol;
      room.currentTurn = room.players.find(p => p !== playerId);
      
      // Add move to history
      room.moveHistory.push({
        playerId,
        position,
        symbol,
        timestamp: Date.now()
      });
      
      // Check for winner
     // Check for winner or draw
// Check for winner
const winner = checkWinner(room.board);
console.log('Winner check result:', winner);
console.log('Board state:', room.board);
console.log('Board includes null:', room.board.includes(null));

if (winner) {
  console.log('Game ended with winner:', winner);
  room.winner = winner;
  room.status = 'finished';
  
  // Save game result to database
  await saveGameResult(roomId, room, winner);
} else if (!room.board.includes(null)) {
  console.log('Game ended in draw');
  room.winner = 'draw';
  room.status = 'finished';
  
  // Save game result to database
  await saveGameResult(roomId, room, 'draw');
}
      
      io.to(roomId).emit('game_updated', {
        board: room.board,
        currentTurn: room.currentTurn,
        winner: room.winner
      });
    }
  });

  socket.on('leave_game', async (data) => {
    const { roomId, playerId } = data;
    const room = rooms.get(roomId);
    
    if (room && room.status === 'playing') {
      // Mark game as abandoned
      await saveGameResult(roomId, room, 'abandoned', playerId);
      
      const opponent = room.players.find(p => p !== playerId);
      const opponentSocket = Array.from(onlineUsers.values()).find(u => u.userId === opponent);
      
      if (opponentSocket) {
        io.to(opponentSocket.socketId).emit('opponent_left');
      }
      
      rooms.delete(roomId);
    }
    
    socket.leave(roomId);
    socket.join('lobby');
    socket.emit('game_left');
  });

  socket.on('play_again', (data) => {
    const { roomId, playerId } = data;
    const room = rooms.get(roomId);
    
    if (room) {
      const opponent = room.players.find(p => p !== playerId);
      const opponentSocket = Array.from(onlineUsers.values()).find(u => u.userId === opponent);
      
      if (opponentSocket) {
        io.to(opponentSocket.socketId).emit('play_again_request', { from: playerId });
      }
    }
  });

  socket.on('chat_message', (data) => {
    const { roomId, message, playerId, username } = data;
    const room = rooms.get(roomId);
    
    if (room) {
      const chatMessage = {
        id: Date.now(),
        message,
        playerId,
        username,
        timestamp: new Date().toLocaleTimeString()
      };
      
      io.to(roomId).emit('chat_message', chatMessage);
    }
  });

  socket.on('back_to_lobby', (data) => {
    const { roomId } = data;
    socket.leave(roomId);
    socket.join('lobby');
  });

  socket.on('disconnect', () => {
    for (const [userId, userData] of onlineUsers.entries()) {
      if (userData.socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.to('lobby').emit('online_users_updated', Array.from(onlineUsers.values()));
  });
});

// Helper function to save game result
async function saveGameResult(roomId, room, winner, abandonedBy = null) {
  try {
    const game = await Game.findOne({ roomId: roomId });
    if (!game) {
      console.log('Game not found for roomId:', roomId);
      return;
    }

    // Calculate game duration
    const duration = Math.floor((Date.now() - room.startTime) / 1000);

    // Determine result and winner
    let result;
    let winnerId = null;

    if (winner === 'abandoned') {
      result = 'abandoned';
      // Winner is the player who didn't abandon
      winnerId = room.players.find(p => p !== abandonedBy);
    } else if (winner === 'draw') {
      result = 'draw';
    } else if (winner === 'X') {
      result = 'player1_wins';
      winnerId = room.players[0]; // First player is X
    } else if (winner === 'O') {
      result = 'player2_wins';
      winnerId = room.players[1]; // Second player is O
    }

    // Update game record
   game.moveHistory = room.moveHistory.map(move => ({
  playerId: new mongoose.Types.ObjectId(move.playerId), // Add 'new' here
  position: move.position,
  symbol: move.symbol,
  timestamp: move.timestamp
}));

// This line should be OUTSIDE the map function:
game.winner = winnerId ? new mongoose.Types.ObjectId(winnerId) : null;
    game.finalBoard = room.board;
    game.result = result;
  game.winner = winnerId ? new mongoose.Types.ObjectId(winnerId) : null;
    game.duration = duration;
    game.status = 'completed';

    await game.save();
    
    // Update user statistics
    await updateUserStats(room.players[0], room.players[1], result);
    
    console.log('Game result saved:', game._id);
  } catch (error) {
    console.error('Error saving game result:', error);
  }
}

// Helper function to update user statistics
async function updateUserStats(player1Id, player2Id, result) {
  try {
    // Change these lines:
const player1 = await User.findById(new mongoose.Types.ObjectId(player1Id));
const player2 = await User.findById(new mongoose.Types.ObjectId(player2Id));

    if (player1) {
      player1.gamesPlayed += 1;
      if (result === 'player1_wins') player1.gamesWon += 1;
      else if (result === 'player2_wins') player1.gamesLost += 1;
      else if (result === 'draw') player1.gamesDraw += 1;
      await player1.save();
    }

    if (player2) {
      player2.gamesPlayed += 1;
      if (result === 'player2_wins') player2.gamesWon += 1;
      else if (result === 'player1_wins') player2.gamesLost += 1;
      else if (result === 'draw') player2.gamesDraw += 1;
      await player2.save();
    }
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));