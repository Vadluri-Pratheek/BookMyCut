require('dotenv').config();

const express = require('express');
const cors = require('cors');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const barberRoutes = require('./routes/barberRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const customerRoutes = require('./routes/customerRoutes');

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    success: true,
    message: 'BookMyCut API is running',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to check database connection
app.get('/api/debug/status', (req, res) => {
  const mongoose = require('mongoose');
  res.status(200).json({
    success: true,
    message: 'Server is running',
    mongoDBConnected: mongoose.connection.readyState === 1,
    mongoDBState: mongoose.connection.readyState,
    timestamp: new Date().toISOString()
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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  process.stdout.write(`BookMyCut server running on port ${PORT}\n`);
});
