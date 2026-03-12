export interface Trajet {
  type: 'TRAIN' | 'FLIGHT';
  numero: string;
  date: string;
  depart: string;
  arrivee: string;
  lieuDepart: string;
  lieuArrivee: string;
  correspondanceLieu?: string;
  correspondanceHeure?: string;
  correspondanceDate?: string;
  correspondanceNumero?: string;
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
}

export interface Congres {
  id: string;
  nom: string;
  date: string;
  lieu: string;
  heure?: string;
  participants: Participant[];
  archive?: boolean;
}

export interface ExportHistory {
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
