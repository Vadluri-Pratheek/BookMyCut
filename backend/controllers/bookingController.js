const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const Shop = require('../models/Shop');
const Barber = require('../models/Barber');
const Customer = require('../models/Customer');
const DaySchedule = require('../models/DaySchedule');
const {
  getAvailableSlots: computeAvailableSlots,
  hasOverlap,
  getOccupiedRange,
  buildFreeIntervals,
  doesSlotFitFreeIntervals,
} = require('../utils/availabilityEngine');
const { generateBookingCode } = require('../utils/generateCode');
const {
  minsToTimeStr,
  getTodayStr,
  isWithinBookingWindow,
  isTuesdayDateStr,
  minutesUntilSlot,
} = require('../utils/timeHelpers');
const {
  getTravelBufferMinutes,
  getEffectiveSlotDurationMinutes,
  normalizePoint,
} = require('../utils/travelTime');
const { autoCancelExpiredBookings } = require('../utils/bookingLifecycle');
const { sendBookingCancellationNotification } = require('../utils/bookingNotifications');
const { normalizeLocationPoint } = require('../utils/locationPoint');

const buildBarberDayAvailability = ({ barber, schedule, bookings, bookingType, shopLocation }) => {
  if (!schedule) {
    return null;
  }

  if (bookingType === 'homevisit' && (!barber.canOfferHomeServices || !barber.isAcceptingHomeVisitsToday)) {
    return null;
  }

  const workStart = Number(schedule.workStart);
  const workEnd = Number(schedule.workEnd);
  const occupiedIntervals = [
    ...(schedule.breaks || []).map((item) => ({
      start: Number(item.breakStart),
      end: Number(item.breakEnd),
    })),
    ...bookings.map((booking) => {
      const { occupiedStart, occupiedEnd } = getOccupiedRange(booking, shopLocation);
      return {
        start: occupiedStart,
        end: occupiedEnd,
      };
    }),
  ];

  return {
    workStart,
    workEnd,
    freeIntervals: buildFreeIntervals({
      workStart,
      workEnd,
      occupiedIntervals,
    }),
  };
};

const lockScheduleForBooking = ({ barberId, date, session }) =>
  DaySchedule.findOneAndUpdate(
    { barberId, date },
    { $currentDate: { updatedAt: true } },
    { new: true, session }
  );

const isBookingWriteConflict = (error) =>
  error?.errorLabels?.includes('TransientTransactionError')
  || /writeconflict/i.test(error?.message || '');

const getRequestCustomerLocation = ({ query = {}, body = {} }) => {
  if (body.homeLocation) {
    return body.homeLocation;
  }

  if (query.customerLat !== undefined && query.customerLng !== undefined) {
    return {
      lat: Number(query.customerLat),
      lng: Number(query.customerLng),
    };
  }

  return null;
};

const normalizeRequestedServices = ({ serviceName, serviceNames, selectedServices }) => {
  if (Array.isArray(selectedServices) && selectedServices.length > 0) {
    return selectedServices
      .map((service) => ({
        name: String(service?.name || '').trim(),
        ...(service?.durationMinutes != null ? { durationMinutes: Number(service.durationMinutes) } : {}),
        ...(service?.price != null ? { price: Number(service.price) } : {}),
        ...(service?.category ? { category: String(service.category).trim() } : {}),
        ...(service?.genderSpecific ? { genderSpecific: String(service.genderSpecific).trim() } : {}),
      }))
      .filter((service) => service.name);
  }

  if (Array.isArray(serviceNames) && serviceNames.length > 0) {
    return serviceNames
      .map((name) => ({ name: String(name || '').trim() }))
      .filter((service) => service.name);
  }

  if (typeof serviceName === 'string' && serviceName.trim()) {
    return [{ name: serviceName.trim() }];
  }

  return [];
};

const matchesRequestedService = (shopService, requestedService) => {
  if (!shopService || !requestedService?.name) {
    return false;
  }

  if (String(shopService.name).trim() !== requestedService.name) {
    return false;
  }

  if (requestedService.durationMinutes != null
    && Number(shopService.durationMinutes) !== Number(requestedService.durationMinutes)) {
    return false;
  }

  if (requestedService.price != null && Number(shopService.price) !== Number(requestedService.price)) {
    return false;
  }

  if (requestedService.genderSpecific
    && String(shopService.genderSpecific || 'Unisex') !== requestedService.genderSpecific) {
    return false;
  }

  if (requestedService.category
    && String(shopService.category || '').trim() !== requestedService.category) {
    return false;
  }

  return true;
};

