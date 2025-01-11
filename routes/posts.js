const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Post = require('../models/Post');
const auth = require('../middleware/auth');

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));  // Use absolute path
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Create post with error handling
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    const post = new Post({
      user: req.userId,
      image: `/uploads/${req.file.filename}`,  // Use relative path
      caption: req.body.caption || '',
      likes: []
    });

    await post.save();
    
    const populatedPost = await Post.findById(post._id)
      .populate('user', 'username email')
      .lean();

    // Add full URL to the response
    populatedPost.imageUrl = `http://localhost:5000${populatedPost.image}`;
    
    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Post creation error:', error);
    res.status(500).json({ message: 'Error creating post', error: error.message });
  }
});

// Get posts
router.get('/', auth, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'username email')
      .sort('-createdAt')
      .lean();

    // Add full URLs to all posts
    posts.forEach(post => {
      post.imageUrl = `http://localhost:5000${post.image}`;
    });

    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Like/unlike post
router.post('/:postId/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const likeIndex = post.likes.indexOf(req.userId);
    if (likeIndex > -1) {
      post.likes.splice(likeIndex, 1);
    } else {
      post.likes.push(req.userId);
    }

    await post.save();
    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 