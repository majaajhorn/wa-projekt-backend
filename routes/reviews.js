// routes/reviews.js
import express from 'express';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import * as reviewModel from '../models/reviews.js';
import { connectDB } from '../db.js';

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

// Middleware to check if user is an employer
const isEmployer = (req, res, next) => {
  if (req.user.role !== 'employer') {
    return res.status(403).json({ message: 'Access denied. Employers only.' });
  }
  next();
};

// Create a new review (employers only)
router.post('/', verifyToken, isEmployer, async (req, res) => {
  try {
    const { jobseekerId, rating, comment, jobId } = req.body;
    
    if (!jobseekerId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Jobseeker ID and valid rating (1-5) are required' });
    }
    
    // Check if the employer has already reviewed this jobseeker
    const hasReviewed = await reviewModel.hasEmployerReviewedJobseeker(req.user.id, jobseekerId);
    if (hasReviewed) {
      return res.status(400).json({ message: 'You have already reviewed this jobseeker' });
    }
    
    // Create the review
    const reviewData = {
      employerId: req.user.id,
      jobseekerId,
      rating,
      comment: comment || '',
      jobId: jobId || null
    };
    
    const review = await reviewModel.createReview(reviewData);
    
    res.status(201).json({
      message: 'Review submitted successfully',
      review
    });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ message: 'Error submitting review' });
  }
});

// Get reviews for a specific jobseeker
router.get('/jobseeker/:id', async (req, res) => {
  try {
    const jobseekerId = req.params.id;
    
    if (!ObjectId.isValid(jobseekerId)) {
      return res.status(400).json({ message: 'Invalid jobseeker ID' });
    }
    
    const reviews = await reviewModel.getJobseekerReviews(jobseekerId);
    
    // Get employer details for each review
    const db = await connectDB();
    const reviewsWithEmployerDetails = await Promise.all(reviews.map(async (review) => {
      const employer = await db.collection('users').findOne(
        { _id: review.employerId },
        { projection: { password: 0 } }
      );
      
      return {
        ...review,
        employer: employer ? {
          id: employer._id.toString(),
          fullName: employer.fullName,
          companyName: employer.profileData?.companyName || ''
        } : null
      };
    }));
    
    // Get average rating
    const averageRating = await reviewModel.getJobseekerAverageRating(jobseekerId);
    
    res.status(200).json({
      reviews: reviewsWithEmployerDetails,
      averageRating: averageRating.averageRating,
      reviewCount: averageRating.reviewCount
    });
  } catch (error) {
    console.error('Error fetching jobseeker reviews:', error);
    res.status(500).json({ message: 'Error fetching reviews' });
  }
});

// Get reviews created by a specific employer
router.get('/employer', verifyToken, isEmployer, async (req, res) => {
  try {
    const reviews = await reviewModel.getEmployerReviews(req.user.id);
    
    // Get jobseeker details for each review
    const db = await connectDB();
    const reviewsWithJobseekerDetails = await Promise.all(reviews.map(async (review) => {
      const jobseeker = await db.collection('users').findOne(
        { _id: review.jobseekerId },
        { projection: { password: 0 } }
      );
      
      return {
        ...review,
        jobseeker: jobseeker ? {
          id: jobseeker._id.toString(),
          fullName: jobseeker.fullName
        } : null
      };
    }));
    
    res.status(200).json(reviewsWithJobseekerDetails);
  } catch (error) {
    console.error('Error fetching employer reviews:', error);
    res.status(500).json({ message: 'Error fetching reviews' });
  }
});

// Check if an employer has already reviewed a jobseeker
router.get('/check/:jobseekerId', verifyToken, isEmployer, async (req, res) => {
  try {
    const jobseekerId = req.params.jobseekerId;
    
    if (!ObjectId.isValid(jobseekerId)) {
      return res.status(400).json({ message: 'Invalid jobseeker ID' });
    }
    
    const hasReviewed = await reviewModel.hasEmployerReviewedJobseeker(req.user.id, jobseekerId);
    
    res.status(200).json({ hasReviewed });
  } catch (error) {
    console.error('Error checking review status:', error);
    res.status(500).json({ message: 'Error checking review status' });
  }
});

export default router;