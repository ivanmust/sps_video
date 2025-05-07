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
  const [currentKioskId, setCurrentKioskId] = useState<number | null>(null);
  
  // New state for tracking how long an incoming call has been pending
  const [incomingCallWaitTime, setIncomingCallWaitTime] = useState(0);
  const incomingCallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
              (call: { officerId: number; processed: any; kioskId: number }) => call.officerId === id && !call.processed
            );
            
            if (callForThisOfficer) {
              console.log('Pending call found via API polling:', callForThisOfficer);
              setStatus(`Incoming call from kiosk #${callForThisOfficer.kioskId}...`);
              setCurrentKioskId(callForThisOfficer.kioskId);
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
      
      // Try to extract kiosk ID from the call metadata or peer ID
      if (incoming.metadata && incoming.metadata.kioskId) {
        setCurrentKioskId(incoming.metadata.kioskId);
      } else {
        // Try to extract from peer ID (e.g., kiosk-1-abc123)
        const kioskIdMatch = incoming.peer.match(/kiosk-(\d+)/);
        if (kioskIdMatch && kioskIdMatch[1]) {
          setCurrentKioskId(parseInt(kioskIdMatch[1]));
        }
      }
      
      setIncomingCall(incoming);
      setStatus('Incoming call from kiosk...');
      
      // Reset incoming call timer
      setIncomingCallWaitTime(0);
      
      // Start the timer for auto-decline
      if (incomingCallTimerRef.current) {
        clearInterval(incomingCallTimerRef.current);
      }
      
      incomingCallTimerRef.current = setInterval(() => {
        setIncomingCallWaitTime(prev => {
          const newTime = prev + 1;
          // Auto-decline if the call has been waiting for 30 seconds
          if (newTime >= 30) {
            declineCall();
            return 0;
          }
          return newTime;
        });
      }, 1000);
      
      // Auto-answer option
      if (true) { // Set this to a config option if you want
        acceptCall();
      }
    });

    peer.on('connection', (conn) => {
      console.log('Incoming data connection:', conn);
      
      // Try to extract kiosk ID from the connection metadata or peer ID
      if (conn.metadata && conn.metadata.kioskId) {
        setCurrentKioskId(conn.metadata.kioskId);
      } else {
        // Try to extract from peer ID (e.g., kiosk-1-abc123)
        const kioskIdMatch = conn.peer.match(/kiosk-(\d+)/);
        if (kioskIdMatch && kioskIdMatch[1]) {
          setCurrentKioskId(parseInt(kioskIdMatch[1]));
        }
      }
      
      conn.on('data', (data) => {
        console.log('Received data:', data);
        if (data === 'CALL_REQUEST') {
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
  
  // New function to handle declining a call
  const declineCall = () => {
    if (incomingCall) {
      console.log('Auto-declining call after 30 seconds of no response');
      incomingCall.close();
      setIncomingCall(null);
      setStatus('Call auto-declined after 30 seconds');
      setToast({ 
        open: true, 
        message: 'Call auto-declined after 30 seconds of no response', 
        severity: 'info' 
      });
      
      // Clear the incoming call timer
      if (incomingCallTimerRef.current) {
        clearInterval(incomingCallTimerRef.current);
        incomingCallTimerRef.current = null;
      }
      
      // Reset wait time
      setIncomingCallWaitTime(0);
      
      // Notify API that the call was declined (if needed)
      if (currentKioskId !== null) {
        try {
          fetch('http://localhost:5173/api/end-call', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              kioskId: currentKioskId,
              officerId: id,
              endedBy: 'officer',
              reason: 'auto-declined',
              timestamp: new Date().toISOString()
            })
          });
        } catch (error) {
          console.error('Failed to notify API about auto-declined call:', error);
        }
      }
    }
  };

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

    // Clear the incoming call timer
    if (incomingCallTimerRef.current) {
      clearInterval(incomingCallTimerRef.current);
      incomingCallTimerRef.current = null;
    }
    
    // Reset wait time
    setIncomingCallWaitTime(0);

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

  const endCall = async () => {
    setStatus('Call ended by officer');
    setToast({ open: true, message: 'Call ended', severity: 'info' });
    
    // Notify the API that the call has been ended by the officer
    if (currentKioskId !== null) {
      try {
        const response = await fetch('http://localhost:5173/api/end-call', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            kioskId: currentKioskId,
            officerId: id,
            endedBy: 'officer',
            timestamp: new Date().toISOString()
          })
        });
        
        if (response.ok) {
          console.log('Successfully notified API that officer ended call');
          
          // Also update active call status
          try {
            await fetch(`http://localhost:5173/api/active-calls/${currentKioskId}/${id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status: 'ended',
                endTimestamp: new Date().toISOString()
              })
            });
          } catch (endError) {
            console.error('Error updating active call status:', endError);
          }
        }
      } catch (error) {
        console.error('Failed to notify API about call end:', error);
      }
    }
    
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
    if (incomingCallTimerRef.current) {
      clearInterval(incomingCallTimerRef.current);
      incomingCallTimerRef.current = null;
    }
    
    setCurrentCall(null);
    setIncomingCall(null);
    setCurrentKioskId(null);
    setCallDuration(0); // Reset call duration when cleaning up
    setIncomingCallWaitTime(0); // Reset incoming call wait time
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
            sx={{ height: 40 }}
          />
          <Typography variant="h5" sx={{ color: 'white', fontWeight: 600 }}>
            Officer Console
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ 
            width: 10, 
            height: 10, 
            borderRadius: '50%',
            bgcolor: currentCall ? '#22c55e' : '#f59e0b',
            boxShadow: currentCall ? '0 0 8px #22c55e' : 'none'
          }} />
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            {status}
          </Typography>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        p: 3,
        position: 'relative',
      }}>
        {/* Officer Info Card */}
        <Box sx={{
          bgcolor: 'rgba(15, 23, 42, 0.5)',
          borderRadius: 2,
          p: 3,
          mb: 3,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Box 
              component="div"
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mr: 2
              }}
            >
              <Typography variant="h4" sx={{ color: '#64748b' }}>
                {name ? name[0] : id}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" sx={{ color: 'white' }}>
                {name || `Officer #${id}`}
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                {rank || 'Police Officer'}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Video Stream Container */}
        <Box sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(15, 23, 42, 0.5)',
          borderRadius: 2,
          p: 3,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {currentCall ? (
            <>
              <video 
                ref={remoteVideoRef}
                autoPlay
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '8px',
                }}
              />
              <Box sx={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                bgcolor: 'rgba(15, 23, 42, 0.75)',
                borderRadius: 20,
                p: 1,
                px: 3,
                backdropFilter: 'blur(5px)',
              }}>
                <Typography variant="body2" sx={{ color: 'white' }}>
                  Call duration: {formatCallDuration(callDuration)}
                </Typography>
                <Button 
                  variant="contained" 
                  color="error"
                  onClick={endCall}
                  sx={{ 
                    borderRadius: 20,
                    minWidth: 'unset',
                    width: 40,
                    height: 40,
                    p: 0,
                  }}
                >
                  <Box component="span" sx={{ fontSize: 18 }}>✕</Box>
                </Button>
              </Box>
            </>
          ) : incomingCall ? (
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Typography variant="h5" sx={{ color: 'white', mb: 2 }}>
                Incoming call from Kiosk {currentKioskId || '...'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 3 }}>
                Auto-decline in {30 - incomingCallWaitTime} seconds
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button 
                  variant="contained" 
                  color="success"
                  onClick={acceptCall}
                >
                  Accept Call
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    incomingCall.close();
                    setIncomingCall(null);
                    setStatus('Call rejected');
                    // Clear the incoming call timer
                    if (incomingCallTimerRef.current) {
                      clearInterval(incomingCallTimerRef.current);
                      incomingCallTimerRef.current = null;
                    }
                    setIncomingCallWaitTime(0);
                  }}
                >
                  Reject
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}>
              <Typography variant="h6" sx={{ color: '#94a3b8', mb: 2, textAlign: 'center' }}>
                Waiting for incoming calls
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b', textAlign: 'center', maxWidth: 400 }}>
                You will be automatically connected when a citizen initiates a call from a kiosk.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box sx={{
        p: 2,
        bgcolor: '#0f172a',
        borderTop: '1px solid rgba(148, 163, 184, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          Officer ID: {id}
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          {new Date().toLocaleTimeString()}
        </Typography>
      </Box>

      {/* Toast notifications */}
      <Snackbar 
        open={toast.open} 
        autoHideDuration={6000} 
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setToast({ ...toast, open: false })} 
          severity={toast.severity}
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default OfficerReceiver;