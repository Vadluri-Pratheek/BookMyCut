# BookMyCut — Barber Shop Booking & Slot Management System

A full-stack MERN application for real-time barber shop appointment booking,
with conflict-free slot management and location-based shop discovery.

## Problem

Walk-in barber shop booking leads to double-bookings and long wait times.
BookMyCut lets customers book a specific time slot in advance, guarantees
that slot won't be double-booked even under concurrent requests, and helps
customers find nearby shops.

## Key Technical Features

- **Real-time slot locking** — each barber's dashboard shows a live timeline
  of time slots. When a customer books a slot, it's immediately locked on
  the barber's side and removed from the availability list shown to other
  customers, guaranteeing no two customers can ever book the same slot.
- **MongoDB transactions** — booking creation is wrapped in a transaction so
  a slot can never be double-booked even under simultaneous requests.
- **Geospatial search** — nearby-shop search using MongoDB geospatial queries
  with a Haversine-based distance buffer.
- **JWT authentication** — separate registration/login flows for customers,
  barber shop owners, and barber staff (staff join via a shop code).

## Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js, Express
- **Database:** MongoDB (Mongoose)
- **Auth:** JWT
- **Deployment:** Render (see `RENDER_DEPLOYMENT.md`)

## Project Structure

```
├── backend/               # Node.js + Express API
│   ├── controllers/       # Route controllers
│   ├── middleware/        # Auth, error handling
│   ├── models/            # Mongoose schemas
│   ├── routes/            # API route definitions
│   └── server.js          # Entry point
└── frontend/              # React app (Vite)
    ├── src/
    │   ├── App.jsx
    │   └── main.jsx
    └── index.html
```

## Setup & Usage

**Prerequisites:** Node.js v18+, MongoDB (local or Atlas)

```bash
git clone https://github.com/Vadluri-Pratheek/BookMyCut.git
cd BookMyCut
```

**Backend:**
```bash
cd backend
npm install
# update .env with your MongoDB URI and JWT secret
npm run dev    # http://localhost:5000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

## Screenshots
<img width="1747" height="881" alt="image" src="https://github.com/user-attachments/assets/4ca021d6-777e-400e-82f5-4ef734d0f386" /> 

<img width="1732" height="872" alt="image" src="https://github.com/user-attachments/assets/34fd66c3-9bd3-4f69-9175-cc86d3612236" />

<img width="1716" height="851" alt="image" src="https://github.com/user-attachments/assets/298d4f64-a849-4a21-8a98-3ba3d18b22d6" />




## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/customer/register` | Registers a new customer |
| POST | `/api/auth/customer/login` | Authenticates a customer and returns a JWT |
| GET | `/api/auth/customer/me` | Returns the logged-in customer's profile (protected) |
| POST | `/api/auth/barber/register/owner` | Registers a new barbershop owner and shop (services, hours, location, gender served) |
| POST | `/api/auth/barber/register/staff` | Registers barber staff under an existing shop via shop code |
| POST | `/api/auth/barber/login` | Authenticates a barber/owner and returns a JWT |
| GET | `/api/auth/barber/me` | Returns the logged-in barber's profile and shop (protected) |
| GET | `/api/shops/nearby` | Geospatial search for nearby shops |
| GET | `/api/bookings/available-slots` | Returns real-time available slots for a shop/date |
| POST | `/api/bookings` | Creates a booking inside a MongoDB transaction |


## What I'd Improve Next

- Booking the slot for a different person and at different location
- Add payment integration

## Author

Built as part of a three-person team — Vadluri Pratheek, Gurjigalla Akhilesh, Tera Sai Aswin Reddy.
NIT Warangal.
