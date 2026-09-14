import { supabase } from './supabase';

export async function getHistoricalAggregates(guestId: string) {
  let { data: sessions, error } = await supabase
    .from('sessions')
    .select('*, session_dimensions(*), session_feedbacks(*)')
    .eq('user_id', guestId);

  // If user_id filtering fails or column does not exist, query all sessions gracefully
  if (error && (error.message?.includes('user_id') || error.code === 'PGRST204')) {
    const fallback = await supabase
      .from('sessions')
      .select('*, session_dimensions(*), session_feedbacks(*)');
    sessions = fallback.data;
    error = fallback.error;
  }

  if (error || !sessions) {
    console.error('Error fetching sessions:', error);
    return null;
  }

  // If no sessions, return empty state signal
  if (sessions.length === 0) {
    return { empty: true };
  }

  // Calculate aggregates
  let totalDuration = 0;
  let totalSpeaking = 0;
  let overallScoreSum = 0;
  let sessionsWithScore = 0;
  const dimensionScores: Record<string, number[]> = {};

  sessions.forEach(session => {
    totalDuration += session.duration_ms;
    totalSpeaking += session.speaking_time_ms;
    
    if (session.overall_score !== null) {
      overallScoreSum += session.overall_score;
      sessionsWithScore++;
    }

    session.session_dimensions.forEach((dim: any) => {
      if (!dimensionScores[dim.dimension]) {
        dimensionScores[dim.dimension] = [];
      }
      dimensionScores[dim.dimension].push(dim.score);
    });
  });

  const avgScore = sessionsWithScore > 0 ? Math.round(overallScoreSum / sessionsWithScore) : 0;
  
  const dimensionAverages = Object.entries(dimensionScores).map(([dim, scores]) => {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { dimension: dim, score: avg };
  });

  const weaknessCounts: Record<string, number> = {};
  sessions.forEach((s: any) => {
    (s.session_feedbacks || []).forEach((f: any) => {
      if (f.biggest_weakness && f.biggest_weakness !== "Retry") {
        weaknessCounts[f.biggest_weakness] = (weaknessCounts[f.biggest_weakness] || 0) + 1;
      }
    });
  });

  const topWeaknesses = Object.entries(weaknessCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([weakness, count]) => ({ weakness, count }));

  return {
    empty: false,
    totalSessions: sessions.length,
    totalDurationMs: totalDuration,
    totalSpeakingMs: totalSpeaking,
    averageScore: avgScore,
    dimensions: dimensionAverages,
    topWeaknesses: topWeaknesses,
    rawSessions: sessions // Keep this for frontend charts
  };
}
