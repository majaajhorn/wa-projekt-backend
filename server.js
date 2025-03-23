import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth.js';
import dotenv from 'dotenv';
import jobRoutes from './routes/jobs.js';

const app = express();
const PORT = 5000;

// CORS configuration
const corsOptions = {
    origin: /http:\/\/localhost:\d+/, // Allow requests from any localhost port
    methods: ['GET', 'POST', 'PUT', 'DELETE'],  // Allow specific HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'], // Allow specific headers
  };
  
  // Apply CORS middleware with the specified options
  app.use(cors(corsOptions));
  
  // Middleware
  app.use(bodyParser.json());
  
  // Routes
  app.use('/auth', authRoutes);

  app.use('/uploads', express.static('uploads'));

  app.use('/jobs', jobRoutes);
  
  app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));