const { minsToTimeStr } = require('./timeHelpers');
const { getEffectiveSlotEndMinutes } = require('./travelTime');

const hasOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

const getOccupiedRange = (booking, shopLocation) => {
  const occupiedStart = Number(booking.slotStartMinutes);
  const recomputedEnd = getEffectiveSlotEndMinutes({
    slotStartMinutes: booking.slotStartMinutes,
    serviceDuration: booking.serviceDuration,
    customerLocation: booking.homeLocation,
    shopLocation,
  });
  const fallbackEnd = Number(booking.slotEndMinutes);

  return {
    occupiedStart,
    occupiedEnd: Number.isFinite(recomputedEnd) ? recomputedEnd : fallbackEnd,
  };
};

const mergeIntervals = (intervals = []) => {
  const normalized = intervals
    .map((interval) => ({
      start: Number(interval.start),
      end: Number(interval.end),
    }))
    .filter((interval) => Number.isFinite(interval.start)
      && Number.isFinite(interval.end)
      && interval.end > interval.start)
    .sort((a, b) => (a.start - b.start) || (a.end - b.end));

  const merged = [];

  for (const interval of normalized) {
    const last = merged[merged.length - 1];

    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
      continue;
    }

    last.end = Math.max(last.end, interval.end);
  }

  return merged;
};

const buildFreeIntervals = ({ workStart, workEnd, occupiedIntervals = [] }) => {
  const start = Number(workStart);
  const end = Number(workEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }

  const occupied = mergeIntervals(
    occupiedIntervals
      .map((interval) => ({
        start: Math.max(Number(interval.start), start),
        end: Math.min(Number(interval.end), end),
      }))
      .filter((interval) => interval.end > interval.start)
  );

  const free = [];
  let cursor = start;

  for (const interval of occupied) {
    if (interval.start > cursor) {
      free.push({ start: cursor, end: interval.start });
    }

    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < end) {
    free.push({ start: cursor, end });
  }

  return free;
};

const doesSlotFitFreeIntervals = ({ freeIntervals = [], slotStart, duration }) => {
  const start = Number(slotStart);
  const serviceDuration = Number(duration);

  return freeIntervals.some((interval) =>
    start >= interval.start && (start + serviceDuration) <= interval.end);
};

const getAvailableSlots = ({
  workStart,
  workEnd,
  breaks = [],
  existingBookings = [],
  serviceDuration,
  customerLocation,
  shopLocation,
}) => {
  const slots = [];
  const duration = Number(serviceDuration);
  const workStartMins = Number(workStart);
  const workEndMins = Number(workEnd);

  for (let start = workStartMins; start <= workEndMins - duration; start += duration) {
    const end = getEffectiveSlotEndMinutes({
      slotStartMinutes: start,
      serviceDuration: duration,
      customerLocation,
      shopLocation,
    });

    const overlapsBreak = breaks.some((item) =>
      hasOverlap(start, end, Number(item.breakStart), Number(item.breakEnd)));

    if (overlapsBreak || end > workEndMins) {
      continue;
    }

    const conflictsExisting = existingBookings.some((booking) => {
      const { occupiedStart, occupiedEnd } = getOccupiedRange(booking, shopLocation);
      return hasOverlap(start, end, occupiedStart, occupiedEnd);
    });

    if (conflictsExisting) {
      continue;
    }

    slots.push({
      slotTimeStr: minsToTimeStr(start),
      slotStartMinutes: start,
      slotEndMinutes: end,
      status: 'available',
    });
  }

  return slots;
};

module.exports = {
  getAvailableSlots,
  hasOverlap,
  getOccupiedRange,
  mergeIntervals,
  buildFreeIntervals,
  doesSlotFitFreeIntervals,
};
