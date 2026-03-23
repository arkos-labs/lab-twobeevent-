-- Suppression de l'ancienne table si elle existait
DROP TABLE IF EXISTS public.app_state;

-- 1. Table des Congrès
CREATE TABLE public.congres (
  id uuid PRIMARY KEY,
  nom text NOT NULL,
  date text,
  lieu text,
  adresse text,
  archive boolean DEFAULT false,
  email_template jsonb,
  bulletin_template text,
  logistics_template text,
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
VALUES (1, '{"subject": "Mundipharma – 27es Journées Nationales d\'Infectiologie 2026 – Invitation", "body": "Chère/Cher Dr,\\n\\nLe laboratoire Mundipharma a le plaisir de vous compter parmi ses invités au Congrès JNI, qui se déroulera du 18 au 20 juin 2026 à Paris au :\\nPalais des Congrès de Paris\\n2 Place de la Porte Maillot, 75017 Paris\\n\\nL’organisation logistique de votre participation nous a été confiée par le laboratoire. Afin d’organiser au mieux votre séjour, merci de bien vouloir remplir le formulaire ci-joint et nous le retourner dès réception à l’adresse suivante : keisha.khoto-thinu@twobevents.fr.\\n\\nNous nous tenons à votre disposition pour toute information complémentaire au 01 84 25 94 89.\\n\\nDans l’attente de vous lire, nous vous prions de croire, Chère/Cher Madame/Monsieur, à l’assurance de notre considération distinguée.\\n\\n\\nKeïsha KHOTO-THINU pour le laboratoire Mundipharma"}'::jsonb) 
ON CONFLICT (id) DO NOTHING;

-- Désactivation du Row Level Security 
ALTER TABLE public.congres DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;
