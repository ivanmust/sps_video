import { useState, useEffect, useRef, FC, useCallback } from 'react';
import { Button, Box, Typography, Paper, Stack } from '@mui/material';
import Peer, { MediaConnection } from 'peerjs';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';

interface ReceiverProps {
  id: number;
  caseItem: { name: string; assignedTo: number };
}

const Receiver: FC<ReceiverProps> = ({ id, caseItem }) => {
  const [status, setStatus] = useState('Initializing...');
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [currentCall, setCurrentCall] = useState<MediaConnection | null>(null);
  const [incomingCall, setIncomingCall] = useState<MediaConnection | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const peerId = `officer-${id}`;
    const newPeer = new Peer(peerId, {
      host: 'esrirw.rw',
      port: 9000,
      path: '/peerjs',
      secure: true,
    });

    newPeer.on('open', () => {
      setStatus(`Ready to receive call (ID: ${peerId})`);
    });

    newPeer.on('call', (call) => {
      setStatus('Incoming call...');
      setIncomingCall(call);
    });

    newPeer.on('error', (err) => {
      console.error('PeerJS error:', err);
      setStatus(`Error: ${err.type}`);
    });

    return () => {
      if (currentCall) {
        currentCall.close();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      newPeer.destroy();
    };
  }, [id]);

  // Ensure controls are always visible
  useEffect(() => {
    const checkControlsVisibility = () => {
      if (controlsRef.current) {
        const rect = controlsRef.current.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        
        if (!isVisible) {
          controlsRef.current.style.bottom = "16px";
          controlsRef.current.style.position = "fixed";
        }
      }
    };
    
    window.addEventListener('resize', checkControlsVisibility);
    checkControlsVisibility();
    
    return () => window.removeEventListener('resize', checkControlsVisibility);
  }, []);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      incomingCall.answer(stream);
      setCurrentCall(incomingCall);
      setIncomingCall(null);
      setStatus('Call accepted');

      incomingCall.on('stream', (remoteStream: MediaStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setStatus('Call connected');
      });

      incomingCall.on('close', () => {
        setStatus('Call ended');
        cleanup();
      });

      incomingCall.on('error', (err: Error) => {
        console.error('Call error:', err);
        setStatus(`Call error: ${err.message}`);
        cleanup();
      });
    } catch (err: unknown) {
      console.error('Media error:', err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [incomingCall]);

  const cleanup = () => {
    if (remoteVideoRef.current?.srcObject) {
      const tracks = (remoteVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track: MediaStreamTrack) => track.stop());
      remoteVideoRef.current.srcObject = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setCurrentCall(null);
    setIncomingCall(null);
  };

  const toggleVideo = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  }, [localStream, isVideoEnabled]);

  const toggleAudio = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  }, [localStream, isAudioEnabled]);

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#1e293b',
        color: 'white',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Header */}
      <Paper
        elevation={3}
        sx={{
          p: { xs: 1.5, sm: 2, md: 3 },
          bgcolor: '#0f172a',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 2 },
          zIndex: 10,
        }}
      >
        <Box
          component="img"
          src="/logo.png" 
          alt="Logo" 
          sx={{ 
            height: { xs: '24px', sm: '30px', md: '40px' },
            width: 'auto',
          }}
        />
        <Box>
          <Typography 
            variant="h5" 
            sx={{ 
              color: '#ffffff', 
              fontWeight: 600,
              fontSize: { xs: '1rem', sm: '1.2rem', md: '1.5rem' }
            }}
          >
            OFFICER {caseItem.name}
          </Typography>
          <Typography 
            variant="body2"
            sx={{ 
              color: status.includes('Error') ? '#ef4444' : 
                     status.includes('Connected') ? '#10b981' : '#94a3b8',
              fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.875rem' }
            }}
          >
            Status: {status}
          </Typography>
        </Box>
      </Paper>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          p: { xs: 1, sm: 2, md: 3 },
          position: 'relative',
          bgcolor: '#1e293b',
          height: { xs: 'calc(100vh - 60px)', sm: 'calc(100vh - 72px)', md: 'calc(100vh - 88px)' },
        }}
      >
        {/* Remote Video - Made more responsive */}
        <Box
          sx={{
            flex: 1,
            position: 'relative',
            borderRadius: { xs: 1, sm: 2, md: 3 },
            overflow: 'hidden',
            bgcolor: '#0f172a',
            border: '2px solid rgba(148, 163, 184, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
          {/* Logo overlay when no video */}
          {!currentCall && !incomingCall && (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                width: '90%',
              }}
            >
              <Box
                component="img"
                src="/logo.png" 
                alt="Waiting" 
                sx={{
                  width: { xs: '80px', sm: '100px', md: '120px' },
                  height: 'auto',
                  opacity: 0.5,
                  marginBottom: { xs: '0.5rem', sm: '1rem' },
                }}
              />
              <Typography 
                variant="h6" 
                sx={{ 
                  color: '#94a3b8',
                  fontSize: { xs: '0.9rem', sm: '1rem', md: '1.25rem' }
                }}
              >
                Waiting for incoming call
              </Typography>
            </Box>
          )}
        </Box>

        {/* Controls - Made more responsive */}
        <Stack
          ref={controlsRef}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1, sm: 2 }}
          sx={{
            position: 'absolute',
            bottom: { xs: '16px', sm: '24px', md: '32px' },
            left: '50%',
            transform: 'translateX(-50%)',
            bgcolor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            p: { xs: 1.5, sm: 2 },
            px: { xs: 2, sm: 3 },
            borderRadius: { xs: 2, sm: 3 },
            border: '2px solid rgba(148, 163, 184, 0.2)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            width: { xs: 'calc(100% - 32px)', sm: 'auto' },
            maxWidth: { xs: 'calc(100% - 32px)', sm: '90%', md: '600px' },
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3,
          }}
        >
          {incomingCall ? (
            <Button
              fullWidth
              variant="contained"
              onClick={acceptCall}
              startIcon={<Phone size={20} />}
              sx={{
                bgcolor: '#059669',
                '&:hover': { bgcolor: '#047857' },
                minWidth: { xs: '100%', sm: '140px', md: '160px' },
                height: { xs: '40px', sm: '44px', md: '48px' },
                fontSize: { xs: '0.9rem', sm: '1rem', md: '1.1rem' },
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
              }}
            >
              Accept Call
            </Button>
          ) : currentCall ? (
            <Stack 
              direction="row"
              spacing={{ xs: 1, sm: 2 }}
              sx={{ 
                width: { xs: '100%', sm: 'auto' }, 
                justifyContent: 'space-between',
                flexWrap: { xs: 'wrap', sm: 'nowrap' }
              }}
            >
              
              
              <Button
                variant="contained"
                color="error"
                onClick={cleanup}
                startIcon={<PhoneOff size={18} />}
                sx={{
                  bgcolor: '#dc2626',
                  '&:hover': { bgcolor: '#b91c1c' },
                  minWidth: { xs: '100%', sm: '120px', md: '140px' },
                  height: { xs: '40px', sm: '44px', md: '48px' },
                  fontSize: { xs: '0.9rem', sm: '1rem', md: '1.1rem' },
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                  marginTop: { xs: '8px', sm: 0 },
                  flexBasis: { xs: '100%', sm: 'auto' },
                }}
              >
                End Call
              </Button>
            </Stack>
          ) : (
            <Typography 
              variant="body1" 
              sx={{ 
                color: '#94a3b8',
                py: 1,
                fontSize: { xs: '0.9rem', sm: '1rem', md: '1.1rem' }
              }}
            >
              Waiting for incoming call...
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default Receiver;