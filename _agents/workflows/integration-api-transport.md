---
description: Comment remplacer la simulation de recherche de trajets par une véritable API (SNCF Connect ou Google Flights)
---

# Intégration d'une API de Transport Réelle

Ce workflow explique comment passer de la fonction de simulation actuelle (`searchTransport` dans `src/lib/transport.ts`) à une véritable intégration API B2B (par exemple, une API SNCF Connect ou Amadeus/Google Flights B2B).

## Étapes de mise en place

1. Obtenir les identifiants d'API (Clé API ou OAuth tokens) auprès du fournisseur de transport ou de l'agence de voyage.
2. Ajouter ces identifiants de manière sécurisée dans un fichier `.env.local` à la racine du projet :
   ```env
   TRANSPORT_API_KEY=votre_cle_api_secrete
   TRANSPORT_API_URL=https://api.fournisseur-transport.com/v1
   ```
3. Modifier le fichier `src/lib/transport.ts` pour qu'il effectue une requête HTTP réelle en utilisant `fetch` :

   ```typescript
   export async function searchTransport(origin: string, destination: string, date: string): Promise<RouteOption[]> {
     try {
       const response = await fetch(`${process.env.TRANSPORT_API_URL}/search?origin=${origin}&destination=${destination}&date=${date}`, {
         method: 'GET',
         headers: {
           'Authorization': `Bearer ${process.env.TRANSPORT_API_KEY}`,
           'Content-Type': 'application/json'
         }
       });
       
       if (!response.ok) throw new Error('Erreur API Transport');
       const data = await response.json();
       
       // Mapping des données brutes de l'API vers l'interface RouteOption
       return data.results.map((item: any) => ({
         id: item.journey_id,
         type: item.vehicle_type === 'TRAIN' ? 'TRAIN' : 'FLIGHT',
         departureTime: formatTime(item.departure_datetime),
         arrivalTime: formatTime(item.arrival_datetime),
         duration: calculateDuration(item.departure_datetime, item.arrival_datetime),
         price: item.price.amount,
       }));
     } catch (error) {
       console.error("Erreur de recherche", error);
       // Fallback ou erreur
       return [];
     }
   }
   ```

4. Gérer les erreurs (Rate limit, ville non trouvée, pas de trajet ce jour-là) et faire remonter ces informations dans l'interface utilisateur pour que l'administrateur soit alerté.
