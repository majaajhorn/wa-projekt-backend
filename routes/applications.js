import express from 'express';
import { connectDB } from '../db.js';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { createNotification } from './notifications.js';

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

// Configure multer for resume uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/resumes');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and Word documents are allowed.'));
    }
  }
});

// Get all applications for current user (jobseeker)
router.get('/my-applications', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    
    console.log('Fetching applications for user ID:', req.user.id);
    
    // Find applications for this user
    const applications = await db.collection('applications').find({
      applicantId: req.user.id
    }).toArray();
    
    console.log(`Found ${applications.length} applications`);
    
    if (applications.length === 0) {
      return res.status(200).json([]);
    }
    
    // Get job details for each application
    const jobIds = applications.map(app => {
      try {
        return new ObjectId(app.jobId);
      } catch (e) {
        console.error(`Invalid ObjectId for jobId: ${app.jobId}`);
        return null;
      }
    }).filter(id => id !== null);
    
    console.log(`Fetching details for ${jobIds.length} jobs`);
    
    const jobs = await db.collection('jobs').find({
      _id: { $in: jobIds }
    }).toArray();
    
    console.log(`Found ${jobs.length} job details`);
    
    // Combine application data with job details
    const result = applications.map(app => {
      // Find the job for this application
      const jobMatch = jobs.find(j => j._id.toString() === app.jobId);
      
      if (!jobMatch) {
        console.log(`No job found for jobId: ${app.jobId}`);
      }
      
      const job = jobMatch || { 
        title: 'Unknown Job', 
        company: 'Unknown', 
        location: 'Unknown',
        salary: 0,
        salaryPeriod: 'monthly'
      };
      
      return {
        ...app,
        job: job
      };
    });
    
    console.log(`Returning ${result.length} combined application records`);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ message: 'Error fetching applications' });
  }
});

// Get all applications for the employer
// MOVED THIS ROUTE BEFORE THE /:id ROUTE TO FIX THE CONFLICT
router.get('/employer-applications', verifyToken, async (req, res) => {
  try {
    const db = await connectDB();
    
    // Find applications where the employer is the current user
    const applications = await db.collection('applications').find({
      employerId: req.user.id
    }).toArray();
    
    // Get job details for each application
    const jobIds = applications.map(app => new ObjectId(app.jobId));
    const jobs = await db.collection('jobs').find({
      _id: { $in: jobIds }
    }).toArray();
    
    // Get applicant details for each application
const applicantIds = applications.map(app => {
  try {
    // Handle cases where applicantId might be a string
    return new ObjectId(app.applicantId);
  } catch (e) {
    console.error(`Invalid ObjectId for applicantId: ${app.applicantId}`);
    return null;
  }
}).filter(id => id !== null);

const applicants = await db.collection('users').find({
  _id: { $in: applicantIds }
}).project({
  _id: 1,
  firstName: 1,
  lastName: 1,
  fullName: 1, // Add fullName field to projection
  email: 1,
  phone: 1
}).toArray();

console.log(`Found ${applicants.length} applicants for ${applicantIds.length} IDs`);

  // Combine application data with job and applicant details
  const result = applications.map(app => {
    const job = jobs.find(j => j._id.toString() === app.jobId);
    // Convert applicantId to string for comparison if it exists
    const applicantIdStr = app.applicantId ? app.applicantId.toString() : null;
    const applicant = applicants.find(a => a._id.toString() === applicantIdStr);
    
    // Log if applicant not found for debugging
    if (!applicant && applicantIdStr) {
      console.log(`No applicant found for ID: ${applicantIdStr}`);
    }
    
    return {
      ...app,
      job: job || { title: 'Unknown Job' },
      applicant: applicant || null
    };
  });
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching employer applications:', error);
    res.status(500).json({ message: 'Error fetching applications' });
  }
});

// Check if user has already applied to a job
router.get('/check/:jobId', verifyToken, async (req, res) => {
  try {
    const jobId = req.params.jobId;
    
    if (!ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }
    
    const db = await connectDB();
    const existingApplication = await db.collection('applications').findOne({
      jobId,
      applicantId: req.user.id
    });
    
    res.status(200).json({
      hasApplied: !!existingApplication
    });
  } catch (error) {
    console.error('Error checking application status:', error);
    res.status(500).json({ message: 'Error checking application status' });
  }
});

