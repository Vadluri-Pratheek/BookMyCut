const express = require('express');
const { body, validationResult } = require('express-validator');

const bookingController = require('../controllers/bookingController');
const { protectCustomer, protectBarber } = require('../middleware/authMiddleware');

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

// PUBLIC
router.get('/slots', bookingController.getAvailableSlots);
router.get('/shop-slots', bookingController.getShopAggregatedAvailability);

// CUSTOMER PROTECTED
router.post(
  '/',
  protectCustomer,
  [
    body('shopId').trim().notEmpty().withMessage('shopId is required'),
    body('barberId').optional().trim(),
    body().custom((_, { req }) => {
      const hasLegacyServiceName = typeof req.body.serviceName === 'string' && req.body.serviceName.trim().length > 0;
      const hasServiceNames = Array.isArray(req.body.serviceNames) && req.body.serviceNames.length > 0;
      const hasSelectedServices = Array.isArray(req.body.selectedServices) && req.body.selectedServices.length > 0;

      if (hasLegacyServiceName || hasServiceNames || hasSelectedServices) {
        return true;
      }

      throw new Error('At least one service is required');
    }),
    body('serviceName').optional().trim().notEmpty().withMessage('serviceName cannot be empty'),
    body('serviceNames').optional().isArray({ min: 1 }).withMessage('serviceNames must be a non-empty array'),
    body('serviceNames.*').optional().trim().notEmpty().withMessage('serviceNames entries must be valid'),
    body('selectedServices').optional().isArray({ min: 1 }).withMessage('selectedServices must be a non-empty array'),
    body('selectedServices.*.name').optional().trim().notEmpty().withMessage('selectedServices name is required'),
    body('selectedServices.*.durationMinutes').optional().isFloat({ gt: 0 }).withMessage('selectedServices durationMinutes must be greater than 0'),
    body('selectedServices.*.price').optional().isFloat({ min: 0 }).withMessage('selectedServices price must be 0 or more'),
    body('slotStartMinutes').isInt({ min: 0, max: 1439 }).withMessage('slotStartMinutes must be valid'),
    body('date').trim().notEmpty().withMessage('date is required'),
    body('bookingType').optional().isIn(['inshop', 'homevisit']).withMessage('bookingType must be inshop or homevisit'),
    body('homeLocation.lat').optional().isFloat().withMessage('homeLocation.lat must be a number'),
    body('homeLocation.lng').optional().isFloat().withMessage('homeLocation.lng must be a number'),
    validate,
  ],
  bookingController.createBooking
);

// CUSTOMER PROTECTED
router.get('/my', protectCustomer, bookingController.getMyBookingsCustomer);

// CUSTOMER PROTECTED
router.put('/:bookingId/cancel', protectCustomer, bookingController.cancelBookingByCustomer);

// BARBER PROTECTED
router.get('/shop', protectBarber, bookingController.getShopBookingsBarber);

// BARBER PROTECTED
router.put('/:bookingId/barber-cancel', protectBarber, bookingController.cancelBookingByBarber);

// BARBER PROTECTED
router.put('/:bookingId/checkin', protectBarber, bookingController.checkInBooking);

// BARBER PROTECTED
router.put('/:bookingId/check-in', protectBarber, bookingController.checkInBooking);

module.exports = router;
