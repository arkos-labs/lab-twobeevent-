export function openGoogleFlights(
  origin: string,
  destination: string,
  dateAller: string,   // format YYYY-MM-DD
  dateRetour?: string,
  heureDebut?: string,  // format HH:mm
  congresId?: string,
  participantId?: string
) {
  // Nettoyer les villes (enlever les codes postaux, etc.)
  const cleanCity = (str: string) =>
    str.replace(/\(.*?\)/g, '').trim().split(' ')[0];

  const from = cleanCity(origin);
  const to = cleanCity(destination);

  const dep = dateAller || '';
  const ret = dateRetour || '';

  const formatDate = (d: string) => d.split('-').reverse().join('/');
  const dAller = dep ? formatDate(dep) : '';
  const dRetour = ret ? formatDate(ret) : '';

  // L'ajout de "/search" est CRUCIAL pour que Google Flights interprète le paramètre q
  const query = `${from} ${to} ${dAller} ${dRetour}`;
  let url = `https://www.google.com/travel/flights/search?q=${encodeURIComponent(query)}`;
  
  if (congresId) url += `&twobeevent_congres_id=${encodeURIComponent(congresId)}`;
  if (participantId) url += `&twobeevent_participant_id=${encodeURIComponent(participantId)}`;
  url += `&twobeevent_api_url=${encodeURIComponent(window.location.origin)}`;

  window.open(url, '_blank');
}

// Ouvre Google Hotels pré-rempli avec les filtres demandés (3-4*, max 150€, petit-déjeuner inclus)
export function openGoogleHotels(
  city: string,
  checkIn?: string,
  checkOut?: string,
  congresId?: string,
  participantId?: string
) {
  const cleanCity = (str: string) =>
    str.replace(/\(.*?\)/g, '').trim();

  const dest = cleanCity(city);
  
  // Construction du titre de recherche complet avec les contraintes :
  // - 3 ou 4 étoiles
  // - Max 150€ TTC
  // - Petit-déjeuner et taxe de séjour inclus
  // - Proche du lieu (dest)
  const searchQuery = `hotels near ${dest} 3-4 stars max 150 euros breakfast and taxes included`;
  
  const base = `https://www.google.com/travel/hotels?q=${encodeURIComponent(searchQuery)}`;
  
  // Tentative d'ajout de paramètres de filtrage direct (si supportés par l'URL)
  const filters = `&max_price=150&hotel_class=3,4`;
  
  const dates = checkIn ? `&dates=${checkIn}` + (checkOut ? `,${checkOut}` : '') : '';
  
  let url = base + filters + dates;
  if (congresId) url += `&twobeevent_congres_id=${encodeURIComponent(congresId)}`;
  if (participantId) url += `&twobeevent_participant_id=${encodeURIComponent(participantId)}`;
  url += `&twobeevent_api_url=${encodeURIComponent(window.location.origin)}`;

  window.open(url, '_blank');
}

// Ouvre SNCF Connect pré-rempli (trains)
export function openSNCF(origin: string, destination: string, date: string, dateRetour?: string, heureDebut?: string, congresId?: string, participantId?: string) {
  const cleanCity = (str: string) =>
    str.replace(/\(.*?\)/g, '').trim().split(' ')[0];
  const from = cleanCity(origin);
  const to = cleanCity(destination);
  const formatDate = (d: string) => d.split('-').reverse().join('/');
  const dAller = date ? formatDate(date) : '';
  const dRetour = dateRetour ? formatDate(dateRetour) : '';

  let query = `De ${from} à ${to}`;
  if (dAller) query += ` le ${dAller}`;
  
  if (heureDebut) {
    const [h, m] = heureDebut.split(':').map(Number);
    const arrivalLimit = `${String(h - 1).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
    query += ` arrivant avant ${arrivalLimit}`;
  }

  if (dRetour) query += ` et retour le ${dRetour}`;

  let url = `https://www.sncf-connect.com/home/search?userInput=${encodeURIComponent(query)}`;
  if (congresId) url += `&twobeevent_congres_id=${encodeURIComponent(congresId)}`;
  if (participantId) url += `&twobeevent_participant_id=${encodeURIComponent(participantId)}`;
  url += `&twobeevent_api_url=${encodeURIComponent(window.location.origin)}`;

  window.open(url, '_blank');
}
