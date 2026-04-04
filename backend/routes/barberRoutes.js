const express = require('express');
const { body, validationResult } = require('express-validator');

const barberController = require('../controllers/barberController');
const { protectBarber } = require('../middleware/authMiddleware');
const { requireOwner } = require('../middleware/roleMiddleware');
const { isValidUpiId } = require('../utils/upi');

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
router.get('/profile', protectBarber, barberController.getBarberProfile);

// BARBER PROTECTED
router.put(
  '/profile',
  protectBarber,
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().trim().notEmpty().withMessage('Phone cannot be empty'),
    body('upiId').optional({ values: 'undefined' }).custom((value) => {
      if (String(value).trim() === '') {
        return true;
      }
      if (!isValidUpiId(value)) {
        throw new Error('Enter a valid UPI ID');
      }
      return true;
    }),
    validate,
  ],
  barberController.updateBarberProfile
);

// BARBER PROTECTED
router.put(
  '/home-toggle',
  protectBarber,
  [
    body('isAccepting').isBoolean().withMessage('isAccepting must be a boolean'),
    validate,
  ],
  barberController.toggleHomeServiceAvailability
);

// PUBLIC
router.get('/traveling/:shopId', barberController.getTravelingBarbersForShop);

// OWNER ONLY
router.get('/staff', protectBarber, requireOwner, barberController.getShopStaff);
router.delete('/staff/:barberId', protectBarber, requireOwner, barberController.removeShopStaff);

module.exports = router;
