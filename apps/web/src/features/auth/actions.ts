'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '../../lib/supabase/server';

const credentials = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function signIn(formData: FormData): Promise<never> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) redirect('/login?error=invalid');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect('/login?error=credentials');

  redirect('/');
}
