import { defineConfig } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import dotenv from 'dotenv';
import { User } from './entities/User.js';
import { MatchHistory } from './entities/MatchHistory.js';

dotenv.config();

export default defineConfig({
  entities: [User, MatchHistory],
  dbName: process.env.DB_NAME || 'precision_path',
  clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/precision_path',
  debug: process.env.NODE_ENV !== 'production',
  metadataProvider: TsMorphMetadataProvider,
  driverOptions: {
    connection: {
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
  },
});
