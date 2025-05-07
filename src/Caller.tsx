import { useState, useEffect, useRef, FC, useCallback } from 'react';
import { Button, Box, Typography, Paper, Stack } from '@mui/material';
import Peer, { MediaConnection } from 'peerjs';
import { Phone } from 'lucide-react';
import PropTypes from 'prop-types';




const Caller: FC<{ cases: { name: string; assignedTo: number }[]; kioskId: number }> = ({ cases, kioskId }) => {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [call, setCall] = useState<MediaConnection | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [, setReceiverId] = useState<number | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVideoAvailable, setIsVideoAvailable] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  
  // Create the peer connection
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
      
      // Check for auto-start parameters after peer is ready
      checkForAutoStart();
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

  // Enhanced message listener - detects messages from both parent windows and direct messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('Received message:', event.data);
      
      // Check if this is a call initiation message
      if (event.data && event.data.type === 'INITIATE_CALL') {
        console.log('Received call initiation message:', event.data);
        
        // Extract the officer ID
        const officerId = event.data.officerId;
        
        // Check if this is a valid officer for this kiosk
        const allowedReceivers = kioskId === 1 ? [1, 3, 5] : kioskId === 2 ? [2, 4, 6] : [];
        
        // Make sure kioskId matches if it was provided
        if (event.data.kioskId && event.data.kioskId !== kioskId) {
          console.log(`Ignoring call for different kiosk ID: ${event.data.kioskId}`);
          return;
        }
        
        if (allowedReceivers.includes(officerId)) {
          console.log(`Auto-starting call to Officer ID: ${officerId}`);
          handleOfficerSelect(officerId);
        } else {
          console.warn(`Invalid officer ID for this kiosk: ${officerId}`);
        }
      }
    };
    
    // Add the event listener to catch messages from any source
    window.addEventListener('message', handleMessage);
    
    // Cleanup
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [kioskId]);

  // Check API endpoints for call requests
  useEffect(() => {
    const checkForCallRequests = async () => {
      try {
        const response = await fetch(`/api/pending-calls?kioskId=${kioskId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.pendingCall) {
            console.log('Found pending call:', data);
            handleOfficerSelect(data.officerId);
            
            // Acknowledge that we've processed this call request
            await fetch(`/api/acknowledge-call`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                callId: data.callId,
                kioskId: kioskId
              })
            });
          }
        }
      } catch (error) {
        console.error('Error checking for call requests:', error);
      }
    };
    
    // Poll every few seconds
    const intervalId = setInterval(checkForCallRequests, 3000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [kioskId]);

  // Function to check URL parameters for auto-start
  const checkForAutoStart = useCallback(() => {
    if (!peer) return; // Wait for peer to be ready
    
    // Parse URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const autostart = urlParams.get('autostart');
    const officerId = urlParams.get('officerId');
    
    // If autostart=true and officerId is provided, start the call
    if (autostart === 'true' && officerId) {
      const officerIdNum = parseInt(officerId, 10);
      
      // Check if this is a valid officer for this kiosk
      const allowedReceivers = kioskId === 1 ? [1, 3, 5] : kioskId === 2 ? [2, 4, 6] : [];
      if (allowedReceivers.includes(officerIdNum)) {
        console.log(`Auto-starting call to Officer ID: ${officerIdNum}`);
        handleOfficerSelect(officerIdNum);
        
        // Clean up URL parameters after starting call but maintain the path
        const url = new URL(window.location.href);
        url.searchParams.delete('autostart');
        url.searchParams.delete('officerId');
        window.history.replaceState({}, '', url);
      }
    }
  }, [peer, kioskId]);

  // Call checkForAutoStart again when component is fully mounted
  useEffect(() => {
    if (peer) {
      checkForAutoStart();
    }
  }, [peer, checkForAutoStart]);

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
    setReceiverId(null);

    // Reset UI to initial state after a short delay
    setTimeout(() => {
      setStatus('Ready - Select an officer to call');
    }, 1000);
    
    // Notify parent window if needed
    if (window.opener) {
      window.opener.postMessage({ type: 'CALL_ENDED' }, '*');
    }
  }, [localStream]);

  const allowedReceivers = kioskId === 1 ? [1, 3, 5] : kioskId === 2 ? [2, 4, 6] : [];

  const startCall = useCallback(async (selectedReceiverId: number) => {
    if (!peer) {
      setStatus('Cannot call: Peer not ready.');
      return;
    }

    setStatus('Calling...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      // Generate metadata to identify the call
      const metadata = {
        kioskId: kioskId
      };

      // Make the call with metadata
      const newCall = peer.call(`officer-${selectedReceiverId}`, stream, { metadata });

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
          
          // Notify parent window if needed
          if (window.opener) {
            window.opener.postMessage({ type: 'CALL_CONNECTED' }, '*');
          }
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
  }, [peer, handleCallEnded, kioskId]);

  // Function to handle officer selection that automatically starts the call
  const handleOfficerSelect = (officerId: number) => {
    setReceiverId(officerId);
    
    // Determine the URL extension based on the officer
    const officerCase = cases.find(item => item.assignedTo === officerId);
    const officerName = officerCase?.name?.toLowerCase() || '';
    
    // Update the URL based on officer selection
    let extension = '';
    if (officerName.includes('reporting')) {
      extension = '/reporting';
    } else if (officerName.includes('inquiries')) {
      extension = '/inquiries';
    } else if (officerName.includes('complaints')) {
      extension = '/complaints';
    }
    
    // Get the base path from current URL
    const pathParts = window.location.pathname.split('/');
    // Find the base call URL
    let basePath = '';
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i] === 'call') {
        basePath = pathParts.slice(0, i + 2).join('/'); // Include 'call' and kioskId
        break;
      }
    }
    
    // Update URL without navigating, preserving the base path
    const newUrl = extension ? `${basePath}${extension}` : basePath;
    window.history.pushState({}, '', newUrl);
    
    // Automatically start the call with the selected officer
    startCall(officerId);
  };

  // Export handleOfficerSelect to make it available to the parent window
  useEffect(() => {
    // Expose the function to the parent/opener window
    (window as any).initiateCall = (officerId: number) => {
      if (allowedReceivers.includes(officerId)) {
        handleOfficerSelect(officerId);
        return true;
      }
      return false;
    };
    
    // Handle call termination request from parent
    const handleParentMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'END_CALL') {
        if (call) {
          call.close();
          handleCallEnded();
        }
      }
    };
    
    window.addEventListener('message', handleParentMessage);
    
    return () => {
      window.removeEventListener('message', handleParentMessage);
    };
  }, [allowedReceivers, call, handleCallEnded]);

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
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2
            }}>
              <Box 
                component="img" 
                src="/logo.png" 
                alt="Waiting" 
                sx={{ 
                  width: { xs: '120px', sm: '150px', md: '180px' }, 
                  height: 'auto', 
                  opacity: 0.7
                }} 
              />
              <Typography variant="h6" sx={{ 
                color: '#94a3b8', 
                fontSize: { xs: '0.9rem', sm: '1rem', md: '1.2rem' },
                fontWeight: 500
              }}>
                {!call ? 'Waiting for call from kiosk...' : 'Connecting to officer...'}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Controls - Officer Buttons */}
        {!call ? (
          <Stack 
            ref={controlsRef} 
            direction={{ xs: 'column', sm: 'row' }} 
            spacing={{ xs: 1, sm: 1.5 }} 
            sx={{
              position: 'absolute',
              bottom: { xs: 16, sm: 20, md: 24 },
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              justifyContent: 'center',
              width: { xs: '90%', sm: 'auto' },
            }}
          >
            {allowedReceivers.map((officerId) => {
              const officerData = cases.find(c => c.assignedTo === officerId);
              
              return (
                <Button
                  key={officerId}
                  variant="contained"
                  color="primary"
                  onClick={() => handleOfficerSelect(officerId)}
                  startIcon={<Phone />}
                  disabled={!!call}
                  sx={{
                    px: { xs: 2, sm: 3 },
                    py: { xs: 1, sm: 1.5 },
                    bgcolor: '#3b82f6',
                    '&:hover': {
                      bgcolor: '#2563eb',
                    },
                    whiteSpace: 'nowrap',
                    minWidth: { xs: '100%', sm: '120px' },
                  }}
                >
                  {officerData?.name || `Officer ${officerId}`}
                </Button>
              );
            })}
          </Stack>
        ) : (
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (call) {
                call.close();
                handleCallEnded();
              }
            }}
            startIcon={<Phone />}
            sx={{
              position: 'absolute',
              bottom: { xs: 16, sm: 20, md: 24 },
              left: '50%',
              transform: 'translateX(-50%)',
              px: { xs: 2, sm: 3 },
              py: { xs: 1, sm: 1.5 },
              bgcolor: '#ef4444',
              '&:hover': {
                bgcolor: '#dc2626',
              }
            }}
          >
            End Call
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default Caller;

