import express from 'express';
import { connectDB } from '../db.js';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const db = await connectDB();
    
    // Check if email already exists
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const newUser = {
      fullName,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date().toISOString(),
      profileCompleted: false,
      profileData: {}
    };
    
    const result = await db.collection('users').insertOne(newUser);
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: result.insertedId.toString(),
        fullName,
        email,
        role
      }, 
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Don't send password in response
    delete newUser.password;
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: result.insertedId.toString(),
        ...newUser
      },
      token
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Error registering user' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    const db = await connectDB();
    
    // Find user by email
    const user = await db.collection('users').findOne({ email });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }, 
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profileCompleted: user.profileCompleted || false
      },
      token
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Get current user profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.id) },
      { projection: { password: 0 } } // Exclude password
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      ...user,
      id: user._id.toString()
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Get user by ID - THIS IS THE ENDPOINT WE NEED TO FIX
router.get('/:id', verifyToken, async (req, res) => {
  try {
    // Validate the ID first
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    const db = await connectDB();
    
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { password: 0 } } // Exclude password
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return user data
    res.status(200).json({
      ...user,
      id: user._id.toString()
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { profileData } = req.body;
    
    if (!profileData) {
      return res.status(400).json({ message: 'Profile data is required' });
    }
    
    const db = await connectDB();
    
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { 
        $set: { 
          profileData,
          profileCompleted: true,
          updatedAt: new Date().toISOString()
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Upload profile picture
router.post('/profile-picture', verifyToken, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const profilePicture = `${req.protocol}://${req.get('host')}/${req.file.path}`;
    
    const db = await connectDB();
    
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { 
        $set: { 
          profilePicture,
          updatedAt: new Date().toISOString()
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      message: 'Profile picture uploaded successfully',
      profilePicture
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ message: 'Error uploading profile picture' });
  }
});

// Get jobseekers for employers to browse
router.get('/jobseekers', verifyToken, async (req, res) => {
  try {
    // Check if user is an employer
    if (req.user.role !== 'employer') {
      return res.status(403).json({ message: 'Access denied. Employers only.' });
    }
    
    const db = await connectDB();
    
    // Find all jobseekers with completed profiles
    const jobseekers = await db.collection('users').find(
      { 
        role: 'jobseeker',
        profileCompleted: true
      },
      { projection: { password: 0 } } // Exclude password
    ).toArray();
    
    res.status(200).json(jobseekers.map(user => ({
      ...user,
      id: user._id.toString()
    })));
  } catch (error) {
    console.error('Error fetching jobseekers:', error);
    res.status(500).json({ message: 'Error fetching jobseekers' });
  }
});

// Add this route to your users.js file
router.get('/profile-stats', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    
    // Count profile views (you might need to create this collection)
    const viewCount = await db.collection('profileViews').countDocuments({
      userId: req.user.id
    });
    
    res.status(200).json({
      viewCount: viewCount || 0
    });
  } catch (error) {
    console.error('Error fetching profile stats:', error);
    res.status(500).json({ message: 'Error fetching profile stats' });
  }
});

export default router;