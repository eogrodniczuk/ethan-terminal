'use client';

import { Protected } from '@/components/protected';
import { TerminalNav } from '@/components/terminal-nav';
import { Section } from '@/components/section';
import { defaultPositions } from '@/lib/default-positions';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { PositionRow, PositionType } from '@/lib/types';
import { useEffect, useState } from 'react';

const emptyRow = (sort_order: number): PositionRow => ({
  sort_order,
  type: 'Equity',
  ticker: '',
  display: '',
  shares: 0,
  avg_purchase_price: 0,
  cash_value: 0,
  currency: 'CAD',
  contract_multiplier: 1,
  beta: null,
  current_price_override: null,
  delta: null,
  beta_override: null
});

export default function PortfolioAdminPage() {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [storyNotes, setStoryNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabaseBrowser.auth.getUser();
      const user = authData.user;
      if (!user) return;
      const [{ data: positions }, { data: settings }] = await Promise.all([
        supabaseBrowser.from('positions').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }),
        supabaseBrowser.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
      ]);
      setRows((positions as PositionRow[])?.length ? (positions as PositionRow[]) : defaultPositions as PositionRow[]);
      setStoryNotes(settings?.story_notes ?? '');
    }
    load();
  }, []);

  function updateRow(index: number, field: keyof PositionRow, value: string) {
    setRows((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      if (['shares', 'avg_purchase_price', 'cash_value', 'contract_multiplier', 'beta', 'current_price_override', 'delta', 'beta_override', 'sort_order'].includes(field)) {
        return { ...row, [field]: value === '' ? null : Number(value) } as PositionRow;
      }
      return { ...row, [field]: value } as PositionRow;
    }));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(prev.length + 1)]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index).map((row, i) => ({ ...row, sort_order: i + 1 })));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const { data: authData } = await supabaseBrowser.auth.getUser();
    const user = authData.user;
    if (!user) return;

    const cleaned = rows.map((row, i) => ({
      ...row,
      user_id: user.id,
      sort_order: i + 1,
      ticker: row.ticker || null,
      beta: row.beta === null || row.beta === undefined || Number.isNaN(Number(row.beta)) ? null : Number(row.beta),
      current_price_override: row.current_price_override == null || Number.isNaN(Number(row.current_price_override)) ? null : Number(row.current_price_override),
      delta: row.delta == null || Number.isNaN(Number(row.delta)) ? null : Number(row.delta),
      beta_override: row.beta_override == null || Number.isNaN(Number(row.beta_override)) ? null : Number(row.beta_override)
    }));

    const { error: deleteError } = await supabaseBrowser.from('positions').delete().eq('user_id', user.id);
    if (deleteError) {
      setSaving(false);
      setMessage(deleteError.message);
      return;
    }

    const { error } = await supabaseBrowser.from('positions').insert(cleaned);
    if (error) {
      setSaving(false);
      setMessage(error.message);
      return;
    }

    const { error: settingsError } = await supabaseBrowser.from('user_settings').upsert({ user_id: user.id, story_notes: storyNotes }, { onConflict: 'user_id' });
    setSaving(false);
    setMessage(settingsError ? settingsError.message : 'Saved successfully.');
  }

  return (
    <Protected>
      <main className="terminal-shell">
        <TerminalNav />
        <Section title="Portfolio Settings">
          <div className="settings-actions">
            <button className="bbg-button" onClick={addRow}>Add Position</button>
            <button className="bbg-button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            {message && <span className="save-message">{message}</span>}
          </div>
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>#</th><th>Type</th><th>Ticker</th><th>Display</th><th>Shares</th><th>Avg Cost</th><th>Cash</th><th>CCY</th><th>Multiplier</th><th>Beta</th><th>Price Override</th><th>Delta</th><th>Beta Override</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td><input value={row.sort_order} onChange={(e) => updateRow(index, 'sort_order', e.target.value)} /></td>
                    <td>
                      <select value={row.type} onChange={(e) => updateRow(index, 'type', e.target.value as PositionType)}>
                        {['Equity', 'ETF', 'Option', 'Cash'].map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </td>
                    <td><input value={row.ticker ?? ''} onChange={(e) => updateRow(index, 'ticker', e.target.value)} /></td>
                    <td><input value={row.display} onChange={(e) => updateRow(index, 'display', e.target.value)} /></td>
                    <td><input value={row.shares} onChange={(e) => updateRow(index, 'shares', e.target.value)} /></td>
                    <td><input value={row.avg_purchase_price} onChange={(e) => updateRow(index, 'avg_purchase_price', e.target.value)} /></td>
                    <td><input value={row.cash_value} onChange={(e) => updateRow(index, 'cash_value', e.target.value)} /></td>
                    <td>
                      <select value={row.currency} onChange={(e) => updateRow(index, 'currency', e.target.value)}>
                        <option>CAD</option>
                        <option>USD</option>
                      </select>
                    </td>
                    <td><input value={row.contract_multiplier} onChange={(e) => updateRow(index, 'contract_multiplier', e.target.value)} /></td>
                    <td><input value={row.beta ?? ''} onChange={(e) => updateRow(index, 'beta', e.target.value)} /></td>
                    <td><input value={row.current_price_override ?? ''} onChange={(e) => updateRow(index, 'current_price_override', e.target.value)} /></td>
                    <td><input value={row.delta ?? ''} onChange={(e) => updateRow(index, 'delta', e.target.value)} /></td>
                    <td><input value={row.beta_override ?? ''} onChange={(e) => updateRow(index, 'beta_override', e.target.value)} /></td>
                    <td><button className="delete-btn" onClick={() => removeRow(index)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Story Notes">
          <textarea className="story-textarea" value={storyNotes} onChange={(e) => setStoryNotes(e.target.value)} rows={8} />
        </Section>
      </main>
    </Protected>
  );
}
