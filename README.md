# BookMyCut — Barber Shop Booking & Slot Management System

A full-stack MERN application for real-time barber shop appointment booking,
with conflict-free slot management and location-based shop discovery.

## Problem

Walk-in barber shop booking leads to double-bookings and long wait times.
BookMyCut lets customers book a specific time slot in advance, guarantees
that slot won't be double-booked even under concurrent requests, and helps
customers find nearby shops.

## Key Technical Features

- **Interval-merging slot algorithm** — computes real-time available slots
  by merging existing bookings and shop working hours, so no two customers
  can be shown (or book) a conflicting time. *(Describe your actual algorithm
  here in 2-3 sentences — this is your strongest differentiator and it's
  currently invisible to anyone reading the repo.)*
- **MongoDB transactions** — booking creation is wrapped in a transaction so
  a slot can never be double-booked even under simultaneous requests.
- **Geospatial search** — nearby-shop search using MongoDB geospatial queries
  with a Haversine-based distance buffer.
- **JWT authentication** — secured customer/shop-owner auth flow.

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

## Live Demo

[FILL IN — link to your Render deployment. If it's deployed, this is a
five-second win: recruiters can click and see a working product instead
of reading code.]

## Screenshots

[FILL IN — 2-3 screenshots: homepage, booking flow, shop-owner dashboard.
A README with screenshots gets read; a README without them gets skipped.]

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | [FILL IN] |
| POST | `/api/auth/login` | [FILL IN] |
| GET | `/api/shops/nearby` | Geospatial search for nearby shops |
| GET | `/api/bookings/available-slots` | Returns merged available slots for a shop/date |
| POST | `/api/bookings` | Creates a booking inside a MongoDB transaction |

*(Fill this table in from your actual `routes/` files — even a partial table
massively increases perceived engineering maturity.)*

## What I'd Improve Next

- [Booking the slot for a different person and at different location]
- [Add payment integration]

## Author

Built as part of a three-person team — Vadluri Pratheek,Gurjigalla Akhilesh,Tera Sai Aswin Reddy
NIT Warangal.
