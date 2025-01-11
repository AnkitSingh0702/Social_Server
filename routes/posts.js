const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const Post = require('../models/Post');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function (req, file, cb) {
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter with better error handling
const fileFilter = (req, file, cb) => {
  // Check MIME type first
  if (!file.mimetype.startsWith('image/')) {
    return cb(null, false);
  }

  // Then check file extension
  const allowedExtensions = /\.(jpg|jpeg|png|gif)$/i;
  if (!file.originalname.match(allowedExtensions)) {
    return cb(null, false);
  }

  cb(null, true);
};

// Error handling middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single('image');

// Create post with better error handling
router.post('/', auth, (req, res) => {
  upload(req, res, function(err) {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image' });
    }

    // Store only the relative path in MongoDB
    const imagePath = `/uploads/${req.file.filename}`;

    const post = new Post({
      user: req.userId,
      image: imagePath,
      caption: req.body.caption || ''
    });

    post.save()
      .then(post => post.populate('user', 'username email'))
      .then(post => res.status(201).json(post))
      .catch(error => {
        console.error('Post creation error:', error);
        res.status(500).json({ message: 'Error creating post' });
      });
  });
});

// Get all posts
router.get('/', auth, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'username email')
      .sort({ createdAt: -1 });

    // Add full URLs to images for deployed version
    const postsWithUrls = posts.map(post => ({
      ...post.toObject(),
      image: post.image.startsWith('http') 
        ? post.image 
        : `https://social-server-ls65.onrender.com/uploads/${path.basename(post.image)}`
    }));

    res.json(postsWithUrls);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

// Like/unlike post
router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const likeIndex = post.likes.indexOf(req.userId);
    if (likeIndex === -1) {
      post.likes.push(req.userId);
    } else {
      post.likes.splice(likeIndex, 1);
    }

    await post.save();
    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Error updating like' });
  }
});

module.exports = router; 