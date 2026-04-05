const Barber = require('../models/Barber');
const Booking = require('../models/Booking');
const DaySchedule = require('../models/DaySchedule');
const Shop = require('../models/Shop');
const { getTodayStr, isWithinBookingWindow } = require('../utils/timeHelpers');
const { getEffectiveSlotEndMinutes } = require('../utils/travelTime');
const { autoCancelExpiredBookings } = require('../utils/bookingLifecycle');

/**
 * Creates or updates a barber's day schedule.
 * Access: Barber only.
 * Business rules: schedules are limited to today through the next 3 days, work hours must be valid, and breaks must fit inside work hours.
 */
const setupDaySchedule = async (req, res, next) => {
  try {
    const { date, workStart, workEnd, breaks = [], isHomeServiceDay } = req.body;
    const normalizedWorkStart = Number(workStart);
    const normalizedWorkEnd = Number(workEnd);
    const normalizedBreaks = breaks
      .map((item) => ({
        breakStart: Number(item.breakStart),
        breakEnd: Number(item.breakEnd),
        ...(item.label ? { label: item.label } : {}),
      }))
      .sort((a, b) => a.breakStart - b.breakStart);

    if (!isWithinBookingWindow(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be today or within the next 3 days',
      });
    }

    if (normalizedWorkStart >= normalizedWorkEnd) {
      return res.status(400).json({
        success: false,
        message: 'Work start must be before work end',
      });
    }

    const invalidBreak = normalizedBreaks.some((item) =>
      item.breakStart < normalizedWorkStart ||
      item.breakEnd > normalizedWorkEnd ||
      item.breakStart >= item.breakEnd);

    if (invalidBreak) {
      return res.status(400).json({
        success: false,
        message: 'Break times must fall within working hours',
      });
    }

    const scheduleUpdates = {
      workStart: normalizedWorkStart,
      workEnd: normalizedWorkEnd,
      breaks: normalizedBreaks,
      shopId: req.user.shopId,
    };

    if (typeof isHomeServiceDay === 'boolean') {
      scheduleUpdates.isHomeServiceDay = isHomeServiceDay;
    }

    const savedSchedule = await DaySchedule.findOneAndUpdate(
      { barberId: req.user.id, date },
      {
        $set: scheduleUpdates,
        $setOnInsert: {
          barberId: req.user.id,
          date,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    if (date === getTodayStr()) {
      const barberUpdates = { isAvailableToday: true };

      if (isHomeServiceDay === true) {
        barberUpdates.isAcceptingHomeVisitsToday = true;
      }

      await Barber.findByIdAndUpdate(req.user.id, barberUpdates);
    }

    return res.status(200).json({ success: true, data: savedSchedule });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the authenticated barber's schedule and bookings for a day.
 * Access: Barber only.
 * Business rules: bookings are sorted chronologically and customer details are limited to operational fields.
 */
const getMySchedule = async (req, res, next) => {
  try {
    const date = req.query.date || getTodayStr();

    await autoCancelExpiredBookings({ barberId: req.user.id, date });

    const [daySchedule, bookings, shop] = await Promise.all([
      DaySchedule.findOne({ barberId: req.user.id, date }).lean(),
      Booking.find({ barberId: req.user.id, date })
        .populate('customerId', 'name phone gender')
        .sort({ slotStartMinutes: 1 })
        .lean(),
      Shop.findById(req.user.shopId).select('location').lean(),
    ]);

    const bookingsWithEffectiveEnd = bookings.map((booking) => ({
      ...booking,
      effectiveSlotEndMinutes: getEffectiveSlotEndMinutes({
        slotStartMinutes: booking.slotStartMinutes,
        serviceDuration: booking.serviceDuration,
        customerLocation: booking.homeLocation,
        shopLocation: shop?.location,
      }),
    }));

    return res.status(200).json({
      success: true,
      data: {
        schedule: daySchedule || null,
        bookings: bookingsWithEffectiveEnd,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns schedules for every barber in the authenticated barber's shop on a given day.
 * Access: Barber only.
 * Business rules: only barbers from the authenticated shop are included.
 */
const getDayScheduleForShop = async (req, res, next) => {
  try {
    const date = req.query.date || getTodayStr();

    const barbers = await Barber.find({ shopId: req.user.shopId })
      .select('-passwordHash')
      .lean();

    const schedules = await DaySchedule.find({
      shopId: req.user.shopId,
      date,
      barberId: { $in: barbers.map((barber) => barber._id) },
    }).lean();

    const scheduleMap = new Map(schedules.map((schedule) => [String(schedule.barberId), schedule]));
    const barbersWithSchedules = barbers.map((barber) => ({
      ...barber,
      schedule: scheduleMap.get(String(barber._id)) || null,
    }));

    return res.status(200).json({ success: true, data: barbersWithSchedules });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  setupDaySchedule,
  getMySchedule,
  getDayScheduleForShop,
};
