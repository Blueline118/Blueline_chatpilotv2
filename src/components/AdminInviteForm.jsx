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
    <div className="mt-4 p-3 border rounded-lg">
      <h3 className="font-semibold mb-2">Lid uitnodigen</h3>
      <form onSubmit={onInvite} className="flex flex-col gap-2">
        <input
          type="email"
          required
          placeholder="naam@bedrijf.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <select
          value={roleChoice}
          onChange={(e) => setRoleChoice(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="TEAM">TEAM</option>
          <option value="CUSTOMER">CUSTOMER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          className="self-start inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
        >
          {busy ? 'Aanmaken…' : 'Genereer invite link'}
        </button>
      </form>

      {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
      {link && (
        <div className="mt-3 text-sm">
          <div className="text-gray-600 mb-1">Kopieer en deel deze link:</div>
          <div className="flex items-center gap-2">
            <input readOnly value={link} className="flex-1 border rounded px-2 py-1" />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(link)}
              className="px-2 py-1 border rounded hover:bg-gray-50"
            >
              Kopieer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
