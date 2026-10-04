import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './errors';
export async function consumeQuota(db: SupabaseClient, cost = 1) {
  const { data, error } = await db.rpc('consume_ai_quota', { p_cost: cost });
  if (error) throw new AppError('AI practice is temporarily unavailable. Please try again later.', 503);
  if (data !== true) throw new AppError('Practice limit reached. Please try again later.', 429);
}
