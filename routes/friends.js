const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// Get friends list
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('friends', '-password')
      .exec();
    
    // Ensure unique friends by _id
    const uniqueFriends = Array.from(
      new Map(user.friends.map(friend => [friend._id.toString(), friend])).values()
    );
    
    res.json(uniqueFriends);
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get friend recommendations with mutual friends count
router.get('/recommendations', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId).populate('friends');
    const currentUserFriendIds = currentUser.friends.map(f => f._id.toString());

    // Get all users except current user and their friends
    const potentialFriends = await User.find({
      _id: { 
        $ne: req.userId, 
        $nin: currentUserFriendIds 
      }
    }).populate('friends').select('-password');

    // Calculate mutual friends for each potential friend
    const recommendations = potentialFriends.map(user => {
      const userFriendIds = user.friends.map(f => f._id.toString());
      const mutualFriends = currentUserFriendIds.filter(id => 
        userFriendIds.includes(id)
      ).length;

      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        mutualFriends
      };
    });

    // Sort by number of mutual friends
    recommendations.sort((a, b) => b.mutualFriends - a.mutualFriends);

    res.json(recommendations);
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send friend request
router.post('/request/:userId', auth, async (req, res) => {
  try {
    if (!req.params.userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if request already exists
    const existingRequest = targetUser.friendRequests.find(
      req => req.from.toString() === req.userId
    );
    if (existingRequest) {
      return res.status(400).json({ message: 'Friend request already sent' });
    }

    targetUser.friendRequests.push({
      from: req.userId,
      status: 'pending'
    });
    await targetUser.save();

    res.json({ message: 'Friend request sent successfully' });
  } catch (error) {
    console.error('Friend request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get friend requests
router.get('/requests', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate({
        path: 'friendRequests.from',
        select: 'username email'
      });
    
    res.json(user.friendRequests);
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Handle friend request (accept/reject)
router.post('/requests/:requestId/:action', auth, async (req, res) => {
  try {
    const { requestId, action } = req.params;
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const user = await User.findById(req.userId);
    const request = user.friendRequests.id(requestId);

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (action === 'accept') {
      user.friends.push(request.from);
      const otherUser = await User.findById(request.from);
      otherUser.friends.push(user._id);
      await otherUser.save();
    }

    user.friendRequests.pull(requestId);
    await user.save();

    res.json({ message: `Friend request ${action}ed` });
  } catch (error) {
    console.error('Handle request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add this route to handle unfriending
router.delete('/:friendId', auth, async (req, res) => {
  try {
    const { friendId } = req.params;
    
    // Validate friendId
    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ message: 'Invalid friend ID' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const friend = await User.findById(friendId);
    if (!friend) {
      return res.status(404).json({ message: 'Friend not found' });
    }

    // Remove from both users' friend lists
    user.friends = user.friends.filter(id => id.toString() !== friendId);
    friend.friends = friend.friends.filter(id => id.toString() !== req.userId);

    await Promise.all([user.save(), friend.save()]);

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Unfriend error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 