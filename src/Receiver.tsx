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
  const [callDuration, setCallDuration] = useState(0); // New: call duration in seconds
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null); // New: interval reference

  useEffect(() => {
    const peerId = `officer-${id}`;
    const peer = new Peer(peerId, {
      host: 'esrirw.rw',
      port: 9000,
      path: '/peerjs',
      secure: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    peerRef.current = peer;

    peer.on('open', () => {
      console.log('PeerJS Connected:', peerId);
      setStatus('Online - Waiting for incoming calls');
      setToast({ open: true, message: 'Connected to PeerJS server ✅', severity: 'success' });
    });

    peer.on('call', (incoming) => {
      console.log('Incoming call detected!');
      setIncomingCall(incoming);
      setStatus('Incoming call from kiosk...');
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      setStatus(`PeerJS error: ${err.type}`);
      setToast({ open: true, message: `PeerJS error: ${err.type}`, severity: 'error' });
    });

    return () => {
      peer.destroy();
      cleanup();
    };
  }, [id]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      incomingCall.answer(stream);
      setCurrentCall(incomingCall);
      setIncomingCall(null);
      setStatus('Call connected');
      setCallDuration(0); // Reset timer

      // Start call timer
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      incomingCall.on('stream', (remoteStream: MediaStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          setStatus('Call connected');
          setToast({ open: true, message: 'Call connected ✅', severity: 'success' });
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
  }, [incomingCall]);

  

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

      {/* Main Content Area */}
      <Box sx={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 3,
        position: 'relative'
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
              objectFit: 'cover', 
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