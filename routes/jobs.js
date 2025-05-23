import express from 'express';
import { connectDB } from '../db.js';
import { jobCollection } from '../models/jobs.js';
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

// Middleware to check if user is an employer
const isEmployer = (req, res, next) => {
  if (req.user.role !== 'employer') {
    return res.status(403).json({ message: 'Access denied. Employers only.' });
  }
  next();
};

// Create a new job posting
router.post('/create', verifyToken, isEmployer, async (req, res) => {
  try {
    const {
      title,
      salary,
      salaryPeriod,
      employmentType,
      location,
      description,
      requirements,
      postedDate,
      active
    } = req.body;

    // Validate required fields
    if (!title || !salary || !employmentType || !location || !description) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const db = await connectDB();
    const jobs = await jobCollection(db);

    // Create job posting
    const jobPosting = {
      employerId: req.user.id,
      title,
      salary,
      salaryPeriod,
      employmentType,
      location,
      description,
      requirements: requirements || [],
      postedDate: postedDate || new Date().toISOString(),
      active: active !== undefined ? active : true,
      applications: []
    };

    const result = await jobs.insertOne(jobPosting);
    
    if (result.acknowledged) {
      res.status(201).json({ 
        message: 'Job posted successfully',
        jobId: result.insertedId 
      });
    } else {
      res.status(500).json({ message: 'Failed to create job posting' });
    }
  } catch (error) {
    console.error('Error creating job posting:', error);
    res.status(500).json({ message: 'Error creating job posting' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { location, employmentType, keyword } = req.query;
    
    // Build filter criteria
    let filter = { active: true };
    
    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }
    
    if (employmentType) {
      filter.employmentType = employmentType;
    }
    
    if (keyword) {
      filter.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } }
      ];
    }
    
    const db = await connectDB();
    const jobs = await jobCollection(db);
    
    // Get jobs with filter and sort by posted date (newest first)
    const jobListings = await jobs.find(filter)
      .sort({ postedDate: -1 })
      .toArray();
    
    res.status(200).json(jobListings);
  } catch (error) {
    console.error('Error getting job listings:', error);
    res.status(500).json({ message: 'Error fetching job listings' });
  }
});

// Get jobs posted by the current employer
router.get('/my-jobs', verifyToken, isEmployer, async (req, res) => {
  try {
    const db = await connectDB();
    const jobs = await jobCollection(db);
    
    const employerJobs = await jobs.find({ 
      employerId: req.user.id 
    }).sort({ postedDate: -1 }).toArray();
    
    res.status(200).json(employerJobs);
  } catch (error) {
    console.error('Error getting employer jobs:', error);
    res.status(500).json({ message: 'Error fetching your job listings' });
  }
});

// Update a job posting
router.put('/:id', verifyToken, isEmployer, async (req, res) => {
  try {
    const jobId = req.params.id;
    
    if (!ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }
    
    const db = await connectDB();
    const jobs = await jobCollection(db);
    
    // First check if the job belongs to this employer
    const existingJob = await jobs.findOne({ 
      _id: new ObjectId(jobId),
      employerId: req.user.id
    });
    
    if (!existingJob) {
      return res.status(404).json({ message: 'Job not found or not authorized to update' });
    }
    
    // Update job fields
    const updateData = {};
    
    if (req.body.title) updateData.title = req.body.title;
    if (req.body.salary) updateData.salary = req.body.salary;
    if (req.body.salaryPeriod) updateData.salaryPeriod = req.body.salaryPeriod;
    if (req.body.employmentType) updateData.employmentType = req.body.employmentType;
    if (req.body.location) updateData.location = req.body.location;
    if (req.body.description) updateData.description = req.body.description;
    if (req.body.requirements) updateData.requirements = req.body.requirements;
    if (req.body.active !== undefined) updateData.active = req.body.active;
    
    const result = await jobs.updateOne(
      { _id: new ObjectId(jobId) },
      { $set: updateData }
    );
    
    if (result.modifiedCount === 1) {
      res.status(200).json({ message: 'Job updated successfully' });
    } else {
      res.status(400).json({ message: 'No changes made to job' });
    }
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ message: 'Error updating job posting' });
  }
});

