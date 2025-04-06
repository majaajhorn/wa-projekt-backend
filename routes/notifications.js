// routes/notifications.js
import express from 'express';
import { connectDB } from '../db.js';
import { notificationCollection } from '../models/notifications.js';
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

// Get all notifications for the current user
router.get('/my-notifications', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    const notifications = await notificationCollection(db);
    
    const userNotifications = await notifications.find({
      recipientId: req.user.id
    }).sort({ createdAt: -1 }).toArray();
    
    res.status(200).json(userNotifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Error fetching notifications' });
  }
});

// Get unread notification count
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    const notifications = await notificationCollection(db);
    
    const count = await notifications.countDocuments({
      recipientId: req.user.id,
      isRead: false
    });
    
    res.status(200).json({ count });
  } catch (error) {
    console.error('Error fetching unread notification count:', error);
    res.status(500).json({ message: 'Error fetching unread notification count' });
  }
});

// Mark notification as read
router.put('/:id/mark-read', verifyToken, async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }
    
    const db = await connectDB();
    const notifications = await notificationCollection(db);
    
    // Find the notification
    const notification = await notifications.findOne({
      _id: new ObjectId(notificationId)
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    // Check if user owns this notification
    if (notification.recipientId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this notification' });
    }
    
    // Update the notification
    const result = await notifications.updateOne(
      { _id: new ObjectId(notificationId) },
      { $set: { isRead: true } }
    );
    
    if (result.modifiedCount === 1) {
      res.status(200).json({ message: 'Notification marked as read' });
    } else {
      res.status(400).json({ message: 'Failed to update notification' });
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Error marking notification as read' });
  }
});

// Mark all notifications as read
router.put('/mark-all-read', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    const notifications = await notificationCollection(db);
    
    // Update all unread notifications for the user
    const result = await notifications.updateMany(
      { recipientId: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    
    res.status(200).json({ 
      message: 'All notifications marked as read',
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Error marking all notifications as read' });
  }
});

// Delete a notification
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }
    
    const db = await connectDB();
    const notifications = await notificationCollection(db);
    
    // Find the notification
    const notification = await notifications.findOne({
      _id: new ObjectId(notificationId)
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    // Check if user owns this notification
    if (notification.recipientId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this notification' });
    }
    
    // Delete the notification
    const result = await notifications.deleteOne({
      _id: new ObjectId(notificationId)
    });
    
    if (result.deletedCount === 1) {
      res.status(200).json({ message: 'Notification deleted successfully' });
    } else {
      res.status(400).json({ message: 'Failed to delete notification' });
    }
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Error deleting notification' });
  }
});

// Create a new notification (internal function to be used by other routes)
export async function createNotification(db, data) {
  try {
    const notifications = await notificationCollection(db);
    
    const notification = {
      recipientId: data.recipientId,
      senderId: data.senderId || null,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedId: data.relatedId || null,
      relatedType: data.relatedType || null,
      isRead: false,
      createdAt: new Date().toISOString()
    };
    
    const result = await notifications.insertOne(notification);
    return result;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

export default router;