import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { userCollection } from '../models/user.js';
import { connectDB } from '../db.js';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath); // Save files in the 'uploads' folder
  },
  filename: (req, file, cb) => {
    console.log('Uploading file:', file.originalname);
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });


// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];  // Extract token from 'Authorization' header
    if (!token) return res.status(401).json({ message: 'No token provided' });
  
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return res.status(401).json({ message: 'Invalid token' });
      req.user = decoded;  // Attach user info to request
      next();  // Proceed to next middleware/route handler
    });
  };


// Register route
router.post('/register', async (req, res) => {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password || !role) {
        return res.status(400).json({ message: 'All fields are required.'});
    }

    const validRoles = ['jobseeker', 'employer'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role selected.'});
    }

    const db = await connectDB();
    const users = await userCollection(db);

    const existingUser = await users.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ message: 'Email already in use.'});
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await users.insertOne({ fullName, email, password: hashedPassword, role });

    res.status(201).json({ message: 'User registered successfully.'});
});


// Login route
router.post('/login', async (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    const validRoles = ['jobseeker', 'employer'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role selected.'});
    }

    const db = await connectDB();
    const users = await userCollection(db);

    const user = await users.findOne({ email, role });
    if (!user) {
        return res.status(400).json({ message: 'Invalid email, password or role.'});
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(400).json({ message: 'Invalid email or password.'})
    }

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET);

    res.status(200).json({ message: 'Login successful', token});
})

router.get('/profile', verifyToken, async (req, res) => {
    try {
      const userId = req.user.id;  // Make sure your JWT token decoding middleware is working
      const db = await connectDB();
      const users = await userCollection(db);

      const user = await users.findOne({ _id: new ObjectId(userId) });
      if (user) {
        res.status(200).json(user);  // Return the user profile
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    } catch (err) {
      console.error('Error in /profile route:', err);
      res.status(500).json({ message: 'Error fetching user profile' });
    }
  });

// Route to upload profile picture
router.post('/upload-profile-picture', verifyToken, upload.single('profilePicture'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const userId = req.user.id;
    const db = await connectDB();
    const users = await userCollection(db);

    // Get server URL
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // Create profile picture URL
    const profilePictureUrl = `${baseUrl}/${req.file.path.replace(/\\/g, '/')}`;

    // Update user document with profile picture URL
    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { profilePicture: profilePictureUrl } }
    );

    // Return success response with profile picture URL
    res.status(200).json({
      message: 'Profile picture uploaded successfully',
      profilePicture: profilePictureUrl
    });
  } catch (err) {
    console.error('Error uploading profile picture:', err);
    res.status(500).json({ message: 'Error uploading profile picture' });
  }
});
// Route to update profile
// Route to update profile
router.put('/update-profile', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { 
    email, 
    currentPassword, 
    newPassword, 
    gender, 
    location, 
    englishLevel, 
    qualification, 
    careExperience, 
    liveInExperience, 
    drivingLicence,
    aboutYourself, // Add the new field
    companyName    // Add this field for employer profiles
  } = req.body;

  try {
    const db = await connectDB();
    const users = await userCollection(db);

    const user = await users.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update email if provided
    if (email) {
      const existingUser = await users.findOne({ email });
      if (existingUser && existingUser._id.toString() !== userId) {
        return res.status(400).json({ message: 'Email is already in use.' });
      }
      user.email = email;
    }

    // Update password if provided
    if (currentPassword && newPassword) {
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Current password is incorrect.' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

    // Initialize profileData if it doesn't exist
    if (!user.profileData) {
      user.profileData = {};
    }

    // Update profile fields if provided
    if (gender !== undefined) user.profileData.gender = gender;
    if (location !== undefined) user.profileData.location = location;
    if (englishLevel !== undefined) user.profileData.englishLevel = englishLevel;
    
    // Handle array fields for qualification and careExperience
    if (qualification !== undefined) {
      // Ensure qualification is stored as an array even if only one value is sent
      user.profileData.qualification = Array.isArray(qualification) ? qualification : [qualification];
    }
    
    if (careExperience !== undefined) {
      // Ensure careExperience is stored as an array even if only one value is sent
      user.profileData.careExperience = Array.isArray(careExperience) ? careExperience : [careExperience];
    }
    
    if (liveInExperience !== undefined) user.profileData.liveInExperience = liveInExperience;
    if (drivingLicence !== undefined) user.profileData.drivingLicence = drivingLicence;
    
    // Handle the new aboutYourself field
    if (aboutYourself !== undefined) user.profileData.aboutYourself = aboutYourself;
    
    // Handle company name for employer profiles
    if (companyName !== undefined) user.profileData.companyName = companyName;

    // Check if profile is complete based on user role
    let profileComplete = false;
    
    if (user.role === 'jobseeker') {
      profileComplete = user.profileData.gender && 
                        user.profileData.location && 
                        user.profileData.englishLevel && 
                        user.profileData.qualification && 
                        user.profileData.qualification.length > 0 &&
                        user.profileData.careExperience && 
                        user.profileData.careExperience.length > 0 && 
                        user.profileData.liveInExperience && 
                        user.profileData.drivingLicence;
    } else if (user.role === 'employer') {
      profileComplete = user.profileData.gender && 
                        user.profileData.location && 
                        user.profileData.companyName;
    }
                            
    user.profileCompleted = profileComplete;

    // Log the data being saved to debug
    console.log('Updating user profile with data:', {
      email: user.email,
      profileData: user.profileData,
      profileCompleted: user.profileCompleted
    });

    await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          email: user.email,
          password: user.password,
          profileData: user.profileData,
          profileCompleted: user.profileCompleted
        },
      }
    );

    // Return updated profile data to frontend
    res.status(200).json({ message: 'Profile updated successfully', user: user });

  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Route to get all carers/job seekers
router.get('/carers', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    const users = await userCollection(db);
    
    // Fetch all users with role 'jobseeker'
    // Note: We're not filtering by profileCompleted to ensure we get all users
    const carers = await users.find({ 
      role: 'jobseeker'
    }).toArray();

    console.log(`Found ${carers.length} job seekers`);

    // Remove sensitive information before sending to client
    const safeCarers = carers.map(carer => {
      const { password, ...safeData } = carer;
      return safeData;
    });

    res.status(200).json(safeCarers);
  } catch (err) {
    console.error('Error fetching carers:', err);
    res.status(500).json({ message: 'Error fetching carers' });
  }
});

export default router;