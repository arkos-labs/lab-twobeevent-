export interface Segment {
  lieuDepart: string;
  lieuArrivee: string;
  depart: string;
  arrivee: string;
  date?: string;
  numero: string;
  duree?: string;
  classe?: string;
  placement?: string;
}

export interface Trajet {
  type: 'TRAIN' | 'FLIGHT';
  numero: string;
  date: string;
  depart: string;
  arrivee: string;
  lieuDepart: string;
  lieuArrivee: string;
  segments?: Segment[];
  correspondanceLieu?: string;
  correspondanceHeure?: string;
  correspondanceArrivee?: string;
  correspondanceDate?: string;
  correspondanceNumero?: string;
  duree?: string;
  classe?: string;
  placement?: string;
  correspondanceDuree?: string;
}


export interface PropositionTransport {
  aller: Trajet;
  retour: Trajet;
}

export interface PropositionHotel {
  nom: string;
  checkIn?: string;
  checkOut?: string;
}

export interface LogistiqueSaisie {
  transports: PropositionTransport[];
  hotels: PropositionHotel[];
}

export interface Participant {
  id: string;
  nom: string;
  email: string;        // peut être vide ''
  telephone: string;    // colonne O
  villeDepart: string;
  statut: 'A_TRAITER' | 'ATTENTE_REPONSE' | 'VALIDE' | 'SUPPRIME';
  logistique?: LogistiqueSaisie;
  dejaExporte?: boolean;
  optionsChoisies?: string;
  billetsEnvoyes?: boolean;
  dateDebut?: string;
  dateFin?: string;
}

export interface Congres {
  id: string;
  nom: string;
  date: string; // Gardé pour la compatibilité (sera dateDebut par défaut)
  dateDebut?: string; // Format YYYY-MM-DD
  dateFin?: string;   // Format YYYY-MM-DD
  lieu: string;
  adresse?: string;   // Nouvelle adresse complète de l'événement
  heure?: string;
  participants: Participant[];
  archive?: boolean;
  emailTemplate?: {
    subject: string;
    body: string;
  };
  bulletinTemplate?: string;   // Base64 Docx/XLSX
  logisticsTemplate?: string;  // Base64 Docx/XLSX
  logo?: string;               // Base64 PNG/JPG
  signature?: string;          // Base64 PNG/JPG
}

export interface ExportHistory {
  id?: string;
  date: string;
  count: number;
  congresName: string;
}

export interface ExportHistoryRow {
  id: string;
  date: string;
  description: string;
  nb_participants: number;
}
