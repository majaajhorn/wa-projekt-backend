// models/savedJobs.js
import { MongoClient } from 'mongodb';

// Get or create the savedJobs collection
export async function savedJobsCollection(db) {
  // Check if collection exists
  const collections = await db.listCollections({ name: 'savedJobs' }).toArray();
  
  // If collection doesn't exist, create it
  if (collections.length === 0) {
    console.log('Creating savedJobs collection...');
    await db.createCollection('savedJobs');
    
    // Create indexes for better query performance
    const savedJobs = db.collection('savedJobs');
    await savedJobs.createIndex({ userId: 1 }); // Index for faster user-based queries
    await savedJobs.createIndex({ jobId: 1 }); // Index for faster job-based queries
    await savedJobs.createIndex({ userId: 1, jobId: 1 }, { unique: true }); // Compound index to prevent duplicates
    
    console.log('savedJobs collection created with indexes');
  }
  
  return db.collection('savedJobs');
}