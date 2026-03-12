# LogiCongrès

Application de gestion logistique pour congrès médicaux : import de participants, suivi des statuts, propositions de transport/hôtel, génération PDF et exports Excel.

## Stack
- Next.js (App Router)
- React 19
- Tailwind CSS
- Supabase (optionnel, avec fallback LocalStorage)

## Fonctionnalités clés
- Création/archivage de congrès
- Import Excel des participants
- Gestion logistique (transport + hôtel)
- Génération PDF personnalisée
- Export Excel (base + agence)
- Synchronisation Supabase (si configuré)

## Installation
```bash
npm install
```

## Lancer en dev
```bash
npm run dev
```

## Configuration Supabase (optionnelle)
Créer un fichier `.env.local` :
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Initialiser les tables via :
- `supabase_setup.sql` ou
- `supabase_setup_v2.sql`

> Si Supabase n’est pas configuré, l’app fonctionne en LocalStorage.

## Exports
- **Export agence** : uniquement les participants validés non exportés.
- **Export base** : base complète d’un congrès.

## Structure
```
src/
  app/
    page.tsx        # UI principale
  lib/
    pdfGenerator.ts # PDF
    supabase.ts     # Client Supabase
    hotels.ts       # Recherche hôtels (OSM)
    transport.ts    # Mock trajets
    types.ts        # Types partagés
```

## Notes
- Le champ `heure` est géré côté app (fallback `09:00` si non fourni).
- Les champs `optionsChoisies` et `billetsEnvoyes` ne sont pas persistés si la table Supabase ne les contient pas.
