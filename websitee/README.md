# CAMU Attendance Management System

A React-based attendance management system for CAMU (Chandigarh University) with QR code scanning capabilities.

## Features

- User authentication with CAMU credentials
- QR code scanning for attendance
- Multi-user attendance management
- Real-time attendance marking
- Responsive design

## Local Development

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup

1. **Install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Start development servers:**
   ```bash
   npm run dev
   ```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## Deployment to Vercel

### Method 1: Using Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```

### Method 2: Using Vercel Dashboard

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Sign up/Login with your GitHub account
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will automatically detect the configuration

3. **Deploy:**
   - Vercel will automatically build and deploy your application
   - The frontend will be served from the root domain
   - The backend API will be available at `/api/*` endpoints

### Environment Variables (Optional)

If you need to set environment variables:

1. **In Vercel Dashboard:**
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add any required variables

2. **Using Vercel CLI:**
   ```bash
   vercel env add VARIABLE_NAME
   ```

## API Endpoints

- `POST /api/login` - User authentication
- `POST /api/get-cookie` - Get session cookie
- `POST /api/mark-attendance` - Mark attendance

## Project Structure

```
websitee/
├── frontend/          # React application
├── backend/           # Node.js Express server
├── vercel.json        # Vercel configuration
└── package.json       # Root package.json
```

## Notes

- The application uses a monorepo structure
- Frontend is built as a static site
- Backend runs as serverless functions on Vercel
- All API calls are automatically routed to `/api/*` endpoints 