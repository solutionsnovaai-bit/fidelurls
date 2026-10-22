import pg from 'pg';
import { HttpError } from './http.js';

const { Pool } = pg;

// As tabelas são criadas sozinhas no primeiro acesso.
const SCHEMA = `
create table if not exists links (
  id bigserial primary key,
  slug text not null,
  url text not null,
  mask boolean not null default true,
  frameable boolean,
  meta_title text,
  meta_description text,
  meta_image text,
  meta_icon text,
  clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table links add column if not exists mask boolean not null default true;
create unique index if not exists links_slug_lower on links (lower(slug));
create index if not exists links_created on links (created_at desc);

create table if not exists auth_fails (
  ip text not null,
  ts timestamptz not null default now()
);
create index if not exists auth_fails_ip_ts on auth_fails (ip, ts);
`;

let pool;
let ready;

function connectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ''
  );
}

export function getPool() {
  if (!pool) {
    const cs = connectionString();
    if (!cs) throw new HttpError(500, 'Banco de dados não configurado. Conecte o Neon (Postgres) ao projeto na Vercel.');
    pool = new Pool({ connectionString: cs, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
    pool.on('error', () => {});
  }
  return pool;
}

export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      try {
        await getPool().query(SCHEMA);
      } catch (err) {
        if (err && (err.code === '23505' || err.code === '42P07')) await getPool().query(SCHEMA);
        else throw err;
      }
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export async function q(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}
