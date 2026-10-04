export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.startsWith('sb_secret_')) throw new Error('Invalid public Supabase configuration');
  if (key.startsWith('eyJ')) {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'anon') throw new Error('Public Supabase key must have anon role');
  }
  return { url, key };
}
