const Game = require('../models/Game');
const User = require('../models/User');

// Get user's game history
const getGameHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const games = await Game.find({
      $or: [{ player1: userId }, { player2: userId }],
      status: 'completed'
    })
    .populate('player1', 'username')
    .populate('player2', 'username')
    .populate('winner', 'username')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Game.countDocuments({
      $or: [{ player1: userId }, { player2: userId }],
      status: 'completed'
    });

    res.json({
      success: true,
      games,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching game history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch game history'
    });
  }
};

// Get user's game statistics
const getGameStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await Game.aggregate([
      {
        $match: {
          $or: [{ player1: userId }, { player2: userId }],
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalGames: { $sum: 1 },
          wins: {
            $sum: {
              $cond: [{ $eq: ['$winner', userId] }, 1, 0]
            }
          },
          draws: {
            $sum: {
              $cond: [{ $eq: ['$result', 'draw'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const result = stats[0] || { totalGames: 0, wins: 0, draws: 0 };
    result.losses = result.totalGames - result.wins - result.draws;
    result.winRate = result.totalGames > 0 ? Math.round((result.wins / result.totalGames) * 100) : 0;

    res.json({
      success: true,
      stats: result
    });
  } catch (error) {
    console.error('Error fetching game stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch game statistics'
    });
  }
};

// Get specific game details
const getGameDetails = async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user._id;

    const game = await Game.findOne({
      _id: gameId,
      $or: [{ player1: userId }, { player2: userId }]
    })
    .populate('player1', 'username')
    .populate('player2', 'username')
    .populate('winner', 'username')
    .populate('moveHistory.playerId', 'username');

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    res.json({
      success: true,
      game
    });
  } catch (error) {
    console.error('Error fetching game details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch game details'
    });
  }
};

module.exports = {
  getGameHistory,
  getGameStats,
  getGameDetails
};