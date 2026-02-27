import { createClient } from '@supabase/supabase-js';

// Replace this with your Supabase Project URL
const SUPABASE_URL = 'https://jfdvbyoyvqriqhqtmyjo.supabase.co';

// Replace this with your Supabase public (anon/publishable) key
const SUPABASE_PUBLIC_KEY = 'sb_publishable_SwyxDRF6_y_pBGtoBeKh7A_9RZX-Mv0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
