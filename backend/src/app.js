import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.route.js';
import shopRoutes from './routes/shop.route.js';
import barberRoutes from './routes/barber.route.js';
import scheduleRoutes from './routes/schedule.route.js';
import bookingRoutes from './routes/booking.route.js';
import customerRoutes from './routes/customer.route.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'BookMyCut API is running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/debug/status', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    mongoDBConnected: mongoose.connection.readyState === 1,
    mongoDBState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/customers', customerRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

export default app;
