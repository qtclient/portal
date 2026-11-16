import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ quiet: true });

export default defineConfig({
	schema: 'prisma/schema',
	migrations: { path: 'prisma/migrations' },
	// `prisma generate` runs in the image build without DATABASE_URL.
	datasource: { url: process.env.DATABASE_URL ?? '' },
});