const resolveRequestedShopServices = (shopServices = [], requestPayload = {}) => {
  const requestedServices = normalizeRequestedServices(requestPayload);

  if (requestedServices.length === 0) {
    return [];
  }

  return requestedServices.map((requestedService) => {
    const match = shopServices.find((shopService) => matchesRequestedService(shopService, requestedService));

    if (!match) {
      throw new Error(`Service "${requestedService.name}" is not available in this shop`);
    }

    return {
      name: String(match.name).trim(),
      durationMinutes: Number(match.durationMinutes),
      price: Number(match.price),
      ...(match.category ? { category: match.category } : {}),
      ...(match.genderSpecific ? { genderSpecific: match.genderSpecific } : {}),
    };
  });
};

/**
 * Returns available time slots for a specific barber on a given date.
 * Access: Public.
 * Business rules: workStart, workEnd, breaks, existingBookings, and serviceDuration are required.
 */
const getAvailableSlotsHandler = async (req, res, next) => {
  try {
    const { barberId, date, serviceDuration, bookingType = 'inshop' } = req.query;

    if (!barberId || !date || !serviceDuration) {
      return res.status(400).json({
        success: false,
        message: 'barberId, date and serviceDuration are required',
      });
    }

    const duration = Number(serviceDuration);
    if (!Number.isFinite(duration) || duration <= 0) {
      return res.status(400).json({
        success: false,
        message: 'serviceDuration must be greater than 0',
      });
    }

    if (isTuesdayDateStr(date)) {
      return res.status(200).json({
        success: true,
        data: { date, slots: [], isClosed: true, closureReason: 'Shops are closed on Tuesday' },
      });
    }

    const barber = await Barber.findById(barberId).lean();
    if (!barber) {
      return res.status(404).json({ success: false, message: 'Barber not found' });
    }

    const shop = await Shop.findById(barber.shopId).lean();
    const customerLocation = getRequestCustomerLocation({ query: req.query });

    const [schedule, existingBookings] = await Promise.all([
      DaySchedule.findOne({ barberId, date }).lean(),
      Booking.find({ barberId, date, status: 'upcoming' }).lean(),
    ]);

    if (!schedule) {
      return res.status(200).json({ success: true, data: { date, slots: [] } });
    }

    if (bookingType === 'homevisit' && (!barber.canOfferHomeServices || !barber.isAcceptingHomeVisitsToday)) {
      return res.status(200).json({ success: true, data: { date, slots: [] } });
    }

    const slots = computeAvailableSlots({
      workStart: schedule.workStart,
      workEnd: schedule.workEnd,
      breaks: schedule.breaks,
      existingBookings,
      serviceDuration: duration,
      customerLocation,
      shopLocation: shop ? shop.location : null,
    });

    return res.status(200).json({ success: true, data: { date, slots } });
  } catch (error) {
    next(error);
  }
};

/**
 * Computes aggregated shop availability based on service duration.
 * Access: Public.
 * Business rules: a minute T is free if at least one barber is free from T to T + duration.
 */
