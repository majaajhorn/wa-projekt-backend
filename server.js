import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth.js';
import dotenv from 'dotenv';

const app = express();
const PORT = 5000;

// CORS configuration
const corsOptions = {
    origin: 'http://localhost:5173',  // Allow requests from the frontend's origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'],  // Allow specific HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allow specific headers
  };
  
  // Apply CORS middleware with the specified options
  app.use(cors(corsOptions));
  
  // Middleware
  app.use(bodyParser.json());
  
  // Routes
  app.use('/auth', authRoutes);
  
  app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));