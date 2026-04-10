import { io } from 'socket.io-client';

export class NetworkManager {
  constructor() {
    this.socket     = null;
    this.playerId   = null;
    this.slot       = null;
    this.latestState = null;
    this.connected  = false;
    this.ping       = 0;
    this._pingInterval = null;

    // Callbacks
    this.onJoined     = null; // ({ playerId, slot, token, reconnected })
    this.onRoomInfo   = null; // ({ roomId, playerCount })
    this.onRoomFull   = null;
    this.onPlayerDied = null; // ({ playerId })
    this.onPlayerWon  = null; // ({ playerId, name })
    this.onNewWave    = null; // ({ wave })
    this.onWaveClear  = null; // ({ nextWave, delay })
    this.onVictory    = null; // ({ wave, survivalTime, players })
    this.onKill       = null; // ({ name, slot, enemyType })
  }

  connect(serverUrl = '') {
    this.socket = io(serverUrl, {
      transports: ['polling', 'websocket'],
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Net] connected', this.socket.id);
      this._startPing();
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      clearInterval(this._pingInterval);
      console.log('[Net] disconnected');
    });

    this.socket.on('joined',     (d) => { this.playerId = d.playerId; this.slot = d.slot; this.onJoined?.(d); });
    this.socket.on('roomInfo',   (d) => this.onRoomInfo?.(d));
    this.socket.on('roomFull',   (d) => this.onRoomFull?.(d));
    this.socket.on('playerDied', (d) => this.onPlayerDied?.(d));
    this.socket.on('playerWon',  (d) => this.onPlayerWon?.(d));
    this.socket.on('newWave',    (d) => this.onNewWave?.(d));
    this.socket.on('waveClear',  (d) => this.onWaveClear?.(d));
    this.socket.on('victory',    (d) => this.onVictory?.(d));
    this.socket.on('kill',       (d) => this.onKill?.(d));
    this.socket.on('pong',       ({ ts }) => { this.ping = Date.now() - ts; });

    this.socket.on('gs', (state) => { this.latestState = state; });
  }

  joinRoom(roomId, name, appearance) {
    this.socket?.emit('joinRoom', { roomId, name, appearance });
  }

  tryReconnect(token, roomId) {
    this.socket?.emit('tryReconnect', { token, roomId });
  }

  sendInput(keys, mouseAngle, shoot, reload, useHealthpack, dash, grenade) {
    if (!this.connected || !this.playerId) return;
    this.socket.emit('input', { ...keys, mouseAngle, shoot, reload, useHealthpack, dash, grenade });
  }

  disconnect() {
    clearInterval(this._pingInterval);
    this.socket?.disconnect();
  }

  _startPing() {
    clearInterval(this._pingInterval);
    this._pingInterval = setInterval(() => {
      if (this.connected) this.socket.emit('ping', { ts: Date.now() });
    }, 2000);
  }
}
