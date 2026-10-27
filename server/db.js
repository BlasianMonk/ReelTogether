import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required. See .env.example');
export const pool=new Pool({connectionString:process.env.DATABASE_URL});
export const query=(sql,args=[])=>pool.query(sql,args);
export async function migrate(){
 await query(`CREATE TABLE IF NOT EXISTS users(id UUID PRIMARY KEY,username VARCHAR(32) NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now())`);
 await query(`CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL)`);
 await query(`CREATE TABLE IF NOT EXISTS rooms(id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES users(id),title VARCHAR(70) NOT NULL,movie TEXT NOT NULL,public BOOLEAN NOT NULL DEFAULT true,host_key TEXT NOT NULL,playing BOOLEAN NOT NULL DEFAULT false,position DOUBLE PRECISION NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await query(`CREATE TABLE IF NOT EXISTS watch_history(user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,movie TEXT NOT NULL,position DOUBLE PRECISION NOT NULL DEFAULT 0,last_watched TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(user_id,movie))`);
}
export async function saveHistory(userId,movie,position){if(userId&&movie)await query(`INSERT INTO watch_history(user_id,movie,position) VALUES($1,$2,$3) ON CONFLICT(user_id,movie) DO UPDATE SET position=EXCLUDED.position,last_watched=now()`,[userId,movie,position]);}
