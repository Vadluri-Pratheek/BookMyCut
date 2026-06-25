import express from 'express';
import { body } from 'express-validator';

import * as scheduleController from '../controllers/schedule.controller.js';
import { protectBarber } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';

const router = express.Router();



// BARBER PROTECTED
router.post(
  '/setup',
  protectBarber,
  [
    body('date').trim().notEmpty().withMessage('date is required'),
    body('workStart').isInt({ min: 0, max: 1439 }).withMessage('workStart must be minutes from midnight'),
    body('workEnd').isInt({ min: 1, max: 1440 }).withMessage('workEnd must be minutes from midnight'),
    body('breaks').optional().isArray().withMessage('breaks must be an array'),
    body('breaks.*.breakStart').optional().isInt({ min: 0, max: 1439 }).withMessage('breakStart must be valid'),
    body('breaks.*.breakEnd').optional().isInt({ min: 1, max: 1440 }).withMessage('breakEnd must be valid'),
    body('isHomeServiceDay').optional().isBoolean().withMessage('isHomeServiceDay must be boolean'),
    validate,
  ],
  scheduleController.setupDaySchedule
);

// BARBER PROTECTED
router.get('/my', protectBarber, scheduleController.getMySchedule);

// BARBER PROTECTED
router.get('/shop', protectBarber, scheduleController.getDayScheduleForShop);

export default router;


