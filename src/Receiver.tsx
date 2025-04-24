import React, { useEffect, useRef, useState } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { Box, Typography, Button } from '@mui/material';

interface ReceiverProps {
  id: number;
  caseItem: { name: string; assignedTo: number };
}

const Receiver: React.FC<ReceiverProps> = ({ id, caseItem }) => {
  const [status, setStatus] = useState('Initializing...');
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [currentCall, setCurrentCall] = useState<MediaConnection | null>(null);
  const [incomingCall, setIncomingCall] = useState<MediaConnection | null>(null);

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

  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

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
    } catch (err) {
      console.error('Media error:', err);
      setStatus('Error accessing media devices');
    }
  };

  const endCall = () => {
    if (currentCall) {
      currentCall.close();
    }
    setStatus('Call ended by receiver');
    cleanup();
  };

  const cleanup = () => {
    if (localVideoRef.current?.srcObject) {
      (localVideoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current?.srcObject) {
      (remoteVideoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      remoteVideoRef.current.srcObject = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    setLocalStream(null);
    setCurrentCall(null);
    setIncomingCall(null);
  };

  return (
    <Box p={2}>
      <Typography variant="h6">Receiver - {caseItem.name}</Typography>
      <Typography>Status: {status}</Typography>

      <Box mt={2} display="flex" gap={2}>
        <Box>
          <Typography variant="subtitle2">Remote Video</Typography>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '300px' }} />
        </Box>
      </Box>

      <Box mt={2} display="flex" gap={2}>
        {incomingCall && (
          <Button variant="contained" color="primary" onClick={acceptCall}>
            Accept Call
          </Button>
        )}
        {currentCall && (
          <Button variant="contained" color="secondary" onClick={endCall}>
            End Call
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default Receiver;
