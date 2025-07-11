const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  player1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  player2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  moveHistory: [{
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    position: {
      type: Number,
      required: true,
      min: 0,
      max: 8
    },
    symbol: {
      type: String,
      required: true,
      enum: ['X', 'O']
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  finalBoard: {
    type: [String],
    default: Array(9).fill(null)
  },
  result: {
    type: String,
    enum: ['player1_wins', 'player2_wins', 'draw', 'abandoned'],
    required: true
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for faster queries
gameSchema.index({ player1: 1, player2: 1, createdAt: -1 });
gameSchema.index({ roomId: 1 });

module.exports = mongoose.model('Game', gameSchema);