export function validateConfig(config) {
  if (config.mode === 'demo') return;
  const message = 'Configura config.js com o URL e a chave pública (publishable/anon) do Supabase, ou escolhe mode: demo para um ensaio local. Nunca uses uma chave secret/service_role.';
  if (config.mode !== 'live' || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || '')) throw Error(message);
  const key = config.supabasePublishableKey || '';
  if (key.startsWith('sb_publishable_') && key.length > 20) return;
  try { const body = key.split('.')[1]?.replaceAll('-', '+').replaceAll('_', '/'); if (key.split('.').length === 3 && JSON.parse(atob(body)).role === 'anon') return; } catch {}
  throw Error(message);
}
