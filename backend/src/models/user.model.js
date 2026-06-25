import mongoose from 'mongoose';
import locationPointSchema from './schemas/locationPoint.js';

const breakSchema = new mongoose.Schema(
  {
    breakStart: { type: Number, required: true },
    breakEnd: { type: Number, required: true },
    label: { type: String, default: 'Break', trim: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    // Common Fields
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    passwordResetOtpHash: { type: String, default: null },
    passwordResetOtpExpiresAt: { type: Date, default: null },
    passwordResetOtpRequestedAt: { type: Date, default: null },

    // Email Verification fields
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationOtpHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },
    
    // Role definitions
    roles: [{ type: String, enum: ['customer', 'barber'], required: true }],

    // Customer specific fields
    gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'] },
    dateOfBirth: { type: Date },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    location: { type: String },
    homeLocation: { type: locationPointSchema, default: null },

    // Barber specific fields
    upiId: { type: String, default: '', trim: true, lowercase: true },
    shopRole: { type: String, enum: ['owner', 'staff'] }, // previously 'role' in Barber
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    canOfferHomeServices: { type: Boolean, default: false },
    isAcceptingHomeVisitsToday: { type: Boolean, default: false },
    isAvailableToday: { type: Boolean, default: false },
    generalWorkStart: { type: Number, default: 540 },
    generalWorkEnd: { type: Number, default: 1260 },
    generalBreaks: { type: [breakSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