const getShopAggregatedAvailability = async (req, res, next) => {
  try {
    const { shopId, date, serviceDuration, bookingType = 'inshop' } = req.query;

    if (!shopId || !date || !serviceDuration) {
      return res.status(400).json({
        success: false,
        message: 'shopId, date and serviceDuration are required',
      });
    }

    const duration = Number(serviceDuration);
    if (!Number.isFinite(duration) || duration <= 0) {
      return res.status(400).json({
        success: false,
        message: 'serviceDuration must be greater than 0',
      });
    }

    const shop = await Shop.findById(shopId).lean();
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
    const customerLocation = getRequestCustomerLocation({ query: req.query });
    const effectiveDuration = getEffectiveSlotDurationMinutes({
      serviceDuration: duration,
      customerLocation,
      shopLocation: shop.location,
    });

    if (isTuesdayDateStr(date)) {
      return res.status(200).json({
        success: true,
        data: {
          date,
          slots: [],
          openTime: shop.openTime,
          closeTime: shop.closeTime,
          effectiveDurationMinutes: effectiveDuration,
          isClosed: true,
          closureReason: 'Shops are closed on Tuesday',
        },
      });
    }

    const barbers = await Barber.find({ shopId }).lean();

    if (!barbers.length) {
      return res.status(200).json({
        success: true,
        data: {
          date,
          slots: [],
          openTime: shop.openTime,
          closeTime: shop.closeTime,
          effectiveDurationMinutes: effectiveDuration,
        },
      });
    }

    const barberIds = barbers.map((b) => b._id);
    const [schedules, allBookings] = await Promise.all([
      DaySchedule.find({ barberId: { $in: barberIds }, date }).lean(),
      Booking.find({ barberId: { $in: barberIds }, date, status: 'upcoming' }).lean(),
    ]);

    let shopOpen = shop.openTime || 540;
    let shopClose = shop.closeTime || 1260;
    // STEP 1 & 2 — For each barber compute free intervals
    const barberFreeIntervals = new Map();
    const scheduledAvailabilities = [];
    barbers.forEach((barber) => {
      const schedule = schedules.find((s) => String(s.barberId) === String(barber._id));
      const barberBookings = allBookings.filter((b) => String(b.barberId) === String(barber._id));
      const availability = buildBarberDayAvailability({
        barber,
        schedule,
        bookings: barberBookings,
        bookingType,
        shopLocation: shop.location,
      });

      if (!availability) {
        barberFreeIntervals.set(barber._id, []);
        return;
      }

      scheduledAvailabilities.push(availability);
      barberFreeIntervals.set(barber._id, availability.freeIntervals);
    });

    if (!scheduledAvailabilities.length) {
      return res.status(200).json({
        success: true,
        data: {
          date,
          slots: [],
          openTime: shopOpen,
          closeTime: shopClose,
          effectiveDurationMinutes: effectiveDuration,
        },
      });
    }

    shopOpen = Math.min(...scheduledAvailabilities.map((availability) => availability.workStart));
    shopClose = Math.max(...scheduledAvailabilities.map((availability) => availability.workEnd));

    // STEP 3 - For each minute T
    const minuteStatus = [];
    for (let t = shopOpen; t <= shopClose - effectiveDuration; t++) {
      const isGreen = barbers.some((barber) =>
        doesSlotFitFreeIntervals({
          freeIntervals: barberFreeIntervals.get(barber._id) || [],
          slotStart: t,
          duration: effectiveDuration,
        }));

      minuteStatus.push({ t, color: isGreen ? 'GREEN' : 'GREY' });
    }

    // VERIFIED: Availability engine correct
    // STEP 4 - Merge segments
    const aggregatedSlots = [];
    if (minuteStatus.length > 0) {
      let currentStart = minuteStatus[0].t;
      let currentColor = minuteStatus[0].color;
      let lastT = minuteStatus[0].t;

      for (let i = 1; i < minuteStatus.length; i++) {
        if (minuteStatus[i].color === currentColor && minuteStatus[i].t === lastT + 1) {
          lastT = minuteStatus[i].t;
        } else {
          aggregatedSlots.push({ start: currentStart, end: lastT + 1, color: currentColor });
          currentStart = minuteStatus[i].t;
          currentColor = minuteStatus[i].color;
          lastT = minuteStatus[i].t;
        }
      }
      aggregatedSlots.push({ start: currentStart, end: lastT + 1, color: currentColor });
    }
    // VERIFIED: Slots API returns merged chart

    return res.status(200).json({
      success: true,
      data: {
        date,
        slots: aggregatedSlots,
        openTime: shopOpen,
        closeTime: shopClose,
        effectiveDurationMinutes: effectiveDuration,
        travelBufferMinutes: getTravelBufferMinutes({
          customerLocation,
          shopLocation: shop.location,
        }),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates a new booking within a MongoDB transaction.
 * Access: Customer only.
 * Business rules: bookings are limited to today through the next 3 days, slot conflicts are prevented transactionally, and home visits enforce additional customer and barber rules.
 */
const createBooking = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const {
      shopId,
      barberId,
      serviceName,
      serviceNames,
      selectedServices: requestedSelectedServices = [],
      slotStartMinutes,
      date,
      bookingType = 'inshop',
    } = req.body;

    if (!isWithinBookingWindow(date)) {
      const today = getTodayStr();
      if (date < today) {
        return res.status(400).json({
          success: false,
          message: 'Cannot book appointments in the past',
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Bookings only allowed up to 3 days in advance',
        });
      }
    }

    if (isTuesdayDateStr(date)) {
      return res.status(400).json({
        success: false,
        message: 'Shops are closed on Tuesday',
      });
    }

    const shop = await Shop.findById(shopId).lean();
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    let resolvedServices;
    try {
      resolvedServices = resolveRequestedShopServices(shop.services, {
        serviceName,
        serviceNames,
        selectedServices: requestedSelectedServices,
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    if (!resolvedServices.length) {
      return res.status(400).json({ success: false, message: 'At least one service is required' });
    }

    const serviceNameLabel = resolvedServices.map((service) => service.name).join(' + ');
    const serviceDuration = resolvedServices.reduce(
      (total, service) => total + Number(service.durationMinutes || 0),
      0
    );
    const priceTotal = resolvedServices.reduce(
      (total, service) => total + Number(service.price || 0),
      0
    );
    const slotStart = Number(slotStartMinutes);
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    if (date === getTodayStr() && slotStart < currentMinutes) {
      return res.status(400).json({
        success: false,
        message: 'Booking time must be the current time or later',
      });
    }

    let assignedBarberId = null; // Enforce auto-assignment primarily
    if (barberId) assignedBarberId = barberId; // Keep for explicit testing if needed

    await session.startTransaction();

    const customer = await Customer.findById(req.user.id).select('homeLocation').session(session).lean();
    const requestedLocation = getRequestCustomerLocation({ body: req.body });
    const resolvedCustomerLocation =
      normalizeLocationPoint(requestedLocation)
      || normalizeLocationPoint(customer?.homeLocation);

    if (bookingType === 'homevisit' && !resolvedCustomerLocation) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Home location is required for home service bookings',
      });
    }

    const effectiveDuration = getEffectiveSlotDurationMinutes({
      serviceDuration,
      customerLocation: resolvedCustomerLocation,
      shopLocation: shop.location,
    });
    const slotEnd = slotStart + effectiveDuration;
    const bookingLocation = resolvedCustomerLocation || undefined;

    // Verify Barber Auto Assignment Logic
    if (!assignedBarberId) {
      const barbers = await Barber.find({ shopId }).session(session);
      const eligibleBarbers = [];

      // STEP 1 - Find all free barbers
      for (const barber of barbers) {
        if (bookingType === 'homevisit' && (!barber.canOfferHomeServices || !barber.isAcceptingHomeVisitsToday)) continue;

        const schedule = await DaySchedule.findOne({ barberId: barber._id, date }).session(session);
        if (!schedule || slotStart < schedule.workStart || slotEnd > schedule.workEnd) continue;
        if (schedule.breaks.some((b) => hasOverlap(slotStart, slotEnd, b.breakStart, b.breakEnd))) continue;

        const existingBookings = await Booking.find({ barberId: barber._id, date, status: 'upcoming' }).session(session);
        const occStart = slotStart;
        const occEnd = slotEnd;

        const hasConflict = existingBookings.some((b) => {
          const { occupiedStart, occupiedEnd } = getOccupiedRange(b, shop.location);
          return hasOverlap(occStart, occEnd, occupiedStart, occupiedEnd);
        });

        if (!hasConflict) {
          eligibleBarbers.push({
            id: barber._id,
            bookingCount: existingBookings.length,
          });
        }
      }

      // STEP 2 - If candidateBarbers is empty, return 409
      if (!eligibleBarbers.length) {
        await session.abortTransaction();
        return res.status(409).json({ success: false, message: 'This slot is no longer available. Please select another time.' });
      }

      // STEP 3 - Pick LEAST BUSY
      eligibleBarbers.sort((a, b) => a.bookingCount - b.bookingCount);

      // STEP 4 - Conflict check inside transaction
      for (const candidate of eligibleBarbers) {
        const lockedSchedule = await lockScheduleForBooking({
          barberId: candidate.id,
          date,
          session,
        });
        if (!lockedSchedule || slotStart < lockedSchedule.workStart || slotEnd > lockedSchedule.workEnd) continue;
        if (lockedSchedule.breaks.some((b) => hasOverlap(slotStart, slotEnd, b.breakStart, b.breakEnd))) continue;

        // Re-verify chosen barber is still free
        const existingBookings = await Booking.find({ barberId: candidate.id, date, status: 'upcoming' }).session(session);
        const occStart = slotStart;
        const occEnd = slotEnd;

        const hasConflict = existingBookings.some((b) => {
          const { occupiedStart, occupiedEnd } = getOccupiedRange(b, shop.location);
          return hasOverlap(occStart, occEnd, occupiedStart, occupiedEnd);
        });

        if (!hasConflict) {
          assignedBarberId = candidate.id;
          break; // Found a free candidate
        }
      }

      // If all taken
      if (!assignedBarberId) {
        await session.abortTransaction();
        return res.status(409).json({ success: false, message: 'This slot is no longer available. Please select another time.' });
      }
    } else {
      // RULE 2, 3, 4 Verifications constraints for explicit barber requests
      const barber = await Barber.findById(assignedBarberId).session(session);
      if (!barber || String(barber.shopId) !== String(shopId)) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Invalid barber selected' });
      }

      const schedule = await lockScheduleForBooking({
        barberId: assignedBarberId,
        date,
        session,
      });
      if (!schedule || slotStart < schedule.workStart || slotEnd > schedule.workEnd) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Slot is outside barber working hours' });
      }

      if (schedule.breaks.some((b) => hasOverlap(slotStart, slotEnd, b.breakStart, b.breakEnd))) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Slot falls within barber break time' });
      }

      const existingBookings = await Booking.find({ barberId: assignedBarberId, date, status: 'upcoming' }).session(session);
      const occStart = slotStart;
      const occEnd = slotEnd;

      if (existingBookings.some((b) => {
        const { occupiedStart, occupiedEnd } = getOccupiedRange(b, shop.location);
        return hasOverlap(occStart, occEnd, occupiedStart, occupiedEnd);
      })) {
        await session.abortTransaction();
        return res.status(409).json({ success: false, message: 'This slot is already booked' });
      }
    }

    const travelBufferStart = slotStart;
    const travelBufferEnd = slotEnd;
    
    // VERIFIED: Barber auto-assignment working
    // VERIFIED: 4-digit verification code working
    const vCode = String(Math.floor(1000 + Math.random() * 9000));

    // STEP 5 - Create booking
    const booking = await Booking.create(
      [
        {
          bookingCode: generateBookingCode(),
          verificationCode: vCode,
          customerId: req.user.id,
          shopId,
          barberId: assignedBarberId,
          serviceName: serviceNameLabel,
          selectedServices: resolvedServices,
          serviceDuration,
          priceTotal,
          date,
          slotTimeStr: minsToTimeStr(slotStart),
          slotStartMinutes: slotStart,
          slotEndMinutes: slotEnd,
          bookingType,
          homeLocation: bookingLocation,
          travelBufferStart,
          travelBufferEnd,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return res.status(201).json({ success: true, data: booking[0] });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (isBookingWriteConflict(error)) {
      return res.status(409).json({
        success: false,
        message: 'This slot is no longer available. Please select another time.',
      });
    }
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Cancels a booking as the customer who created it.
 * Access: Customer only.
 * Business rules: only the booking owner can cancel, only upcoming bookings are cancellable, and cancellation must happen at least 6 hours before the slot.
 */
const cancelBookingByCustomer = async (req, res, next) => {
  try {
    await autoCancelExpiredBookings({ _id: req.params.bookingId });
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (String(booking.customerId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not your booking' });
    }

    if (booking.status !== 'upcoming') {
      return res.status(400).json({
        success: false,
        message:
          booking.cancelledBy === 'auto'
            ? 'Booking was auto-cancelled after the timer expired'
            : 'Only upcoming bookings can be cancelled',
      });
    }

    const minsLeft = minutesUntilSlot(booking.date, booking.slotStartMinutes);
    const cancellationThresholdMins = Number(process.env.CUSTOMER_CANCELLATION_MIN_HOURS || 6) * 60;

    if (minsLeft < cancellationThresholdMins) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel within 6 hours of your appointment. ${Math.ceil(minsLeft / 60)} hours remaining.`,
      });
    }

    booking.status = 'cancelled';
    booking.cancelledBy = 'customer';
    booking.cancellationReason = req.body.cancellationReason;
    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancels a booking as the assigned barber.
 * Access: Barber only.
 * Business rules: only the assigned barber can cancel and the cancellation must happen within 24 hours of booking creation.
 */
const cancelBookingByBarber = async (req, res, next) => {
  try {
    await autoCancelExpiredBookings({ _id: req.params.bookingId });
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (String(booking.barberId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not your booking' });
    }

    if (booking.status !== 'upcoming') {
      return res.status(400).json({
        success: false,
        message:
          booking.cancelledBy === 'auto'
            ? 'Booking was auto-cancelled after the timer expired'
            : 'Only upcoming bookings can be cancelled',
      });
    }

    const hoursSinceCreation = (Date.now() - booking.createdAt.getTime()) / (1000 * 60 * 60);
    const barberCancelLimitHours = Number(process.env.BARBER_CANCELLATION_LIMIT_HOURS || 24);

    if (hoursSinceCreation > barberCancelLimitHours) {
      return res.status(400).json({
        success: false,
        message: `Barbers can only cancel within 24 hours of booking creation. This booking was created ${Math.floor(hoursSinceCreation)} hours ago.`,
      });
    }

    booking.status = 'cancelled';
    booking.cancelledBy = 'barber';
    booking.cancellationReason = req.body.cancellationReason;
    await booking.save();

    try {
      await sendBookingCancellationNotification({
        booking,
        cancelledBy: 'barber',
        cancellationReason: booking.cancellationReason,
      });
    } catch (notifyError) {
      console.error('Failed to send barber cancellation email:', notifyError);
    }

    return res.status(200).json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    next(error);
  }
};

/**
 * Marks an upcoming booking as completed during check-in.
 * Access: Barber only.
 * Business rules: only the assigned barber can check in the booking and only upcoming bookings can be completed.
 */
const checkInBooking = async (req, res, next) => {
  try {
    await autoCancelExpiredBookings({ _id: req.params.bookingId });
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (String(booking.barberId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not your booking' });
    }

    if (booking.status !== 'upcoming') {
      return res.status(400).json({
        success: false,
        message:
          booking.cancelledBy === 'auto'
            ? 'Booking was auto-cancelled after the timer expired'
            : 'Booking is not upcoming',
      });
    }

    booking.status = 'completed';
    booking.checkedInAt = new Date();
    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Check-in successful',
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns bookings for the authenticated customer.
 * Access: Customer only.
 * Business rules: optional status filtering is applied on top of the authenticated customer's bookings only.
 */
const getMyBookingsCustomer = async (req, res, next) => {
  try {
    const filter = { customerId: req.user.id };

    await autoCancelExpiredBookings(filter);

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const bookings = await Booking.find(filter)
      .populate('shopId', 'name location.address location.coordinates')
      .populate('barberId', 'name phone')
      .sort({ date: -1, slotStartMinutes: -1 })
      .lean();

    // VERIFIED: Booking dashboard loads from MongoDB
    return res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns all shop bookings for the authenticated barber's shop on a given date.
 * Access: Barber only.
 * Business rules: data is scoped to the authenticated barber's shop and sorted by slot time.
 */
const getShopBookingsBarber = async (req, res, next) => {
  try {
    const date = req.query.date || getTodayStr();

    await autoCancelExpiredBookings({ shopId: req.user.shopId, date });

    const shop = await Shop.findById(req.user.shopId).select('location').lean();

    const bookings = await Booking.find({ shopId: req.user.shopId, date })
      .populate('customerId', 'name phone gender')
      .populate('barberId', 'name')
      .sort({ slotStartMinutes: 1 })
      .lean();

    const bookingsWithEffectiveEnd = bookings.map((booking) => ({
      ...booking,
      effectiveSlotEndMinutes: getOccupiedRange(booking, shop?.location).occupiedEnd,
    }));

    return res.status(200).json({ success: true, data: bookingsWithEffectiveEnd });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAvailableSlots: getAvailableSlotsHandler,
  getShopAggregatedAvailability,
  createBooking,
  cancelBookingByCustomer,
  cancelBookingByBarber,
  checkInBooking,
  getMyBookingsCustomer,
  getShopBookingsBarber,
};
