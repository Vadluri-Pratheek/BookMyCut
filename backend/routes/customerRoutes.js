const express = require('express');
const customerController = require('../controllers/customerController');
const { protectCustomer } = require('../middleware/authMiddleware');

const router = express.Router();

// PROTECTED — applies customer updates
router.put('/profile', protectCustomer, customerController.updateProfile);

module.exports = router;
