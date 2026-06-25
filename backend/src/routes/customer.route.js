import express from 'express';
import * as customerController from '../controllers/customer.controller.js';
import { protectCustomer } from '../middleware/auth.middleware.js';

const router = express.Router();

// PROTECTED — applies customer updates
router.put('/profile', protectCustomer, customerController.updateProfile);

export default router;


