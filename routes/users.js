import express from 'express';
import { connectDB } from '../db.js';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

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

// Get profile statistics
router.get('/profile-stats', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    const profileStats = await db.collection('profileStats').findOne({
      userId: req.user.id
    });
    
    // If no stats exist yet, return defaults
    if (!profileStats) {
      return res.status(200).json({
        viewCount: 0,
        lastViewed: null,
        recentViewers: []
      });
    }
    
    res.status(200).json(profileStats);
  } catch (error) {
    console.error('Error fetching profile stats:', error);
    res.status(500).json({ message: 'Error fetching profile statistics' });
  }
});

// View someone else's profile (and increment view counter)
router.get('/profile/:userId', verifyToken, async (req, res) => {
  try {
    const profileUserId = req.params.userId;
    const viewerId = req.user.id;
    
    if (!ObjectId.isValid(profileUserId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
    const db = await connectDB();
    
    // Get user profile
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(profileUserId) },
      { projection: { password: 0 } } // Exclude password from result
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Don't count if viewing own profile
    if (profileUserId !== viewerId) {
      // Update view count
      await db.collection('profileStats').updateOne(
        { userId: profileUserId },
        {
          $inc: { viewCount: 1 },
          $set: { lastViewed: new Date().toISOString() },
          $push: {
            recentViewers: {
              $each: [{ userId: viewerId, viewedAt: new Date().toISOString() }],
              $slice: -10 // Keep only the 10 most recent viewers
            }
          }
        },
        { upsert: true }
      );
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Error viewing profile:', error);
    res.status(500).json({ message: 'Error fetching user profile' });
  }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const {
      firstName,
      lastName,
      bio,
      skills,
      experience,
      education,
      contactEmail,
      phoneNumber,
      location
    } = req.body;
    
    const db = await connectDB();
    
    // Build update object with provided fields
    const updateData = {};
    
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (bio !== undefined) updateData.bio = bio;
    if (skills !== undefined) updateData.skills = skills;
    if (experience !== undefined) updateData.experience = experience;
    if (education !== undefined) updateData.education = education;
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (location !== undefined) updateData.location = location;
    
    // Add last updated timestamp
    updateData.updatedAt = new Date().toISOString();
    
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );
    
    if (result.modifiedCount === 1) {
      res.status(200).json({ message: 'Profile updated successfully' });
    } else if (result.matchedCount === 1) {
      res.status(200).json({ message: 'No changes made to profile' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating user profile' });
  }
});

// Get current user's profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const db = await connectDB();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } } // Exclude password from result
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Error fetching user profile' });
  }
});

export default router;