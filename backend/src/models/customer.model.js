import mongoose from 'mongoose';
import locationPointSchema from './schemas/locationPoint.js';

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    passwordResetOtpHash: { type: String, default: null },
    passwordResetOtpExpiresAt: { type: Date, default: null },
    passwordResetOtpRequestedAt: { type: Date, default: null },
    gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'], required: true },
    dateOfBirth: { type: Date },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    location: { type: String },
    homeLocation: { type: locationPointSchema, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);

