import { useState, useEffect, useRef, FC, useCallback } from 'react';
import { Button, Select, MenuItem, Box, Typography } from '@mui/material';
import Peer, { MediaConnection } from 'peerjs';

const Caller: FC<{ cases: { name: string; assignedTo: number }[] }> = ({ cases }) => {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [call, setCall] = useState<MediaConnection | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [receiverId, setReceiverId] = useState<number | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Replace this with your logic to determine the kiosk ID
  const kioskId = 1; // Example: 1 or 2

  const allowedReceivers: { [key: number]: number[] } = {
    1: [1, 3, 5],
    2: [2, 4, 6],
  };

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

    return () => {
      newPeer.destroy();
    };
  }, []);

  const startCall = useCallback(async () => {
    if (!peer || receiverId === null) return;
    setStatus('Calling...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const newCall = peer.call(`officer-${receiverId}`, stream);

      newCall.on('stream', (remoteStream: MediaStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          setStatus('Call connected!');
        }
      });

      newCall.on('close', () => {
        setStatus('Call ended by receiver');
        cleanup();
      });

      newCall.on('error', (err: Error) => {
        console.error('Call error:', err);
        setStatus(`Call error: ${err.message}`);
        cleanup();
      });

      setCall(newCall);
    } catch (err: unknown) {
      console.error('Error starting call:', err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [peer, receiverId]);

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
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject = null;
    }
    setCall(null);
  };

  const filteredCases = cases.filter((c) => allowedReceivers[kioskId]?.includes(c.assignedTo));

  return (
    <Box sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        KIOSK {kioskId}
      </Typography>

      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{
          width: '100%',
          maxHeight: '30vh',
          backgroundImage: `url("/logo.png")`,
          borderRadius: 8,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      />

      <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Select
          value={receiverId ?? ''}
          onChange={(e) => setReceiverId(+e.target.value)}
          sx={{ minWidth: 120 }}
          displayEmpty
        >
          <MenuItem value="" disabled>
            Select Officer
          </MenuItem>
          {filteredCases.map((c) => (
            <MenuItem value={c.assignedTo} key={c.assignedTo}>
              Officer {c.name}
            </MenuItem>
          ))}
        </Select>

        <Button variant="contained" onClick={startCall} disabled={!peer || !!call || receiverId === null}>
          Start Call
        </Button>
      </Box>

      <Typography sx={{ mt: 2 }}>Status: {status}</Typography>
    </Box>
  );
};

export default Caller;
