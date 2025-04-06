import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import jobsRoutes from './routes/jobs.js';
import applicationsRoutes from './routes/applications.js'; // Add this import
import usersRoutes from './routes/users.js'; // Add this import
import notificationRoutes from './routes/notifications.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make uploads folder accessible
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/applications', applicationsRoutes); // Add this route
app.use('/api/users', usersRoutes); // Add this route
app.use('/api/notifications', notificationRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('Job Portal API is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});