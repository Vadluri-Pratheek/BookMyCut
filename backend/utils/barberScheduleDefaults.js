const DEFAULT_GENERAL_WORK_START = 540;
const DEFAULT_GENERAL_WORK_END = 1260;

const normalizeBreaks = (breaks = []) =>
  breaks
    .map((item) => ({
      breakStart: Number(item.breakStart),
      breakEnd: Number(item.breakEnd),
      label: item.label ? String(item.label).trim() : 'Break',
    }))
    .filter((item) => Number.isFinite(item.breakStart) && Number.isFinite(item.breakEnd))
    .sort((a, b) => a.breakStart - b.breakStart);

const parseGeneralScheduleInput = ({
  workStart,
  workEnd,
  breaks = [],
} = {}) => ({
  workStart: workStart == null ? DEFAULT_GENERAL_WORK_START : Number(workStart),
  workEnd: workEnd == null ? DEFAULT_GENERAL_WORK_END : Number(workEnd),
  breaks: normalizeBreaks(breaks),
});

const validateScheduleWindow = ({ workStart, workEnd, breaks = [] }) => {
  if (!Number.isInteger(workStart) || !Number.isInteger(workEnd)) {
    return 'General working hours must use valid times';
  }

  if (workStart < 0 || workStart > 1439 || workEnd < 1 || workEnd > 1440) {
    return 'General working hours must be within the day';
  }

  if (workStart >= workEnd) {
    return 'General work start must be before general work end';
  }

  const invalidBreak = breaks.some((item) =>
    item.breakStart < workStart
    || item.breakEnd > workEnd
    || item.breakStart >= item.breakEnd
  );

  if (invalidBreak) {
    return 'General break times must fall within working hours';
  }

  const hasOverlap = breaks.some((item, index) =>
    index > 0 && item.breakStart < breaks[index - 1].breakEnd
  );

  if (hasOverlap) {
    return 'General break times cannot overlap';
  }

  return null;
};

const getBarberDefaultSchedule = (barber = {}) =>
  parseGeneralScheduleInput({
    workStart: barber.generalWorkStart,
    workEnd: barber.generalWorkEnd,
    breaks: barber.generalBreaks,
  });

module.exports = {
  DEFAULT_GENERAL_WORK_START,
  DEFAULT_GENERAL_WORK_END,
  normalizeBreaks,
  parseGeneralScheduleInput,
  validateScheduleWindow,
  getBarberDefaultSchedule,
};
