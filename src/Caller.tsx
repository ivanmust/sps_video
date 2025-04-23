import { useState, useEffect, useRef, FC, useCallback } from 'react';
import { Button, Select, MenuItem, Box, Typography } from '@mui/material';
import Peer, { MediaConnection } from 'peerjs';

const Caller:FC<{ cases: { name: string, assignedTo: number }[]}> = ({cases}) => {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [call, setCall] = useState<MediaConnection | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [receiverId, setReceiverId] = useState(1);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [toBeCalled, setTobeCalled] = useState(0);

  useEffect(() => {
    // Initialize PeerJS

    const peer = new Peer(`caller-${Math.random().toString(36).substr(2, 9)}`, {
      host: 'esrirw.rw',
      port: 9000,
      path: '/peerjs',
      secure: true,
    });
    
    peer.on('open', (id) => {
      setStatus(`Ready (ID: ${id})`);
      setPeer(peer);
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      setStatus(`Error: ${err.type}`);
    });

    return () => {
      if (peer) peer.destroy();
    };
  }, []);

  
useEffect(() => {
  const pathname =  window.location.pathname;
  const id = parseInt(pathname.split('/').pop()!);

  if(id == 1) {
    if(receiverId == 1) {
      setTobeCalled(1)
      // newCall = peer.call(`officer-1`, stream);
    } else if(receiverId == 3) {
      setTobeCalled(3)
      // newCall = peer.call(`officer-3`, stream);
    } else if(receiverId == 5) {
      // newCall = peer.call(`officer-5`, stream);
      setTobeCalled(5)
    }
    
  } else {
    if(receiverId == 1) {
      setTobeCalled(2)
      // newCall = peer.call(`officer-1`, stream);
    }
    if(receiverId == 3) {
      setTobeCalled(4)
      // newCall = peer.call(`officer-3`, stream);
    }
    if(receiverId == 2) {
      setTobeCalled(2)
      // newCall = peer.call(`officer-2`, stream);
    } else if(receiverId == 4) {
      // newCall = peer.call(`officer-4`, stream);
      setTobeCalled(4)
    }else if(receiverId == 6) {  
      // newCall = peer.call(`officer-6`, stream);
      setTobeCalled(6)
    }
    if(receiverId == 5) {
      // newCall = peer.call(`officer-5`, stream);
      setTobeCalled(6)
    }

  }
  console.log('id', id)
  console.log('receiverId', receiverId)

  console.log(toBeCalled, receiverId)
}, [receiverId, toBeCalled, window.location.pathname])
  const startCall = useCallback(async () => {
    if (!peer) return;
    setStatus('Calling...');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const newCall = peer.call(`officer-${toBeCalled}`, stream);
      
      newCall.on('stream', (remoteStream: MediaStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          setStatus('Call connected!');
        }
      });
      
      newCall.on('close', () => {
        setStatus('Call ended');
        endCall();
      });
      
      newCall.on('error', (err: Error) => {
        console.error('Call error:', err);
        setStatus(`Call error: ${err.message}`);
        endCall();
      });
      
      setCall(newCall);
    } catch (err: unknown) {
      console.error('Error starting call:', err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [peer, toBeCalled]);

  const endCall = () => {
    if (call) {
      call.close();
      setCall(null);
    }
    if (remoteVideoRef.current?.srcObject) {
      const tracks = (remoteVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track: MediaStreamTrack) => track.stop());
      remoteVideoRef.current.srcObject = null;
      window.location.reload();
    }
    setStatus('Ready to call');
  };


 

  return (
    <Box sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>KIOSK</Typography>
      
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{ width: '100%', maxHeight: '60vh', backgroundImage: `url("/logo.png")`, borderRadius: 8, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
      />
      
      <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Select
          value={receiverId}
          onChange={(e) => setReceiverId(+e.target.value)}
          sx={{ minWidth: 120 }}
        >
          {(()=>{
            const uniqueTypes = new Set([...Object.values(cases)].map((item) => item.name));
            return Array.from(uniqueTypes).map((type) => {
              const foundCase = cases.find(c => c.name=== type)
              if(!foundCase) return
              return (
              <MenuItem value={foundCase.assignedTo} key={type}>Officer {type}</MenuItem>
            )});
          })()}
        </Select>
        
        <Button
          variant="contained"
          onClick={startCall}
          disabled={!peer || !!call}
        >
          Start Call
        </Button>
      </Box>
      
      <Typography sx={{ mt: 2 }}>Status: {status}</Typography>
    </Box>
  );
};

export default Caller;