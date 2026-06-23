import express from 'express';
import * as customerController from '../controllers/customerController.js';
import { protectCustomer } from '../middleware/authMiddleware.js';

const router = express.Router();

// PROTECTED — applies customer updates
router.put('/profile', protectCustomer, customerController.updateProfile);

export default router;
