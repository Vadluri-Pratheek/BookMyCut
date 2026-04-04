const mongoose = require('mongoose');

const breakSchema = new mongoose.Schema(
  {
    breakStart: { type: Number, required: true },
    breakEnd: { type: Number, required: true },
    label: { type: String, default: 'Break', trim: true },
  },
  { _id: false }
);

const barberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    upiId: { type: String, default: '', trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    passwordResetOtpHash: { type: String, default: null },
    passwordResetOtpExpiresAt: { type: Date, default: null },
    passwordResetOtpRequestedAt: { type: Date, default: null },
    role: { type: String, enum: ['owner', 'staff'], required: true },
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

module.exports = mongoose.model('Barber', barberSchema);
