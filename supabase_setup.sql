-- À copier-coller et exécuter dans l'éditeur SQL de votre tableau de bord Supabase

CREATE TABLE IF NOT EXISTS public.app_state (
  id integer PRIMARY KEY,
  congres jsonb DEFAULT '[]'::jsonb,
  export_history jsonb DEFAULT '[]'::jsonb,
  email_template jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now()
);

-- Désactiver le paramètre de sécurité RLS (Row Level Security) 
-- car nous utilisons une solution simple (pas d'authentification utilisateur ici).
ALTER TABLE public.app_state DISABLE ROW LEVEL SECURITY;

-- Insérer la première ligne vide si elle n'existe pas encore
INSERT INTO public.app_state (id) 
VALUES (1) 
ON CONFLICT (id) DO NOTHING;
