import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from '../models/user.model.js';
import Shop from '../models/shop.model.js';
import {
  getBarberDefaultSchedule,
  parseGeneralScheduleInput,
  validateScheduleWindow,
} from '../utils/barberScheduleDefaults.js';
import { generateShopCode } from '../utils/generateCode.js';
import { sendEmail } from '../utils/mailer.js';
import { normalizeUpiId } from '../utils/upi.js';

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const PASSWORD_RESET_OTP_MINUTES = Number(process.env.PASSWORD_RESET_OTP_MINUTES || 10);
const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const generatePasswordResetOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const hashPasswordResetOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const clearPasswordResetState = (user) => {
  user.passwordResetOtpHash = null;
  user.passwordResetOtpExpiresAt = null;
  user.passwordResetOtpRequestedAt = null;
};

const EMAIL_VERIFICATION_OTP_MINUTES = 15;
const generateEmailVerificationOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const hashEmailVerificationOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const sendEmailVerificationOtpEmail = async ({ email, name, otpCode }) => {
  const lines = [
    `Hi ${name || 'there'},`,
    '',
    `Welcome to BookMyCut! Your email verification OTP is: ${otpCode}`,
    '',
    `This OTP will expire in ${EMAIL_VERIFICATION_OTP_MINUTES} minutes.`,
    'If you did not sign up for this account, please ignore this email.',
    '',
    'BookMyCut',
  ];

  return sendEmail({
    to: email,
    subject: 'BookMyCut Email Verification OTP',
    text: lines.join('\n'),
  });
};

