const mongoose = require('mongoose');

const Barber = require('../models/Barber');
const Booking = require('../models/Booking');
const DaySchedule = require('../models/DaySchedule');
const { getTodayStr } = require('../utils/timeHelpers');
const { normalizeUpiId } = require('../utils/upi');

/**
 * Returns the authenticated barber profile and linked shop details.
 * Access: Barber only.
 * Business rules: password hashes are never returned.
 */
const getBarberProfile = async (req, res, next) => {
  try {
    const barber = await Barber.findById(req.user.id)
      .select('-passwordHash')
      .populate('shopId', 'name shopCode genderServed hasHomeService')
      .lean();

    return res.status(200).json({ success: true, data: barber });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggles whether a barber accepts home visits today.
 * Access: Barber only.
 * Business rules: barber must be eligible for home services and cannot disable while upcoming home visits exist today.
 */
const toggleHomeServiceAvailability = async (req, res, next) => {
  try {
    const { isAccepting } = req.body;
    const barber = await Barber.findById(req.user.id);

    if (!barber.canOfferHomeServices) {
      return res.status(400).json({
        success: false,
        message: 'You did not sign up for home services. Contact your shop owner.',
      });
    }

    if (isAccepting === false) {
      const count = await Booking.countDocuments({
        barberId: req.user.id,
        date: getTodayStr(),
        bookingType: 'homevisit',
        status: 'upcoming',
      });

      if (count > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot disable home services. You have ${count} home visit(s) scheduled today. Cancel them first.`,
        });
      }
    }

    barber.isAcceptingHomeVisitsToday = Boolean(isAccepting);
    await barber.save();

    return res.status(200).json({
      success: true,
      data: { isAcceptingHomeVisitsToday: barber.isAcceptingHomeVisitsToday },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lists home-service-capable barbers in a shop who have a matching home-service day schedule.
 * Access: Public.
 * Business rules: only barbers with both home-service capability and a matching home-service schedule are returned.
 */
const getTravelingBarbersForShop = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const { date } = req.query;

    const barbers = await Barber.find({ shopId, canOfferHomeServices: true })
      .select('-passwordHash')
      .lean();

    const schedules = await DaySchedule.find({
      shopId,
      date,
      isHomeServiceDay: true,
      barberId: { $in: barbers.map((barber) => barber._id) },
    }).lean();

    const allowedBarberIds = new Set(schedules.map((schedule) => String(schedule.barberId)));
    const travelingBarbers = barbers.filter((barber) => allowedBarberIds.has(String(barber._id)));

    return res.status(200).json({ success: true, data: travelingBarbers });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns all staff and owner barbers for the authenticated owner's shop.
 * Access: Owner only.
 * Business rules: password hashes are never returned.
 */
const getShopStaff = async (req, res, next) => {
  try {
    const staffList = await Barber.find({ shopId: req.user.shopId, role: 'staff' })
      .select('-passwordHash')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({ success: true, data: staffList });
  } catch (error) {
    next(error);
  }
};

/**
 * Removes a joined staff barber from the authenticated owner's shop.
 * Access: Owner only.
 * Business rules: only staff in the same shop can be removed, and staff with upcoming bookings cannot be removed.
 */
const removeShopStaff = async (req, res, next) => {
  try {
    const { barberId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(404).json({ success: false, message: 'Barber not found' });
    }

    const barber = await Barber.findOne({
      _id: barberId,
      shopId: req.user.shopId,
      role: 'staff',
    });

    if (!barber) {
      return res.status(404).json({ success: false, message: 'Barber not found' });
    }

    const upcomingBookingsCount = await Booking.countDocuments({
      barberId: barber._id,
      status: 'upcoming',
      date: { $gte: getTodayStr() },
    });

    if (upcomingBookingsCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove this barber while upcoming bookings exist.',
      });
    }

    barber.shopId = null;
    barber.isAcceptingHomeVisitsToday = false;
    barber.isAvailableToday = false;
    await barber.save();

    return res.status(200).json({
      success: true,
      message: 'Barber removed from shop successfully',
      data: { id: barber._id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the authenticated barber's profile.
 * Access: Barber only.
 */
const updateBarberProfile = async (req, res, next) => {
  try {
    const { name, phone, upiId } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (upiId !== undefined) updates.upiId = normalizeUpiId(upiId);

    const barber = await Barber.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select('-passwordHash').lean();

    return res.status(200).json({ success: true, data: barber });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBarberProfile,
  toggleHomeServiceAvailability,
  getTravelingBarbersForShop,
  getShopStaff,
  removeShopStaff,
  updateBarberProfile,
};
