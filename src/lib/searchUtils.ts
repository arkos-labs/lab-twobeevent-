// Variable globale pour le throttling (limite la fréquence d'ouverture)
let lastRequestTime = 0;
const MIN_DELAY = 1200; // 1.2 seconde entre deux clics pour paraître humain

function secureOpen(url: string, windowName: string) {
  const now = Date.now();
  if (now - lastRequestTime < MIN_DELAY) {
    console.warn("[Security] Requête trop rapide, blocage préventif.");
    return;
  }
  lastRequestTime = now;

  // Délai aléatoire (Jitter) entre 100 et 600ms pour casser la régularité
  const randomJitter = Math.floor(Math.random() * 500) + 100;
  
  setTimeout(() => {
    window.open(url, windowName, 'noreferrer');
  }, randomJitter);
}

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

  const query = `${from} ${to} ${dAller} ${dRetour}`;
  let url = `https://www.google.com/travel/flights/search?q=${encodeURIComponent(query)}`;
  
  if (congresId) url += `&twobeevent_congres_id=${encodeURIComponent(congresId)}`;
  if (participantId) url += `&twobeevent_participant_id=${encodeURIComponent(participantId)}`;
  url += `&twobeevent_api_url=${encodeURIComponent(window.location.origin)}`;

  // On réutilise l'onglet de recherche de vol pour éviter le spam
  secureOpen(url, 'twobeevent_flights_search');
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

  secureOpen(url, 'twobeevent_hotels_search');
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

  // La SNCF est très sensible : on réutilise STRICTEMENT le même onglet
  secureOpen(url, 'twobeevent_sncf_search');
}

// Ouvre Trainline pré-rempli (alternative à SNCF Connect)
export function openTrainline(
  origin: string, 
  destination: string, 
  date: string, 
  dateRetour?: string, 
  heureDebut?: string, 
  congresId?: string, 
  participantId?: string
) {
  const cleanCity = (str: string) =>
    str.replace(/\(.*?\)/g, '').trim().split(' ')[0];
  const from = cleanCity(origin);
  const to = cleanCity(destination);
  
  // Format Trainline: https://www.thetrainline.com/search/results?departureStation=paris&arrivalStation=lyon&outwardDate=2024-03-23T08%3A00%3A00
  const formatDate = (d: string) => {
    if (!d) return '';
    return d; // YYYY-MM-DD
  };

  const d = formatDate(date);
  const time = heureDebut ? `${heureDebut}:00` : "08:00:00";
  
  let url = `https://www.thetrainline.com/search/results?departureStation=${encodeURIComponent(from)}&arrivalStation=${encodeURIComponent(to)}&outwardDate=${d}T${encodeURIComponent(time)}`;
  
  if (dateRetour) {
    url += `&inwardDate=${formatDate(dateRetour)}T17%3A00%3A00`;
  }
  
  if (congresId) url += `&twobeevent_congres_id=${encodeURIComponent(congresId)}`;
  if (participantId) url += `&twobeevent_participant_id=${encodeURIComponent(participantId)}`;
  url += `&twobeevent_api_url=${encodeURIComponent(window.location.origin)}`;

  secureOpen(url, 'twobeevent_trainline_search');
}