// Apply for a job
router.post('/apply', verifyToken, upload.single('resume'), async (req, res) => {
  try {
    const { jobId, coverLetter, additionalNotes } = req.body;
    
    if (!jobId || !coverLetter) {
      return res.status(400).json({ message: 'Job ID and cover letter are required' });
    }
    
    if (!ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }
    
    const db = await connectDB();
    
    // Check if job exists
    const job = await db.collection('jobs').findOne({
      _id: new ObjectId(jobId)
    });
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    // Check if user has already applied
    const existingApplication = await db.collection('applications').findOne({
      jobId,
      applicantId: req.user.id
    });
    
    if (existingApplication) {
      return res.status(400).json({ message: 'You have already applied for this job' });
    }
    
    // Get applicant details for notification
    const applicant = await db.collection('users').findOne({
      _id: new ObjectId(req.user.id)
    });
    
    // Create application
    const application = {
      jobId,
      applicantId: req.user.id,
      employerId: job.employerId,
      coverLetter,
      additionalNotes: additionalNotes || '',
      resumePath: req.file ? req.file.path : null,
      status: 'Pending',
      appliedDate: new Date().toISOString(),
      lastStatusUpdate: new Date().toISOString(),
      // Store the applicant's name directly in the application document as well
      applicantName: applicant ? `${applicant.firstName} ${applicant.lastName}` : "Unknown Applicant",
      applicantEmail: applicant ? applicant.email : "unknown@example.com"
    };
    
    const result = await db.collection('applications').insertOne(application);
    
    if (result.acknowledged) {
      // Update job with application reference
      await db.collection('jobs').updateOne(
        { _id: new ObjectId(jobId) },
        { $push: { applications: result.insertedId.toString() } }
      );
      
      // Create notification for employer
      await createNotification(db, {
        recipientId: job.employerId,
        senderId: req.user.id,
        type: 'job_application',
        title: 'New Job Application',
        message: `${applicant?.firstName || 'A user'} ${applicant?.lastName || ''} has applied for your job: ${job.title}`,
        relatedId: result.insertedId.toString(),
        relatedType: 'application'
      });
      
      res.status(201).json({
        message: 'Application submitted successfully',
        applicationId: result.insertedId
      });
    } else {
      res.status(500).json({ message: 'Failed to submit application' });
    }
  } catch (error) {
    console.error('Error submitting application:', error);
    res.status(500).json({ message: 'Error submitting application' });
  }
});

// Get a single application by ID
// THIS ROUTE MOVED AFTER THE MORE SPECIFIC ROUTES
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const applicationId = req.params.id;
    
    if (!ObjectId.isValid(applicationId)) {
      return res.status(400).json({ message: 'Invalid application ID' });
    }
    
    const db = await connectDB();
    const application = await db.collection('applications').findOne({
      _id: new ObjectId(applicationId)
    });
    
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }
    
    // Check if user is authorized to view this application
    if (application.applicantId !== req.user.id && application.employerId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this application' });
    }
    
    // Get job details
    const job = await db.collection('jobs').findOne({
      _id: new ObjectId(application.jobId)
    });
    
    // Get applicant details if needed
    let applicant = null;
    if (application.applicantId && ObjectId.isValid(application.applicantId)) {
      applicant = await db.collection('users').findOne({
        _id: new ObjectId(application.applicantId)
      });
    }
    
    // Combine application with job details
    const result = {
      ...application,
      job,
      applicant
    };
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ message: 'Error fetching application details' });
  }
});

// Withdraw/delete application (jobseeker)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const applicationId = req.params.id;
    
    if (!ObjectId.isValid(applicationId)) {
      return res.status(400).json({ message: 'Invalid application ID' });
    }
    
    const db = await connectDB();
    
    // Find the application
    const application = await db.collection('applications').findOne({
      _id: new ObjectId(applicationId)
    });
    
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }
    
    // Check if user owns this application
    if (application.applicantId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to withdraw this application' });
    }
    
    // Only allow withdrawal of pending applications
    if (application.status !== 'Pending') {
      return res.status(400).json({ message: 'Can only withdraw pending applications' });
    }
    
    // Delete the application
    const result = await db.collection('applications').deleteOne({
      _id: new ObjectId(applicationId)
    });
    
    if (result.deletedCount === 1) {
      // Remove application reference from job
      await db.collection('jobs').updateOne(
        { _id: new ObjectId(application.jobId) },
        { $pull: { applications: applicationId } }
      );
      
      res.status(200).json({ message: 'Application withdrawn successfully' });
    } else {
      res.status(400).json({ message: 'Failed to withdraw application' });
    }
  } catch (error) {
    console.error('Error withdrawing application:', error);
    res.status(500).json({ message: 'Error withdrawing application' });
  }
});

router.put('/:id/status', verifyToken, async (req, res) => {
  try {
    const applicationId = req.params.id;
    const { status } = req.body;
    
    if (!ObjectId.isValid(applicationId)) {
      return res.status(400).json({ message: 'Invalid application ID' });
    }
    
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }
    
    // Validate status
    const validStatuses = ['Pending', 'Reviewed', 'Interviewing', 'Hired', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const db = await connectDB();
    
    // Find the application
    const application = await db.collection('applications').findOne({
      _id: new ObjectId(applicationId)
    });
    
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }
    
    // Check if user is authorized to update this application
    if (application.employerId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this application' });
    }
    
    // Update the application
    const result = await db.collection('applications').updateOne(
      { _id: new ObjectId(applicationId) },
      { 
        $set: { 
          status, 
          lastStatusUpdate: new Date().toISOString() 
        } 
      }
    );
    
    if (result.modifiedCount === 1) {
      // Get the applicant to create a notification
      let applicant = null;
      if (ObjectId.isValid(application.applicantId)) {
        applicant = await db.collection('users').findOne({
          _id: new ObjectId(application.applicantId)
        });
      }
      
      // Get the job details
      const job = await db.collection('jobs').findOne({
        _id: new ObjectId(application.jobId)
      });
      
      // Create notification for the applicant
      if (application.applicantId && job) {
        await createNotification(db, {
          recipientId: application.applicantId,
          senderId: req.user.id,
          type: 'application_status',
          title: 'Application Status Update',
          message: `Your application for ${job.title} has been updated to ${status}`,
          relatedId: applicationId,
          relatedType: 'application'
        });
      }
      
      res.status(200).json({ 
        message: 'Application status updated successfully',
        status
      });
    } else {
      res.status(400).json({ message: 'Failed to update application status' });
    }
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json({ message: 'Error updating application status' });
  }
});

export default router;