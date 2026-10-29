export class Network {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
    this.isConnected = false;
  }

  connect(onOpen) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      if (onOpen) onOpen();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${window.location.host}`);

    this.socket.onopen = () => {
      this.isConnected = true;
      console.log('[Network] Connected to game server');
      if (onOpen) onOpen();
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handler = this.handlers.get(msg.type);
        if (handler) {
          handler(msg);
        }
      } catch (err) {
        console.error('[Network] Parse error:', err);
      }
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      console.warn('[Network] Disconnected from server');
    };
  }

  on(messageType, callback) {
    this.handlers.set(messageType, callback);
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }
}

export const network = new Network();

