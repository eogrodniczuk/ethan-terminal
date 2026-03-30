import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.INITIAL_USER_EMAIL || 'ethan.19@me.com';
const password = process.env.INITIAL_USER_PASSWORD;

if (!url || !serviceRole || !password) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or INITIAL_USER_PASSWORD');
  process.exit(1);
}

const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true
});

if (error && !String(error.message).toLowerCase().includes('already')) {
  console.error(error);
  process.exit(1);
}

console.log('Initial user ready:', data?.user?.email || email);
