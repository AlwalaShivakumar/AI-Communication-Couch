import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from './supabase/config';

const { url, key } = supabaseConfig();
export const supabase = createBrowserClient(url, key);
