import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import jobsRoutes from './routes/jobs.js';
import applicationsRoutes from './routes/applications.js'; 
import usersRoutes from './routes/users.js'; 
import notificationRoutes from './routes/notifications.js';
import reviewsRoutes from './routes/reviews.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'https://carematch.vercel.app'
];

// Enhanced CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin); // Helpful for debugging
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
  credentials: true,
  maxAge: 86400 // Cache preflight requests for 24 hours
}));

// Add an OPTIONS preflight handler for all routes
app.options('*', cors());

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  // If it's a CORS error, send appropriate response
  if (err.message.includes('CORS')) {
    return res.status(403).json({
      message: 'CORS error: Origin not allowed',
      error: err.message
    });
  }
  
  res.status(500).json({
    message: 'Internal server error',
    error: err.message
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make uploads folder accessible
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/applications', applicationsRoutes); 
app.use('/api/users', usersRoutes); 
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewsRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('Job Portal API is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});