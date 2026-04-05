const mongoose = require('mongoose');
require('dotenv').config();

const Barber = require('./models/Barber');
const Shop = require('./models/Shop');
const DaySchedule = require('./models/DaySchedule');
const Booking = require('./models/Booking');
const { getShopAggregatedAvailability } = require('./controllers/bookingController');

async function debugAvailability() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const shopId = '69c8fb4a38dfb0aadfcbbdf2';
    const date = '2026-03-29';
    const serviceDuration = 40;

    // Check shop
    const shop = await Shop.findById(shopId).lean();
    console.log('Shop:', shop ? shop.name : 'Not found');

    // Check barbers
    const barbers = await Barber.find({ shopId, isActive: true }).lean();
    console.log(`Found ${barbers.length} barbers`);
    barbers.forEach(b => console.log(`- ${b.name} (${b._id})`));

    // Check schedules
    const schedules = await DaySchedule.find({ date }).lean();
    console.log(`Found ${schedules.length} schedules`);
    schedules.forEach(s => console.log(`- Barber ${s.barberId}: ${s.workStart}-${s.workEnd}, breaks: ${s.breaks.length}`));

    // Check bookings
    const bookings = await Booking.find({ date, status: 'upcoming' }).lean();
    console.log(`Found ${bookings.length} bookings`);

    // Simulate the API call
    const mockReq = {
      query: { shopId, date, serviceDuration, bookingType: 'inshop' }
    };
    
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`Response ${code}:`, JSON.stringify(data, null, 2));
          return data;
        }
      })
    };

    await getShopAggregatedAvailability(mockReq, mockRes, (error) => {
      if (error) {
        console.error('Error:', error);
      }
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugAvailability();
