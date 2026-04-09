import { io } from 'socket.io-client';

export class NetworkManager {
  constructor() {
    this.socket     = null;
    this.playerId   = null;
    this.slot       = null;
    this.latestState = null;
    this.connected  = false;

    // Callbacks the game sets
    this.onJoined     = null; // ({ playerId, slot, wave })
    this.onRoomInfo   = null; // ({ roomId, playerCount })
    this.onRoomFull   = null;
    this.onPlayerDied = null; // ({ playerId })
    this.onPlayerWon  = null; // ({ playerId, name })
    this.onNewWave    = null; // ({ wave })
    this.onWaveClear  = null; // ({ nextWave, delay })
  }

  connect(serverUrl = '') {
    this.socket = io(serverUrl, {
      transports: ['polling', 'websocket'], // polling first — most reliable through proxies
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Net] connected', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('[Net] disconnected');
    });

    this.socket.on('joined',     (d) => { this.playerId = d.playerId; this.slot = d.slot; this.onJoined?.(d); });
    this.socket.on('roomInfo',   (d) => this.onRoomInfo?.(d));
    this.socket.on('roomFull',   (d) => this.onRoomFull?.(d));
    this.socket.on('playerDied', (d) => this.onPlayerDied?.(d));
    this.socket.on('playerWon',  (d) => this.onPlayerWon?.(d));
    this.socket.on('newWave',    (d) => this.onNewWave?.(d));
    this.socket.on('waveClear',  (d) => this.onWaveClear?.(d));

    // Main game state snapshot
    this.socket.on('gs', (state) => {
      this.latestState = state;
    });
  }

  joinRoom(roomId, name) {
    this.socket?.emit('joinRoom', { roomId, name });
  }

  /** Call every frame with current input state */
  sendInput(keys, mouseAngle, shoot, reload) {
    if (!this.connected || !this.playerId) return;
    this.socket.emit('input', { ...keys, mouseAngle, shoot, reload });
  }

  disconnect() {
    this.socket?.disconnect();
  }
}
