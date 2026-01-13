import 'dotenv/config';

const databaseUrl = process.env.SUPABASE_URL;

export default {
    dialect: 'postgresql',
    schema: './src/drizzle/schema.ts',
    out: './src/drizzle/migrations/',
    dbCredentials: {
        url: databaseUrl,
    },
};
