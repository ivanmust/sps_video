import { useState, useEffect, useRef, FC, useCallback } from 'react';
import { Box, Typography, Snackbar, Alert, Button } from '@mui/material';
import Peer, { MediaConnection } from 'peerjs';

interface OfficerProps {
  id: number;
  name?: string;
  rank?: string;
  caseItem?: {
    name: string;
    assignedTo: number;
  };
}

const OfficerReceiver: FC<OfficerProps> = ({ id, name = "", rank = "", caseItem: _caseItem }) => {
  const [status, setStatus] = useState('Ready - Waiting for incoming calls');
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ 
    open: false, 
    message: '',  
    severity: 'info' 
  });
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [currentCall, setCurrentCall] = useState<MediaConnection | null>(null);
  const [incomingCall, setIncomingCall] = useState<MediaConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const [callDuration, setCallDuration] = useState(0); // Call duration in seconds
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null); // Interval reference
  const [pendingCallsCheckerActive, setPendingCallsCheckerActive] = useState(false);

  // Poll for pending calls from the API as an alternative connection method
  useEffect(() => {
    const checkForPendingCalls = async () => {
      if (pendingCallsCheckerActive) {
        try {
          const response = await fetch('http://localhost:5173/api/pending-calls');
          if (response.ok) {
            const pendingCalls = await response.json();
            
            // Find any pending call for this officer
            const callForThisOfficer = pendingCalls.find(
              (              call: { officerId: number; processed: any; }) => call.officerId === id && !call.processed
            );
            
            if (callForThisOfficer) {
              console.log('Pending call found via API polling:', callForThisOfficer);
              setStatus(`Incoming call from kiosk #${callForThisOfficer.kioskId}...`);
              setToast({ 
                open: true, 
                message: `Incoming call detected for Officer #${id}`, 
                severity: 'info' 
              });
              
              // Mark the call as processed
              try {
                await fetch(`http://localhost:5173/api/pending-calls/${callForThisOfficer.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ processed: true })
                });
              } catch (error) {
                console.error('Error marking call as processed:', error);
              }
              
              // Auto-answer if configured
              if (true) { // Set this to a config option if you want
                await prepareAndAutoAnswer();
              }
            }
          }
        } catch (error) {
          console.warn('Error checking for pending calls:', error);
        }
      }
    };
    
    // Start polling when component mounts
    const intervalId = setInterval(checkForPendingCalls, 3000);
    setPendingCallsCheckerActive(true);
    
    return () => {
      clearInterval(intervalId);
      setPendingCallsCheckerActive(false);
    };
  }, [id]);

  // Initialize PeerJS connection
  useEffect(() => {
    const peerId = `officer-${id}`;
    console.log('Initializing PeerJS with ID:', peerId);
    
    const peer = new Peer(peerId, {
      host: 'esrirw.rw',
      port: 9000,
      path: '/peerjs',
      secure: true,
      debug: 3, // Enable detailed debug logs
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }, // Add more STUN servers for better connectivity
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
      },
    });

    peerRef.current = peer;

    peer.on('open', () => {
      console.log('PeerJS Connected with ID:', peerId);
      setStatus('Online - Waiting for incoming calls');
      setToast({ open: true, message: 'Connected to PeerJS server ✅', severity: 'success' });
    });

    peer.on('call', (incoming) => {
      console.log('Incoming call detected!', incoming);
      setIncomingCall(incoming);
      setStatus('Incoming call from kiosk...');
      
      // Auto-answer option
      if (true) { // Set this to a config option if you want
        acceptCall();
      }
    });

    peer.on('connection', (conn) => {
      console.log('Incoming data connection:', conn);
      
      conn.on('data', (data) => {
        console.log('Received data:', data);
        if (data  === 'CALL_REQUEST') {
          setStatus('Call request received from kiosk...');
        }
      });
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      setStatus(`PeerJS error: ${err.type}`);
      setToast({ open: true, message: `PeerJS error: ${err.type}`, severity: 'error' });
      
      // Try to reconnect after error
      setTimeout(() => {
        if (peerRef.current) {
          console.log('Attempting to reconnect...');
          peerRef.current.reconnect();
        }
      }, 5000);
    });

    // Log when a peer is disconnected and attempt to reconnect
    peer.on('disconnected', () => {
      console.log('PeerJS disconnected');
      setStatus('Connection lost - Reconnecting...');
      
      setTimeout(() => {
        if (peerRef.current) {
          console.log('Attempting to reconnect after disconnect...');
          peerRef.current.reconnect();
        }
      }, 3000);
    });

    return () => {
      peer.destroy();
      cleanup();
    };
  }, [id]);

  // Function to prepare media and auto-answer when a call is detected through API
  const prepareAndAutoAnswer = async () => {
    try {
      // Get user media in advance
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      
      // Now we're ready to answer any incoming calls
      setStatus('Ready to answer incoming call');
      
      // If there's already an incoming call waiting, answer it
      if (incomingCall) {
        acceptCall();
      }
    } catch (err) {
      console.error('Failed to prepare media for auto-answer:', err);
      setStatus('Error accessing camera/microphone');
      setToast({ open: true, message: 'Failed to access camera/microphone ❌', severity: 'error' });
    }
  };

  const acceptCall = useCallback(async () => {
    if (!incomingCall) {
      console.log('No incoming call to accept');
      return;
    }

    try {
      console.log('Accepting incoming call...');
      
      // Use existing localStream if available, otherwise get a new one
      let stream = localStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
      }

      // Answer the call with our stream
      incomingCall.answer(stream);
      setCurrentCall(incomingCall);
      setIncomingCall(null);
      setStatus('Call connected');
      setCallDuration(0); // Reset timer

      // Start call timer
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      // Listen for the remote stream
      incomingCall.on('stream', (remoteStream: MediaStream) => {
        console.log('Received remote stream', remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          setStatus('Call connected');
          setToast({ open: true, message: 'Call connected ✅', severity: 'success' });
        } else {
          console.error('Remote video reference is not available');
        }
      });

      incomingCall.on('close', () => {
        console.log('Call closed by remote kiosk.');
        setStatus('Call ended');
        setToast({ open: true, message: 'Call ended 📞', severity: 'info' });
        cleanup();
      });

      incomingCall.on('error', (err: Error) => {
        console.error('Call error:', err);
        setStatus(`Call error: ${err.message}`);
        setToast({ open: true, message: `Call error: ${err.message}`, severity: 'error' });
        cleanup();
      });

    } catch (err: unknown) {
      console.error('Failed to open camera/microphone:', err);
      setStatus('Error accessing media devices');
      setToast({ open: true, message: 'Failed to access camera/microphone ❌', severity: 'error' });
    }
  }, [incomingCall, localStream]);

  

  const endCall = () => {
    setStatus('Call ended');
    setToast({ open: true, message: 'Call ended', severity: 'info' });
    cleanup();
  };

  const cleanup = () => {
    if (currentCall) {
      currentCall.close();
    }
    if (remoteVideoRef.current?.srcObject) {
      const remoteStream = remoteVideoRef.current.srcObject as MediaStream;
      remoteStream.getTracks().forEach((track) => track.stop());
      remoteVideoRef.current.srcObject = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    
    setCurrentCall(null);
    setIncomingCall(null);
    setCallDuration(0); // Reset call duration when cleaning up
    setStatus('Online - Waiting for incoming calls');
  };

  // Helper to format seconds into MM:SS
  function formatCallDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  return (
    <Box sx={{ 
      height: '100vh', 
      width: '100vw', 
      backgroundColor: '#0a192f', 
      position: 'relative', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <Box sx={{
        p: 2,
        bgcolor: '#0f172a',
        borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box component="img" 
            src="/logo.png" 
            alt="Logo" 
            sx={{ 
              height: '32px', 
              width: 'auto', 
              borderRadius: '50%',
              bgcolor: '#1e293b'
            }} 
          />
          <Box>
            <Typography variant="h6" sx={{ color: '#ffffff', fontWeight: 600 }}>
              OFFICER RECEIVER
            </Typography>
            <Typography variant="body2" sx={{ color: '#94a3b8' }}>
              Status: {status}
            </Typography>
          </Box>
        </Box>
        
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body1" sx={{ color: '#ffffff', fontWeight: 500 }}>
            {name}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            {rank} • ID #{id}
          </Typography>
        </Box>
      </Box>

     {/* Main Content - Video Area */}
     <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        p: { xs: 1, sm: 1.5, md: 2 }, 
        position: 'relative', 
        bgcolor: '#1e293b', 
        height: 'calc(100vh - 50px)' // Adjusted based on header height
      }}>
      
        {/* Video Container */}
        <Box sx={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          borderRadius: 2,
          position: 'relative',
          bgcolor: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          {!currentCall && !incomingCall && (
            <>
              {/* Officer Badge/Logo */}
              <Box 
                component="img"
                src="/logo.png"
                alt="Officer Badge"
                sx={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  mb: 3
                }}
              />
              
              <Typography variant="h5" sx={{ color: '#94a3b8', mb: 4 }}>
                Waiting for incoming calls
              </Typography>
              
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 4,
                borderRadius: 2,
                border: '1px solid rgba(148, 163, 184, 0.2)',
                width: '100%',
                maxWidth: '400px',
                gap: 2
              }}>
                <Box sx={{ 
                  width: '12px', 
                  height: '12px', 
                  borderRadius: '50%', 
                  bgcolor: '#10b981',
                  animation: 'pulse 2s infinite'
                }} />
                <Typography sx={{ color: '#94a3b8' }}>
                  Your officer ID is <strong style={{ color: '#ffffff' }}>{id}</strong>
                </Typography>
              </Box>
            </>
          )}

          {/* Video Element (hidden until call) */}
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain', 
              display: currentCall ? 'block' : 'none'
            }} 
          />

          {/* Incoming Call Controls */}
          {incomingCall && (
            <Box sx={{
              position: 'absolute',
              bottom: '50%',
              left: '50%',
              transform: 'translate(-50%, 50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              p: 4,
              borderRadius: 2,
              width: '90%',
              maxWidth: '400px'
            }}>
              <Typography variant="h5" sx={{ color: '#ffffff' }}>
                Incoming Call from Kiosk
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  color="success"
                  onClick={acceptCall}
                  sx={{ px: 4, py: 1.5 }}
                >
                  Accept
                </Button>
                
              </Box>
            </Box>
          )}

          {/* Active Call Controls */}
          {currentCall && (
            <Box sx={{
              position: 'absolute',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}>
              <Typography sx={{ color: '#ffffff', fontSize: '18px', fontWeight: 'bold' }}>
                {formatCallDuration(callDuration)}
              </Typography>

              <Button
                variant="contained"
                color="error"
                onClick={endCall}
                sx={{ px: 4, py: 1.5 }}
              >
                End Call
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* CSS Keyframes for pulsing dot */}
      <style>
        {`
          @keyframes pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
            }
            70% {
              box-shadow: 0 0 0 10px rgba(16, 185, 129, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
            }
          }
        `}
      </style>

      {/* Toast Notifications */}
      <Snackbar 
        open={toast.open} 
        autoHideDuration={3000} 
        onClose={() => setToast((prev) => ({ ...prev, open: false }))} 
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default OfficerReceiver;