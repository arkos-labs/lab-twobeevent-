export interface Hotel {
    name: string;
    distance?: number;
}

// Fonction pour récupérer les coordonnées GPS d'une ville (Gratuit, pas de clé API)
async function getCoordinates(city: string): Promise<{ lat: number, lon: number } | null> {
    try {
        // Si le nom du congrès contient la ville (ex: "Cardiologie Paris"), on nettoie pour garder la ville
        const query = encodeURIComponent(city);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
            headers: {
                'Accept-Language': 'fr',
                // Nominatim demande un User-Agent personnalisé
                'User-Agent': 'LogistiqueCongresApp/1.0'
            }
        });

        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        }
        return null;
    } catch (error) {
        console.error("Erreur géocodage:", error);
        return null;
    }
}

// Fonction principale pour trouver les hôtels (Gratuit, pas de clé API)
export async function searchHotels(congressCity: string): Promise<Hotel[]> {
    console.log(`Recherche d'hôtels pour : ${congressCity}`);

    // 1. Trouver les coordonnées de la ville
    // On extrait le dernier mot si c'est formaté comme "Congrès Paris"
    const cityParts = congressCity.split(' ');
    const searchStr = cityParts.length > 1 ? cityParts[cityParts.length - 1] : congressCity;

    const coords = await getCoordinates(searchStr);

    if (!coords) {
        console.warn("Impossible de trouver les coordonnées pour", searchStr);
        return [
            { name: "Hôtel de la Gare (Simulation)" },
            { name: "Le Grand Hôtel (Simulation)" }
        ];
    }

    // 2. Chercher les hôtels dans un rayon de 2000m (2km) avec Overpass API
    try {
        const overpassQuery = `
      [out:json];
      node(around:2000,${coords.lat},${coords.lon})["tourism"="hotel"];
      out top 5;
    `;

        // URL encodée de l'API Overpass
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data && data.elements && data.elements.length > 0) {
            return data.elements
                .filter((element: any) => element.tags && element.tags.name)
                .map((element: any) => ({
                    name: element.tags.name,
                }));
        }

        return [{ name: "Aucun hôtel trouvé informatiquement, recherche manuelle requise." }];
    } catch (error) {
        console.error("Erreur lors de la recherche d'hôtels:", error);
        return [{ name: "Erreur de connexion au service hôtelier." }];
    }
}
