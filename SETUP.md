# ProxCam Setup Guide

## Quick Start

### Prerequisites
- Node.js 16+ installed
- npm or yarn package manager
- Git
- Supabase account (free tier works)

### 1. Clone and Setup
```bash
git clone https://github.com/Jkamisama/proxy.git
cd proxy
cd websitee
npm run setup
```

### 2. Configure Environment
1. Create a Supabase project at https://supabase.com
2. Get your project URL and anon key
3. Update `websitee/backend/.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
PORT=3001
```

### 3. Create Database Table
Run this SQL in your Supabase SQL editor:
```sql
CREATE TABLE attendance_records (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  stu_id VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add RLS policies if needed
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (adjust based on your security needs)
CREATE POLICY "Allow all operations" ON attendance_records FOR ALL USING (true);
```

### 4. Start Development Server
```bash
npm run dev
```

This will start:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Features

### Enhanced 20+ User Support
- **Batch Processing**: Server-side batch attendance marking
- **Rate Limiting**: Prevents server overload
- **Fallback System**: Automatic fallback to individual processing
- **Progress Tracking**: Real-time progress updates
- **Error Handling**: Comprehensive error handling and retry logic

### Performance Optimizations
- Connection pooling with keep-alive
- Request queuing and batching
- Exponential backoff retry mechanism
- Concurrent processing with rate limiting

## Usage

### Adding Users
1. Tap the date "05-Aug-2025" 10 times to reveal "Add User" button
2. Enter CAMU email and password
3. User data is encrypted and stored in Supabase

### Marking Attendance
1. Click "Record Attendance" on the active class
2. Scan QR code with camera
3. System automatically processes all users:
   - **5+ users**: Uses batch processing API
   - **<5 users**: Uses individual processing for speed

### Processing Methods

#### Batch Processing (Recommended for 5+ users)
- Processes all users server-side
- Rate limited to 3 concurrent requests
- 500ms delay between batches
- Automatic retry with exponential backoff

#### Individual Processing (For <5 users)
- Client-side processing
- Batched in groups of 3
- Better for small groups

## API Endpoints

### New Endpoints
- `POST /api/mark-attendance-batch` - Batch attendance marking
- `GET /api/users-and-cookies` - Get users with fresh cookies
- `POST /api/prewarm-cookies` - Preload cookies for faster processing

### Legacy Endpoints (Still Supported)
- `POST /api/login` - User authentication
- `POST /api/get-cookie` - Get session cookie
- `POST /api/mark-attendance` - Individual attendance marking

## Configuration

### Backend Configuration (`websitee/backend/.env`)
```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key

# Performance Tuning
MAX_CONCURRENT_REQUESTS=3    # Concurrent requests to CAMU
BATCH_DELAY_MS=500          # Delay between batches
REQUEST_TIMEOUT_MS=8000     # Request timeout

# Server
PORT=3001
NODE_ENV=development
```

### Frontend Configuration
The frontend automatically detects user count and chooses the optimal processing method:
- **Batch mode**: 5+ users (more efficient)
- **Individual mode**: <5 users (faster for small groups)

## Troubleshooting

### Common Issues

#### 1. "No users loaded" Error
- Ensure Supabase is configured correctly
- Check database table exists
- Verify environment variables

#### 2. "Cookies not loaded" Error
- Wait a moment after adding users
- Check network connectivity
- Verify CAMU credentials are correct

#### 3. Attendance Marking Fails
- Check CAMU server status
- Verify QR code is valid and not expired
- Ensure users have valid session cookies

#### 4. Performance Issues with Many Users
- Use batch processing (automatic for 5+ users)
- Check server resources
- Monitor network connectivity

### Performance Tuning

#### For 20+ Users
1. **Increase batch size** (backend):
```javascript
const batchSize = 5; // Increase from 3 to 5
```

2. **Reduce delays** (if server can handle it):
```javascript
const delayBetweenBatches = 300; // Reduce from 500ms
```

3. **Increase concurrent requests**:
```env
MAX_CONCURRENT_REQUESTS=5
```

#### For 50+ Users
Consider implementing:
- WebSocket for real-time updates
- Database connection pooling
- Redis for session caching
- Load balancing

## Deployment

### Vercel Deployment
```bash
npm install -g vercel
vercel login
vercel
```

### Environment Variables in Vercel
Add these in your Vercel dashboard:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NODE_ENV=production`

## Security Notes

1. **Password Encryption**: Passwords are encrypted before storage
2. **Session Management**: Cookies are cached with TTL
3. **Rate Limiting**: Built-in rate limiting prevents abuse
4. **Input Validation**: All inputs are validated and sanitized

## Support

For issues or questions:
1. Check this setup guide
2. Review the main README.md
3. Check Supabase logs
4. Monitor browser console for errors

## Development

### Project Structure
```
websitee/
├── frontend/          # React application
│   ├── src/
│   │   ├── App.js     # Main application (enhanced)
│   │   └── AttendanceProcessor.js  # New attendance processing logic
│   └── package.json
├── backend/           # Node.js API server
│   ├── index.js       # Enhanced with batch processing
│   ├── .env          # Environment configuration
│   └── package.json
└── package.json       # Root package.json
```

### Key Improvements
1. **Batch Processing API**: New `/api/mark-attendance-batch` endpoint
2. **Enhanced Error Handling**: Comprehensive error handling and retry logic
3. **Performance Optimization**: Connection pooling, rate limiting, request queuing
4. **Better UX**: Real-time progress tracking, automatic method selection
5. **Scalability**: Support for 20+ users with room for growth to 50+

### Testing with Multiple Users
1. Add 10+ test users with valid CAMU credentials
2. Test batch processing with QR scan
3. Monitor performance and success rates
4. Adjust configuration as needed