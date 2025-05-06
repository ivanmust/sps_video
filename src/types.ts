export interface Officer {
  id: number;
  name: string;
  rank?: string;
}

export interface Call {
  callId: number;
  kioskId: number;
  officerId: number;
  callType: string;
  autostart: boolean;
  peerId?: string;
  timestamp: number;
  acknowledged: boolean;
  status: string;
} 