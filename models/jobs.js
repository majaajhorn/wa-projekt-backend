// models/jobs.js
import { MongoClient } from 'mongodb';

// Get or create the job collection
export async function jobCollection(db) {
  // Check if collection exists
  const collections = await db.listCollections({ name: 'jobs' }).toArray();
  
  // If collection doesn't exist, create it
  if (collections.length === 0) {
    console.log('Creating jobs collection...');
    await db.createCollection('jobs');
    
    // Create indexes for better query performance
    const jobs = db.collection('jobs');
    await jobs.createIndex({ title: 'text', description: 'text' }); // Full-text search
    await jobs.createIndex({ location: 1 }); // Location-based search
    await jobs.createIndex({ employmentType: 1 }); // Filter by employment type
    await jobs.createIndex({ postedDate: -1 }); // Sort by posted date
    await jobs.createIndex({ employerId: 1 }); // Filter by employer
    
    console.log('Jobs collection created with indexes');
  }
  
  return db.collection('jobs');
}