const express = require('express');
const { body, validationResult } = require('express-validator');

const authController = require('../controllers/authController');
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
router.post(
  '/customer/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Valid gender is required'),
    validate,
  ],
  authController.registerCustomer
);

// PUBLIC
router.post(
  '/customer/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  authController.loginCustomer
);

router.post(
  '/customer/forgot-password',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    validate,
  ],
  authController.requestCustomerPasswordResetOtp
);

router.post(
  '/customer/reset-password',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').trim().isLength({ min: 4, max: 8 }).withMessage('Valid OTP is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate,
  ],
  authController.resetCustomerPasswordWithOtp
);

// PUBLIC
router.post(
  '/barber/register/owner',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('shopName').trim().notEmpty().withMessage('Shop name is required'),
    body('shopAddress').trim().notEmpty().withMessage('Shop address is required'),
    body('shopLng').isFloat().withMessage('shopLng must be a number'),
    body('shopLat').isFloat().withMessage('shopLat must be a number'),
    body('genderServed').isIn(['Male', 'Female', 'Unisex']).withMessage('Valid genderServed is required'),
    body('hasHomeService').optional().isBoolean().withMessage('hasHomeService must be boolean'),
    body('services').isArray({ min: 1 }).withMessage('At least one service is required'),
    body('services.*.name').trim().notEmpty().withMessage('Each service name is required'),
    body('services.*.durationMinutes').isInt({ min: 1 }).withMessage('Each service durationMinutes must be a positive integer'),
    body('services.*.price').isFloat({ min: 0 }).withMessage('Each service price must be a positive number'),
    body('services.*.genderSpecific').optional().isIn(['Male', 'Female', 'Unisex']).withMessage('Service genderSpecific must be Male, Female, or Unisex'),
    body('openTime').isInt({ min: 0, max: 1439 }).withMessage('openTime must be minutes from midnight'),
    body('closeTime').isInt({ min: 1, max: 1440 }).withMessage('closeTime must be minutes from midnight'),
    body('generalWorkStart').isInt({ min: 0, max: 1439 }).withMessage('generalWorkStart must be minutes from midnight'),
    body('generalWorkEnd').isInt({ min: 1, max: 1440 }).withMessage('generalWorkEnd must be minutes from midnight'),
    body('generalBreaks').optional().isArray().withMessage('generalBreaks must be an array'),
    body('generalBreaks.*.breakStart').optional().isInt({ min: 0, max: 1439 }).withMessage('generalBreaks breakStart must be valid'),
    body('generalBreaks.*.breakEnd').optional().isInt({ min: 1, max: 1440 }).withMessage('generalBreaks breakEnd must be valid'),
    body('canOfferHomeServices').optional().isBoolean().withMessage('canOfferHomeServices must be boolean'),
    validate,
  ],
  authController.registerBarberOwner
);

// PUBLIC
router.post(
  '/barber/register/staff',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('shopCode').trim().notEmpty().withMessage('shopCode is required'),
    body('generalWorkStart').isInt({ min: 0, max: 1439 }).withMessage('generalWorkStart must be minutes from midnight'),
    body('generalWorkEnd').isInt({ min: 1, max: 1440 }).withMessage('generalWorkEnd must be minutes from midnight'),
    body('generalBreaks').optional().isArray().withMessage('generalBreaks must be an array'),
    body('generalBreaks.*.breakStart').optional().isInt({ min: 0, max: 1439 }).withMessage('generalBreaks breakStart must be valid'),
    body('generalBreaks.*.breakEnd').optional().isInt({ min: 1, max: 1440 }).withMessage('generalBreaks breakEnd must be valid'),
    body('canOfferHomeServices').optional().isBoolean().withMessage('canOfferHomeServices must be boolean'),
    validate,
  ],
  authController.registerBarberStaff
);

// PUBLIC
router.post(
  '/barber/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  authController.loginBarber
);

router.post(
  '/barber/forgot-password',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    validate,
  ],
  authController.requestBarberPasswordResetOtp
);

router.post(
  '/barber/reset-password',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').trim().isLength({ min: 4, max: 8 }).withMessage('Valid OTP is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate,
  ],
  authController.resetBarberPasswordWithOtp
);

// PROTECTED — returns logged-in customer's profile from DB
router.get('/customer/me', protectCustomer, authController.getCustomerMe);

// PROTECTED — returns logged-in barber's profile + shop from DB
router.get('/barber/me', protectBarber, authController.getBarberMe);

module.exports = router;
