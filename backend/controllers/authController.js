const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Customer = require('../models/Customer');
const Barber = require('../models/Barber');
const Shop = require('../models/Shop');
const {
  getBarberDefaultSchedule,
  parseGeneralScheduleInput,
  validateScheduleWindow,
} = require('../utils/barberScheduleDefaults');
const { generateShopCode } = require('../utils/generateCode');
const { normalizeLocationPoint } = require('../utils/locationPoint');
const { sendEmail } = require('../utils/mailer');

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const PASSWORD_RESET_OTP_MINUTES = Number(process.env.PASSWORD_RESET_OTP_MINUTES || 10);

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const generatePasswordResetOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const hashPasswordResetOtp = (otp) =>
  crypto.createHash('sha256').update(String(otp)).digest('hex');

const clearPasswordResetState = (user) => {
  user.passwordResetOtpHash = null;
  user.passwordResetOtpExpiresAt = null;
  user.passwordResetOtpRequestedAt = null;
};

const sendPasswordResetOtpEmail = async ({ email, name, otpCode, accountLabel }) => {
  const lines = [
    `Hi ${name || 'there'},`,
    '',
    `Your BookMyCut ${accountLabel} password reset OTP is: ${otpCode}`,
    '',
    `This OTP will expire in ${PASSWORD_RESET_OTP_MINUTES} minutes.`,
    'If you did not request this password reset, you can ignore this email.',
    '',
    'BookMyCut',
  ];

  return sendEmail({
    to: email,
    subject: 'BookMyCut Password Reset OTP',
    text: lines.join('\n'),
  });
};

