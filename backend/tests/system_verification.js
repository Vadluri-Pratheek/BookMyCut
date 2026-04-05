const mongoose = require('mongoose');
require('dotenv').config();
const Barber = require('../models/Barber');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');
const { generateShopCode } = require('../utils/generateCode');

const runTests = async () => {
  try {
    console.log('--- Starting Functionality Audit Verification ---');
    
    // Connect to DB (using local/env mongo)
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/barber-shop-test');
    console.log('✅ Connected to Database');

    // Clean up test data
    await Barber.deleteMany({ email: /test-barber/ });
    await Shop.deleteMany({ name: /Test Shop/ });
    await Customer.deleteMany({ email: /test-customer/ });

    /* 1. Barber Shop Registration Persistence Verification */
    console.log('\n--- 1. Barber Shop Registration Persistence ---');
    const barberData = {
      name: 'Test Barber Owner',
      email: 'test-barber@example.com',
      phone: '9876543210',
      passwordHash: 'dummy-hash',
      role: 'owner',
    };
    const shopData = {
      shopCode: generateShopCode(),
      name: 'Test Shop Persistence Name',
      location: {
        type: 'Point',
        coordinates: [77.5946, 12.9716],
        address: '123, Test St, Bengaluru',
      },
      genderServed: 'Unisex',
      openTime: 540,
      closeTime: 1260,
    };

    const barber = await Barber.create(barberData);
    const shop = await Shop.create({ ...shopData, ownerId: barber._id });
    barber.shopId = shop._id;
    await barber.save();

    const fetchedShop = await Shop.findById(shop._id).lean();
    if (fetchedShop.name === 'Test Shop Persistence Name') {
      console.log('✅ Real shop name stored and correctly fetched from DB.');
    } else {
      throw new Error('❌ Shop name persistence failed!');
    }

    const fetchedBarber = await Barber.findById(barber._id).populate('shopId').lean();
    if (fetchedBarber.shopId.name === 'Test Shop Persistence Name') {
      console.log('✅ Barber profile correctly links to shop with real name.');
    } else {
      throw new Error('❌ Barber shop linkage failed!');
    }

    /* 2. Gender-based Filtering Verification */
    console.log('\n--- 2. Gender-based Customer-to-Shop Filtering ---');
    
    // Create shops with different gender services
    await Shop.create({
      shopCode: 'MALE01', name: 'Test Shop Male Only', ownerId: barber._id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      genderServed: 'Male', openTime: 540, closeTime: 1260
    });
    await Shop.create({
      shopCode: 'FEM001', name: 'Test Shop Female Only', ownerId: barber._id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      genderServed: 'Female', openTime: 540, closeTime: 1260
    });
    await Shop.create({
      shopCode: 'UNI001', name: 'Test Shop Unisex', ownerId: barber._id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      genderServed: 'Unisex', openTime: 540, closeTime: 1260
    });

    // Verify Male Customer Filtering (Query Level)
    const maleShops = await Shop.find({
      isActive: true,
      genderServed: { $in: ['Male', 'Unisex'] }
    }).lean();
    
    const hasFemaleOnly = maleShops.some(s => s.genderServed === 'Female');
    const hasMale = maleShops.some(s => s.genderServed === 'Male');
    const hasUnisex = maleShops.some(s => s.genderServed === 'Unisex');

    if (!hasFemaleOnly && hasMale && hasUnisex) {
      console.log('✅ Male customer query correctly excludes female-only shops and includes male/unisex.');
    } else {
      throw new Error('❌ Male filtering failed!');
    }

    // Verify Female Customer Filtering (Query Level)
    const femaleShops = await Shop.find({
      isActive: true,
      genderServed: { $in: ['Female', 'Unisex'] }
    }).lean();
    
    const hasMaleOnly = femaleShops.some(s => s.genderServed === 'Male');
    const hasFemale = femaleShops.some(s => s.genderServed === 'Female');
    const hasUnisexForFemale = femaleShops.some(s => s.genderServed === 'Unisex');

    if (!hasMaleOnly && hasFemale && hasUnisexForFemale) {
      console.log('✅ Female customer query correctly excludes male-only shops and includes female/unisex.');
    } else {
      throw new Error('❌ Female filtering failed!');
    }

    console.log('\n--- Verification Complete ---');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification Error:', error.message);
    process.exit(1);
  }
};

runTests();
