// Service d'auto-complétion d'adresses (Gratuit via API Adresse Gouv.fr)
export interface AddressSuggestion {
  label: string;
  street: string;
  city: string;
  postcode: string;
}

export async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  if (!query || query.length < 3) return [];

  try {
    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
    const data = await response.json();

    if (data && data.features) {
      return data.features.map((feature: any) => ({
        label: feature.properties.label,
        street: feature.properties.name,
        city: feature.properties.city,
        postcode: feature.properties.postcode
      }));
    }
    return [];
  } catch (error) {
    console.error("Erreur Autocomplexe Adresse:", error);
    return [];
  }
}
