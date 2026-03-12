-- Suppression de l'ancienne table si elle existait
DROP TABLE IF EXISTS public.app_state;

-- 1. Table des Congrès
CREATE TABLE public.congres (
  id uuid PRIMARY KEY,
  nom text NOT NULL,
  date text,
  lieu text,
  archive boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Table des Participants
CREATE TABLE public.participants (
  id uuid PRIMARY KEY,
  congres_id uuid REFERENCES public.congres(id) ON DELETE CASCADE,
  nom text NOT NULL,
  email text,
  telephone text,
  ville_depart text,
  statut text DEFAULT 'A_TRAITER',
  billets_envoyes boolean DEFAULT false,
  deja_exporte boolean DEFAULT false,
  options_choisies text,
  proposition_transport jsonb,
  proposition_hotel jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Table de l'Historique des exports
CREATE TABLE public.export_history (
  id text PRIMARY KEY,
  date text,
  description text,
  nb_participants integer
);

-- 4. Table des Paramètres (ex: Modèle d'email)
CREATE TABLE public.settings (
  id integer PRIMARY KEY,
  email_template jsonb
);

-- Initialisation de la ligne de paramètre
INSERT INTO public.settings (id, email_template) 
VALUES (1, '{"subject": "Proposition Logistique - {CONGRES}", "body": "Bonjour {NOM}..."}'::jsonb) 
ON CONFLICT (id) DO NOTHING;

-- Désactivation du Row Level Security 
ALTER TABLE public.congres DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;
