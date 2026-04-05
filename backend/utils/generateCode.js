const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const randomCode = (length) => {
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }

  return code;
};

const generateShopCode = () => `SC${randomCode(6)}`;

const generateBookingCode = () => `BK${randomCode(8)}`;

module.exports = {
  generateShopCode,
  generateBookingCode,
};
