const Booking = require('../models/Booking');
const { getTodayStr } = require('./timeHelpers');
const { sendBookingCancellationNotification } = require('./bookingNotifications');

const CURRENT_CUSTOMER_BUFFER_SECONDS = Number(process.env.CURRENT_CUSTOMER_BUFFER_SECONDS || 60);
const AUTO_CANCEL_BUFFER_SECONDS = Number(process.env.AUTO_CANCEL_BUFFER_SECONDS || 60);
const TOTAL_AUTO_CANCEL_SECONDS = CURRENT_CUSTOMER_BUFFER_SECONDS + AUTO_CANCEL_BUFFER_SECONDS;

const getBookingStartDateTime = (booking) => {
  if (!booking?.date || booking?.slotStartMinutes == null) {
    return null;
  }

  const [year, month, day] = String(booking.date).split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const startDateTime = new Date(year, month - 1, day);
  startDateTime.setHours(0, 0, 0, 0);
  startDateTime.setMinutes(Number(booking.slotStartMinutes));
  return startDateTime;
};

const getBookingAutoCancelTime = (booking) => {
  const startDateTime = getBookingStartDateTime(booking);
  if (!startDateTime) {
    return null;
  }

  return new Date(startDateTime.getTime() + (TOTAL_AUTO_CANCEL_SECONDS * 1000));
};

const shouldAutoCancelBooking = (booking, referenceTime = new Date()) => {
  if (!booking || booking.status !== 'upcoming' || booking.checkedInAt) {
    return false;
  }

  const autoCancelTime = getBookingAutoCancelTime(booking);
  if (!autoCancelTime) {
    return false;
  }

  return referenceTime.getTime() >= autoCancelTime.getTime();
};

const buildExpiryScopedFilter = (baseFilter = {}) => {
  const filter = { ...baseFilter, status: 'upcoming' };
  const today = getTodayStr();

  if (typeof filter.date === 'string') {
    if (filter.date > today) {
      return null;
    }

    return filter;
  }

  if (!filter.date) {
    filter.date = { $lte: today };
    return filter;
  }

  filter.date = {
    ...filter.date,
    $lte: today,
  };

  return filter;
};

const autoCancelExpiredBookings = async (baseFilter = {}, referenceTime = new Date()) => {
  const filter = buildExpiryScopedFilter(baseFilter);

  if (!filter) {
    return 0;
  }

  const candidates = await Booking.find(filter)
    .select('_id customerId barberId shopId serviceName date slotTimeStr slotStartMinutes bookingType status checkedInAt')
    .lean();

  const staleBookings = candidates
    .filter((booking) => shouldAutoCancelBooking(booking, referenceTime));

  const staleIds = staleBookings.map((booking) => booking._id);

  if (staleIds.length === 0) {
    return 0;
  }

  const result = await Booking.updateMany(
    { _id: { $in: staleIds }, status: 'upcoming' },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'auto',
        cancellationReason: 'Auto-cancelled after the current customer timer expired',
      },
    }
  );

  const updatedAutoCancelledBookings = await Booking.find({
    _id: { $in: staleIds },
    status: 'cancelled',
    cancelledBy: 'auto',
  })
    .select('_id customerId barberId shopId serviceName date slotTimeStr bookingType')
    .lean();

  await Promise.allSettled(
    updatedAutoCancelledBookings.map((booking) =>
      sendBookingCancellationNotification({
        booking,
        cancelledBy: 'auto',
        cancellationReason: 'Auto-cancelled after the current customer timer expired',
      }))
  );

  return result.modifiedCount || 0;
};

module.exports = {
  CURRENT_CUSTOMER_BUFFER_SECONDS,
  AUTO_CANCEL_BUFFER_SECONDS,
  TOTAL_AUTO_CANCEL_SECONDS,
  getBookingStartDateTime,
  getBookingAutoCancelTime,
  shouldAutoCancelBooking,
  autoCancelExpiredBookings,
};
