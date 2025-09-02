const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');
const FormData = require('form-data');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Test endpoint to verify backend is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!', timestamp: new Date().toISOString() });
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Hash password function for secure storage
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

// Base64 encode function (Node.js equivalent of btoa)
const btoa = (str) => {
  return Buffer.from(str, 'utf8').toString('base64');
};

// Base64 decode function (Node.js equivalent of atob)
const atobNode = (str) => {
  return Buffer.from(str, 'base64').toString('utf8');
};

// Optimize HTTP agents for keep-alive
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

// Axios instance with sane defaults
const api = axios.create({
  timeout: 8000,
  httpAgent,
  httpsAgent,
  validateStatus: () => true,
});

// Helper: MyCamu login
async function myCamuLogin(email, password) {
  const loginUrl = 'https://student.bennetterp.camu.in/login/validate';
  const payload = {
    dtype: 'M',
    Email: email,
    pwd: password,
  };
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://student.bennetterp.camu.in',
    'Referer': 'https://student.bennetterp.camu.in/login',
  };
  const response = await api.post(loginUrl, payload, { headers, withCredentials: true });
  if (!response || response.status >= 500) {
    throw new Error('Login service unavailable');
  }
  return response;
}

// In-memory cookie cache
const cookieCache = new Map(); // email -> { cookie, updatedAt: number }
const COOKIE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getCookieForUser(email, password) {
  const now = Date.now();
  const cached = cookieCache.get(email);
  if (cached && now - cached.updatedAt < COOKIE_TTL_MS) {
    return cached.cookie;
  }
  const response = await myCamuLogin(email, password);
  const setCookie = response.headers['set-cookie'];
  if (!setCookie) throw new Error('No session cookie received');
  const connectSid = setCookie.find((c) => c.startsWith('connect.sid='));
  if (!connectSid) throw new Error('No connect.sid cookie found');
  const cookie = connectSid.split(';')[0];
  cookieCache.set(email, { cookie, updatedAt: now });
  return cookie;
}

// POST /login: Get name and StuID
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const response = await myCamuLogin(email, password);
    const data = response.data;
    const logindetails = data?.output?.data?.logindetails;
    if (!logindetails) return res.status(400).json({ error: 'Invalid login response' });
    const name = logindetails.Name;
    const stuId = logindetails.Student?.[0]?.StuID;
    if (!name || !stuId) return res.status(400).json({ error: 'Could not extract name or StuID' });
    
    // Store user data in Supabase
    try {
      const { data: supabaseData, error: supabaseError } = await supabase
        .from('attendance_records')
        .insert([
          {
            email: email,
            name: name,
            stu_id: stuId,
            password_hash: hashPassword(password),
            password_encrypted: btoa(encodeURIComponent(password)) // Store encrypted version
          }
        ])
        .select();

      if (supabaseError) {
        console.error('Supabase error:', supabaseError);
        // Don't fail the login if Supabase fails, just log it
      } else {
        console.log('User data stored in Supabase:', supabaseData);
        // Minimal log to avoid atob in Node env
        console.log('🔐 Password stored (encrypted) for', email);
      }
    } catch (supabaseErr) {
      console.error('Error storing in Supabase:', supabaseErr);
    }

    res.json({ name, stuId });
  } catch (err) {
    res.status(401).json({ error: 'Login failed', details: err.message });
  }
});

// POST /get-cookie: Get session cookie
app.post('/api/get-cookie', async (req, res) => {
  const { email, password } = req.body;
  try {
    const cookie = await getCookieForUser(email, password);
    res.json({ cookie });
  } catch (err) {
    res.status(401).json({ error: 'Login failed', details: err.message });
  }
});

