export const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getLocalDateWithOffset = (offset = 0, baseDate = new Date()) => {
  const date = new Date(baseDate);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
};

export const getLocalDateFromStr = (dateStr) => {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
};

export const getLocalDateStr = (offset = 0, baseDate = new Date()) =>
  formatLocalDate(getLocalDateWithOffset(offset, baseDate));

export const isTuesdayDateStr = (dateStr) => getLocalDateFromStr(dateStr).getDay() === 2;
