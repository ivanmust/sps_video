import { useState, useEffect, useRef, FC, useCallback } from 'react';
import { Button, Select, MenuItem, Box, Typography, Paper, Stack } from '@mui/material';
import Peer, { MediaConnection } from 'peerjs';
import { Phone } from 'lucide-react';

const Caller: FC<{ cases: { name: string; assignedTo: number }[]; kioskId: number }> = ({ cases, kioskId }) => {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [call, setCall] = useState<MediaConnection | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [receiverId, setReceiverId] = useState<number | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVideoAvailable, setIsVideoAvailable] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
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

  const handleCallEnded = useCallback(() => {
    console.log('Call ended - resetting UI');
    setStatus('Call ended');

    // Stop the remote video
    if (remoteVideoRef.current?.srcObject) {
      const tracks = (remoteVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      remoteVideoRef.current.srcObject = null;
    }

    // Clear remote stream reference
    remoteStreamRef.current = null;

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    setCall(null);
    setIsVideoAvailable(false);

    // Reset UI to initial state after a short delay
    setTimeout(() => {
      setStatus('Ready - Select an officer to call');
    }, 1000);
  }, [localStream]);

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

      newCall.on('close', () => {
        console.log('Call closed by receiver');
        handleCallEnded();
      });

      newCall.on('error', (err) => {
        console.error('Call error:', err);
        setStatus(`Call error: ${err.message}`);
        handleCallEnded();
      });

      newCall.on('stream', (remoteStream: MediaStream) => {
        console.log('Received remote stream');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteStreamRef.current = remoteStream;
          setIsVideoAvailable(true);
          setStatus('Call connected!');
        }

        remoteStream.getTracks().forEach(track => {
          track.onended = () => {
            console.log('Remote track ended');
            if (remoteStream.getTracks().every(t => t.readyState === 'ended')) {
              handleCallEnded();
            }
          };
        });
      });

      setCall(newCall);
    } catch (err) {
      console.error('Error starting call:', err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [peer, receiverId, handleCallEnded]);

  return (
    <Box sx={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      flexDirection: 'column', 
      bgcolor: '#1e293b', 
      color: 'white', 
      overflow: 'hidden'
    }}>
      
      {/* Header - More compact for small screens */}
      <Paper elevation={3} sx={{ 
        p: { xs: 1, sm: 1.5, md: 2 }, 
        bgcolor: '#0f172a', 
        borderBottom: '1px solid rgba(148, 163, 184, 0.2)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1.5, 
        height: { xs: '50px', sm: '60px', md: '70px' }
      }}>
        <Box component="img" src="/logo.png" alt="Logo" sx={{ 
          height: { xs: '24px', sm: '28px', md: '36px' }, 
          width: 'auto' 
        }} />
        <Box>
          <Typography variant="h5" sx={{ 
            color: '#ffffff', 
            fontWeight: 600, 
            fontSize: { xs: '0.9rem', sm: '1.1rem', md: '1.3rem' },
            lineHeight: 1.2
          }}>
            KIOSK {kioskId}
          </Typography>
          <Typography variant="body2" sx={{ 
            color: status.includes('Error') ? '#ef4444' : status.includes('Connected') ? '#10b981' : '#94a3b8', 
            fontSize: { xs: '0.65rem', sm: '0.7rem', md: '0.8rem' },
            lineHeight: 1.2
          }}>
            Status: {status}
          </Typography>
        </Box>
      </Paper>

      {/* Main Content - Video Area */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        p: { xs: 1, sm: 1.5, md: 2 }, 
        position: 'relative', 
        bgcolor: '#1e293b', 
        height: 'calc(100vh - 50px)' // Adjusted based on header height
      }}>
        
        <Box sx={{ 
          flex: 1, 
          position: 'relative', 
          borderRadius: 1, 
          overflow: 'hidden', 
          bgcolor: '#0f172a', 
          border: '1px solid rgba(148, 163, 184, 0.2)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: '100%' 
        }}>
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
          />
          
          {/* Show logo when no video */}
          {!isVideoAvailable && (
            <Box sx={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)', 
              textAlign: 'center', 
              width: '90%' 
            }}>
              <Box 
                component="img" 
                src="/logo.png" 
                alt="Waiting" 
                sx={{ 
                  width: { xs: '70px', sm: '90px', md: '110px' }, 
                  height: 'auto', 
                  opacity: 0.5, 
                  mb: 1.5 
                }} 
              />
              <Typography variant="h6" sx={{ 
                color: '#94a3b8', 
                fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1.1rem' } 
              }}>
                Select an officer and start a call
              </Typography>
            </Box>
          )}
        </Box>

        {/* Controls - Simplified for small screens */}
        <Stack 
          ref={controlsRef} 
          direction={{ xs: 'column', sm: 'row' }} 
          spacing={{ xs: 1, sm: 1.5 }} 
          sx={{
            position: 'absolute', 
            bottom: { xs: '10px', sm: '16px', md: '24px' }, 
            left: '50%', 
            transform: 'translateX(-50%)',
            bgcolor: 'rgba(15, 23, 42, 0.95)', 
            backdropFilter: 'blur(12px)', 
            p: { xs: 1, sm: 1.5 }, 
            px: { xs: 1.5, sm: 2 },
            borderRadius: { xs: 1.5, sm: 2 }, 
            border: '1px solid rgba(148, 163, 184, 0.2)', 
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            width: { xs: 'calc(100% - 20px)', sm: 'auto' }, 
            maxWidth: '95%',
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 3
          }}
        >
          <Select 
            value={receiverId || ''} 
            onChange={(e) => setReceiverId(+e.target.value)} 
            sx={{
              minWidth: { xs: '100%', sm: '180px', md: '220px' }, 
              height: { xs: '36px', sm: '40px', md: '44px' },
              bgcolor: 'rgba(51, 65, 85, 0.9)', 
              color: 'white', 
              '& .MuiSelect-icon': { color: 'white' },
              '& .MuiOutlinedInput-notchedOutline': { border: '1px solid rgba(148, 163, 184, 0.3)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148, 163, 184, 0.5)' },
              fontSize: { xs: '0.8rem', sm: '0.85rem', md: '0.95rem' }
            }} 
            disabled={!!call} 
            MenuProps={{ 
              PaperProps: { 
                style: { 
                  maxHeight: 180,
                  backgroundColor: '#1e293b',
                  color: 'white'
                } 
              } 
            }}
          >
            <MenuItem value="" disabled>Select an officer</MenuItem>
            {cases.filter(item => allowedReceivers.includes(item.assignedTo)).map(type => (
              <MenuItem value={type.assignedTo} key={type.name}>
                Officer {type.name}
              </MenuItem>
            ))}
          </Select>

          {!call && (
            <Button 
              fullWidth 
              variant="contained" 
              onClick={startCall} 
              disabled={!peer || receiverId === null}
              startIcon={<Phone size={16} />} 
              sx={{
                bgcolor: '#059669', 
                '&:hover': { bgcolor: '#047857' },
                minWidth: { xs: '100%', sm: '120px', md: '140px' },
                height: { xs: '36px', sm: '40px', md: '44px' },
                fontSize: { xs: '0.8rem', sm: '0.85rem', md: '0.95rem' },
                fontWeight: 600, 
                boxShadow: '0 4px 8px rgba(5, 150, 105, 0.3)',
                '&:disabled': { bgcolor: 'rgba(5, 150, 105, 0.3)', color: 'rgba(255, 255, 255, 0.5)' }
              }}
            >
              Start Call
            </Button>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default Caller;