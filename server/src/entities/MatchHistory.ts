import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'match_history' })
export class MatchHistory {
  @PrimaryKey()
  id: string = crypto.randomUUID();

  @Property()
  roomCode!: string;

  @Property({ default: 1 })
  playerCount: number = 1;

  @Property({ nullable: true })
  winnerName?: string;

  @Property({ type: 'float' })
  durationSeconds: number = 0;

  @Property({ default: 1 })
  maxTier: number = 1;

  @Property({ onCreate: () => new Date() })
  playedAt: Date = new Date();
}