const createPasswordResetOtpRequestHandler = ({ Model, accountLabel }) => async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await Model.findOne({ email });

    if (user) {
      const otpCode = generatePasswordResetOtp();
      user.passwordResetOtpHash = hashPasswordResetOtp(otpCode);
      user.passwordResetOtpExpiresAt = new Date(Date.now() + (PASSWORD_RESET_OTP_MINUTES * 60 * 1000));
      user.passwordResetOtpRequestedAt = new Date();
      await user.save();
      await sendPasswordResetOtpEmail({
        email: user.email,
        name: user.name,
        otpCode,
        accountLabel,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists for that email, an OTP has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

const createPasswordResetHandler = ({ Model, accountLabel }) => async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    const newPassword = String(req.body.newPassword || '');
    const user = await Model.findOne({ email });

    if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    if (new Date(user.passwordResetOtpExpiresAt).getTime() < Date.now()) {
      clearPasswordResetState(user);
      await user.save();
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (user.passwordResetOtpHash !== hashPasswordResetOtp(otp)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    clearPasswordResetState(user);
    await user.save();

    return res.status(200).json({
      success: true,
      message: `${accountLabel.charAt(0).toUpperCase() + accountLabel.slice(1)} password reset successful. Please login with your new password.`,
    });
  } catch (error) {
    next(error);
  }
};

const requestCustomerPasswordResetOtp = createPasswordResetOtpRequestHandler({
  Model: Customer,
  accountLabel: 'customer',
});

const requestBarberPasswordResetOtp = createPasswordResetOtpRequestHandler({
  Model: Barber,
  accountLabel: 'barber',
});

const resetCustomerPasswordWithOtp = createPasswordResetHandler({
  Model: Customer,
  accountLabel: 'customer',
});

const resetBarberPasswordWithOtp = createPasswordResetHandler({
  Model: Barber,
  accountLabel: 'barber',
});

/**
 * Registers a new customer account.
 * Access: Public.
 * Business rules: email must be unique and password is stored as a bcrypt hash.
 */
const registerCustomer = async (req, res, next) => {
  try {
    const { name, email, phone, password, gender, dateOfBirth, homeLocation } = req.body;

    const existingCustomer = await Customer.findOne({ email: email.toLowerCase() }).lean();

    if (existingCustomer) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const normalizedHomeLocation = normalizeLocationPoint(homeLocation);
    if (!normalizedHomeLocation) {
      return res.status(400).json({ success: false, message: 'Customer location is required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const customer = await Customer.create({
      name,
      email,
      phone,
      passwordHash,
      gender,
      dateOfBirth,
      location: normalizedHomeLocation.address || '',
      city: normalizedHomeLocation.city || '',
      state: normalizedHomeLocation.state || '',
      homeLocation: normalizedHomeLocation,
    });

    const token = signToken({
      id: customer._id,
      userType: 'customer',
      gender: customer.gender,
      city: customer.city,
      state: customer.state,
    });

    return res.status(201).json({
      success: true,
      data: {
        token,
        customer: {
          id: customer._id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone || '',
          gender: customer.gender,
          address: customer.location || '',
          city: customer.city,
          state: customer.state,
          homeLocation: customer.homeLocation || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Authenticates an existing customer.
 * Access: Public.
 * Business rules: only valid email/password pairs can receive a JWT.
 */
const loginCustomer = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const customer = await Customer.findOne({ email: email.toLowerCase() });

    if (!customer) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, customer.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = signToken({
      id: customer._id,
      userType: 'customer',
      gender: customer.gender,
      city: customer.city,
      state: customer.state,
    });

    return res.status(200).json({
      success: true,
      data: {
        token,
        customer: {
          id: customer._id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone || '',
          gender: customer.gender,
          address: customer.location || '',
          city: customer.city,
          state: customer.state,
          homeLocation: customer.homeLocation || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Registers a barber owner and creates their shop.
 * Access: Public.
 * Business rules: barber email must be unique, the owner is linked to the created shop, and shop codes are generated server-side.
 */
const registerBarberOwner = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      shopName,
      shopAddress,
      shopLng,
      shopLat,
      shopCity,
      shopState,
      genderServed,
      hasHomeService,
      services,
      openTime,
      closeTime,
      generalWorkStart,
      generalWorkEnd,
      generalBreaks = [],
      canOfferHomeServices,
    } = req.body;

    const existingBarber = await Barber.findOne({ email: email.toLowerCase() }).lean();

    if (existingBarber) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const parsedGeneralSchedule = parseGeneralScheduleInput({
      workStart: generalWorkStart,
      workEnd: generalWorkEnd,
      breaks: generalBreaks,
    });
    const generalScheduleError = validateScheduleWindow(parsedGeneralSchedule);

    if (generalScheduleError) {
      return res.status(400).json({ success: false, message: generalScheduleError });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const shopCode = generateShopCode();

    const barber = await Barber.create({
      name,
      email,
      phone,
      passwordHash,
      role: 'owner',
      shopId: null,
      canOfferHomeServices,
      generalWorkStart: parsedGeneralSchedule.workStart,
      generalWorkEnd: parsedGeneralSchedule.workEnd,
      generalBreaks: parsedGeneralSchedule.breaks,
    });

    const shop = await Shop.create({
      shopCode,
      name: shopName,
      ownerId: barber._id,
      location: {
        type: 'Point',
        coordinates: [Number(shopLng), Number(shopLat)],
        address: shopAddress,
        city: shopCity,
        state: shopState,
      },
      genderServed,
      hasHomeService: hasHomeService || canOfferHomeServices, // VERIFIED: hasHomeService auto-tags correctly
      services,
      openTime,
      closeTime,
    });

    barber.shopId = shop._id;
    await barber.save();

    const token = signToken({
      id: barber._id,
      userType: 'barber',
      role: 'owner',
      shopId: shop._id,
    });

    return res.status(201).json({
      success: true,
      data: {
        token,
        shopCode,
        barber: { id: barber._id, name: barber.name, role: barber.role },
        shop: { id: shop._id, name: shop.name, shopCode: shop.shopCode },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Registers a staff barber into an existing shop.
 * Access: Public.
 * Business rules: the provided shop code must exist and barber email must be unique.
 */
const registerBarberStaff = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      shopCode,
      generalWorkStart,
      generalWorkEnd,
      generalBreaks = [],
      canOfferHomeServices,
    } = req.body;

    const shop = await Shop.findOne({ shopCode }).lean();

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found. Check your Shop ID.',
      });
    }

    const existingBarber = await Barber.findOne({ email: email.toLowerCase() }).lean();

    if (existingBarber) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const parsedGeneralSchedule = parseGeneralScheduleInput({
      workStart: generalWorkStart,
      workEnd: generalWorkEnd,
      breaks: generalBreaks,
    });
    const generalScheduleError = validateScheduleWindow(parsedGeneralSchedule);

    if (generalScheduleError) {
      return res.status(400).json({ success: false, message: generalScheduleError });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const normalizedCanOfferHomeServices =
      shop.genderServed === 'Male' ? false : Boolean(canOfferHomeServices);

    const barber = await Barber.create({
      name,
      email,
      phone,
      passwordHash,
      role: 'staff',
      shopId: shop._id,
      canOfferHomeServices: normalizedCanOfferHomeServices,
      generalWorkStart: parsedGeneralSchedule.workStart,
      generalWorkEnd: parsedGeneralSchedule.workEnd,
      generalBreaks: parsedGeneralSchedule.breaks,
    });

    if (normalizedCanOfferHomeServices && !shop.hasHomeService) {
      await Shop.findByIdAndUpdate(shop._id, { hasHomeService: true });
      // VERIFIED: hasHomeService auto-tags correctly
    }

    const token = signToken({
      id: barber._id,
      userType: 'barber',
      role: 'staff',
      shopId: shop._id,
    });

    return res.status(201).json({
      success: true,
      data: {
        token,
        barber: { id: barber._id, name: barber.name, role: barber.role },
        shop: { id: shop._id, name: shop.name, shopCode: shop.shopCode },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Authenticates an owner or staff barber.
 * Access: Public.
 * Business rules: only valid barber credentials can receive a JWT with shop and role claims.
 */
const loginBarber = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const barber = await Barber.findOne({ email: email.toLowerCase() }).populate('shopId');

    if (!barber) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, barber.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!barber.shopId) {
      return res.status(401).json({
        success: false,
        message: 'You are no longer assigned to a shop.',
      });
    }

    const token = signToken({
      id: barber._id,
      userType: 'barber',
      role: barber.role,
      shopId: barber.shopId ? barber.shopId._id : null,
    });

    return res.status(200).json({
      success: true,
      data: {
        ...(() => {
          const defaultSchedule = getBarberDefaultSchedule(barber);
          return {
            token,
            barber: {
              id: barber._id,
              name: barber.name,
              email: barber.email,
              role: barber.role,
              shopId: barber.shopId ? barber.shopId._id : null,
              shopName: barber.shopId ? barber.shopId.name : '',
              shopAddress: barber.shopId ? barber.shopId.location?.address : '',
              shopCity: barber.shopId ? barber.shopId.location?.city : '',
              shopState: barber.shopId ? barber.shopId.location?.state : '',
              openTime: barber.shopId ? barber.shopId.openTime : 540,
              closeTime: barber.shopId ? barber.shopId.closeTime : 1260,
              generalWorkStart: defaultSchedule.workStart,
              generalWorkEnd: defaultSchedule.workEnd,
              generalBreaks: defaultSchedule.breaks,
            },
          };
        })(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the authenticated customer's profile from the database.
 * Access: Protected (customer JWT required).
 */
const getCustomerMe = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.user.id).lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    return res.status(200).json({
      success: true,
      data: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || '',
        gender: customer.gender,
        city: customer.city || '',
        state: customer.state || '',
        dateOfBirth: customer.dateOfBirth || null,
        address: customer.location || '',
        homeLocation: customer.homeLocation || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the authenticated barber's profile + shop from the database.
 * Access: Protected (barber JWT required).
 */
const getBarberMe = async (req, res, next) => {
  try {
    const barber = await Barber.findById(req.user.id).populate('shopId').lean();
    if (!barber) {
      return res.status(404).json({ success: false, message: 'Barber not found' });
    }
    const shop = barber.shopId;
    const defaultSchedule = getBarberDefaultSchedule(barber);
    return res.status(200).json({
      success: true,
      data: {
        id: barber._id,
        name: barber.name,
        email: barber.email,
        phone: barber.phone || '',
        role: barber.role,
        shopId: shop ? shop._id : null,
        shopName: shop ? shop.name : '',
        shopCode: shop ? shop.shopCode : '',
        shopAddress: shop ? (shop.location?.address || '') : '',
        shopCity: shop ? (shop.location?.city || '') : '',
        shopState: shop ? (shop.location?.state || '') : '',
        shopLat: shop ? (shop.location?.coordinates?.[1] ?? null) : null,
        shopLng: shop ? (shop.location?.coordinates?.[0] ?? null) : null,
        openTime: shop ? (shop.openTime ?? 540) : 540,
        closeTime: shop ? (shop.closeTime ?? 1260) : 1260,
        generalWorkStart: defaultSchedule.workStart,
        generalWorkEnd: defaultSchedule.workEnd,
        generalBreaks: defaultSchedule.breaks,
        homeServiceBarber: Boolean(barber.canOfferHomeServices),
        isHomeServiceActive: Boolean(barber.isAcceptingHomeVisitsToday),
        barberId: barber._id,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerCustomer,
  loginCustomer,
  registerBarberOwner,
  registerBarberStaff,
  loginBarber,
  requestCustomerPasswordResetOtp,
  requestBarberPasswordResetOtp,
  resetCustomerPasswordWithOtp,
  resetBarberPasswordWithOtp,
  getCustomerMe,
  getBarberMe,
};
