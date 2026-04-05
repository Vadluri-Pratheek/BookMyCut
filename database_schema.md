# BookMyCut - Database Schema Design (MongoDB)

Based squarely on all the complex frontend workflows we've built—including the multi-barber aggregation arrays, the home service geolocation logic, and gender-specific routing—here is the perfect **Mongoose Database Schema** design to support your complete application. 

> [!NOTE]
> This schema is designed for a **NoSQL (MongoDB) / Mongoose Object Modeling** environment, commonly used with the Node.js/Express stack. It heavily utilizes geospatial indexing (`2dsphere`) to natively calculate "Shops Near Me" and handle Customer Pin Drops perfectly.

---

## 1. Shop Schema (`shops`)
This relies heavily on GeoJSON for the native map coordinates and embeds basic service menus.
```javascript
const mongoose = require('mongoose');

const ShopSchema = new mongoose.Schema({
  shopCode: { type: String, unique: true, required: true }, // e.g., "SHOP-2024-XYZ"
  name: { type: String, required: true },
  
  // Location Data utilizing MongoDB GeoJSON for powerful radius-based math
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
    address: { type: String, required: true }
  },
  
  // The Audience & Services offered
  genderServed: { type: String, enum: ['Male', 'Female', 'Unisex'], required: true },
  hasHomeService: { type: Boolean, default: false }, // Tagged 'true' at Owner Registration if Female/Unisex
  
  services: [{
    name: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    price: { type: Number, required: true },
    category: { type: String }
  }],
  
  // Timings (Stored in total minutes from midnight, e.g., 9:00 AM = 540)
  openTime: { type: Number, default: 540 },
  closeTime: { type: Number, default: 1260 },
  
  // Analytics
  rating: { type: Number, default: 5.0 },
  reviewsCount: { type: Number, default: 0 }
}, { timestamps: true });

ShopSchema.index({ location: '2dsphere' }); // Crucial for querying "Shops within 10km"
module.exports = mongoose.model('Shop', ShopSchema);
```

## 2. Barber/Staff Schema (`barbers`)
This represents both Shop Owners and joining Barbers.
```javascript
const mongoose = require('mongoose');

const BarberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true },
  
  role: { type: String, enum: ['owner', 'staff'], required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  
  // Dynamic Dashboard Statuses
  canOfferHomeServices: { type: Boolean, default: false }, // Only set to True if shop has HomeServices
  isAcceptingHomeVisitsToday: { type: Boolean, default: false }, // Represents the ON/OFF Toggle in the dashboard header
  
  // Profile Meta
  avatarColor: { type: String, default: '#0d9488' } // Hex color for UI representation
}, { timestamps: true });

module.exports = mongoose.model('Barber', BarberSchema);
```

## 3. Customer Schema (`customers`)
```javascript
const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true },
  
  // Registration data to filter which shops are displayed
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
}, { timestamps: true });

module.exports = mongoose.model('Customer', CustomerSchema);
```

## 4. Booking Schema (`bookings`)
The heart of the application. It captures exactly when, who, and *where* (if Home Visit).
```javascript
const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  bookingCode: { type: String, required: true, unique: true }, // e.g., "#4901" generated on insert
  
  // Relationships
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  barberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', required: true }, // Determined via Availability Engine
  
  // Time & Service
  serviceName: { type: String, required: true },
  serviceDuration: { type: Number, required: true }, // Snapshot in case shop changes durations later
  priceTotal: { type: Number, required: true },
  
  date: { type: String, required: true }, // "YYYY-MM-DD"
  slotTimeStr: { type: String, required: true }, // "09:00 AM" (For Display)
  slotStartMinutes: { type: Number, required: true }, // 540 (For Math)
  slotEndMinutes: { type: Number, required: true }, // 585 (Based on selected service)
  
  // Home Visit Payload
  isHomeVisit: { type: Boolean, default: false },
  homeLocation: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String }
  },
  
  // Lifecycle
  status: { type: String, enum: ['upcoming', 'completed', 'cancelled', 'no_show'], default: 'upcoming' },
}, { timestamps: true });

module.exports = mongoose.model('Booking', BookingSchema);
```

---

## 💡 Developer Action Plan for the Backend
1. **Initialize Mongoose**: Set up your backend MongoDB connection in `server.js`.
2. **Translate to Models**: Create a `models/` directory in your backend folder and save each schema to `Shop.js`, `Barber.js`, `Customer.js`, and `Booking.js`.
3. **The Booking Engine Logic**: In the route (`POST /api/bookings/available-slots`), you calculate availability by pulling all bookings for the requested `<shopId>` and `<date>`, filtering by `barberId`, and mapping out the gaps just as we prototyped on the frontend!