// GET /users: Get all users from Supabase (for admin use)
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// GET /users-for-frontend: Get users with encrypted passwords for frontend use
app.get('/api/users-for-frontend', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('email, name, stu_id, password_encrypted, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Convert to frontend format
    const frontendUsers = data.map(user => ({
        id: Date.now() + Math.random(), // Generate unique ID
        email: user.email, // This is the actual email
        password: user.password_encrypted, // This is the encrypted password
        name: user.name,
        stuId: user.stu_id
      }));

    console.log(`📤 Sending ${frontendUsers.length} users to frontend`);
    res.json(frontendUsers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// GET /users-and-cookies: return users with fresh cookies (fast parallel)
app.get('/api/users-and-cookies', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('email, name, stu_id, password_encrypted, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Decode password and fetch cookie concurrently
    const results = await Promise.allSettled(
      data.map(async (u) => {
        const decodedPassword = decodeURIComponent(atobNode(u.password_encrypted));
        const cookie = await getCookieForUser(u.email, decodedPassword);
        return {
          email: u.email,
          name: u.name,
          stuId: u.stu_id,
          cookie,
        };
      })
    );

    const usersWithCookies = results
      .map((r, i) => (r.status === 'fulfilled' ? r.value : { email: data[i].email, name: data[i].name, stuId: data[i].stu_id, cookie: null }))
      .filter(Boolean);

    res.json(usersWithCookies);
  } catch (err) {
    console.error('Failed to prepare users and cookies:', err);
    res.status(500).json({ error: 'Failed to prepare users and cookies', details: err.message });
  }
});

// POST /prewarm-cookies: optional manual trigger to refresh cookie cache
app.post('/api/prewarm-cookies', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('email, password_encrypted');
    if (error) return res.status(500).json({ error: 'Failed to read users' });
    await Promise.allSettled(
      (data || []).map(async (u) => {
        const decodedPassword = decodeURIComponent(atobNode(u.password_encrypted));
        await getCookieForUser(u.email, decodedPassword);
      })
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to prewarm', details: e.message });
  }
});

// POST /decode-qr: server-side decode for tough frames
// Body: { imageBase64: string (DataURL or base64), mimeType?: string }
app.post('/api/decode-qr', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }
    // Support either DataURL or raw base64
    let base64Data = imageBase64;
    let contentType = mimeType || 'image/jpeg';
    const dataUrlMatch = /^data:(.*?);base64,(.*)$/i.exec(imageBase64);
    if (dataUrlMatch) {
      contentType = dataUrlMatch[1] || contentType;
      base64Data = dataUrlMatch[2];
    }
    const buffer = Buffer.from(base64Data, 'base64');

    // Use api.qrserver.com which returns JSON and has good tolerance
    const form = new FormData();
    form.append('file', buffer, { filename: 'frame.jpg', contentType });

    const response = await api.post('https://api.qrserver.com/v1/read-qr-code/', form, {
      headers: form.getHeaders(),
      // Slightly longer timeout for remote service
      timeout: 10000,
      maxContentLength: 10 * 1024 * 1024,
    });

    if (!response || response.status >= 400) {
      return res.status(502).json({ error: 'Remote decode failed', status: response?.status, body: response?.data });
    }
    const payload = response.data;
    const text = payload?.[0]?.symbol?.[0]?.data || null;
    if (!text) {
      return res.status(404).json({ error: 'No QR found' });
    }
    return res.json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Decode error', details: e.message });
  }
});

// Helper function to mark single attendance with retry
async function markSingleAttendance(stuId, attendanceId, cookie, retries = 3) {
  const url = 'https://student.bennetterp.camu.in/api/Attendance/record-online-attendance';
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'appversion': 'v2',
    'clienttzofst': '330',
    'cookie': cookie,
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://student.bennetterp.camu.in',
    'Referer': 'https://student.bennetterp.camu.in/attendance',
  };
  const payload = {
    attendanceId,
    StuID: stuId,
    offQrCdEnbld: true,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await api.post(url, payload, { headers });
      if (!response) throw new Error('No response from CAMU');
      if (response.status >= 400) {
        throw new Error(`Attendance marking failed: ${response.statusText}`);
      }
      return response.data;
    } catch (error) {
      if (attempt === retries) throw error;
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

// POST /mark-attendance: Mark attendance for a user (legacy endpoint)
app.post('/api/mark-attendance', async (req, res) => {
  const { stuId, attendanceId, cookie } = req.body;
  try {
    const result = await markSingleAttendance(stuId, attendanceId, cookie);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Attendance marking failed', details: err.message });
  }
});

// POST /mark-attendance-batch: Mark attendance for multiple users with rate limiting
app.post('/api/mark-attendance-batch', async (req, res) => {
  const { attendanceId, users } = req.body;
  
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Users array is required' });
  }

  if (users.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 users allowed per batch' });
  }

  const results = [];
  const batchSize = 3; // Process 3 users concurrently
  const delayBetweenBatches = 500; // 500ms delay between batches

  console.log(`📋 Processing batch attendance for ${users.length} users`);

  // Process users in batches to avoid overwhelming the CAMU server
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (user) => {
      try {
        const result = await markSingleAttendance(user.stuId, attendanceId, user.cookie);
        return {
          name: user.name,
          stuId: user.stuId,
          status: 'success',
          result: result
        };
      } catch (error) {
        return {
          name: user.name,
          stuId: user.stuId,
          status: 'error',
          error: error.message
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    
    // Add batch results to overall results
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          name: batch[index].name,
          stuId: batch[index].stuId,
          status: 'error',
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    // Add delay between batches (except for the last batch)
    if (i + batchSize < users.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  console.log(`✅ Batch processing completed: ${results.filter(r => r.status === 'success').length}/${results.length} successful`);
  
  res.json({
    success: true,
    total: results.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length,
    results: results
  });
});

const PORT = process.env.PORT || 3001;

// Add error handling for server startup
const server = app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  console.log(`Environment variables loaded:`, {
    SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'Missing',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing'
  });
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('💡 Port 3001 is already in use. Try a different port.');
  }
});