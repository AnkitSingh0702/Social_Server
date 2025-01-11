const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Search users
router.get('/search', auth, async (req, res) => {
  try {
    const query = req.query.q;
    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 