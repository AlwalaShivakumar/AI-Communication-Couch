"use client";

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, Clock, MessageSquare, Zap, Target, BookOpen, AlertCircle, History, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { generateTotalInsights } from '@/app/actions';
import { supabase } from '@/lib/supabase';

export default function ProfileDashboardClient({ initialData, userId }: { initialData: any, userId: string }) {
  const [timeframe, setTimeframe] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { rawSessions } = initialData;

  const calculateStreak = (sessions: any[]) => {
    if (!sessions || sessions.length === 0) return 0;
    
    const uniqueDates = Array.from(new Set(sessions.map(s => {
      const d = new Date(s.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    if (uniqueDates.length === 0) return 0;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
      return 0; // Streak broken
    }

    let streak = 1;
    let currentDate = new Date(uniqueDates[0]);

    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(currentDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      
      if (uniqueDates[i] === prevDateStr) {
        streak++;
        currentDate = new Date(uniqueDates[i]);
      } else {
        break;
      }
    }

    return streak;
  };

  const currentStreak = calculateStreak(rawSessions);

  useEffect(() => {
    async function fetchInsights() {
      if (initialData && !initialData.empty) {
        try {
          let latestSessionDate = new Date(0);
          rawSessions.forEach((s: any) => {
            const sDate = new Date(s.created_at);
            if (sDate > latestSessionDate) {
              latestSessionDate = sDate;
            }
          });

          const { data: profile } = await supabase
            .from('profiles')
            .select('last_insights_cache, last_insights_timestamp')
            .eq('id', userId)
            .single();

          let cacheIsFresh = false;
          if (profile?.last_insights_cache && profile?.last_insights_timestamp) {
            const cacheDate = new Date(profile.last_insights_timestamp);
            if (cacheDate >= latestSessionDate) {
              cacheIsFresh = true;
            }
          }

          if (cacheIsFresh && profile) {
            setAiInsights(profile.last_insights_cache);
          } else {
            const summarizedData = { ...initialData };
            delete summarizedData.rawSessions;
            const insights = await generateTotalInsights(summarizedData);
            setAiInsights(insights);
            
            await supabase
              .from('profiles')
              .update({
                last_insights_cache: insights,
                last_insights_timestamp: new Date().toISOString()
              })
              .eq('id', userId);
          }
        } catch (error) {
          console.error("Failed to fetch or generate AI insights", error);
        } finally {
          setLoadingInsights(false);
        }
      } else {
        setLoadingInsights(false);
      }
    }
    fetchInsights();
  }, [initialData, userId, rawSessions]);

  const getFilteredSessions = () => {
    if (timeframe === 'all') return rawSessions;
    
    const now = new Date();
    const cutoff = new Date();
    if (timeframe === 'today') cutoff.setHours(0,0,0,0);
    else if (timeframe === '7d') cutoff.setDate(now.getDate() - 7);
    else if (timeframe === '30d') cutoff.setDate(now.getDate() - 30);

    return rawSessions.filter((s: any) => new Date(s.created_at) >= cutoff);
  };

  const filteredSessions = getFilteredSessions();

  let totalDurationMs = 0;
  let totalSpeakingMs = 0;
  let scoreSum = 0;
  let scoredCount = 0;
  const dimScores: Record<string, number[]> = {};

  filteredSessions.forEach((s: any) => {
    totalDurationMs += s.duration_ms;
    totalSpeakingMs += s.speaking_time_ms;
    if (s.overall_score) {
      scoreSum += s.overall_score;
      scoredCount++;
    }
    (s.session_dimensions || []).forEach((dim: any) => {
      if (!dimScores[dim.dimension]) dimScores[dim.dimension] = [];
      dimScores[dim.dimension].push(dim.score);
    });
  });

  const averageScore = scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0;
  const dimensions = Object.entries(dimScores).map(([dim, scores]) => ({
    dimension: dim,
    score: Math.round(scores.reduce((a,b) => a+b, 0) / scores.length)
  }));

  const totalSessions = filteredSessions.length;

  const weaknessCounts: Record<string, number> = {};
  filteredSessions.forEach((s: any) => {
    (s.session_feedbacks || []).forEach((f: any) => {
      if (f.biggest_weakness && f.biggest_weakness !== "Retry") {
        weaknessCounts[f.biggest_weakness] = (weaknessCounts[f.biggest_weakness] || 0) + 1;
      }
    });
  });

  const topWeaknesses = Object.entries(weaknessCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([weakness, count]) => ({ weakness, count }));

  const formatTime = (ms: number) => {
    const totalMinutes = Math.floor(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const aiActionPlan = aiInsights || {
    stop: "Not enough data to analyze yet.",
    start: "Keep practicing to generate insights.",
    continue: "Consistency is key.",
    focus: "General Practice",
    exercises: ["Complete 3 more sessions to unlock deep AI analysis."],
    hiddenPatterns: []
  };

  const chartData = filteredSessions.map((s: any, idx: number) => ({
    name: `S${idx + 1}`,
    score: s.overall_score || 0
  })).filter((s: any) => s.score > 0);

  const toggleSession = (id: string) => {
    if (expandedSessionId === id) {
      setExpandedSessionId(null);
    } else {
      setExpandedSessionId(id);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Filters */}
      <div className="flex gap-2 bg-gray-100 dark:bg-gray-900 p-1 w-max rounded-lg">
        {['today', '7d', '30d', 'all'].map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf as any)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${timeframe === tf ? 'bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
          >
            {tf === 'today' ? 'Today' : tf === '7d' ? '7 Days' : tf === '30d' ? '30 Days' : 'All Time'}
          </button>
        ))}
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard title="Current Streak" value={`${currentStreak} 🔥`} icon={<Zap size={18} />} />
        <StatCard title="Overall Score" value={averageScore} suffix="/ 100" icon={<Activity size={18} />} />
        <StatCard title="Total Sessions" value={totalSessions} icon={<MessageSquare size={18} />} />
        <StatCard title="Practice Time" value={formatTime(totalDurationMs)} icon={<Clock size={18} />} />
        <StatCard title="Speaking Time" value={formatTime(totalSpeakingMs)} icon={<Zap size={18} />} />
      </div>

      {/* Progress Chart */}
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-sm h-80">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Target size={20} className="text-purple-500"/> Overall Communication Trend</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-800" />
            <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              content={({ active, payload, label }: any) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3 rounded-lg shadow-sm text-gray-900 dark:text-gray-100">
                      <p className="font-semibold text-sm mb-1">{label}</p>
                      <p className="text-purple-500 font-bold text-sm">Score: {payload[0].value}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line type="monotone" dataKey="score" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#a855f7' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Dimensions Grid */}
      <div>
        <h3 className="text-lg font-bold mb-4">Skill Progress</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {dimensions.map((dim: any) => (
            <div key={dim.dimension} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-xl flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{dim.dimension}</span>
              <span className="text-2xl font-bold">{dim.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested Workout */}
      {!loadingInsights && aiActionPlan.exercises && aiActionPlan.exercises.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-6 rounded-2xl animate-in fade-in duration-500 mt-4">
          <h3 className="text-lg font-bold mb-4 text-blue-900 dark:text-blue-300 flex items-center gap-2">
            <Target size={20} /> Today's Suggested Workout
          </h3>
          <ul className="space-y-3">
            {aiActionPlan.exercises.map((ex: string, i: number) => (
              <li key={i} className="flex gap-3 text-sm text-blue-800 dark:text-blue-300">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span className="font-medium">{ex}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hidden Patterns */}
      {loadingInsights ? (
        <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 p-6 rounded-2xl animate-pulse">
          <div className="h-6 w-64 bg-purple-200 dark:bg-purple-800/50 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 w-3/4 bg-purple-200 dark:bg-purple-800/50 rounded"></div>
            <div className="h-4 w-5/6 bg-purple-200 dark:bg-purple-800/50 rounded"></div>
            <div className="h-4 w-2/3 bg-purple-200 dark:bg-purple-800/50 rounded"></div>
          </div>
        </div>
      ) : aiActionPlan.hiddenPatterns && aiActionPlan.hiddenPatterns.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 p-6 rounded-2xl animate-in fade-in duration-500">
          <h3 className="text-lg font-bold mb-4 text-purple-900 dark:text-purple-300 flex items-center gap-2">
            <Zap size={20} /> Hidden Patterns Discovered
          </h3>
          <ul className="space-y-3">
            {aiActionPlan.hiddenPatterns.map((pattern: string, i: number) => (
              <li key={i} className="flex gap-3 text-sm text-purple-800 dark:text-purple-300">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                {pattern}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Action Plan (Stop / Start / Continue) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loadingInsights ? (
          <>
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800/50 p-6 rounded-2xl flex flex-col gap-3 animate-pulse">
                <div className="h-4 w-1/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded mt-1"></div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-6 rounded-2xl flex flex-col gap-3 animate-in fade-in duration-500">
              <span className="text-xs font-bold uppercase tracking-wider text-red-500">Stop</span>
              <p className="text-sm font-medium text-red-900 dark:text-red-300">{aiActionPlan.stop}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 p-6 rounded-2xl flex flex-col gap-3 animate-in fade-in duration-500">
              <span className="text-xs font-bold uppercase tracking-wider text-green-500">Start</span>
              <p className="text-sm font-medium text-green-900 dark:text-green-300">{aiActionPlan.start}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-6 rounded-2xl flex flex-col gap-3 animate-in fade-in duration-500">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-500">Continue</span>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-300">{aiActionPlan.continue}</p>
            </div>
          </>
        )}
      </div>

      {/* What you should do next */}
      {loadingInsights ? (
        <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-sm animate-pulse">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-6"></div>
          <div className="space-y-6">
            <div>
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-2"></div>
              <div className="h-6 w-1/3 bg-purple-200 dark:bg-purple-900/50 rounded"></div>
            </div>
            <div className="space-y-3">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-2"></div>
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3">
                  <div className="w-5 h-5 shrink-0 rounded-full bg-gray-200 dark:bg-gray-800"></div>
                  <div className="h-5 w-full bg-gray-200 dark:bg-gray-800 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-sm animate-in fade-in duration-500">
          <h3 className="text-lg font-bold mb-4">What You Should Do Next</h3>
          <div className="space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">Primary Target</span>
              <h4 className="text-xl font-semibold text-purple-400">{aiActionPlan.focus}</h4>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">Exercises</span>
              {aiActionPlan.exercises.map((ex: string, i: number) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="w-5 h-5 shrink-0 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs font-bold">{i + 1}</div>
                  <p>{ex}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top 5 Weaknesses */}
      {topWeaknesses.length > 0 && (
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-sm">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><AlertCircle size={20} className="text-red-500"/> Your Biggest Weaknesses</h3>
          <div className="space-y-4">
            {topWeaknesses.map((w, i) => (
              <div key={i} className="flex items-start justify-between border-b border-gray-100 dark:border-gray-800 pb-3 last:border-0 last:pb-0">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">{i + 1}. {w.weakness}</h4>
                  <p className="text-sm text-gray-500 mt-1">Identified in {w.count} responses.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session History */}
      {filteredSessions.length > 0 && (
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-sm">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><History size={20} className="text-blue-500"/> Session History</h3>
          <div className="space-y-4">
            {[...filteredSessions].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((session: any) => {
              const isExpanded = expandedSessionId === session.id;
              const dateObj = new Date(session.created_at);
              const formattedDate = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
              const formattedTime = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              
              return (
                <div key={session.id} className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-all duration-200">
                  <button 
                    onClick={() => toggleSession(session.id)}
                    className="w-full text-left flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800/80 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{formattedDate} <span className="text-gray-500 font-normal text-sm ml-2">{formattedTime}</span></div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                          <Activity size={14} /> Score: {session.overall_score || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                          <Clock size={14} /> {formatTime(session.duration_ms)}
                        </span>
                      </div>
                    </div>
                    <div className="text-gray-400">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="p-5 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
                      {session.session_feedbacks && session.session_feedbacks.length > 0 ? (
                        <div className="space-y-6">
                          {session.session_feedbacks.map((fb: any, idx: number) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                              <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                  <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500">Transcript</h5>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(session.transcript_text || fb.transcript);
                                      setCopiedId(`${session.id}-${idx}`);
                                      setTimeout(() => setCopiedId(null), 2000);
                                    }}
                                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 text-xs"
                                  >
                                    {copiedId === `${session.id}-${idx}` ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                    {copiedId === `${session.id}-${idx}` ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                                <p className="text-gray-800 dark:text-gray-200 text-sm italic">"{fb.transcript}"</p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <h5 className="text-xs font-bold uppercase tracking-wider text-red-500 mb-1">Biggest Weakness</h5>
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{fb.biggest_weakness}</p>
                                </div>
                                <div>
                                  <h5 className="text-xs font-bold uppercase tracking-wider text-green-500 mb-1">How to Fix</h5>
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{fb.fix}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between text-sm">
                                <span className="font-semibold text-purple-500">Score: {fb.score}/100</span>
                                {fb.is_retry && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 rounded text-xs font-medium">Retry</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-4">No detailed feedback available for this session.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

function StatCard({ title, value, suffix, icon }: any) {
  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-5 rounded-2xl shadow-sm flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-bold">{value}</span>
        {suffix && <span className="text-gray-500 text-sm mb-1">{suffix}</span>}
      </div>
    </div>
  );
}
