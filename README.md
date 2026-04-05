# Barber Service Booking and Management System

A full-stack MERN application for managing barber shop bookings and services.

## Tech Stack
- **Frontend**: React (Vite)
- **Backend**: Node.js + Express
- **Database**: MongoDB (Mongoose)

## Project Structure

```
├── backend/               # Node.js + Express API
│   ├── controllers/       # Route controllers
│   ├── middleware/        # Custom middleware (auth, error handling)
│   ├── models/            # Mongoose schemas/models
│   ├── routes/            # API route definitions
│   ├── .env               # Environment variables
│   ├── .gitignore
│   ├── package.json
│   └── server.js          # Server entry point
│
└── frontend/              # React app (Vite)
    ├── public/
    ├── src/
    │   ├── assets/
    │   ├── App.jsx
    │   └── main.jsx
    ├── .env               # Frontend env (VITE_API_BASE_URL)
    ├── index.html
    └── package.json
```

## Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB (local or Atlas)

### Backend Setup

```bash
cd backend
npm install
# Update .env with your MongoDB URI and JWT secret
npm run dev    # starts on http://localhost:5000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev    # starts on http://localhost:5173
```

## Environment Variables

### Backend (`backend/.env`)
| Variable    | Description                        | Default                                      |
|-------------|------------------------------------|----------------------------------------------|
| PORT        | Server port                        | 5000                                         |
| MONGO_URI   | MongoDB connection string          | mongodb://localhost:27017/barber-booking     |
| JWT_SECRET  | Secret key for JWT signing         | your_super_secret_jwt_key_here               |
| NODE_ENV    | Environment (development/production)| development                                 |

### Frontend (`frontend/.env`)
| Variable           | Description               | Default                       |
|--------------------|---------------------------|-------------------------------|
| VITE_API_BASE_URL  | Backend API base URL      | http://localhost:5000/api     |
