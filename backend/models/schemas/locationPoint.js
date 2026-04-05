const mongoose = require('mongoose');

const locationPointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    accuracy: { type: Number, min: 0 },
    source: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

module.exports = locationPointSchema;
