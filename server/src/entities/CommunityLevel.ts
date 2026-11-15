import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'community_levels' })
export class CommunityLevel {
  @PrimaryKey()
  id: string = crypto.randomUUID();

  @Property()
  name!: string;

  @Property()
  creatorName!: string;

  @Property({ default: '' })
  description: string = '';

  @Property({ type: 'jsonb' })
  levelData!: {
    spawn: { x: number; y: number };
    clearBonusPoints: number;
    parTimeSeconds: number;
    waves: any[];
    obstacles: any[];
    checkpoints: any[];
  };

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
