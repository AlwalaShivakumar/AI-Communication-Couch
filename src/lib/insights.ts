import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HistoricalData, StoredSession } from './validation';
import { AppError } from './errors';
export function aggregateSessions(sessions: StoredSession[]): HistoricalData {
  const dimensionScores: Record<string, number[]> = {}, weaknesses: Record<string, number> = {};
  const scored = sessions.filter(s => s.overall_score !== null);
  for (const s of sessions) {
    for (const d of s.session_dimensions || []) (dimensionScores[d.dimension] ||= []).push(d.score);
    for (const f of s.session_feedbacks || []) if (f.biggest_weakness && f.biggest_weakness !== 'Retry') weaknesses[f.biggest_weakness] = (weaknesses[f.biggest_weakness] || 0) + 1;
  }
  return { empty: sessions.length === 0, totalSessions: sessions.length,
    totalDurationMs: sessions.reduce((n,s) => n+s.duration_ms,0), totalSpeakingMs: sessions.reduce((n,s) => n+s.speaking_time_ms,0),
    averageScore: scored.length ? Math.round(scored.reduce((n,s) => n+(s.overall_score ?? 0),0)/scored.length) : 0,
    dimensions: Object.entries(dimensionScores).map(([dimension, scores]) => ({ dimension, score: Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) })) as HistoricalData['dimensions'],
    topWeaknesses: Object.entries(weaknesses).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([weakness,count])=>({weakness,count})), rawSessions: sessions };
}
export async function getHistoricalAggregates(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from('sessions').select('id,user_id,mode,created_at,duration_ms,speaking_time_ms,overall_score,session_dimensions(dimension,score),session_feedbacks(id,transcript,score,biggest_weakness,fix,is_retry,retry_improvement,raw_feedback)').eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
  if (error) throw new AppError('Your history could not be loaded. Please try again.', 503);
  return aggregateSessions(((data || []) as StoredSession[]).reverse());
}
