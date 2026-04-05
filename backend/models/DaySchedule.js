const mongoose = require('mongoose');

const breakSchema = new mongoose.Schema(
  {
    breakStart: { type: Number, required: true },
    breakEnd: { type: Number, required: true },
    label: { type: String, default: 'Break', trim: true },
  },
  { _id: false }
);

const dayScheduleSchema = new mongoose.Schema(
  {
    barberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    date: { type: String, required: true },
    workStart: { type: Number, required: true },
    workEnd: { type: Number, required: true },
    breaks: { type: [breakSchema], default: [] },
    isHomeServiceDay: { type: Boolean, default: false },
  },
  { timestamps: true }
);

dayScheduleSchema.index({ barberId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DaySchedule', dayScheduleSchema);
