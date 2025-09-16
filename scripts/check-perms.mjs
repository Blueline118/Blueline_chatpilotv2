// scripts/check-perms.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const ORG_ID = '54ec8e89-d265-474d-98fc-d2ba579ac83f';

if (!url || !anon) {
  console.error('ENV mist VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(url, anon, { auth: { persistSession: false } });

async function main() {
  // 1) Wie ben je (frontend-token)? → login vereist om claims te hebben
  // Vul EEN admin-login in om te testen; daarna kun je user-by-user testen
  const email = process.env.TEST_EMAIL;      // bv. admin@...
  const password = process.env.TEST_PASSWORD;// bijpassend wachtwoord

  if (!email || !password) {
    console.log('Tip: zet TEST_EMAIL/TEST_PASSWORD in .env om echte login te testen.');
  } else {
    const { data: login, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) {
      console.error('Login error:', loginErr.message);
      process.exit(1);
    }
    console.log('✅ Ingelogd als:', login.user.email, login.user.id);
  }

  // 2) Memberships lezen (RLS)
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) {
    console.log('⚠️ Niet ingelogd; sla RLS-tests over. (Alleen has_permission baseline test.)');
  } else {
    const { data: ms, error: msErr } = await supabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', me.id);

    console.log('Memberships:', msErr ? msErr.message : ms);
  }

  // 3) has_permission baseline (lid ⇒ true)
  const { data: hp, error: hpErr } = await supabase.rpc('has_permission', {
    p_org: ORG_ID,
    p_perm: 'any.key',
  });

  console.log('has_permission(any.key) =>', hpErr ? hpErr.message : hp);

  // 4) Extra: probeer 1 chat list + delete probe (alleen als ingelogd)
  if (me) {
    const { data: chats, error: cErr } = await supabase
      .from('chats')
      .select('id, title, owner_id, created_at')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(3);

    console.log('Chats (top 3):', cErr ? cErr.message : chats);

    if (chats?.length) {
      const target = chats[0];
      console.log('Delete probe op:', { id: target.id, owner_id: target.owner_id, you: me.id });
      const { error: delErr } = await supabase
        .from('chats')
        .delete()
        .eq('id', target.id)
        .eq('org_id', ORG_ID);

      if (delErr) console.log('✅ RLS blokkeerde delete (verwacht als geen owner/admin):', delErr.message);
      else console.log('⚠️ Delete lukte vanaf client; check of je owner bent of ADMIN / service key gebruikt.');
    }
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
