// Force redeploy - Latest QR scanner with enhanced focus capabilities
import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const timetable = [
  {
    id: 1,
    course: "Artificial Intelligence and Machine Learning(CSET301)",
    location: "(102-N-LH)",
    time: "03:30 PM - 04:30 PM (60 min)",
    instructor: "Rohit Kumar Kaliyar",
    room: "102-N-LH"
  },
  {
    id: 2,
    course: "Automata Theory and Computability",
    location: "(101-N-LH)",
    time: "04:30 PM - 05:30 PM (60 min)",
    instructor: "Ashish Kumar",
    room: "101-N-LH"
  },
  {
    id: 3,
    course: "Soft Computing",
    location: "(104-N-LH)",
    time: "02:30 PM - 03:30 PM (60 min)",
    instructor: "Mahadev Ajagalla",
    room: "104-N-LH"
  },
  {
    id: 4,
    course: "Web Technologies(CSET382)",
    location: "(P-LH-102)",
    time: "12:30 PM - 01:30 PM (60 min)",
    instructor: "Anant Saraswat",
    room: "P-LH-102"
  },
  {
    id: 5,
    course: "High Performance Computing(CSET305-P)",
    location: "(B-LA-207)",
    time: "10:30 AM - 11:30 AM (60 min)",
    instructor: "Dummy Faculty SEAS",
    room: "B-LA-207"
  },
  {
    id: 6,
    course: "High Performance Computing(CSET305-P)",
    location: "(B-LA-207)",
    time: "11:30 AM - 12:30 PM (60 min)",
    instructor: "Dummy Faculty SEAS",
    room: "B-LA-207"
  }
];

// Simple decryption function

const decryptData = (encryptedData) => {
  try {
    return decodeURIComponent(atob(encryptedData));
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedData;
  }
};

