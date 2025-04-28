import { useState, useEffect, useRef, FC, useCallback } from 'react';
import { Button, Select, MenuItem, Box, Typography, Paper, Stack } from '@mui/material';
import Peer, { MediaConnection } from 'peerjs';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';

const Caller: FC<{ cases: { name: string; assignedTo: number }[]; kioskId: number }> = ({ cases, kioskId }) => {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [call, setCall] = useState<MediaConnection | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [receiverId, setReceiverId] = useState<number | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const controlsRef = useRef<HTMLDivElement>(null);
  // Add a ref to track remote stream for better cleanup
  const remoteStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const newPeer = new Peer(`caller-${Math.random().toString(36).substr(2, 9)}`, {
      host: 'esrirw.rw',
      port: 9000,
      path: '/peerjs',
      secure: true,
    });

    newPeer.on('open', (id) => {
      setStatus(`Ready (ID: ${id})`);
      setPeer(newPeer);
    });

    newPeer.on('error', (err) => {
      console.error('PeerJS error:', err);
      setStatus(`Error: ${err.type}`);
    });

    // Add connection close handler at peer level
    newPeer.on('disconnected', () => {
      console.log('Peer disconnected');
      handleCallEnded();
    });

    newPeer.on('close', () => {
      console.log('Peer connection closed');
      handleCallEnded();
    });

    return () => {
      newPeer.destroy();
    };
  }, []);

  // Function to handle call ending from any source
  const handleCallEnded = useCallback(() => {
    console.log('Call ended - resetting UI');
    setStatus('Call ended');
    
    // Comprehensive cleanup
    if (remoteVideoRef.current?.srcObject) {
      const tracks = (remoteVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      remoteVideoRef.current.srcObject = null;
    }
    
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = null;
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    // Reset UI states
    setCall(null);
    setIsVideoEnabled(true);
    setIsAudioEnabled(true);
    
    // Delay status update to show "Call ended" briefly
    setTimeout(() => {
      if (!call) { // Only update if still no active call
        setStatus('Ready - Select an officer to call');
      }
    }, 2000);
  }, [localStream, call]);

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

  // Monitor call state changes
  useEffect(() => {
    if (call) {
      // Set up connection monitoring
      const connectionCheckInterval = setInterval(() => {
        if (call && call.peerConnection && call.peerConnection.connectionState === 'disconnected') {
          console.log('Detected disconnected state via interval check');
          clearInterval(connectionCheckInterval);
          handleCallEnded();
        }
      }, 1000);
      
      return () => {
        clearInterval(connectionCheckInterval);
      };
    }
  }, [call, handleCallEnded]);

  const allowedReceivers = kioskId === 1 ? [1, 3, 5] : kioskId === 2 ? [2, 4, 6] : [];

  const startCall = useCallback(async () => {
    if (!peer || receiverId === null) {
      setStatus('Cannot call: Peer not ready or no receiver selected.');
      return;
    }

    setStatus('Calling...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      const newCall = peer.call(`officer-${receiverId}`, stream);
      
      // Add multiple event listeners for call termination
      newCall.on('close', () => {
        console.log('Call closed event received');
        setStatus('Call ended by receiver');
        handleCallEnded();
      });
      
      if (newCall.peerConnection) {
        newCall.peerConnection.oniceconnectionstatechange = () => {
          console.log('ICE state changed:', newCall.peerConnection?.iceConnectionState);
          if (newCall.peerConnection?.iceConnectionState === 'disconnected' || 
              newCall.peerConnection?.iceConnectionState === 'failed' ||
              newCall.peerConnection?.iceConnectionState === 'closed') {
            setStatus('Connection lost');
            handleCallEnded();
          }
        };
      }

      newCall.on('stream', (remoteStream: MediaStream) => {
        console.log('Received remote stream');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteStreamRef.current = remoteStream; // Store for cleanup
          setStatus('Call connected!');
          
          // Monitor the remote tracks
          remoteStream.getTracks().forEach(track => {
            track.onended = () => {
              console.log('Remote track ended');
              if (remoteStream.getTracks().every(t => !t.enabled || t.readyState === 'ended')) {
                console.log('All remote tracks ended');
                handleCallEnded();
              }
            };
          });
        }
      });

      newCall.on('error', (err: Error) => {
        console.error('Call error:', err);
        setStatus(`Call error: ${err.message}`);
        handleCallEnded();
      });

      setCall(newCall);
    } catch (err: unknown) {
      console.error('Error starting call:', err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [peer, receiverId, handleCallEnded]);

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
            KIOSK {kioskId}
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
              objectFit: 'contain', // This ensures the video maintains its aspect ratio
            }}
          />
          {/* Logo overlay when no video */}
          {!call && (
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
                Select an officer and start a call
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
          <Select
            value={receiverId || ''}
            onChange={(e) => setReceiverId(+e.target.value)}
            sx={{
              minWidth: { xs: '100%', sm: '200px', md: '250px' },
              height: { xs: '40px', sm: '44px', md: '48px' },
              bgcolor: 'rgba(51, 65, 85, 0.9)',
              color: 'white',
              '& .MuiSelect-icon': { color: 'white' },
              '& .MuiOutlinedInput-notchedOutline': { 
                border: '1px solid rgba(148, 163, 184, 0.3)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(148, 163, 184, 0.5)',
              },
              fontSize: { xs: '0.85rem', sm: '0.9rem', md: '1rem' },
            }}
            disabled={!!call}
            MenuProps={{
              PaperProps: {
                style: {
                  maxHeight: 200,
                }
              }
            }}
          >
            <MenuItem value="" disabled>Select an officer</MenuItem>
            {cases
              .filter((item) => allowedReceivers.includes(item.assignedTo))
              .map((type) => (
                <MenuItem value={type.assignedTo} key={type.name}>
                  Officer {type.name}
                </MenuItem>
              ))}
          </Select>

          {!call ? (
            <Button
              fullWidth
              variant="contained"
              onClick={startCall}
              disabled={!peer || receiverId === null}
              startIcon={<Phone size={20} />}
              sx={{
                bgcolor: '#059669',
                '&:hover': { bgcolor: '#047857' },
                minWidth: { xs: '100%', sm: '140px', md: '160px' },
                height: { xs: '40px', sm: '44px', md: '48px' },
                fontSize: { xs: '0.9rem', sm: '1rem', md: '1.1rem' },
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
                '&:disabled': {
                  bgcolor: 'rgba(5, 150, 105, 0.3)',
                  color: 'rgba(255, 255, 255, 0.5)',
                }
              }}
            >
              Start Call
            </Button>
          ) : (
            <Stack 
              direction="row"
              spacing={{ xs: 1, sm: 2 }}
              sx={{ 
                width: { xs: '100%', sm: 'auto' }, 
                justifyContent: 'space-between',
                flexWrap: { xs: 'wrap', sm: 'nowrap' }
              }}
            >
                                  </Stack>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default Caller;