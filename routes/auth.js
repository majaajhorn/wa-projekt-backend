import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { userCollection } from '../models/user.js';
import { connectDB } from '../db.js';
import { ObjectId } from 'mongodb';

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;


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

export default router;