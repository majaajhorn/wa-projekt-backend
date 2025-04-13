import { MongoClient } from 'mongodb';

// Get or create the notifications collection
export async function notificationCollection(db) {
  // Check if collection exists
  const collections = await db.listCollections({ name: 'notifications' }).toArray();
  
  // If collection doesn't exist, create it
  if (collections.length === 0) {
    console.log('Creating notifications collection...');
    await db.createCollection('notifications');
    
    // Create indexes for better query performance
    const notifications = db.collection('notifications');
    await notifications.createIndex({ recipientId: 1 }); // To find notifications for a user
    await notifications.createIndex({ createdAt: -1 }); // To sort by date
    await notifications.createIndex({ isRead: 1 }); // To filter by read status
    await notifications.createIndex({ type: 1 }); // To filter by notification type
    
    console.log('Notifications collection created with indexes');
  }
  
  return db.collection('notifications');
}