const sendPasswordResetOtpEmail = async ({ email, name, otpCode }) => {
  const lines = [
    `Hi ${name || 'there'},`,
    '',
    `Your BookMyCut password reset OTP is: ${otpCode}`,
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

export const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    const existingUser = await User.findOne({ email: normalizeEmail(email) }).lean();
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const otpCode = generateEmailVerificationOtp();
    const otpHash = hashEmailVerificationOtp(otpCode);

    const user = await User.create({
      name,
      email: normalizeEmail(email),
      phone,
      passwordHash,
      roles: [role],
      isEmailVerified: false,
      emailVerificationOtpHash: otpHash,
      emailVerificationExpiresAt: new Date(Date.now() + (EMAIL_VERIFICATION_OTP_MINUTES * 60 * 1000)),
    });

    await sendEmailVerificationOtpEmail({ email: user.email, name: user.name, otpCode });

    return res.status(201).json({
      success: true,
      message: 'Verification OTP sent to email. Please verify.',
      requireVerification: true,
      email: user.email,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: normalizeEmail(email) }).populate('shopId');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email address to login.' });
    }

    const token = signToken({
      id: user._id,
      roles: user.roles,
      shopId: user.shopId ? user.shopId._id : null,
    });

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          roles: user.roles,
          gender: user.gender,
          city: user.city,
          state: user.state,
          homeLocation: user.homeLocation,
          // Barber specific
          shopRole: user.shopRole,
          shopId: user.shopId ? user.shopId._id : null,
          shopName: user.shopId ? user.shopId.name : '',
          shopCode: user.shopId ? user.shopId.shopCode : '',
          upiId: user.upiId,
          generalWorkStart: user.generalWorkStart,
          generalWorkEnd: user.generalWorkEnd,
          generalBreaks: user.generalBreaks,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Email already verified' });
    }

    if (!user.emailVerificationOtpHash || !user.emailVerificationExpiresAt) {
      return res.status(400).json({ success: false, message: 'No pending verification' });
    }

    if (new Date(user.emailVerificationExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (user.emailVerificationOtpHash !== hashEmailVerificationOtp(otp)) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    user.isEmailVerified = true;
    user.emailVerificationOtpHash = null;
    user.emailVerificationExpiresAt = null;
    await user.save();

    const token = signToken({
      id: user._id,
      roles: user.roles,
      shopId: user.shopId ? user.shopId._id : null,
    });

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          roles: user.roles,
          gender: user.gender,
          city: user.city,
          state: user.state,
          homeLocation: user.homeLocation,
          // Barber specific
          shopRole: user.shopRole,
          shopId: user.shopId ? user.shopId._id : null,
          shopName: user.shopId ? user.shopId.name : '',
          shopCode: user.shopId ? user.shopId.shopCode : '',
          upiId: user.upiId,
          generalWorkStart: user.generalWorkStart,
          generalWorkEnd: user.generalWorkEnd,
          generalBreaks: user.generalBreaks,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const requestPasswordResetOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await User.findOne({ email });

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

export const resetPasswordWithOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    const newPassword = String(req.body.newPassword || '');
    const user = await User.findOne({ email });

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
      message: 'Password reset successful. Please login with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('shopId').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        roles: user.roles,
        gender: user.gender,
        city: user.city,
        state: user.state,
        homeLocation: user.homeLocation,
        // Barber specific
        shopRole: user.shopRole,
        shopId: user.shopId ? user.shopId._id : null,
        shopName: user.shopId ? user.shopId.name : '',
        shopCode: user.shopId ? user.shopId.shopCode : '',
        upiId: user.upiId,
        generalWorkStart: user.generalWorkStart,
        generalWorkEnd: user.generalWorkEnd,
        generalBreaks: user.generalBreaks,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const setupBarberOwner = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.shopId) {
      return res.status(400).json({ success: false, message: 'User already belongs to a shop' });
    }

    const {
      upiId, shopName, shopAddress, shopLng, shopLat, shopCity, shopState,
      genderServed, hasHomeService, services, openTime, closeTime,
      generalWorkStart, generalWorkEnd, generalBreaks = [], canOfferHomeServices
    } = req.body;

    const parsedGeneralSchedule = parseGeneralScheduleInput({
      workStart: generalWorkStart,
      workEnd: generalWorkEnd,
      breaks: generalBreaks,
    });
    const generalScheduleError = validateScheduleWindow(parsedGeneralSchedule);
    if (generalScheduleError) return res.status(400).json({ success: false, message: generalScheduleError });

    const shopCode = generateShopCode();

    const shop = await Shop.create({
      shopCode,
      name: shopName,
      ownerId: user._id,
      location: {
        type: 'Point',
        coordinates: [Number(shopLng), Number(shopLat)],
        address: shopAddress,
        city: shopCity,
        state: shopState,
      },
      genderServed,
      hasHomeService: hasHomeService || canOfferHomeServices,
      services,
      openTime,
      closeTime,
    });

    user.upiId = normalizeUpiId(upiId);
    user.shopRole = 'owner';
    user.shopId = shop._id;
    user.canOfferHomeServices = Boolean(canOfferHomeServices);
    user.generalWorkStart = parsedGeneralSchedule.workStart;
    user.generalWorkEnd = parsedGeneralSchedule.workEnd;
    user.generalBreaks = parsedGeneralSchedule.breaks;
    if (!user.roles.includes('barber')) user.roles.push('barber');
    
    await user.save();

    const token = signToken({
      id: user._id,
      roles: user.roles,
      shopId: shop._id,
    });

    return res.status(201).json({
      success: true,
      data: {
        token,
        shopCode,
        user: { id: user._id, name: user.name, roles: user.roles, upiId: user.upiId || '' },
        shop: { id: shop._id, name: shop.name, shopCode: shop.shopCode },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const setupBarberStaff = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.shopId) {
      return res.status(400).json({ success: false, message: 'User already belongs to a shop' });
    }

    const {
      upiId, shopCode, generalWorkStart, generalWorkEnd, generalBreaks = [], canOfferHomeServices
    } = req.body;

    const shop = await Shop.findOne({ shopCode }).lean();
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found. Check your Shop ID.' });
    }

    const parsedGeneralSchedule = parseGeneralScheduleInput({
      workStart: generalWorkStart,
      workEnd: generalWorkEnd,
      breaks: generalBreaks,
    });
    const generalScheduleError = validateScheduleWindow(parsedGeneralSchedule);
    if (generalScheduleError) return res.status(400).json({ success: false, message: generalScheduleError });

    const normalizedCanOfferHomeServices = shop.genderServed === 'Male' ? false : Boolean(canOfferHomeServices);

    if (normalizedCanOfferHomeServices && !shop.hasHomeService) {
      await Shop.findByIdAndUpdate(shop._id, { hasHomeService: true });
    }

    user.upiId = normalizeUpiId(upiId);
    user.shopRole = 'staff';
    user.shopId = shop._id;
    user.canOfferHomeServices = normalizedCanOfferHomeServices;
    user.generalWorkStart = parsedGeneralSchedule.workStart;
    user.generalWorkEnd = parsedGeneralSchedule.workEnd;
    user.generalBreaks = parsedGeneralSchedule.breaks;
    if (!user.roles.includes('barber')) user.roles.push('barber');
    
    await user.save();

    const token = signToken({
      id: user._id,
      roles: user.roles,
      shopId: shop._id,
    });

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user._id, name: user.name, roles: user.roles, upiId: user.upiId || '' },
        shop: { id: shop._id, name: shop.name, shopCode: shop.shopCode },
      },
    });
  } catch (error) {
    next(error);
  }
};
