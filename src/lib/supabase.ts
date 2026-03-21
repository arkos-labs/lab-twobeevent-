import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Si les variables sont manquantes, on crée un client "fantôme" qui ne fera rien
// mais qui empêchera l'application de planter au démarrage.
// L'application swichera alors sur le LocalStorage comme prévu dans Dashboard.
const phantomResponse = Promise.resolve({ data: null, error: { message: 'Supabase not configured' } });
const phantomChain: any = {
  select: () => phantomChain,
  upsert: () => phantomResponse,
  insert: () => phantomResponse,
  update: () => phantomResponse,
  delete: () => phantomChain,
  eq: () => phantomChain,
  in: () => phantomChain,
  single: () => phantomResponse,
};

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : { from: () => phantomChain } as any;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] URL ou ANON KEY manquante. Mode LocalStorage uniquement.');
}
