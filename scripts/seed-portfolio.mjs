import { createClient } from '@supabase/supabase-js';

const defaultPositions = [
  { sort_order: 1, type: 'Equity', ticker: 'KITS.TO', display: 'KITS.TO', shares: 1200, avg_purchase_price: 10.76, cash_value: 0, currency: 'CAD', contract_multiplier: 1, beta: 0.12, current_price_override: null, delta: null, beta_override: null },
  { sort_order: 2, type: 'Equity', ticker: 'STCK.TO', display: 'STCK.TO', shares: 125, avg_purchase_price: 15.71, cash_value: 0, currency: 'CAD', contract_multiplier: 1, beta: 0.43, current_price_override: null, delta: null, beta_override: null },
  { sort_order: 3, type: 'ETF', ticker: 'EMBJ', display: 'EMBJ', shares: 12, avg_purchase_price: 62.35, cash_value: 0, currency: 'USD', contract_multiplier: 1, beta: 0.89, current_price_override: null, delta: null, beta_override: null },
  { sort_order: 4, type: 'Option', ticker: null, display: 'GLD 31 Dec 2026 465.00 Call', shares: 1, avg_purchase_price: 52, cash_value: 0, currency: 'USD', contract_multiplier: 100, beta: null, current_price_override: 30.55, delta: 0.4132, beta_override: null },
  { sort_order: 5, type: 'Cash', ticker: null, display: 'Cash', shares: 0, avg_purchase_price: 0, cash_value: 3353.28, currency: 'CAD', contract_multiplier: 1, beta: 0, current_price_override: null, delta: 0, beta_override: 0 }
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.INITIAL_USER_EMAIL || 'ethan.19@me.com';

if (!url || !serviceRole) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: users, error: listError } = await supabase.auth.admin.listUsers();
if (listError) {
  console.error(listError);
  process.exit(1);
}
const user = users.users.find((u) => u.email === email);
if (!user) {
  console.error('User not found:', email);
  process.exit(1);
}
await supabase.from('positions').delete().eq('user_id', user.id);
const payload = defaultPositions.map((row, idx) => ({ ...row, user_id: user.id, sort_order: idx + 1 }));
const { error } = await supabase.from('positions').insert(payload);
if (error) {
  console.error(error);
  process.exit(1);
}
await supabase.from('user_settings').upsert({ user_id: user.id, story_notes: 'Middle East escalation still dominating oil and rates. Watch whether gold starts behaving like a cleaner hedge again. Track SPY / VIX / oil relationship for regime confirmation.' }, { onConflict: 'user_id' });
console.log('Portfolio seeded for', email);
