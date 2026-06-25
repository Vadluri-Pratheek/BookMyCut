import express from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller.js';
import { protectCustomer, protectBarber, protectUser } from '../middleware/auth.middleware.js';
import { isValidUpiId } from '../utils/upi.js';
import { validate } from '../middleware/validation.middleware.js';

const router = express.Router();

// --- UNIFIED AUTH ROUTES ---

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['customer', 'barber']).withMessage('Role must be customer or barber'),
    validate,
  ],
  authController.register
);

router.post(
  '/verify-email',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('Valid OTP is required'),
    validate,
  ],
  authController.verifyEmail
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  authController.login
);

router.post(
  '/forgot-password',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    validate,
  ],
  authController.requestPasswordResetOtp
);

router.post(
  '/reset-password',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').trim().isLength({ min: 4, max: 8 }).withMessage('Valid OTP is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate,
  ],
  authController.resetPasswordWithOtp
);

router.get('/me', protectUser, authController.getMe);


// --- BARBER SPECIFIC UPGRADES (for creating shops after registering as barber) ---

router.post(
  '/barber/setup-owner',
  protectUser,
  [
    body('upiId').custom((value) => isValidUpiId(value)).withMessage('Valid UPI ID is required'),
    body('shopName').trim().notEmpty().withMessage('Shop name is required'),
    body('shopAddress').trim().notEmpty().withMessage('Shop address is required'),
    body('shopLng').isFloat().withMessage('shopLng must be a number'),
    body('shopLat').isFloat().withMessage('shopLat must be a number'),
    body('genderServed').isIn(['Male', 'Female', 'Unisex']).withMessage('Valid genderServed is required'),
    body('hasHomeService').optional().isBoolean().withMessage('hasHomeService must be boolean'),
    body('services').isArray({ min: 1 }).withMessage('At least one service is required'),
    body('services.*.name').trim().notEmpty().withMessage('Each service name is required'),
    body('services.*.durationMinutes').isInt({ min: 1 }).withMessage('Each service durationMinutes must be positive'),
    body('services.*.price').isFloat({ min: 0 }).withMessage('Each service price must be positive'),
    body('openTime').isInt({ min: 0, max: 1439 }).withMessage('openTime must be minutes from midnight'),
    body('closeTime').isInt({ min: 1, max: 1440 }).withMessage('closeTime must be minutes from midnight'),
    body('generalWorkStart').isInt({ min: 0, max: 1439 }),
    body('generalWorkEnd').isInt({ min: 1, max: 1440 }),
    body('generalBreaks').optional().isArray(),
    validate,
  ],
  authController.setupBarberOwner
);

router.post(
  '/barber/setup-staff',
  protectUser,
  [
    body('upiId').custom((value) => isValidUpiId(value)).withMessage('Valid UPI ID is required'),
    body('shopCode').trim().notEmpty().withMessage('shopCode is required'),
    body('generalWorkStart').isInt({ min: 0, max: 1439 }),
    body('generalWorkEnd').isInt({ min: 1, max: 1440 }),
    body('generalBreaks').optional().isArray(),
    validate,
  ],
  authController.setupBarberStaff
);

// Keep old paths for backward compatibility on frontend until we swap API client
router.post('/customer/login', (req, res) => res.redirect(307, '/api/auth/login'));
router.post('/barber/login', (req, res) => res.redirect(307, '/api/auth/login'));

export default router;
