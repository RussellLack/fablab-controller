import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export const getProject = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();
  return data;
});
