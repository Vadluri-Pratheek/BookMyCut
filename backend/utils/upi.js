const UPI_ID_REGEX = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/;

const normalizeUpiId = (value = '') => String(value).trim().toLowerCase();

const isValidUpiId = (value = '') => UPI_ID_REGEX.test(normalizeUpiId(value));

module.exports = {
  UPI_ID_REGEX,
  normalizeUpiId,
  isValidUpiId,
};
