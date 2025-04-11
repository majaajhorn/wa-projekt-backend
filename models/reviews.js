// models/reviews.js
import { connectDB } from '../db.js';
import { ObjectId } from 'mongodb';

// Get the reviews collection
export const reviewsCollection = async () => {
  const db = await connectDB();
  return db.collection('reviews');
};

// Create a new review
export const createReview = async (reviewData) => {
  const collection = await reviewsCollection();
  reviewData.createdAt = new Date().toISOString();
  
  // Make sure the IDs are ObjectId format
  if (reviewData.employerId) reviewData.employerId = new ObjectId(reviewData.employerId);
  if (reviewData.jobseekerId) reviewData.jobseekerId = new ObjectId(reviewData.jobseekerId);
  if (reviewData.jobId) reviewData.jobId = new ObjectId(reviewData.jobId);
  
  const result = await collection.insertOne(reviewData);
  return { ...reviewData, _id: result.insertedId };
};

// Get reviews for a specific jobseeker
export const getJobseekerReviews = async (jobseekerId) => {
  const collection = await reviewsCollection();
  
  const reviews = await collection.find({
    jobseekerId: new ObjectId(jobseekerId)
  }).toArray();
  
  return reviews;
};

// Get reviews given by a specific employer
export const getEmployerReviews = async (employerId) => {
  const collection = await reviewsCollection();
  
  const reviews = await collection.find({
    employerId: new ObjectId(employerId)
  }).toArray();
  
  return reviews;
};

// Check if employer has already reviewed jobseeker
export const hasEmployerReviewedJobseeker = async (employerId, jobseekerId) => {
  const collection = await reviewsCollection();
  
  const review = await collection.findOne({
    employerId: new ObjectId(employerId),
    jobseekerId: new ObjectId(jobseekerId)
  });
  
  return !!review;
};

// Get average rating for a jobseeker
export const getJobseekerAverageRating = async (jobseekerId) => {
  const collection = await reviewsCollection();
  
  const result = await collection.aggregate([
    { $match: { jobseekerId: new ObjectId(jobseekerId) } },
    { $group: {
        _id: "$jobseekerId",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 }
      }
    }
  ]).toArray();
  
  if (result.length === 0) {
    return { averageRating: 0, reviewCount: 0 };
  }
  
  return {
    averageRating: result[0].averageRating,
    reviewCount: result[0].reviewCount
  };
};