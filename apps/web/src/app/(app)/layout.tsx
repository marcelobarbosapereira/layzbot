import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

export const runtime = 'nodejs';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');

  return <>{children}</>;
}
