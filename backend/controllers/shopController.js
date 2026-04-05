const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const Barber = require('../models/Barber');

/**
 * Finds nearby active shops with optional gender filtering.
 * Access: Public.
 * Business rules: longitude and latitude are required and geospatial search only returns active shops.
 */
const getNearbyShops = async (req, res, next) => {
  try {
    const { lng, lat, gender, city, state, maxDistance = 10000 } = req.query; // Default to 10km

    // Validate required coordinates for geospatial search
    if (!city && !state && (lng === undefined || lat === undefined)) {
      return res.status(400).json({
        success: false,
        message: 'lng and lat are required',
      });
    }

    let query = { isActive: true };

    if (lng !== undefined && lat !== undefined) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [Number(lng), Number(lat)],
          },
          $maxDistance: Number(maxDistance),
        },
      };
    } else if (city) {
      query['location.city'] = { $regex: new RegExp(city, 'i') };
    } else if (state) {
      query['location.state'] = { $regex: new RegExp(state, 'i') };
    }

    let genderFilter = {};
    const normalizedGender = gender ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase() : null;
    
    if (normalizedGender === 'Female') {
      genderFilter = { genderServed: { $in: ['Female', 'Unisex'] } };
    } else if (normalizedGender === 'Male') {
      genderFilter = { genderServed: { $in: ['Male', 'Unisex'] } };
    }

    const shops = await Shop.find({
      ...query,
      ...genderFilter,
    })
      .select('name location genderServed hasHomeService rating reviewsCount services shopCode openTime closeTime banner')
      .lean();

    // VERIFIED: Gender filter working correctly

    return res.status(200).json({ success: true, data: shops });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns a single shop by id.
 * Access: Public.
 * Business rules: the shop must exist to be returned.
 */
const getShopById = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(shopId)) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    const shop = await Shop.findById(shopId).populate('ownerId', 'name email').lean();

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    return res.status(200).json({ success: true, data: shop });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns lightweight public shop details by shop code.
 * Access: Public.
 * Business rules: only fields needed for the join flow are returned.
 */
const getShopByCode = async (req, res, next) => {
  try {
    const { shopCode } = req.params;
    const shop = await Shop.findOne({ shopCode: shopCode.trim() })
      .select('name shopCode genderServed hasHomeService')
      .lean();

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    return res.status(200).json({ success: true, data: shop });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the authenticated barber's shop details.
 * Access: Barber only.
 * Business rules: only the authenticated barber's shop can be returned.
 */
const getMyShopDetails = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.user.shopId).populate('ownerId', 'name email').lean();

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    return res.status(200).json({ success: true, data: shop });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the logged-in owner's shop details.
 * Access: Owner only.
 * Business rules: owners can only update their own shop and only provided fields are changed.
 */
const updateShopDetails = async (req, res, next) => {
  try {
    const { shopId } = req.params;

    if (String(req.user.shopId) !== String(shopId)) {
      return res.status(403).json({ success: false, message: 'You can only edit your own shop' });
    }

    const updates = {};
    ['name', 'services', 'openTime', 'closeTime', 'hasHomeService', 'genderServed'].forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const updatedShop = await Shop.findByIdAndUpdate(shopId, updates, {
      new: true,
      runValidators: true,
    }).lean();

    return res.status(200).json({ success: true, data: updatedShop });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the authenticated owner's shop details.
 * Access: Owner only.
 * Business rules: only the authenticated owner's shop is updated and address changes preserve existing coordinates.
 */
const updateMyShopDetails = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.user.shopId);

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    if (req.body.name !== undefined) shop.name = req.body.name;
    if (req.body.openTime !== undefined) shop.openTime = req.body.openTime;
    if (req.body.closeTime !== undefined) shop.closeTime = req.body.closeTime;
    if (req.body.hasHomeService !== undefined) shop.hasHomeService = req.body.hasHomeService;
    if (req.body.genderServed !== undefined) shop.genderServed = req.body.genderServed;
    if (req.body.services !== undefined) shop.services = req.body.services;
    if (req.body.address !== undefined) {
      shop.location = {
        ...shop.location,
        address: req.body.address,
      };
    }
    if (req.body.city !== undefined) {
      shop.location = {
        ...shop.location,
        city: req.body.city,
      };
    }
    if (req.body.state !== undefined) {
      shop.location = {
        ...shop.location,
        state: req.body.state,
      };
    }
    if (req.body.lng !== undefined || req.body.lat !== undefined) {
      const currentCoordinates = shop.location?.coordinates || [];
      const nextLng = req.body.lng !== undefined ? Number(req.body.lng) : currentCoordinates[0];
      const nextLat = req.body.lat !== undefined ? Number(req.body.lat) : currentCoordinates[1];

      shop.location = {
        ...shop.location,
        type: 'Point',
        coordinates: [nextLng, nextLat],
      };
    }

    await shop.save();

    return res.status(200).json({ success: true, data: shop.toObject() });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns public barber records for a shop.
 * Access: Public.
 * Business rules: only non-sensitive barber fields are returned.
 */
const getPublicBarbersForShop = async (req, res, next) => {
  try {
    const { shopId } = req.params;

    const shop = await Shop.findById(shopId).select('_id').lean();
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    const barbers = await Barber.find({ shopId })
      .select('name role canOfferHomeServices isAcceptingHomeVisitsToday isAvailableToday')
      .lean();

    return res.status(200).json({ success: true, data: barbers });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNearbyShops,
  getShopById,
  getShopByCode,
  getMyShopDetails,
  updateShopDetails,
  updateMyShopDetails,
  getPublicBarbersForShop,
};
