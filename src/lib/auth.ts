import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '~/drizzle/client';
import * as schema from '~/drizzle/schema';

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    authUrl: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
        enabled: true,
    },
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema,
    }),
    plugins: [admin()],
});

