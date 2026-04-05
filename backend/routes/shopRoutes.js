const express = require('express');
const { body, validationResult } = require('express-validator');

const shopController = require('../controllers/shopController');
const { protectBarber } = require('../middleware/authMiddleware');
const { requireOwner } = require('../middleware/roleMiddleware');

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

module.exports = router;
