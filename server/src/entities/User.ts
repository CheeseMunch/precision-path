import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey()
  id: string = crypto.randomUUID();

  @Property({ unique: true })
  username!: string;

  @Property({ default: 0, type: 'float' })
  bestSurvivalTime: number = 0;

  @Property({ default: 1 })
  highestTier: number = 1;

  @Property({ default: 0 })
  totalGames: number = 0;

  @Property({ default: 0 })
  totalScore: number = 0;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
