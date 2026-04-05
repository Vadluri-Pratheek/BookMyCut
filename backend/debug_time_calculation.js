const mongoose = require('mongoose');
require('dotenv').config();

const Booking = require('./models/Booking');
const { minutesUntilSlot } = require('./utils/timeHelpers');

async function debugTimeCalculation() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Get the booking we created
    const booking = await Booking.findById('69c900f6a1966662f36c578f');
    if (!booking) {
      console.log('Booking not found');
      return;
    }

    console.log(`Booking: ${booking.bookingCode}`);
    console.log(`Date: ${booking.date}`);
    console.log(`Slot start: ${booking.slotStartMinutes}`);
    console.log(`Slot time: ${booking.slotTimeStr}`);

    // Calculate minutes until slot
    const minutes = minutesUntilSlot(booking.date, booking.slotStartMinutes);
    console.log(`Minutes until slot: ${minutes}`);
    console.log(`Hours until slot: ${minutes / 60}`);

    // Get current time for comparison
    const now = new Date();
    console.log(`Current time: ${now.toLocaleString()}`);
    console.log(`Current minutes from midnight: ${now.getHours() * 60 + now.getMinutes()}`);

    // Calculate expected manually
    const slotDateTime = new Date();
    slotDateTime.setHours(0, 0, 0, 0);
    slotDateTime.setMinutes(booking.slotStartMinutes);
    
    const diffMs = slotDateTime.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    console.log(`Manual calculation: ${diffMinutes} minutes`);
    console.log(`Manual calculation: ${diffMinutes / 60} hours`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugTimeCalculation();
