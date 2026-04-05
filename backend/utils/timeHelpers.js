const formatDateParts = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getLocalDateFromStr = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const isTuesdayDateStr = (dateStr) => getLocalDateFromStr(dateStr).getDay() === 2;

const minsToTimeStr = (mins) => {
  const totalMinutes = Number(mins);
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const timeStrToMins = (str) => {
  const value = String(str).trim();
  const match = value.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);

  if (!match) {
    throw new Error('Invalid time string format');
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3].toUpperCase();

  if (suffix === 'PM' && hours !== 12) {
    hours += 12;
  }

  if (suffix === 'AM' && hours === 12) {
    hours = 0;
  }

  return (hours * 60) + minutes;
};

const getTodayStr = () => formatDateParts(new Date());

const addDaysToDateStr = (dateStr, days) => {
  const date = getLocalDateFromStr(dateStr);
  date.setDate(date.getDate() + Number(days));
  return formatDateParts(date);
};

const getMaxBookingDateStr = () => addDaysToDateStr(getTodayStr(), 3);

const isWithinBookingWindow = (dateStr) => {
  const today = getTodayStr();
  const maxDate = getMaxBookingDateStr();

  return dateStr >= today && dateStr <= maxDate;
};

const minutesUntilSlot = (dateStr, slotStartMinutes) => {
  const slotDate = getLocalDateFromStr(dateStr);
  const slotDateTime = new Date(slotDate);
  slotDateTime.setHours(0, 0, 0, 0);
  slotDateTime.setMinutes(Number(slotStartMinutes));

  return Math.round((slotDateTime.getTime() - Date.now()) / (1000 * 60));
};

module.exports = {
  minsToTimeStr,
  timeStrToMins,
  getTodayStr,
  getMaxBookingDateStr,
  isWithinBookingWindow,
  isTuesdayDateStr,
  minutesUntilSlot,
  addDaysToDateStr,
};
