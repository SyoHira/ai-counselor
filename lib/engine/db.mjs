// DATABASE_URL があれば Postgres（Neon / Supabase 等）、無ければローカルの PGlite（.data/pglite）を使う。
// どちらも query(text, params) → rows の同じ形で呼べる。
import { SCHEMA } from './schema.mjs';

let dbPromise;

async function connect() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import('postgres');
    const sql = postgres(url, { max: 5, onnotice: () => {} });
    return {
      query: (text, params = []) => sql.unsafe(text, params),
      exec: (text) => sql.unsafe(text),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR ?? './.data/pglite';
  const pg = dir === 'memory' ? new PGlite() : new PGlite(dir);
  return {
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    exec: (text) => pg.exec(text),
  };
}

export async function db() {
  if (!dbPromise) {
    dbPromise = connect().then(async (conn) => {
      await conn.exec(SCHEMA);
      return conn;
    });
  }
  return dbPromise;
}

export async function query(text, params) {
  return (await db()).query(text, params);
}

export async function one(text, params) {
  return (await query(text, params))[0] ?? null;
}

// key-value 設定（Threads のトークン更新などで書き換わる値）
export async function getSetting(key, fallback = null) {
  const row = await one('select value from settings where key = $1', [key]);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await query(
    `insert into settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value]
  );
}
