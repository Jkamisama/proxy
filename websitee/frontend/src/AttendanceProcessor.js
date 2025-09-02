import { useState, useCallback } from 'react';

// Queue-based attendance processor for handling 20+ users efficiently
class AttendanceQueue {
  constructor(concurrency = 3, delayBetweenRequests = 300) {
    this.concurrency = concurrency;
    this.delay = delayBetweenRequests;
    this.queue = [];
    this.running = 0;
    this.results = [];
    this.onProgress = null;
  }

  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    
    this.running++;
    const { task, resolve, reject } = this.queue.shift();
    
    try {
      const result = await task();
      resolve(result);
      
      if (this.onProgress) {
        this.onProgress({
          completed: this.results.length + 1,
          total: this.results.length + this.queue.length + this.running,
          result
        });
      }
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      
      // Add delay between requests to avoid overwhelming the server
      if (this.queue.length > 0) {
        setTimeout(() => this.process(), this.delay);
      } else {
        this.process(); // Continue immediately if no delay needed
      }
    }
  }

  clear() {
    this.queue = [];
    this.results = [];
    this.running = 0;
  }
}

export const useAttendanceProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [processingMethod, setProcessingMethod] = useState('batch'); // 'batch' or 'queue'

  const queue = new AttendanceQueue(3, 300); // 3 concurrent, 300ms delay

  // Method 1: Server-side batch processing (recommended for 20+ users)
  const processBatchAttendance = useCallback(async (users, attendanceId, userCookies) => {
    setIsProcessing(true);
    setProgress({ completed: 0, total: users.length });
    setResults([]);

    try {
      // Prepare users with cookies for batch processing
      const usersWithCookies = users.map((user, index) => ({
        name: user.name,
        stuId: user.stuId,
        cookie: userCookies[index]
      }));

      console.log(`🚀 Starting batch attendance processing for ${users.length} users`);

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
      
      // Convert server results to frontend format
      const formattedResults = data.results.map(result => ({
        name: result.name,
        status: result.status === 'success' 
          ? '✅ Marked Present' 
          : `❌ ${result.error || 'Failed'}`,
        code: result.status === 'success' ? 'SUCCESS' : 'ERROR'
      }));

      setResults(formattedResults);
      setProgress({ completed: data.total, total: data.total });

      console.log(`✅ Batch processing completed: ${data.successful}/${data.total} successful`);
      
      return {
        success: true,
        total: data.total,
        successful: data.successful,
        failed: data.failed,
        results: formattedResults
      };

    } catch (error) {
      console.error('❌ Batch processing error:', error);
      
      // Fallback to individual processing if batch fails
      console.log('🔄 Falling back to queue-based processing...');
      return await processQueueAttendance(users, attendanceId, userCookies);
      
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Method 2: Client-side queue processing (fallback)
  const processQueueAttendance = useCallback(async (users, attendanceId, userCookies) => {
    setIsProcessing(true);
    setProgress({ completed: 0, total: users.length });
    setResults(users.map(user => ({ 
      name: user.name, 
      status: '⏳ Queued...', 
      code: 'PENDING' 
    })));

    queue.clear();
    queue.setProgressCallback((progressData) => {
      setProgress({ 
        completed: progressData.completed, 
        total: progressData.total 
      });
    });

    const processedResults = [];

    try {
      console.log(`🔄 Starting queue-based attendance processing for ${users.length} users`);

      const tasks = users.map((user, index) => 
        queue.add(async () => {
          const userCookie = userCookies[index];
          
          if (!userCookie) {
            const result = { 
              name: user.name, 
              status: '❌ No session cookie', 
              code: 'COOKIE_ERROR' 
            };
            
            setResults(prev => {
              const updated = [...prev];
              updated[index] = result;
              return updated;
            });
            
            return result;
          }

          try {
            const response = await fetch('/api/mark-attendance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                stuId: user.stuId, 
                attendanceId, 
                cookie: userCookie 
              })
            });

            const data = await response.json().catch(() => ({}));
            const code = data?.output?.data?.code;
            
            let status = 'Unknown';
            if (code === 'SUCCESS') status = '✅ Marked Present';
            else if (code === 'ATTENDANCE_NOT_VALID') status = '❌ Invalid QR';
            else status = `⚠️ ${code || 'Error'}`;

            const result = { name: user.name, status, code };
            
            setResults(prev => {
              const updated = [...prev];
              updated[index] = result;
              return updated;
            });

            return result;

          } catch (error) {
            const result = { 
              name: user.name, 
              status: '❌ Network error', 
              code: 'TIMEOUT' 
            };
            
            setResults(prev => {
              const updated = [...prev];
              updated[index] = result;
              return updated;
            });

            return result;
          }
        })
      );

      const results = await Promise.allSettled(tasks);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          processedResults.push(result.value);
        } else {
          processedResults.push({
            name: users[index].name,
            status: '❌ Processing failed',
            code: 'ERROR'
          });
        }
      });

      const successful = processedResults.filter(r => r.code === 'SUCCESS').length;
      console.log(`✅ Queue processing completed: ${successful}/${processedResults.length} successful`);

      return {
        success: true,
        total: processedResults.length,
        successful,
        failed: processedResults.length - successful,
        results: processedResults
      };

    } catch (error) {
      console.error('❌ Queue processing error:', error);
      return {
        success: false,
        error: error.message,
        results: processedResults
      };
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Main processing function that chooses the best method
  const processAttendance = useCallback(async (users, attendanceId, userCookies) => {
    if (!users.length) {
      alert('No users loaded yet. Please add users first.');
      return;
    }

    if (!userCookies || userCookies.length !== users.length) {
      alert('Cookies not loaded yet. Please wait a moment and try again.');
      return;
    }

    // Choose processing method based on user count and preference
    if (processingMethod === 'batch' && users.length >= 5) {
      return await processBatchAttendance(users, attendanceId, userCookies);
    } else {
      return await processQueueAttendance(users, attendanceId, userCookies);
    }
  }, [processingMethod, processBatchAttendance, processQueueAttendance]);

  return {
    processAttendance,
    isProcessing,
    progress,
    results,
    processingMethod,
    setProcessingMethod,
    // Utility functions
    resetResults: () => setResults([]),
    getSuccessCount: () => results.filter(r => r.code === 'SUCCESS').length,
    getFailureCount: () => results.filter(r => r.code !== 'SUCCESS' && r.code !== 'PENDING').length
  };
};

export default useAttendanceProcessor;