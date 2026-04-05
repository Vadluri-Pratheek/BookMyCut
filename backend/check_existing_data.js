const mongoose = require('mongoose');
require('dotenv').config();

const Customer = require('./models/Customer');
const Shop = require('./models/Shop');
const Barber = require('./models/Barber');

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Check customers
    const customers = await Customer.find({});
    console.log(`Found ${customers.length} customers:`);
    customers.forEach(c => console.log(`- ${c.name} (${c.email}) - ${c.gender}`));

    // Check shops
    const shops = await Shop.find({});
    console.log(`\nFound ${shops.length} shops:`);
    shops.forEach(s => console.log(`- ${s.name} (${s.shopCode}) - Home Service: ${s.hasHomeService}`));

    // Check barbers
    const barbers = await Barber.find({});
    console.log(`\nFound ${barbers.length} barbers:`);
    barbers.forEach(b => console.log(`- ${b.name} (${b.email}) - ${b.role} - Home: ${b.canOfferHomeServices}`));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkData();