// Delete a job posting
router.delete('/:id', verifyToken, isEmployer, async (req, res) => {
  try {
    const jobId = req.params.id;
    
    if (!ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }
    
    const db = await connectDB();
    const jobs = await jobCollection(db);
    
    // Check if the job belongs to this employer
    const existingJob = await jobs.findOne({ 
      _id: new ObjectId(jobId),
      employerId: req.user.id
    });
    
    if (!existingJob) {
      return res.status(404).json({ message: 'Job not found or not authorized to delete' });
    }
    
    // Delete the job
    const result = await jobs.deleteOne({ _id: new ObjectId(jobId) });
    
    if (result.deletedCount === 1) {
      res.status(200).json({ message: 'Job deleted successfully' });
    } else {
      res.status(400).json({ message: 'Failed to delete job' });
    }
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ message: 'Error deleting job posting' });
  }
});

// Check if a job is saved by the current user
router.get('/saved/check/:jobId', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    const jobId = req.params.jobId;
    
    // Validate job ID
    if (!ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }
    
    // Check if job exists first
    const job = await db.collection('jobs').findOne({ 
      _id: new ObjectId(jobId)
    });
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    // Check if the job is saved by this user
    const savedJob = await db.collection('savedJobs').findOne({
      userId: req.user.id,
      jobId: jobId
    });
    
    res.status(200).json({
      isSaved: !!savedJob
    });
  } catch (error) {
    console.error('Error checking saved job status:', error);
    res.status(500).json({ message: 'Error checking saved job status' });
  }
});

// Get saved jobs for current user
router.get('/saved-jobs', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    
    console.log('Fetching saved jobs for user:', req.user.id);
    
    const savedJobs = await db.collection('savedJobs').find({ 
      userId: req.user.id
    }).toArray();
    
    // Get the full job details for each saved job
    const jobIds = savedJobs.map(saved => new ObjectId(saved.jobId));
    
    if (jobIds.length === 0) {
      return res.status(200).json([]);
    }
    
    const jobs = await db.collection('jobs').find({ 
      _id: { $in: jobIds } 
    }).toArray();
    
    // Combine saved date with job details
    const result = jobs.map(job => {
      const savedJob = savedJobs.find(s => s.jobId.toString() === job._id.toString());
      return {
        ...job,
        savedDate: savedJob.savedDate
      };
    });
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching saved jobs:', error);
    res.status(500).json({ message: 'Error fetching saved jobs' });
  }
});

// include employer email
router.get('/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    
    if (!ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }
    
    const db = await connectDB();
    const jobs = await jobCollection(db);
    
    const job = await jobs.findOne({ _id: new ObjectId(jobId) });
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    // Get employer information to include email
    if (job.employerId) {
      try {
        const employers = db.collection('users');
        const employer = await employers.findOne({ 
          _id: new ObjectId(job.employerId),
          role: 'employer' 
        });
        
        if (employer) {
          // Add employer email to job object
          job.employerEmail = employer.email;
        }
      } catch (err) {
        console.error('Error fetching employer details:', err);
      }
    }
    
    res.status(200).json(job);
  } catch (error) {
    console.error('Error getting job details:', error);
    res.status(500).json({ message: 'Error fetching job details' });
  }
});

// Save a job
router.post('/saved/:jobId', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    
    const jobId = req.params.jobId;
    const userId = req.user.id;
    
    // Check if job exists
    const job = await db.collection('jobs').findOne({ _id: new ObjectId(jobId) });
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    // Check if already saved
    const existingSave = await db.collection('savedJobs').findOne({ 
      userId, 
      jobId 
    });
    
    if (existingSave) {
      return res.status(200).json({ message: 'Job already saved' });
    }
    
    // Save the job
    await db.collection('savedJobs').insertOne({
      userId,
      jobId,
      savedDate: new Date().toISOString()
    });
    
    res.status(201).json({ message: 'Job saved successfully' });
  } catch (error) {
    console.error('Error saving job:', error);
    res.status(500).json({ message: 'Error saving job' });
  }
});

// Remove saved job
router.delete('/saved/:jobId', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    
    const jobId = req.params.jobId;
    const userId = req.user.id;
    
    const result = await db.collection('savedJobs').deleteOne({ 
      userId, 
      jobId 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Saved job not found' });
    }
    
    res.status(200).json({ message: 'Job removed from saved jobs' });
  } catch (error) {
    console.error('Error removing saved job:', error);
    res.status(500).json({ message: 'Error removing saved job' });
  }
});

export default router;