const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getGameHistory, getGameStats, getGameDetails } = require('../controllers/gameController');

// Get user's game history
router.get('/history', auth, getGameHistory);

// Get user's game statistics
router.get('/stats', auth, getGameStats);

// Get specific game details
router.get('/:gameId', auth, getGameDetails);

module.exports = router;