function App() {
  const [users, setUsers] = useState([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [attendanceResults, setAttendanceResults] = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const qrScannerRef = useRef(null);
  const [showQRScannedPopup, setShowQRScannedPopup] = useState(false);
  const [userCookies, setUserCookies] = useState([]);
  const [showAddUserButton, setShowAddUserButton] = useState(false);
  const dateTapCountRef = useRef(0);
  const [, setScanningHint] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [currentCameraId, setCurrentCameraId] = useState('');
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [scanProgress, setScanProgress] = useState({ completed: 0, total: 0 });
  const isReadyToScan = users.length > 0 && userCookies.length === users.length && userCookies.every(Boolean);
  const scanAudioRef = useRef(null);
  

  // Load users and cookies on mount (fast path)
  useEffect(() => {
    console.log('🔄 Loading users and cookies...');
    const loadFast = async () => {
      try {
        const fastRes = await fetch('/api/users-and-cookies', { cache: 'no-store' });
        if (fastRes.ok) {
          const data = await fastRes.json();
          const fastUsers = data.map((u, idx) => ({
            id: Date.now() + idx,
            email: u.email,
            name: u.name,
            stuId: u.stuId,
            password: ''
          }));
          setUsers(fastUsers);
          setUserCookies(data.map((u) => u.cookie));
          return;
        }
        console.warn('Fast path failed, falling back to users-for-frontend + get-cookie');
        const response = await fetch('/api/users-for-frontend', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed users-for-frontend');
          const supabaseUsers = await response.json();
          const decryptedUsers = supabaseUsers.map(user => ({
            ...user,
          password: decryptData(user.password)
          }));
          setUsers(decryptedUsers);
          const cookies = await Promise.all(decryptedUsers.map(user => getFreshCookieForUser(user)));
          setUserCookies(cookies);
      } catch (error) {
        console.error('❌ Error loading users from Supabase:', error);
      }
    };
    
    loadFast();
  }, []);

  useEffect(() => {
    // Key combo listener for admin
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        setShowAddUserButton(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    const videoElement = videoRef.current;
    return () => {
      if (qrScannerRef.current) {
        try { qrScannerRef.current.stop(); } catch {}
      }
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  const addUser = async (email, password) => {
    console.log('➕ Adding new user...');
    setLoading(true);
    try {
      console.log('🌐 Making login request...');
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      console.log('📡 Login response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Login successful, user data:', { name: data.name, stuId: data.stuId });
        
        const newUser = {
          id: Date.now(),
          email: email,
          password: password,
          name: data.name,
          stuId: data.stuId
        };
        
        console.log('👤 Created new user object:', { name: newUser.name, stuId: newUser.stuId });
        
        // User is already saved to Supabase by the backend
        // Just update the local state
        setUsers(prevUsers => [...prevUsers, newUser]);
        console.log('✅ User added to system (saved in Supabase)');
        setShowAddUser(false);
      } else {
        console.error('❌ Login failed:', response.status, response.statusText);
        alert('Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('💥 Error adding user:', error);
      alert('Error adding user. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getFreshCookieForUser = async (user) => {
    try {
      const response = await fetch('/api/get-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.password
        })
      });
      if (response.ok) {
        const data = await response.json();
        console.log('🍪 Received cookie');
        return data.cookie;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  };

  // In openCamera, set high-res constraints
  const openCamera = () => {
    console.log('📷 Opening camera...');
    setIsCameraOpen(true);
    setAttendanceResults([]);
    setScanningHint('Initializing camera...');
    setTimeout(() => {
      startScanner();
    }, 300);
  };

  const closeCamera = () => {
    console.log('📷 Closing camera...');
    setIsCameraOpen(false);
    stopScanner();
  };

  const startScanner = () => {
    if (!videoRef.current) {
      console.error('❌ Video ref not available');
      setScanningHint('Camera initialization failed');
      return;
    }
    
    console.log('🔍 Initializing QR scanner...');
    ensureVideoElementAttributes();
    ensureCameraAccess().then(startZxingScanner);
  };

  const ensureVideoElementAttributes = () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.setAttribute('muted', '');
      v.setAttribute('autoplay', '');
      v.removeAttribute('controls');
      v.style.transform = 'scaleX(1)';
    } catch {}
  };

  const ensureCameraAccess = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      // HTTPS requirement (except localhost)
      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
      if (!isSecure) return;
      // Probe to trigger permission prompt once
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
    } catch (e) {
      console.warn('Camera permission probe failed or denied:', e);
    }
  };

  const loadQrScannerCdn = () => new Promise((resolve) => {
    if (window.QrScanner) return resolve(window.QrScanner);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/qr-scanner@1.4.2/qr-scanner.min.js';
    s.async = true;
    s.onload = () => resolve(window.QrScanner);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });

  const startZxingScanner = async () => {
    console.log('📱 Starting QR Scanner (qr-scanner CDN)...');
    const QrScannerLib = await loadQrScannerCdn();
    if (!QrScannerLib) {
      console.error('Failed to load qr-scanner');
      return;
    }
    try { QrScannerLib.WORKER_PATH = '/qr-scanner-worker.min.js'; } catch {}
    // Ensure video is visible before starting (in case it was hidden after a prior scan)
      if (videoRef.current) {
      try { videoRef.current.classList.remove('hidden'); } catch {}
    }
    
    // Using qr-scanner defaults; no explicit getUserMedia constraints here

    try {
      if (qrScannerRef.current) await qrScannerRef.current.stop();
      // Detach any stale stream
      try { if (videoRef.current) { const s = videoRef.current.srcObject; videoRef.current.srcObject = null; if (s) s.getTracks?.().forEach(t=>t.stop()); } } catch {}
      // Check camera availability early
      try {
        const hasCam = await window.QrScanner.hasCamera();
        if (!hasCam) {
          alert('No camera found on this device');
          return;
        }
      } catch {}
      qrScannerRef.current = new window.QrScanner(
        videoRef.current,
        (result) => {
          const text = result?.data || result;
          if (!text) return;
          handleQRScan(text);
          try { qrScannerRef.current?.stop(); } catch {}
          if (videoRef.current) videoRef.current.classList.add('hidden');
        },
        { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 30, returnDetailedScanResult: true }
      );
      // Match reference decoder behavior
      try { await qrScannerRef.current.setInversionMode('both'); } catch {}
      try { await qrScannerRef.current.setGrayscaleWeights(77, 150, 29, true); } catch {}
      // Try setting environment camera explicitly before listing (some browsers require exact constraint)
      try { await qrScannerRef.current.setCamera({ facingMode: { exact: 'environment' } }); } catch {}
      // Prefer explicit back camera by deviceId if available
      try {
        const list = await window.QrScanner.listCameras(true);
        if (Array.isArray(list) && list.length) {
          const back = list.find(c => /back|rear|environment/i.test(c.label)) || list[list.length - 1];
          if (back?.id) {
            await qrScannerRef.current.setCamera(back.id);
            setCurrentCameraId(back.id);
          }
        }
      } catch {}
      await qrScannerRef.current.start();
      // Force play and wait for video to be rendering
      await ensureVideoPlaying();
      // If still not rendering, try manual stream fallback
      if (videoRef.current && (!videoRef.current.videoWidth || videoRef.current.videoWidth === 0)) {
        try {
          const manual = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
          videoRef.current.srcObject = manual;
          await ensureVideoPlaying();
        } catch (err) {
          console.warn('Secondary manual stream failed:', err);
        }
      }
      // iOS specific: try setting srcObject via createObjectURL fallback
      if (videoRef.current && (!videoRef.current.videoWidth || videoRef.current.videoWidth === 0) && videoRef.current.srcObject) {
        try {
          // Some old iOS need load()+play() sequence
          await videoRef.current.load?.();
          await videoRef.current.play?.();
        } catch {}
      }
      // If still black, switch to front camera as a fallback
      if (videoRef.current && (!videoRef.current.videoWidth || videoRef.current.videoWidth === 0)) {
        try {
          await qrScannerRef.current.setCamera('user');
          await ensureVideoPlaying();
        } catch {}
        if (videoRef.current && (!videoRef.current.videoWidth || videoRef.current.videoWidth === 0)) {
          try {
            const manualFront = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            videoRef.current.srcObject = manualFront;
            await ensureVideoPlaying();
          } catch {}
        }
      }
      // If still black, brute-force try deviceIds
      if (videoRef.current && (!videoRef.current.videoWidth || videoRef.current.videoWidth === 0)) {
        try {
          const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
          for (const dev of devices) {
            try {
              await qrScannerRef.current.setCamera(dev.deviceId);
              await ensureVideoPlaying();
              if (videoRef.current.videoWidth && videoRef.current.videoWidth > 0) {
                setCurrentCameraId(dev.deviceId || '');
                break;
              }
            } catch {}
            try {
              const manualDev = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: dev.deviceId } }, audio: false });
              videoRef.current.srcObject = manualDev;
              await ensureVideoPlaying();
              if (videoRef.current.videoWidth && videoRef.current.videoWidth > 0) {
                setCurrentCameraId(dev.deviceId || '');
                break;
              }
            } catch {}
          }
        } catch {}
      }
      // If the video didn't render yet, unhide again
      if (videoRef.current) videoRef.current.classList.remove('hidden');
      console.log('✅ QrScanner started');
    } catch (e) {
      console.error('Failed to start QrScanner', e);
      // Fallback: try manual getUserMedia to attach a stream so video isn't black
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await ensureVideoPlaying();
        }
        // Try starting scanner again (it will take over the stream)
        try { await qrScannerRef.current?.start(); await ensureVideoPlaying(); } catch {}
      } catch (err) {
        console.warn('Manual getUserMedia fallback failed:', err);
      }
    }
  };

  const ensureVideoPlaying = async () => {
    const vid = videoRef.current;
    if (!vid) return;
    try { await vid.play(); } catch {}
    if (vid.readyState >= 2 && vid.videoWidth && vid.videoHeight) return;
    await new Promise((resolve) => {
      let settled = false;
      const onReady = () => { if (!settled) { settled = true; cleanup(); resolve(); } };
      const onCanPlay = () => onReady();
      const onLoadedData = () => onReady();
      const cleanup = () => {
        vid.removeEventListener('canplay', onCanPlay);
        vid.removeEventListener('loadeddata', onLoadedData);
      };
      vid.addEventListener('canplay', onCanPlay, { once: true });
      vid.addEventListener('loadeddata', onLoadedData, { once: true });
      setTimeout(() => onReady(), 5000);
    });
  };

  // Removed BarcodeDetector path for simplicity

  // Removed server-side decode path for now

  // Removed CDN ZXing core path (using worker instead)

  // Removed auto-adjust path

  const stopScanner = () => {
    console.log('⏹️ Stopping scanner...');
    if (qrScannerRef.current) { try { qrScannerRef.current.stop(); } catch {} qrScannerRef.current = null; }
    if (videoRef.current) { try { videoRef.current.classList.remove('hidden'); } catch {} }
    
    // Clean up video stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        track.stop();
        console.log('✅ Video track stopped:', track.kind);
      });
      videoRef.current.srcObject = null;
      // Reset any CSS zoom transforms
      videoRef.current.style.transform = '';
    }
    
    setScanningHint('');
  };

  // Removed WASM worker path for now (reworking processing)

  const applyZoom = (zoom) => {
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    const capabilities = track?.getCapabilities?.();
    if (capabilities && capabilities.zoom) {
      track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
      if (videoRef.current) videoRef.current.style.transform = '';
    } else if (videoRef.current) {
      videoRef.current.style.transformOrigin = 'center center';
      videoRef.current.style.transform = `scale(${zoom})`;
    }
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => {
      const next = Math.min(prev + 0.1, 3);
      applyZoom(next);
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.1, 1);
      applyZoom(next);
      return next;
    });
  };

  

  // Camera controls inside scanner UI
  

  

  

  

  // Slider handles zoom directly; button handlers removed

  // Removed flash/zoom/filters

  // Helper: fetch with timeout and no-store caching
  const fetchWithTimeout = async (resource, options = {}, timeoutMs = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(resource, { ...options, signal: controller.signal, cache: 'no-store' });
      return response;
    } finally {
      clearTimeout(id);
    }
  };

  const handleQRScan = async (qrData) => {
    if (isProcessingScan) return; // prevent duplicate scans while processing
    
    // play scan sound (with fallback tone)
    try { await scanAudioRef.current?.play(); } catch (_) { try { playBeep(); } catch {} }
    setShowQRScannedPopup(true);
    setTimeout(() => setShowQRScannedPopup(false), 2000);
    
    try {
      const attendanceId = qrData;
      const cookies = userCookies;
      
      if (!users.length) {
        alert('No users loaded yet. Please add users first.');
        return;
      }
      if (!cookies || cookies.length !== users.length) {
        alert('Cookies not loaded yet. Please wait a moment and try again.');
        return;
      }

      setIsProcessingScan(true);
      setScanProgress({ completed: 0, total: users.length });
      
      // Initialize results
      setAttendanceResults(users.map((u) => ({ 
        name: u.name, 
        status: '⏳ Processing...', 
        code: 'PENDING' 
      })));

      console.log(`🎯 Processing attendance for ${users.length} users using ${users.length >= 5 ? 'batch' : 'individual'} method`);

      // Choose processing method based on user count
      if (users.length >= 5) {
        // Use batch processing for 5+ users (more efficient)
        await processBatchAttendance(users, attendanceId, cookies);
      } else {
        // Use individual processing for < 5 users (faster for small groups)
        await processIndividualAttendance(users, attendanceId, cookies);
      }

    } catch (error) {
      console.error('💥 Error processing QR scan:', error);
      alert('Error processing attendance. Please try again.');
    } finally {
      setIsProcessingScan(false);
    }
  };

  // Batch processing method for 5+ users
  const processBatchAttendance = async (users, attendanceId, cookies) => {
    try {
      const usersWithCookies = users.map((user, index) => ({
        name: user.name,
        stuId: user.stuId,
        cookie: cookies[index]
      }));

      const response = await fetch('/api/mark-attendance-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceId,
          users: usersWithCookies
        })
      });

      if (!response.ok) {
        throw new Error(`Batch processing failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update results with server response
      const formattedResults = data.results.map(result => ({
        name: result.name,
        status: result.status === 'success' 
          ? '✅ Marked Present' 
          : `❌ ${result.error || 'Failed'}`,
        code: result.status === 'success' ? 'SUCCESS' : 'ERROR'
      }));

      setAttendanceResults(formattedResults);
      setScanProgress({ completed: data.total, total: data.total });

      console.log(`✅ Batch processing completed: ${data.successful}/${data.total} successful`);

    } catch (error) {
      console.error('❌ Batch processing failed, falling back to individual processing:', error);
      // Fallback to individual processing
      await processIndividualAttendance(users, attendanceId, cookies);
    }
  };

  // Individual processing method (original logic, improved)
  const processIndividualAttendance = async (users, attendanceId, cookies) => {
    const batchSize = 3; // Process 3 users at a time
    const delayBetweenBatches = 500; // 500ms delay between batches

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      const batchTasks = batch.map((user, batchIndex) => (async () => {
        const userIndex = i + batchIndex;
        const userCookie = cookies[userIndex];
        
        if (!userCookie) {
          const failure = { 
            name: user.name, 
            status: '❌ Failed to get session cookie', 
            code: 'COOKIE_ERROR' 
          };
          
          setAttendanceResults((prev) => {
            const updated = [...prev];
            updated[userIndex] = failure;
            return updated;
          });
          
          setScanProgress((p) => ({ ...p, completed: p.completed + 1 }));
          return;
        }

        try {
          const response = await fetchWithTimeout('/api/mark-attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              stuId: user.stuId, 
              attendanceId, 
              cookie: userCookie 
            })
          }, 9000);
          
          const data = await response.json().catch(() => ({}));
          const code = data?.output?.data?.code;
          
          let status = 'Unknown';
          if (code === 'SUCCESS') status = '✅ Marked Present';
          else if (code === 'ATTENDANCE_NOT_VALID') status = '❌ Invalid QR (expired or wrong student)';
          else status = `⚠️ ${code || 'Error'}`;
          
          const result = { name: user.name, status, code };
          
          setAttendanceResults((prev) => {
            const updated = [...prev];
            updated[userIndex] = result;
            return updated;
          });
          
        } catch (e) {
          const errorResult = { 
            name: user.name, 
            status: '❌ Timeout or network error', 
            code: 'TIMEOUT' 
          };
          
          setAttendanceResults((prev) => {
            const updated = [...prev];
            updated[userIndex] = errorResult;
            return updated;
          });
        } finally {
          setScanProgress((p) => ({ ...p, completed: p.completed + 1 }));
        }
      })());

      // Process batch concurrently
      await Promise.allSettled(batchTasks);
      
      // Add delay between batches (except for the last batch)
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
  };

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      o.start();
      setTimeout(() => {
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.02);
        o.stop();
        ctx.close();
      }, 120);
    } catch {}
  };

  const AddUserModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg w-full max-w-sm mx-auto">
        <h2 className="text-xl font-bold mb-4">Add User</h2>
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          addUser(formData.get('email'), formData.get('password'));
        }}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              name="email"
              required
              className="w-full p-3 border border-gray-300 rounded-lg text-base"
              placeholder="Enter email"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              name="password"
              required
              className="w-full p-3 border border-gray-300 rounded-lg text-base"
              placeholder="Enter password"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 text-base font-medium"
            >
              {loading ? 'Adding...' : 'Add User'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddUser(false)}
              className="flex-1 bg-gray-300 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-400 text-base font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Scan sound */}
      <audio ref={scanAudioRef} preload="auto" src="/scan.mp3" />
      {showQRScannedPopup && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 text-lg font-semibold animate-fade-in">
          QR scanned
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Add User Button */}
        {showAddUserButton && (
          <div className="mb-4">
            <button
              onClick={() => setShowAddUser(true)}
              className="bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 w-full text-base font-medium"
            >
              Add User
            </button>
          </div>
        )}

        {/* Today's Schedule - White Div */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-4">
            {/* Semester Info and Buttons - Above date navigation */}
            <div className="flex flex-col justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-xl font-semibold text-gray-800">Timetable</h1>
                <p className="text-sm text-gray-600">Semester - 5 | 2025-2026</p>
              </div>
              <div className="flex gap-2 w-full">
                <button className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2 text-sm">
                  <span>🔄</span>
                  <span>Refresh</span>
                </button>
                <button className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm">
                  Weekly schedule
                </button>
              </div>
            </div>

            {/* Date Navigation - Inside the white div */}
            <div className="flex justify-center items-center gap-4 mb-6">
              <button className="text-gray-600 hover:text-gray-800 p-2">
                <span className="text-xl">‹</span>
              </button>
              <span
                className="text-base font-medium"
                onClick={() => {
                  dateTapCountRef.current += 1;
                  if (dateTapCountRef.current >= 10) {
                    setShowAddUserButton(true);
                    dateTapCountRef.current = 0;
                  }
                }}
              >
                05-Aug-2025
              </span>
              <button className="text-gray-600 hover:text-gray-800 p-2">
                <span className="text-xl">›</span>
              </button>
            </div>

            {/* QR Scanner - Above Today's Schedule */}
            {isCameraOpen && (
              <div className="bg-black rounded-lg shadow-2xl mb-6 transition-all duration-300 w-full">
                <div className="p-4 sm:p-6">
                  <div className="relative">
                    {/* QR Scanner Container for HTML5 */}
                    {/* Removed HTML5 scanner container */}
                    
                    {/* Video element for ZXing (wrapped to keep zoom cropped, not resizing layout) */}
                    <div className="rounded-lg bg-black h-80 sm:h-96 w-full overflow-hidden relative">
                    <video 
                      ref={videoRef} 
                        className="absolute inset-0 w-full h-full object-cover will-change-transform"
                      autoPlay={true} 
                      muted={true} 
                      playsInline={true}
                      disablePictureInPicture={true}
                    />
                    </div>

                    {/* Built-in QrScanner overlay will draw region and outline */}

                    {/* Scanning hint removed */}

                    {/* Zoom Controls */}
                    <div className="absolute bottom-4 right-4 flex flex-col items-center gap-2">
                      <button
                        onClick={handleZoomIn}
                        className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg hover:bg-yellow-500 transition-colors"
                      >
                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                          <path fillRule="evenodd" d="M8 6a2 2 0 100 4 2 2 0 000-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-black text-sm font-bold ml-1">+</span>
                      </button>
                      <div className="bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                        {Math.round(zoomLevel * 100)}%
                      </div>
                      <button
                        onClick={handleZoomOut}
                        className="w-12 h-12 bg-gray-400 rounded-full flex items-center justify-center shadow-lg hover:bg-gray-500 transition-colors"
                      >
                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                          <path fillRule="evenodd" d="M8 6a2 2 0 100 4 2 2 0 000-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-black text-sm font-bold ml-1">-</span>
                      </button>
                      {/* Switch removed per request */}
                    </div>

                    {/* Stop Scanning Button (full width) */}
                    <div className="mt-4">
                      <button onClick={closeCamera} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2 w-full">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"></rect><line x1="200" y1="56" x2="56" y2="200" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"></line><line x1="200" y1="200" x2="56" y2="56" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"></line></svg>
                        Stop Scanning
                      </button>
                    </div>

                    {/* Scanner Indicator removed */}
                  </div>
                </div>
              </div>
            )}

            {/* Today's Schedule Header */}
            <h2 className="text-lg font-semibold mb-4">Today's Schedule</h2>
            
            {/* Course Listings */}
            <div className="space-y-4">
              {timetable.map((course, index) => (
                <div key={course.id} className="border-b border-gray-100 pb-4 last:border-b-0">
                  <div className="flex flex-col justify-between items-start gap-3">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 text-sm">
                        {course.course}{course.location}
                      </h3>
                      <p className="text-gray-600 text-xs">{course.time}</p>
                      <p className="text-gray-600 text-xs">{course.instructor}</p>
                      <p className="text-gray-600 text-xs">{course.room}</p>
                      {index === 1 && (
                        <p className="text-gray-400 text-xs mt-1">Attendance recorded</p>
                      )}
                    </div>
                    {index === 2 && (
                      <button
                        onClick={() => {
                          if (!isReadyToScan) {
                            alert('Users/cookies are still loading. Please wait a moment and try again.');
                            return;
                          }
                          openCamera();
                        }}
                        disabled={!isReadyToScan}
                        className={`px-4 py-3 rounded-lg w-full text-sm font-medium ${
                          isReadyToScan ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        }`}
                      >
                        {isReadyToScan ? 'Record Attendance' : 'Preparing...'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>



        {/* Attendance Results */}
        {attendanceResults.length > 0 && (
          <div className="mt-6 sm:mt-8 mb-20 card bg-white shadow-2xl max-w-md mx-auto backdrop-blur-sm bg-opacity-90 border border-gray-200">
            <div className="card-body p-4 sm:p-6">
              <h3 className="card-title text-lg flex items-center gap-2 mb-4">
                📋 Scan Results
                {isProcessingScan && (
                  <span className="text-xs text-gray-500">({scanProgress.completed}/{scanProgress.total})</span>
                )}
              </h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {attendanceResults.map((result, index) => (
                  <div key={index} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-50 rounded gap-2">
                    <span className="font-medium text-sm sm:text-base">{result.name}</span>
                    <span className={`text-xs sm:text-sm ${result.status.includes('✅') ? 'text-green-600' : result.status.includes('❌') ? 'text-red-600' : 'text-yellow-600'}`}>
                      {result.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddUser && <AddUserModal />}
      
      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="flex justify-around items-center py-3">
          <button className="flex flex-col items-center text-gray-600">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-xs">Profile</span>
          </button>
          
          <button className="flex flex-col items-center text-gray-600">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-xs">Settings</span>
          </button>
          
          <button className="flex flex-col items-center text-gray-600">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 000 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-xs">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
