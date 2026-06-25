import express from 'express';
import { body } from 'express-validator';

import * as shopController from '../controllers/shop.controller.js';
import { protectBarber } from '../middleware/auth.middleware.js';
import { requireOwner } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';

const router = express.Router();



// PUBLIC
router.get('/nearby', shopController.getNearbyShops);

// PUBLIC
router.get('/code/:shopCode', shopController.getShopByCode);

// PUBLIC
router.get('/:shopId/barbers', shopController.getPublicBarbersForShop);

// BARBER PROTECTED
router.get('/my', protectBarber, shopController.getMyShopDetails);

// OWNER ONLY
router.put(
  '/my',
  protectBarber,
  requireOwner,
  [
    body('name').optional().trim().notEmpty().withMessage('Shop name cannot be empty'),
    body('address').optional().trim().notEmpty().withMessage('Shop address cannot be empty'),
    body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('lng must be a valid longitude'),
    body('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('lat must be a valid latitude'),
    body('openTime').optional().isInt({ min: 0, max: 1439 }).withMessage('openTime must be minutes from midnight'),
    body('closeTime').optional().isInt({ min: 1, max: 1440 }).withMessage('closeTime must be minutes from midnight'),
    validate,
  ],
  shopController.updateMyShopDetails
);

// PUBLIC
router.get('/:shopId', shopController.getShopById);

// OWNER ONLY
router.put(
  '/:shopId',
  protectBarber,
  requireOwner,
  [
    body('name').optional().trim().notEmpty().withMessage('Shop name cannot be empty'),
    body('services').optional().isArray().withMessage('services must be an array'),
    body('openTime').optional().isInt({ min: 0, max: 1439 }).withMessage('openTime must be minutes from midnight'),
    body('closeTime').optional().isInt({ min: 1, max: 1440 }).withMessage('closeTime must be minutes from midnight'),
    body('hasHomeService').optional().isBoolean().withMessage('hasHomeService must be boolean'),
    body('genderServed').optional().isIn(['Male', 'Female', 'Unisex']).withMessage('genderServed must be Male, Female, or Unisex'),
    validate,
  ],
  shopController.updateShopDetails
);

export default router;


