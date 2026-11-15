import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, ClientInput } from '../../shared/types';
import { Lobby } from './components/Lobby';
import { WaitingRoom } from './components/WaitingRoom';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { GameOverModal } from './components/GameOverModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { ConfigModal } from './components/ConfigModal';
import { ReadyGoOverlay } from './components/ReadyGoOverlay';
import { sound } from './utils/sound';
import { SERVER_URL } from './utils/api';
import { Play, RotateCcw, Sliders, Home, Pause, Volume2, VolumeX } from 'lucide-react';

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('precision_player_name') || `Pilot_${Math.floor(Math.random() * 900 + 100)}`;
  });
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showReadyGo, setShowReadyGo] = useState(false);
  const [readyGoTrigger, setReadyGoTrigger] = useState(0);
  const [volume, setVolume] = useState<number>(sound.volume);

  const lastTierRef = useRef<number>(1);
  const wasAliveRef = useRef<boolean>(true);
  const lastStatusRef = useRef<string>('lobby');
  const liveGameStateRef = useRef<GameState | null>(null);
  const lastUiSyncSignatureRef = useRef<string>('');

  useEffect(() => {
    localStorage.setItem('precision_player_name', playerName);
  }, [playerName]);

  useEffect(() => {
    const s = io(SERVER_URL || undefined, {
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      setConnected(true);
      setMyPlayerId(s.id || '');
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    s.on('roomCreated', ({ playerId, state }: { roomId: string; playerId: string; state: GameState }) => {
      setMyPlayerId(playerId);
      wasAliveRef.current = true;
      if (state.status === 'countdown') {
        sound.stopMusic();
        setReadyGoTrigger((n) => n + 1);
        setShowReadyGo(true);
      }
      lastStatusRef.current = state.status;
      liveGameStateRef.current = state;
      setGameState(state);
    });

    s.on('roomJoined', ({ playerId, state }: { roomId: string; playerId: string; state: GameState }) => {
      setMyPlayerId(playerId);
      wasAliveRef.current = state.players[playerId]?.alive ?? true;
      lastStatusRef.current = state.status;
      liveGameStateRef.current = state;
      setGameState(state);
    });

    s.on('roomLeft', () => {
      sound.stopMusic();
      setShowReadyGo(false);
      liveGameStateRef.current = null;
      setGameState(null);
    });

    s.on('gameState', (state: GameState) => {
      // Always update the mutable ref immediately for the 120Hz+ Canvas loop (0 React overhead)
      liveGameStateRef.current = state;

      const myId = s.id || '';
      const me = state.players[myId];

      // Only trigger a React state re-render when HUD/Modal-visible fields change
      const playersArr = Object.values(state.players);
      const aliveCount = playersArr.filter((p) => p.alive).length;
      const uiSig = `${state.status}|${state.currentTier}|${me?.score ?? 0}|${me?.alive ?? true}|${aliveCount}/${playersArr.length}|${state.pausedBy ?? ''}|${state.winner?.id ?? ''}`;
      if (uiSig !== lastUiSyncSignatureRef.current) {
        lastUiSyncSignatureRef.current = uiSig;
        setGameState(state);
      }

      // Trigger green-screen "Ready... Go!" video overlay when entering countdown
      if (state.status === 'countdown' && lastStatusRef.current !== 'countdown') {
        sound.stopMusic();
        setReadyGoTrigger((n) => n + 1);
        setShowReadyGo(true);
      }

      // Reset alive tracking when round begins from countdown
      if (state.status === 'playing' && lastStatusRef.current === 'countdown') {
        wasAliveRef.current = true;
        lastTierRef.current = 1;
      }

      // Pause or resume background music when entering/leaving pause screen
      if (state.status === 'paused' && lastStatusRef.current !== 'paused') {
        sound.pauseMusic();
      } else if (state.status === 'playing' && lastStatusRef.current === 'paused') {
        sound.resumeMusic();
      }

      // Handle elimination & Game Over audio:
      // - In multiplayer, if local player dies while others are still alive (or loses), play "Failure..."
      // - When the match ends (gameover), stop music and play "GAME!"
      if (me && wasAliveRef.current && !me.alive) {
        wasAliveRef.current = false;
        setShowReadyGo(false);

        const isMultiplayer = playersArr.length > 1;
        if (isMultiplayer && state.status !== 'gameover') {
          sound.playFailure();
        } else {
          sound.stopMusic();
          sound.playCollision();
        }
      }

      if (state.status === 'gameover' && lastStatusRef.current !== 'gameover') {
        sound.stopMusic();
        setShowReadyGo(false);
        // If local player was already eliminated earlier in multiplayer, play "GAME!" when the match finally ends
        if (!me || !wasAliveRef.current) {
          sound.playCollision();
        }
      }

      // Play victory sound if multiplayer match ends with us as winner
      if (
        state.status === 'gameover' &&
        lastStatusRef.current !== 'gameover' &&
        Object.keys(state.players).length > 1 &&
        state.winner?.id === myId
      ) {
        sound.playVictory();
      }

      lastStatusRef.current = state.status;
      lastTierRef.current = state.currentTier;
    });

    s.on('tierUp', () => {
      sound.playTierUp();
    });

    s.on('error', (msg: string) => {
      alert(msg);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  const handleTogglePause = useCallback(() => {
    if (!socket) return;
    socket.emit('togglePause');
  }, [socket]);

  // Global ESC key handler for Pause / Resume
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showConfig) {
          setShowConfig(false);
          return;
        }
        if (showLeaderboard) {
          setShowLeaderboard(false);
          return;
        }
        if (gameState && (gameState.status === 'playing' || gameState.status === 'paused')) {
          e.preventDefault();
          handleTogglePause();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, showConfig, showLeaderboard, handleTogglePause]);

  const handleCreateRoom = (solo: boolean = false) => {
    if (!socket) return;
    socket.emit('createRoom', { playerName, autoStart: solo });
  };

  const handleJoinRoom = (roomCode: string) => {
    if (!socket || !roomCode.trim()) return;
    socket.emit('joinRoom', { roomId: roomCode.trim().toUpperCase(), playerName });
  };

  const handleStartGame = () => {
    if (!socket) return;
    socket.emit('startGame');
  };

  const handleReturnToWaitingRoom = () => {
    if (!socket) return;
    sound.stopMusic();
    socket.emit('returnToWaitingRoom');
  };

  const handleSendInput = useCallback((input: ClientInput) => {
    if (!socket) return;
    sound.ensureMusicPlaying();
    socket.emit('playerInput', input);
  }, [socket]);

  const handleLeaveRoom = () => {
    sound.stopMusic();
    if (socket) {
      socket.emit('leaveRoom');
    }
    setGameState(null);
  };

  const currentView = !gameState
    ? 'lobby'
    : gameState.status === 'lobby'
    ? 'waiting'
    : 'game';

  return (
    <main className="w-screen h-[100dvh] overflow-hidden bg-[#07080c] relative flex flex-col justify-center items-center select-none font-sans">
      {/* Network status badge (lobby & waiting room only) */}
      {currentView !== 'game' && (
        <div className="absolute bottom-2 right-3 z-30 flex items-center gap-2 text-[10px] font-mono text-gray-500">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500 animate-ping'}`} />
          <span>{connected ? 'CONNECTED' : 'CONNECTING...'}</span>
        </div>
      )}

      {/* View 1: Main Menu Lobby */}
      {currentView === 'lobby' && (
        <Lobby
          playerName={playerName}
          setPlayerName={setPlayerName}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
          onOpenConfig={() => setShowConfig(true)}
        />
      )}

      {/* View 2: Multiplayer Waiting Room */}
      {currentView === 'waiting' && gameState && (
        <WaitingRoom
          gameState={gameState}
          myPlayerId={myPlayerId}
          onStartGame={handleStartGame}
          onLeaveRoom={handleLeaveRoom}
        />
      )}

      {/* View 3: Active Gameplay */}
      {currentView === 'game' && gameState && (
        <div className="relative w-full h-full flex flex-col overflow-hidden">
          <HUD
            gameState={gameState}
            myPlayerId={myPlayerId}
            onTogglePause={handleTogglePause}
          />

          <GameCanvas
            gameState={gameState}
            liveGameStateRef={liveGameStateRef}
            myPlayerId={myPlayerId}
            onSendInput={handleSendInput}
          />

          {/* Green-Screen Chroma-Keyed "Ready... Go!" Video Overlay */}
          {showReadyGo && gameState.status !== 'gameover' && (
            <ReadyGoOverlay
              playTrigger={readyGoTrigger}
              onFinished={() => {
                setShowReadyGo(false);
                if (
                  gameState.status === 'playing' &&
                  gameState.players[myPlayerId]?.alive !== false
                ) {
                  sound.startMusic();
                }
              }}
            />
          )}

          {/* Paused Overlay (ESC) */}
          {gameState.status === 'paused' && (
            <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
              <div className="w-full max-w-sm bg-cyber-panel border border-cyber-border rounded-xl p-6 shadow-2xl flex flex-col gap-4 text-center">
                <div>
                  <div className="w-11 h-11 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-2">
                    <Pause className="w-5 h-5" />
                  </div>
                  <h2 className="text-2xl font-black font-display tracking-wider text-white uppercase">
                    GAME PAUSED
                  </h2>
                  {gameState.pausedBy && (
                    <p className="text-xs font-mono text-gray-400 mt-1">
                      Paused by {gameState.pausedBy}
                    </p>
                  )}
                </div>

                {/* Volume Slider */}
                <div className="bg-[#090b12] border border-cyber-border/70 rounded-lg px-3.5 py-3 flex flex-col gap-2 text-left">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        const next = volume > 0 ? 0 : 0.3;
                        setVolume(next);
                        sound.setVolume(next);
                      }}
                      className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition"
                    >
                      {volume > 0 ? (
                        <Volume2 className="w-4 h-4" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-red-400" />
                      )}
                      <span className="uppercase font-bold">Volume</span>
                    </button>
                    <span className="text-gray-200 font-bold">{Math.round(volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setVolume(val);
                      sound.setVolume(val);
                    }}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleTogglePause}
                    className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition"
                  >
                    <Play className="w-4 h-4 fill-black" /> Resume (ESC)
                  </button>

                  <button
                    onClick={() => setShowConfig(true)}
                    className="w-full py-2.5 px-4 bg-cyber-dark hover:bg-[#1a1f30] border border-cyan-500/30 text-cyan-300 font-mono text-xs rounded-lg flex items-center justify-center gap-2 transition"
                  >
                    <Sliders className="w-4 h-4" /> Tune Config & Randomness
                  </button>

                  {gameState.players[myPlayerId]?.isHost && (
                    <button
                      onClick={handleStartGame}
                      className="w-full py-2.5 px-4 bg-cyber-dark hover:bg-cyber-panel border border-cyber-border text-gray-200 font-mono text-xs rounded-lg flex items-center justify-center gap-2 transition"
                    >
                      <RotateCcw className="w-4 h-4" /> Restart Match
                    </button>
                  )}

                  <button
                    onClick={handleLeaveRoom}
                    className="w-full py-2.5 px-4 bg-cyber-dark hover:bg-cyber-panel border border-cyber-border text-gray-400 hover:text-white font-mono text-xs rounded-lg flex items-center justify-center gap-2 transition"
                  >
                    <Home className="w-4 h-4" /> Return to Lobby
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Game Over Modal */}
          {gameState.status === 'gameover' && (
            <GameOverModal
              gameState={gameState}
              myPlayerId={myPlayerId}
              onPlayAgain={handleStartGame}
              onReturnToWaitingRoom={handleReturnToWaitingRoom}
              onReturnToLobby={handleLeaveRoom}
            />
          )}
        </div>
      )}

      {/* Global Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}

      {/* Live Config & Randomness Tuner Modal */}
      {showConfig && (
        <ConfigModal onClose={() => setShowConfig(false)} />
      )}
    </main>
  );
};
