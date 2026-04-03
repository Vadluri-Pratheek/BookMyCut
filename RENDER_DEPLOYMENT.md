# Render Deployment Guide for BookMyCut

## Overview
This guide will help you deploy the BookMyCut MERN application to Render.com. The deployment consists of two services:
1. **Backend API** - Node.js/Express server
2. **Frontend** - React/Vite static site

---

## Prerequisites
- GitHub account (repository pushed to GitHub)
- Render.com account
- MongoDB Atlas account (for cloud database)
- Email service credentials (Gmail or SendGrid)

---

## Step 1: Prepare MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user with username and password
4. Whitelist IP addresses (or allow all: 0.0.0.0/0 for testing)
5. Get your connection string:
   ```
   mongodb+srv://username:password@cluster-name.mongodb.net/bookmycut?retryWrites=true&w=majority
   ```

---

## Step 2: Set Up Email Service

### Option A: Gmail (Recommended for testing)
1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the generated 16-character password as `MAIL_PASS`

### Option B: SendGrid (Production recommended)
1. Create a SendGrid account
2. Create an API key
3. Use the API key as `MAIL_PASS`
4. Set `MAIL_USER` to `apikey`

---

## Step 3: Generate JWT Secret

Generate a strong JWT secret (use any online tool or run in terminal):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 4: Push to GitHub

Ensure your project is pushed to GitHub:
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

---

## Step 5: Create Services on Render

### 5A: Create Backend Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `bookmycut-backend`
   - **Environment**: `Node`
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Free (or Paid for production)

5. Add **Environment Variables** (click "Add Environment Variable"):
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `MONGO_URI` | Your MongoDB connection string |
   | `JWT_SECRET` | Your generated JWT secret |
   | `JWT_EXPIRES_IN` | `7d` |
   | `TRAVEL_BUFFER_BEFORE_MINS` | `30` |
   | `TRAVEL_BUFFER_AFTER_MINS` | `30` |
   | `PASSWORD_RESET_OTP_MINUTES` | `10` |
   | `MAIL_HOST` | `smtp.gmail.com` (or your email provider) |
   | `MAIL_PORT` | `587` |
   | `MAIL_SECURE` | `false` |
   | `MAIL_USER` | Your email address |
   | `MAIL_PASS` | Your app password or API key |
   | `MAIL_FROM` | `BookMyCut <noreply@yourdomain.com>` |

6. Click **Create Web Service**
7. Wait for it to deploy (3-5 minutes)
8. Note the URL: `https://bookmycut-backend.onrender.com`

### 5B: Create Frontend Static Site

1. Click **New +** → **Static Site**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `bookmycut-frontend`
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist`

4. Add **Environment Variable**:
   | Key | Value |
   |-----|-------|
   | `VITE_API_BASE_URL` | `https://bookmycut-backend.onrender.com/api` |

5. Click **Create Static Site**
6. Wait for deployment (2-3 minutes)
7. Note the URL: `https://bookmycut-frontend.onrender.com`

---

## Step 6: Update Frontend API Configuration

Make sure your frontend's API client uses the environment variable:

**File**: `frontend/src/api/client.js`
```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  // ... other config
});

export default client;
```

---

## Step 7: Update Backend CORS

Update your backend to accept requests from the frontend:

**File**: `backend/server.js`
```javascript
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

Add this to your `.env.example`:
```
FRONTEND_URL=https://bookmycut-frontend.onrender.com
```

---

## Step 8: Verify Deployment

1. Go to your frontend URL: `https://bookmycut-frontend.onrender.com`
2. Test login/register functionality
3. Check browser console for any API errors
4. Check Render logs for backend errors

---

## Troubleshooting

### Service won't start
- Check **Logs** in Render dashboard
- Verify environment variables are correctly set
- Ensure MongoDB connection string is correct

### API requests failing (CORS errors)
- Update `FRONTEND_URL` environment variable in backend
- Verify frontend `VITE_API_BASE_URL` is correct
- Check if backend service is running

### Database connection issues
- Verify MongoDB Atlas IP whitelist includes Render's IPs
- Check connection string format
- Test locally with the same connection string

### Build failures
- Check **Build Logs** in Render
- Verify `package.json` dependencies are correct
- Ensure build commands are correct

---

## Cost Considerations

- **Free Tier**: 
  - Instances spin down after 15 mins of inactivity
  - Limited to small projects
  - Full resource limits: 0.5 vCPU, 512 MB RAM

- **Upgrade to Paid** for production:
  - Persistent uptime
  - Auto-scaling
  - Custom domains

---

## Next Steps

1. Set up custom domain (if available)
2. Configure automated deployments on push
3. Set up monitoring and alerts
4. Implement proper error logging
5. Add backup strategy for MongoDB

---

## Useful Links
- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- [Environment Variables Guide](https://render.com/docs/environment-variables)
