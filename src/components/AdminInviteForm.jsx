// src/components/AdminInviteForm.jsx
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useMembership } from '../hooks/useMembership';

export default function AdminInviteForm({ orgId }) {
  const { role } = useMembership(); // 'ADMIN' | 'TEAM' | 'CUSTOMER'
  const [email, setEmail] = useState('');
  const [roleChoice, setRoleChoice] = useState('TEAM');
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (role !== 'ADMIN') return null;

  const onInvite = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    setLink('');
    try {
      const { data, error } = await supabase.rpc('create_invite', {
        p_org_id: orgId,
        p_email: email,
        p_role: roleChoice
      });
      if (error) throw error;
      const token = data;
      const inviteUrl = `${window.location.origin}/accept-invite?token=${token}`;
      setLink(inviteUrl);
    } catch (e) {
      setErr(e.message || 'Kon invite niet maken');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#eef1f6] bg-white shadow-sm">
      <div className="border-b border-[#f2f4f8] px-4 py-2">
        <h4 className="text-[13px] font-semibold text-[#1c2b49]">Lid uitnodigen</h4>
      </div>

      <form onSubmit={onInvite} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_160px_auto]">
        <input
          type="email"
          required
          placeholder="naam@bedrijf.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 rounded-md border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#d6e0ff]"
        />
        <select
          value={roleChoice}
          onChange={(e) => setRoleChoice(e.target.value)}
          className="h-9 rounded-md border border-[#e5e7eb] bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#d6e0ff]"
        >
          <option value="TEAM">TEAM</option>
          <option value="CUSTOMER">CUSTOMER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-md border border-[#e5e7eb] px-3 text-sm hover:bg-gray-50"
        >
          {busy ? 'Aanmaken…' : 'Genereer link'}
        </button>
      </form>

      {err && <div className="px-4 pb-3 text-sm text-rose-700">{err}</div>}

      {link && (
        <div className="border-t border-[#f2f4f8] px-4 py-3 text-sm">
          <div className="mb-2 text-[#6b7280]">Kopieer en deel deze link:</div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              className="flex-1 h-9 rounded-md border border-[#e5e7eb] bg-white px-2 text-sm"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(link)}
              className="h-9 rounded-md border border-[#e5e7eb] px-2 text-sm hover:bg-gray-50"
            >
              Kopieer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
