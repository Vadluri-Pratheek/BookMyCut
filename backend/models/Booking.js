const mongoose = require('mongoose');
const locationPointSchema = require('./schemas/locationPoint');

const selectedServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true },
    price: { type: Number, required: true },
    category: { type: String, trim: true },
    genderSpecific: {
      type: String,
      enum: ['Male', 'Female', 'Unisex'],
      default: 'Unisex',
    },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingCode: { type: String, unique: true, required: true },
    verificationCode: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    barberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', required: true },
    serviceName: { type: String, required: true, trim: true },
    selectedServices: { type: [selectedServiceSchema], default: [] },
    serviceDuration: { type: Number, required: true },
    priceTotal: { type: Number, required: true },
    date: { type: String, required: true },
    slotTimeStr: { type: String, required: true },
    slotStartMinutes: { type: Number, required: true },
    slotEndMinutes: { type: Number, required: true },
    bookingType: { type: String, enum: ['inshop', 'homevisit'], default: 'inshop' },
    homeLocation: { type: locationPointSchema, default: null },
    travelBufferStart: { type: Number },
    travelBufferEnd: { type: Number },
    status: {
      type: String,
      enum: ['upcoming', 'completed', 'cancelled', 'no_show'],
      default: 'upcoming',
    },
    cancelledBy: { type: String, enum: ['customer', 'barber', 'auto'] },
    cancellationReason: { type: String, trim: true },
    checkedInAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ barberId: 1, date: 1 });
bookingSchema.index({ customerId: 1, status: 1 });
bookingSchema.index({ shopId: 1, date: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
