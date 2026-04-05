const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
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

const shopSchema = new mongoose.Schema(
  {
    shopCode: { type: String, unique: true, required: true },
    name: { type: String, required: true, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', required: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (value) => Array.isArray(value) && value.length === 2,
          message: 'Location coordinates must include longitude and latitude',
        },
      },
      address: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
    },
    genderServed: { type: String, enum: ['Male', 'Female', 'Unisex'], required: true },
    hasHomeService: { type: Boolean, default: false },
    services: { type: [serviceSchema], default: [] },
    openTime: { type: Number, required: true },
    closeTime: { type: Number, required: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

shopSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Shop', shopSchema);
