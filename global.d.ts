export {};

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            SUPABASE_URL: string;
        }
    }
}
