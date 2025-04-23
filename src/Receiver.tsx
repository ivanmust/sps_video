import { useState, useEffect, useRef, FC, useCallback } from 'react';
import { Button, Box, Typography } from '@mui/material';
import Peer, { MediaConnection } from 'peerjs';

const Receiver: FC<{
  type?: string;
  id?: number;
  caseItem: {
    name: string;
  };
}> = ({ type = 'officer', id = 1, caseItem }) => {
  const [call, setCall] = useState<MediaConnection | null>(null);
  const [incomingCall, setIncomingCall] = useState<MediaConnection | null>(null);
  const [status, setStatus] = useState('Initializing...');
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const peerId = `${type}-${id}`;
    setStatus(`Connecting as ${peerId}...`);

    const newPeer = new Peer(peerId, {
      host: 'esrirw.rw',
      port: 9000,
      path: '/peerjs',
      secure: true,
    });

    newPeer.on('open', () => {
      setStatus(`Ready to receive calls (${peerId})`);
    });

    newPeer.on('call', (incoming: MediaConnection) => {
      if (call) {
        incoming.close();
        setStatus(`Busy - Rejected call from ${incoming.peer}`);
      } else {
        setIncomingCall(incoming);
        setStatus('Incoming call...');
      }
    });

    newPeer.on('error', (err) => {
      console.error('PeerJS error:', err);
      setStatus(`Error: ${err.type}`);
    });

    return () => {
      newPeer.destroy();
      endCall();
    };
  }, [type, id]);

  const endCall = useCallback(() => {
    if (call) {
      call.close();
      setCall(null);
    }

    if (incomingCall) {
      incomingCall.close();
      setIncomingCall(null);
    }

    if (localVideoRef.current?.srcObject) {
      const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      localVideoRef.current.srcObject = null;
    }

    setStatus('Ready for calls');
  }, [call, incomingCall]);

  const handleIncomingCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      incomingCall.answer(stream);
      setCall(incomingCall);
      setStatus(`In call with ${incomingCall.peer}`);
      setIncomingCall(null);

      incomingCall.on('close', () => {
        setStatus('Call ended');
        endCall();
      });

      incomingCall.on('error', (err) => {
        console.error('Call error:', err);
        setStatus(`Call error: ${err.message}`);
        endCall();
      });

    } catch (err: unknown) {
      console.error('Error answering call:', err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [incomingCall, endCall]);

  return (
    <Box sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        {caseItem.name}
      </Typography>

      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          maxHeight: '60vh',
          backgroundImage: `url("/logo.png")`,
          borderRadius: 8,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      />

      <Box sx={{ mt: 2 }}>
        {status === 'Incoming call...' ? (
          <Button variant="contained" onClick={handleIncomingCall}>
            Accept Call
          </Button>
        ) : (
          <Button variant="contained" onClick={endCall} disabled={!call}>
            End Call
          </Button>
        )}
      </Box>

      <Typography sx={{ mt: 2 }}>Status: {status}</Typography>
    </Box>
  );
};

export default Receiver;
