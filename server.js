// server.js - Express server for call coordination
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'],
    methods: ['GET', 'POST']
  }
});

const port = 3001;

// Enable CORS and JSON parsing
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// In-memory storage for pending calls (in production, use a database)
const pendingCalls = {};
let nextCallId = 1;

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle officer registration
  socket.on('register-officer', (officerId) => {
    console.log(`Officer ${officerId} registered`);
    socket.join(`officer-${officerId}`);
  });

  // Handle kiosk registration
  socket.on('register-kiosk', (kioskId) => {
    console.log(`Kiosk ${kioskId} registered`);
    socket.join(`kiosk-${kioskId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Endpoint to initiate a call from the kiosk
app.post('/api/initiate-call', (req, res) => {
  const { kioskId, officerId, callType, autostart, peerId } = req.body;
  
  console.log('Received call initiation request:', { kioskId, officerId, callType, autostart, peerId });
  
  if (!kioskId || !officerId) {
    console.log('Missing required parameters');
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  // Generate a unique call ID
  const callId = nextCallId++;
  
  // Store the call request
  pendingCalls[callId] = {
    callId,
    kioskId: Number(kioskId),
    officerId: Number(officerId),
    callType: callType || 'reporting',
    autostart: autostart || true,
    peerId: peerId || null,
    timestamp: Date.now(),
    acknowledged: false,
    status: 'pending'
  };
  
  console.log(`Call ${callId} initiated from kiosk ${kioskId} to officer ${officerId}`);
  
  // If autostart is true, automatically acknowledge the call and notify the officer
  if (autostart) {
    pendingCalls[callId].acknowledged = true;
    pendingCalls[callId].status = 'active';
    console.log(`Call ${callId} auto-started`);
    
    // Notify the officer about the new call
    io.to(`officer-${officerId}`).emit('new-call', {
      ...pendingCalls[callId],
      peerId: peerId // Make sure to include the kiosk's peer ID
    });
    
    // Notify the kiosk that the call was started
    io.to(`kiosk-${kioskId}`).emit('call-started', {
      callId,
      status: 'active'
    });
  }
  
  return res.status(200).json({ 
    success: true, 
    callId,
    autostart: pendingCalls[callId].autostart,
    status: pendingCalls[callId].status
  });
});

// Endpoint for the caller screen to check for pending calls
app.get('/api/pending-calls', (req, res) => {
  const { kioskId } = req.query;
  
  console.log('Checking pending calls for kiosk:', kioskId);
  console.log('Current pending calls:', pendingCalls);
  
  if (!kioskId) {
    return res.status(400).json({ error: 'Missing kioskId parameter' });
  }
  
  // Find the oldest unacknowledged call for this kiosk
  const pendingCallIds = Object.keys(pendingCalls);
  let pendingCall = null;
  
  for (const id of pendingCallIds) {
    const call = pendingCalls[id];
    console.log('Checking call:', call);
    if (call.kioskId.toString() === kioskId.toString() && !call.acknowledged) {
      if (!pendingCall || call.timestamp < pendingCall.timestamp) {
        pendingCall = call;
      }
    }
  }
  
  console.log('Found pending call:', pendingCall);
  
  if (pendingCall) {
    return res.status(200).json({
      pendingCall: true,
      ...pendingCall
    });
  } else {
    return res.status(200).json({
      pendingCall: false
    });
  }
});

// Endpoint for the caller screen to acknowledge a call
app.post('/api/acknowledge-call', (req, res) => {
  const { callId } = req.body;
  
  if (!callId) {
    return res.status(400).json({ error: 'Missing callId parameter' });
  }
  
  if (!pendingCalls[callId]) {
    return res.status(404).json({ error: 'Call not found' });
  }
  
  // Mark the call as acknowledged
  pendingCalls[callId].acknowledged = true;
  console.log(`Call ${callId} acknowledged`);
  
  return res.status(200).json({
    success: true,
    callId
  });
});

// Endpoint for the officer screen to check for calls assigned to them
app.get('/api/officer-calls', (req, res) => {
  const { officerId } = req.query;
  
  if (!officerId) {
    return res.status(400).json({ error: 'Missing officerId parameter' });
  }
  
  // Find all calls for this officer, both acknowledged and unacknowledged
  const officerCalls = Object.values(pendingCalls).filter(call => 
    call.officerId.toString() === officerId.toString()
  );
  
  return res.status(200).json({
    calls: officerCalls
  });
});

// Endpoint to complete/end a call
app.post('/api/end-call', (req, res) => {
  const { callId, notes } = req.body;
  
  if (!callId) {
    return res.status(400).json({ error: 'Missing callId parameter' });
  }
  
  if (!pendingCalls[callId]) {
    return res.status(404).json({ error: 'Call not found' });
  }
  
  // Add notes and mark call as completed
  pendingCalls[callId].completed = true;
  pendingCalls[callId].endTime = Date.now();
  if (notes) {
    pendingCalls[callId].notes = notes;
  }
  
  console.log(`Call ${callId} completed`);
  
  return res.status(200).json({
    success: true,
    callId
  });
});

// Endpoint to get call statistics
app.get('/api/call-stats', (req, res) => {
  const totalCalls = Object.keys(pendingCalls).length;
  const completedCalls = Object.values(pendingCalls).filter(call => call.completed).length;
  const acknowledgedCalls = Object.values(pendingCalls).filter(call => call.acknowledged && !call.completed).length;
  const pendingCallsCount = Object.values(pendingCalls).filter(call => !call.acknowledged).length;
  
  return res.status(200).json({
    totalCalls,
    completedCalls,
    acknowledgedCalls,
    pendingCallsCount
  });
});

// Endpoint to get details of a specific call
app.get('/api/call/:callId', (req, res) => {
  const { callId } = req.params;
  
  if (!pendingCalls[callId]) {
    return res.status(404).json({ error: 'Call not found' });
  }
  
  return res.status(200).json(pendingCalls[callId]);
});

// Start the server
httpServer.listen(port, () => {
  console.log(`Call coordination server running on port ${port}`);
});

// For testing purposes, create some sample calls
if (process.env.NODE_ENV === 'development') {
  pendingCalls[nextCallId++] = {
    callId: nextCallId - 1,
    kioskId: 1,
    officerId: 1,
    callType: 'reporting',
    autostart: true,
    timestamp: Date.now() - 60000,
    acknowledged: false
  };
  
  pendingCalls[nextCallId++] = {
    callId: nextCallId - 1,
    kioskId: 2,
    officerId: 2,
    callType: 'emergency',
    autostart: true,
    timestamp: Date.now() - 120000,
    acknowledged: true
  };
  
  console.log('Added sample calls for development');
}

// Export for testing purposes
export default app;