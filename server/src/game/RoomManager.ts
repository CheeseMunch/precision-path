import { Server } from 'socket.io';
import { MikroORM } from '@mikro-orm/core';
import { GameEngine } from './GameEngine.js';
import { User } from '../entities/User.js';
import { MatchHistory } from '../entities/MatchHistory.js';
import { GameState, LeaderboardEntry } from '../../../shared/types.js';

export class RoomManager {
  private rooms: Map<string, GameEngine> = new Map();
  private playerToRoom: Map<string, string> = new Map();
  private io: Server;
  private orm: MikroORM | null = null;
  // Local in-memory leaderboard fallback (empty until real players play)
  private mockLeaderboard: LeaderboardEntry[] = [];

  constructor(io: Server, orm: MikroORM | null) {
    this.io = io;
    this.orm = orm;
  }

  public setORM(orm: MikroORM) {
    this.orm = orm;
  }

  public createRoom(hostSocketId: string, playerName: string): { roomId: string; engine: GameEngine } {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const engine = new GameEngine(roomId);

    engine.addPlayer(hostSocketId, playerName, true);
    this.rooms.set(roomId, engine);
    this.playerToRoom.set(hostSocketId, roomId);

    this.bindEngineEvents(roomId, engine);

    return { roomId, engine };
  }

  public joinRoom(roomId: string, socketId: string, playerName: string): GameEngine | null {
    const engine = this.rooms.get(roomId.toUpperCase());
    if (!engine) return null;

    engine.addPlayer(socketId, playerName, false);
    this.playerToRoom.set(socketId, roomId.toUpperCase());
    return engine;
  }

  public leaveRoom(socketId: string) {
    const roomId = this.playerToRoom.get(socketId);
    if (!roomId) return;

    this.playerToRoom.delete(socketId);
    const engine = this.rooms.get(roomId);
    if (!engine) return;

    engine.removePlayer(socketId);

    // If room is empty, stop and delete
    if (Object.keys(engine.state.players).length === 0) {
      engine.stop();
      this.rooms.delete(roomId);
    } else {
      this.io.to(roomId).emit('gameState', engine.state);
    }
  }

  public getRoomBySocketId(socketId: string): { roomId: string; engine: GameEngine } | null {
    const roomId = this.playerToRoom.get(socketId);
    if (!roomId) return null;
    const engine = this.rooms.get(roomId);
    if (!engine) return null;
    return { roomId, engine };
  }

  public async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (this.orm) {
      try {
        const em = this.orm.em.fork();
        const users = await em.find(User, {}, {
          orderBy: { bestSurvivalTime: 'DESC' },
          limit: 10,
        });

        return users.map((u) => ({
          id: u.id,
          username: u.username,
          bestSurvivalTime: u.bestSurvivalTime,
          highestTier: u.highestTier,
          totalGames: u.totalGames,
          createdAt: u.createdAt.toISOString(),
        }));
      } catch (err) {
        console.warn('PostgreSQL fetch error, falling back to mock leaderboard:', err);
      }
    }
    return this.mockLeaderboard.sort((a, b) => b.bestSurvivalTime - a.bestSurvivalTime);
  }

  private bindEngineEvents(roomId: string, engine: GameEngine) {
    engine.setCallbacks({
      onStateUpdate: (state) => {
        this.io.to(roomId).emit('gameState', state);
      },
      onTierUp: (tier) => {
        this.io.to(roomId).emit('tierUp', { tier, message: `Reached Tier ${tier}!` });
      },
      onGameOver: async (state) => {
        this.io.to(roomId).emit('gameState', state);
        await this.persistGameResults(state);
      },
    });
  }

  private async persistGameResults(state: GameState) {
    const players = Object.values(state.players);
    const maxSurvival = Math.max(...players.map((p) => p.survivedTime), 0);

    // Save to MikroORM + PostgreSQL if connected
    if (this.orm) {
      try {
        const em = this.orm.em.fork();

        // 1. Record Match History
        const match = new MatchHistory();
        match.roomCode = state.roomId;
        match.playerCount = players.length;
        match.winnerName = state.winner?.name || 'None';
        match.durationSeconds = parseFloat(maxSurvival.toFixed(2));
        match.maxTier = state.currentTier;
        em.persist(match);

        // 2. Update or Create User Stats
        for (const player of players) {
          let user = await em.findOne(User, { username: player.name });
          if (!user) {
            user = new User();
            user.username = player.name;
            em.persist(user);
          }

          user.totalGames += 1;
          user.totalScore += player.score;
          if (player.survivedTime > user.bestSurvivalTime) {
            user.bestSurvivalTime = parseFloat(player.survivedTime.toFixed(2));
          }
          if (state.currentTier > user.highestTier) {
            user.highestTier = state.currentTier;
          }
        }

        // Flush all changes in a single transaction
        await em.flush();
        console.log(`[MikroORM] Successfully saved match ${state.roomId} to PostgreSQL`);
      } catch (err) {
        console.error('[MikroORM] Error saving match to PostgreSQL:', err);
      }
    } else {
      // Update in-memory fallback
      for (const player of players) {
        let entry = this.mockLeaderboard.find((m) => m.username === player.name);
        if (!entry) {
          entry = {
            id: crypto.randomUUID(),
            username: player.name,
            bestSurvivalTime: parseFloat(player.survivedTime.toFixed(2)),
            highestTier: state.currentTier,
            totalGames: 1,
            createdAt: new Date().toISOString(),
          };
          this.mockLeaderboard.push(entry);
        } else {
          entry.totalGames += 1;
          if (player.survivedTime > entry.bestSurvivalTime) {
            entry.bestSurvivalTime = parseFloat(player.survivedTime.toFixed(2));
          }
          if (state.currentTier > entry.highestTier) {
            entry.highestTier = state.currentTier;
          }
        }
      }
    }
  }
}
