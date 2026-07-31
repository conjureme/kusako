import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

export const env = {
  botToken: required('BOT_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: process.env.GUILD_ID ?? '',
  dbPath: process.env.DB_PATH ?? 'data/sako.db',
  ownerId: process.env.OWNER_ID ?? '',
};
