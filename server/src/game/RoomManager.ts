import { Server } from 'socket.io';
import { MikroORM } from '@mikro-orm/core';
import { GameEngine } from './GameEngine.js';
import { User } from '../entities/User.js';
import { MatchHistory } from '../entities/MatchHistory.js';
import { CommunityLevel } from '../entities/CommunityLevel.js';
import { GameState, GameMode, LeaderboardEntry, CampaignLevelConfig } from '../../../shared/types.js';

export class RoomManager {
  private rooms: Map<string, GameEngine> = new Map();
  private playerToRoom: Map<string, string> = new Map();
  private io: Server;
  private orm: MikroORM | null = null;
  private onCommunityLevelCleared?: (communityLevelId: string) => void;
  // Local in-memory leaderboard fallback (empty until real players play)
  private mockLeaderboard: LeaderboardEntry[] = [];

  constructor(io: Server, orm: MikroORM | null) {
    this.io = io;
    this.orm = orm;
  }

  public setORM(orm: MikroORM) {
    this.orm = orm;
  }

  public setOnCommunityLevelCleared(cb: (communityLevelId: string) => void) {
    this.onCommunityLevelCleared = cb;
  }

  public createRoom(
    hostSocketId: string,
    playerName: string,
    options?: { gameMode?: GameMode; campaignLevel?: number; customLevel?: CampaignLevelConfig; communityLevelId?: string; isAiGenerated?: boolean }
  ): { roomId: string; engine: GameEngine } {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const engine = new GameEngine(roomId, options);

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
          orderBy: { bestScore: 'DESC', bestSurvivalTime: 'DESC' },
          limit: 15,
        });

        return users.map((u) => ({
          id: u.id,
          username: u.username,
          bestScore: u.bestScore || 0,
          bestSurvivalTime: u.bestSurvivalTime,
          highestTier: u.highestTier,
          totalGames: u.totalGames,
          totalScore: u.totalScore,
          createdAt: u.createdAt.toISOString(),
        }));
      } catch (err) {
        console.warn('PostgreSQL fetch error, falling back to mock leaderboard:', err);
      }
    }
    return this.mockLeaderboard.sort(
      (a, b) => (b.bestScore || 0) - (a.bestScore || 0) || b.bestSurvivalTime - a.bestSurvivalTime
    );
  }

  private bindEngineEvents(roomId: string, engine: GameEngine) {
    const persistedThisRound = new Set<string>();

    engine.setCallbacks({
      onStateUpdate: (state) => {
        if (state.status === 'countdown' || state.status === 'lobby') {
          persistedThisRound.clear();
        }
        this.io.to(roomId).emit('gameState', state);
      },
      onTierUp: (tier) => {
        this.io.to(roomId).emit('tierUp', { tier, message: `Reached Tier ${tier}!` });
      },
      onPlayerEliminated: async (player, tier) => {
        if (engine.state.gameMode === 'campaign') return;
        if (persistedThisRound.has(player.id)) return;
        persistedThisRound.add(player.id);
        await this.persistSinglePlayerResult(player, tier);
      },
      onGameOver: async (state) => {
        this.io.to(roomId).emit('gameState', state);
        if (state.communityLevelId && state.campaignResult === 'cleared') {
          await this.incrementCommunityLevelClears(state.communityLevelId);
        }
        if (state.gameMode === 'campaign') return;
        await this.persistGameResults(state, persistedThisRound);
      },
    });
  }

  private async incrementCommunityLevelClears(communityLevelId: string) {
    if (this.orm) {
      try {
        const em = this.orm.em.fork();
        const row = await em.findOne(CommunityLevel, { id: communityLevelId });
        if (row) {
          row.clearsCount = (row.clearsCount || 0) + 1;
          await em.flush();
        }
      } catch (err) {
        console.error('Failed to increment community level clearsCount:', err);
      }
    }
    if (this.onCommunityLevelCleared) {
      this.onCommunityLevelCleared(communityLevelId);
    }
  }

  private async persistSinglePlayerResult(
    player: GameState['players'][string],
    tier: number
  ) {
    if (this.orm) {
      try {
        const em = this.orm.em.fork();
        let user = await em.findOne(User, { username: player.name });
        if (!user) {
          user = new User();
          user.username = player.name;
          em.persist(user);
        }

        user.totalGames += 1;
        user.totalScore += player.score;
        if (player.score > (user.bestScore || 0)) {
          user.bestScore = player.score;
        }
        if (player.survivedTime > user.bestSurvivalTime) {
          user.bestSurvivalTime = parseFloat(player.survivedTime.toFixed(2));
        }
        if (tier > user.highestTier) {
          user.highestTier = tier;
        }

        await em.flush();
      } catch (err) {
        console.error('[MikroORM] Error saving player result to PostgreSQL:', err);
      }
    } else {
      let entry = this.mockLeaderboard.find((m) => m.username === player.name);
      if (!entry) {
        entry = {
          id: crypto.randomUUID(),
          username: player.name,
          bestScore: player.score,
          bestSurvivalTime: parseFloat(player.survivedTime.toFixed(2)),
          highestTier: tier,
          totalGames: 1,
          totalScore: player.score,
          createdAt: new Date().toISOString(),
        };
        this.mockLeaderboard.push(entry);
      } else {
        entry.totalGames += 1;
        entry.totalScore = (entry.totalScore || 0) + player.score;
        if (player.score > (entry.bestScore || 0)) {
          entry.bestScore = player.score;
        }
        if (player.survivedTime > entry.bestSurvivalTime) {
          entry.bestSurvivalTime = parseFloat(player.survivedTime.toFixed(2));
        }
        if (tier > entry.highestTier) {
          entry.highestTier = tier;
        }
      }
    }
  }

  private async persistGameResults(state: GameState, persistedThisRound?: Set<string>) {
    const players = Object.values(state.players);
    const maxSurvival = Math.max(...players.map((p) => p.survivedTime), 0);

    // Save any players not yet persisted via onPlayerEliminated
    for (const player of players) {
      if (!persistedThisRound || !persistedThisRound.has(player.id)) {
        if (persistedThisRound) persistedThisRound.add(player.id);
        await this.persistSinglePlayerResult(player, state.currentTier);
      }
    }

    // Record Match History in PostgreSQL if connected
    if (this.orm) {
      try {
        const em = this.orm.em.fork();
        const match = new MatchHistory();
        match.roomCode = state.roomId;
        match.playerCount = players.length;
        match.winnerName = state.winner?.name || 'None';
        match.durationSeconds = parseFloat(maxSurvival.toFixed(2));
        match.maxTier = state.currentTier;
        em.persist(match);
        await em.flush();
        console.log(`[MikroORM] Successfully saved match ${state.roomId} to PostgreSQL`);
      } catch (err) {
        console.error('[MikroORM] Error saving match to PostgreSQL:', err);
      }
    }
  }
}
