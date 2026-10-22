import { q } from './db.js';
import { HttpError } from './http.js';

export const DEFAULT_NAME = 'Fidel URLs';

// Nome que aparece no painel e na tela de carregamento. Quem usa escolhe.
export async function getName() {
  try {
    const { rows } = await q(`select value from settings where key = 'name'`);
    const v = rows[0]?.value?.trim();
    return v || DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

export async function setName(input) {
  const name = String(input ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'Dê um nome para o painel.');
  await q(
    `insert into settings (key, value) values ('name', $1)
     on conflict (key) do update set value = excluded.value`,
    [name]
  );
  return name;
}
