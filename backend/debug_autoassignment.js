const mongoose = require('mongoose');
require('dotenv').config();

const Barber = require('./models/Barber');
const Shop = require('./models/Shop');
const Booking = require('./models/Booking');
const DaySchedule = require('./models/DaySchedule');

async function debugAutoAssignment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const shopId = '69c8fb4a38dfb0aadfcbbdf2';
    const date = '2026-03-29';
    const slotStart = 700;
    const slotEnd = 740;
    const bookingType = 'inshop';

    // Get barbers
    const barbers = await Barber.find({ shopId });
    console.log(`Found ${barbers.length} barbers:`);
    
    for (const barber of barbers) {
      const existingBookings = await Booking.find({ barberId: barber._id, date, status: 'upcoming' });
      console.log(`- ${barber.name}: ${existingBookings.length} bookings`);
      existingBookings.forEach(b => console.log(`  * ${b.slotStartMinutes}-${b.slotEndMinutes}`));
    }

    // Check schedules
    console.log('\nChecking schedules:');
    for (const barber of barbers) {
      const schedule = await DaySchedule.findOne({ barberId: barber._id, date });
      if (schedule) {
        console.log(`- ${barber.name}: work ${schedule.workStart}-${schedule.workEnd}, breaks: ${schedule.breaks.length}`);
        
        // Check if slot is within work hours
        const withinWorkHours = slotStart >= schedule.workStart && slotEnd <= schedule.workEnd;
        console.log(`  Slot ${slotStart}-${slotEnd} within work hours: ${withinWorkHours}`);
        
        // Check break overlap
        const breakOverlap = schedule.breaks.some(b => 
          slotStart < b.breakEnd && slotEnd > b.breakStart
        );
        console.log(`  Slot overlaps break: ${breakOverlap}`);
      } else {
        console.log(`- ${barber.name}: No schedule`);
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugAutoAssignment();
