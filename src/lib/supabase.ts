import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Session = {
  id?: string;
  created_at?: string;
  mode: string;
  duration_ms: number;
  speaking_time_ms: number;
  overall_score: number | null;
};

export type SessionFeedback = {
  id?: string;
  session_id: string;
  transcript: string;
  score: number;
  biggest_weakness: string;
  fix: string;
  is_retry: boolean;
  retry_improvement: number | null;
};

export type SessionDimension = {
  id?: string;
  session_id: string;
  dimension: string;
  score: number;
};
