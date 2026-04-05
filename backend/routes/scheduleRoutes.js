const express = require('express');
const { body, validationResult } = require('express-validator');

const scheduleController = require('../controllers/scheduleController');
const { protectBarber } = require('../middleware/authMiddleware');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  return next();
};

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

module.exports = router;
