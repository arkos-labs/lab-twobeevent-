'use client';

import React, { useState, useRef } from 'react';
import {
  FileUp, Users, CheckCircle2, Loader2, FileDown,
  MailCheck, Mail, MapPin, Edit3, X, Plus, Trash2, Calendar,
  AlertCircle, Clock, ChevronRight, Train, Plane, Hotel,
  Search, Bell, LayoutDashboard, Settings, Filter, MoreHorizontal, Archive, ArchiveRestore, Copy, Database, Ticket,
  Moon, Sun, Wand2, Zap
} from 'lucide-react';
import { generateInvitationPDF } from '@/lib/pdfGenerator';
import { openGoogleFlights, openGoogleHotels, openSNCF } from '@/lib/searchUtils';
import { fetchAddressSuggestions } from '@/lib/autocomplete';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { Congres, ExportHistory, ExportHistoryRow, Participant, PropositionHotel, PropositionTransport, Trajet } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const trajetVide = (): Trajet => ({
  type: 'TRAIN',
  numero: '',
  date: '',
  depart: '',
  arrivee: '',
  lieuDepart: '',
  lieuArrivee: '',
  correspondanceLieu: undefined,
  correspondanceHeure: undefined,
  correspondanceDate: undefined
});

const validateEmail = (email: string) => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const propositionVide = (): PropositionTransport => ({ aller: trajetVide(), retour: trajetVide() });

const normalizeParticipant = (p: any): Participant => {
  const transports = p.logistique?.transports || p.proposition_transport || p.transports || [];
  const hotels = p.logistique?.hotels || p.proposition_hotel || p.hotels || [];
  const hasLogistique = !!p.logistique || transports.length > 0 || hotels.length > 0;

  return {
    id: p.id,
    nom: p.nom || 'Inconnu',
    email: p.email || '',
    telephone: p.telephone || '',
    villeDepart: p.ville_depart || p.villeDepart || '',
    statut: (p.statut as Participant['statut']) || 'A_TRAITER',
    dejaExporte: p.deja_exporte ?? p.dejaExporte ?? false,
    optionsChoisies: p.options_choisies ?? p.optionsChoisies ?? '',
    billetsEnvoyes: p.billets_envoyes ?? p.billetsEnvoyes ?? false,
    logistique: hasLogistique ? { transports, hotels } : undefined
  };
};

const normalizeCongres = (c: any, allParticipants: any[] = []): Congres => ({
  id: c.id,
  nom: c.nom || '',
  date: c.date || c.date_debut || '',
  dateDebut: c.date_debut || c.dateDebut || c.date || '',
  dateFin: c.date_fin || c.dateFin || '',
  lieu: c.lieu || '',
  adresse: c.adresse || '',
  heure: c.heure || '09:00',
  archive: c.archive || false,
  participants: allParticipants
    .filter((p: any) => p.congres_id === c.id)
    .map(normalizeParticipant)
});

const normalizeHistoryRow = (h: any): ExportHistory => ({
  id: h.id,
  date: h.date,
  count: h.nb_participants ?? h.count ?? 0,
  congresName: h.description ?? h.congresName ?? ''
});

// ─── Composant Principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  // ── État global ──
  const [congres, setCongres] = useState<Congres[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'BOARD' | 'ARCHIVES'>('BOARD');
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Modale ajout congrès ──
  const [addCongressOpen, setAddCongressOpen] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newDateFin, setNewDateFin] = useState('');
  const [newLieu, setNewLieu] = useState('');
  const [newAdresse, setNewAdresse] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [newHeure, setNewHeure] = useState('');

  // ── Modale logistique ──
  const [modalOpen, setModalOpen] = useState(false);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [transports, setTransports] = useState<PropositionTransport[]>([]);
  const [hotels, setHotels] = useState<PropositionHotel[]>([]);

  // ── Modale Edition Contact ──
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [tempEmail, setTempEmail] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [tempNom, setTempNom] = useState('');

  // ── Actions Groupées ──
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());

  // ── Modale Email Settings ──
  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState({
    subject: "Proposition Logistique - {CONGRES}",
    body: "Bonjour {NOM},\n\nDans le cadre de votre participation au congrès \"{CONGRES}\", nous avons le plaisir de vous soumettre notre proposition logistique.\n\nVous trouverez en pièce jointe un PDF récapitulatif avec {NB_TRANS} option(s) de transport et {NB_HOTEL} option(s) d'hébergement.\n\nMerci d'indiquer l'Option N° qui vous convient.\n\nCordialement,\nL'équipe Logistique"
  });

  // ── Recherche et Filtres ──
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [exportHistory, setExportHistory] = useState<ExportHistory[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Dark Mode ──
  const [isDark, setIsDark] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [dbError, setDbError] = useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('logitools_theme');
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
        setIsDark(true);
      }
    }
  }, []);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('logitools_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('logitools_theme', 'light');
    }
  };

  // ─── Sélection congrès ───────────────────────────────────────────────────────
  const selectedCongres = congres.find(c => c.id === selectedId) ?? null;

  const updateParticipants = (congresId: string, updater: (ps: Participant[]) => Participant[]) => {
    setCongres(prev => prev.map(c =>
      c.id === congresId ? { ...c, participants: updater(c.participants) } : c
    ));
  };

  // ─── Ajout d'un congrès ──────────────────────────────────────────────────────
  const handleAddCongres = () => {
    if (!newNom.trim()) return;
    const id = crypto.randomUUID();
    const newCongres = {
      id,
      nom: newNom.trim(),
      date: newDate,
      dateDebut: newDate,
      dateFin: newDateFin,
      lieu: newLieu,
      adresse: newAdresse,
      heure: newHeure,
      participants: [] as Participant[],
      archive: false
    };

    // Mise à jour de l'état React
    setCongres(prev => {
      const updated = [...prev, newCongres];
      // Sauvegarde immédiate dans LocalStorage (ne pas attendre le useEffect)
      try {
        localStorage.setItem('logitools_data', JSON.stringify(updated));
      } catch (e) {
        console.error('[handleAddCongres] localStorage error:', e);
      }
      return updated;
    });

    // Marquer que l'utilisateur a deja agi → empeche initData d'ecraser l'etat
    initializedRef.current = true;

    setSelectedId(id);
    setNewNom('');
    setNewDate('');
    setNewDateFin('');
    setNewLieu('');
    setNewAdresse('');
    setNewHeure('');
    setAddCongressOpen(false);
  };

  const handleDeleteCongres = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Supprimer définitivement ce congrès et tous ses participants ?")) return;
    setCongres(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleArchiveCongres = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setCongres(prev => prev.map(c => c.id === id ? { ...c, archive: !c.archive } : c));
    if (selectedId === id) setSelectedId(null); // Deselect if archiving
  };

  const handleDeleteParticipant = (pid: string) => {
    if (!selectedId) return;
    const isAlreadyInTrash = participants.find(p => p.id === pid)?.statut === 'SUPPRIME';

    if (isAlreadyInTrash) {
      if (!window.confirm("Supprimer définitivement ce participant de la corbeille ?")) return;
      updateParticipants(selectedId, ps => ps.filter(p => p.id !== pid));
    } else {
      if (!window.confirm("Envoyer ce participant à la corbeille ?")) return;
      updateParticipants(selectedId, ps => ps.map(p => p.id === pid ? { ...p, statut: 'SUPPRIME' } : p));
    }
  };

  const handleRestoreParticipant = (pid: string) => {
    if (!selectedId) return;
    updateParticipants(selectedId, ps => ps.map(p => p.id === pid ? { ...p, statut: 'A_TRAITER' } : p));
  };

  const handleDeleteHistory = (id?: string) => {
    if (!id) return;
    if (!window.confirm("Supprimer cette entrée de l'historique ?")) return;
    setExportHistory(prev => prev.filter(h => (h.id || `${h.date}-${prev.indexOf(h)}`) !== id));
  };

  const handleCleanHistoryDupes = () => {
    setExportHistory(prev => {
      const seen = new Set<string>();
      return prev.filter(h => {
        const key = `${h.date}-${h.congresName}-${h.count}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  };

  const handleClearHistory = () => {
    if (!window.confirm("Tout supprimer définitivement l'historique ?")) return;
    setExportHistory([]);
  };

  const handleEmptyTrash = () => {
    if (!selectedId || !window.confirm("Vider définitivement la corbeille ?")) return;
    updateParticipants(selectedId, ps => ps.filter(p => p.statut !== 'SUPPRIME'));
  };

  const handleReExportParticipant = (pid: string) => {
    if (!selectedId || !window.confirm("Remettre ce participant dans la liste des exports Agence ?")) return;
    updateParticipants(selectedId, ps => ps.map(p => p.id === pid ? { ...p, dejaExporte: false } : p));
  };

  const handleToggleBillet = (pid: string) => {
    if (!selectedId) return;
    updateParticipants(selectedId, ps => ps.map(p => p.id === pid ? { ...p, billetsEnvoyes: !p.billetsEnvoyes } : p));
  };

  // ─── Import Excel ────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedId) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[] = XLSX.utils.sheet_to_json(ws, { header: 'A', defval: '' });

      // Filtrer les lignes vides
      let rows = data.filter(r => r['K'] || r['L']);

      // Essayer de détecter l'en-tête (qui contient 'prénom', 'nom', ou 'first name' en colonne K ou L)
      if (rows.length > 0) {
        const strK = String(rows[0]['K']).toLowerCase();
        const strL = String(rows[0]['L']).toLowerCase();
        if (strK.includes('prénom') || strK.includes('prenom') || strK.includes('name') || strL.includes('nom') || strL.includes('name')) {
          rows.shift(); // On enlève la première ligne car c'est un en-tête
        }
      }

      const imported: Participant[] = rows.map((row, index) => {
        const prenom = String(row['K'] || '').trim();
        const nom = String(row['L'] || '').trim();
        const email = String(row['P'] || '').trim();   // Col P
        const telephone = String(row['O'] || '').trim();   // Col O
        const codePostal = String(row['T'] || '').trim();  // Col T
        const ville = String(row['U'] || '').trim();       // Col U
        const etablissement = String(row['Q'] || '').trim(); // Col Q

        return {
          id: crypto.randomUUID(),
          nom: `${prenom} ${nom}`.trim() || 'Inconnu',
          email,
          telephone,
          villeDepart: ville
            ? `${ville}${codePostal ? ` (${codePostal})` : ''}`
            : etablissement || 'Inconnue',
          statut: 'A_TRAITER',
        };
      });

      updateParticipants(selectedId, () => imported);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // ─── Modale logistique ───────────────────────────────────────────────────────
  const openLogistiqueModal = (p: Participant) => {
    setCurrentParticipant(p);
    if (p.logistique) {
      setTransports(p.logistique.transports);
      setHotels(p.logistique.hotels);
    } else {
      setTransports([propositionVide()]);
      setHotels([{ nom: '' }]);
    }
    setModalOpen(true);
  };

  const updateTransport = (idx: number, dir: 'aller' | 'retour', field: keyof Trajet, val: any) => {
    setTransports(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [dir]: { ...next[idx][dir], [field]: val } };
      return next;
    });
  };

  const updateTransportMulti = (idx: number, dir: 'aller' | 'retour', updates: Partial<Trajet>) => {
    setTransports(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [dir]: { ...next[idx][dir], ...updates } };
      return next;
    });
  };

  const updateHotel = (idx: number, field: keyof PropositionHotel, val: string) => {
    setHotels(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: val }; return n; });
  };

  const saveLogistique = () => {
    if (!currentParticipant || !selectedId) return;
    updateParticipants(selectedId, ps =>
      ps.map(p => p.id === currentParticipant.id ? { ...p, logistique: { transports, hotels } } : p)
    );
    setModalOpen(false);
  };

  // ─── Gmail ───────────────────────────────────────────────────────────────────
  const openGmailDraft = (participant: Participant) => {
    if (!participant.email) return;
    const nb = participant.logistique?.transports.length ?? 0;
    const nbH = participant.logistique?.hotels.length ?? 0;

    let subject = emailTemplate.subject
      .replace(/{CONGRES}/g, selectedCongres?.nom ?? '');

    let body = emailTemplate.body
      .replace(/{NOM}/g, participant.nom)
      .replace(/{CONGRES}/g, selectedCongres?.nom ?? '')
      .replace(/{NB_TRANS}/g, nb.toString())
      .replace(/{NB_HOTEL}/g, nbH.toString());

    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${participant.email}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  // ─── Génération PDF + Gmail ──────────────────────────────────────────────────
  const handleGeneratePDFAndEmail = async (participant: Participant) => {
    if (!participant.logistique || !selectedId) return;
    setLoadingIds(prev => new Set(prev).add(participant.id));
    try {
      if (selectedCongres) {
        generateInvitationPDF(participant.nom, selectedCongres, participant.logistique);
      }
      if (participant.email) openGmailDraft(participant);
      updateParticipants(selectedId, ps =>
        ps.map(p => p.id === participant.id ? { ...p, statut: 'ATTENTE_REPONSE' } : p)
      );
    } finally {
      setLoadingIds(prev => { const n = new Set(prev); n.delete(participant.id); return n; });
    }
  };

  const openContactModal = (p: Participant) => {
    setEditingParticipant(p);
    setTempEmail(p.email);
    setTempPhone(p.telephone);
    setTempNom(p.nom);
    setContactModalOpen(true);
  };

  const saveContactInfo = () => {
    if (!editingParticipant || !selectedId) return;
    updateParticipants(selectedId, ps =>
      ps.map(p => p.id === editingParticipant.id ? { ...p, email: tempEmail, telephone: tempPhone, nom: tempNom } : p)
    );
    setContactModalOpen(false);
    setEditingParticipant(null);
  };

  const handleValidate = (participantId: string) => {
    if (!selectedId) return;
    updateParticipants(selectedId, ps =>
      ps.map(p => p.id === participantId ? { ...p, statut: 'VALIDE' } : p)
    );
  };

  // ─── Export Agence (Nouveaux uniquement) ───────────────────────────────────
  const handleExportAgence = () => {
    if (!selectedCongres) return;

    // 1. Filtrer les médecins validés qui n'ont PAS encore été exportés
    const aExporter = selectedCongres.participants.filter(p => p.statut === 'VALIDE' && !p.dejaExporte);

    if (aExporter.length === 0) {
      alert("Aucun nouveau médecin validé à exporter pour le moment.");
      return;
    }

    // 2. Préparer les données pour l'Excel de l'agence
    const dataExcel = aExporter.map(p => ({
      'Médecin': p.nom,
      'Email': p.email,
      'Téléphone': p.telephone,
      'Ville Départ': p.villeDepart,
      'Congrès': selectedCongres.nom,
      // ALLER
      'Type Aller': p.logistique?.transports[0]?.aller.type === 'TRAIN' ? 'Train' : (p.logistique?.transports[0]?.aller.type === 'FLIGHT' ? 'Avion' : ''),
      'De (Aller)': p.logistique?.transports[0]?.aller.lieuDepart,
      'À (Aller)': p.logistique?.transports[0]?.aller.lieuArrivee,
      'N° Vol/Train (Aller)': p.logistique?.transports[0]?.aller.numero,
      'Date Aller': p.logistique?.transports[0]?.aller.date,
      'Heure Aller': p.logistique?.transports[0]?.aller.depart,
      'Correspondance Aller': p.logistique?.transports[0]?.aller.correspondanceLieu
        ? `${p.logistique.transports[0].aller.correspondanceLieu} (le ${p.logistique.transports[0].aller.correspondanceDate} à ${p.logistique.transports[0].aller.correspondanceHeure}) - N° ${p.logistique.transports[0].aller.correspondanceNumero || '?'}`
        : 'Direct',
      // RETOUR
      'Type Retour': p.logistique?.transports[0]?.retour.type === 'TRAIN' ? 'Train' : (p.logistique?.transports[0]?.retour.type === 'FLIGHT' ? 'Avion' : ''),
      'De (Retour)': p.logistique?.transports[0]?.retour.lieuDepart,
      'À (Retour)': p.logistique?.transports[0]?.retour.lieuArrivee,
      'N° Vol/Train (Retour)': p.logistique?.transports[0]?.retour.numero,
      'Date Retour': p.logistique?.transports[0]?.retour.date,
      'Heure Retour': p.logistique?.transports[0]?.retour.depart,
      'Correspondance Retour': p.logistique?.transports[0]?.retour.correspondanceLieu
        ? `${p.logistique.transports[0].retour.correspondanceLieu} (le ${p.logistique.transports[0].retour.correspondanceDate} à ${p.logistique.transports[0].retour.correspondanceHeure}) - N° ${p.logistique.transports[0].retour.correspondanceNumero || '?'}`
        : 'Direct',
      // HOTEL
      'Hôtel': p.logistique?.hotels[0]?.nom,
      'Dates Hôtel': p.logistique?.hotels && p.logistique.hotels.length > 0 && p.logistique.hotels[0].checkIn ? `Du ${p.logistique.hotels[0].checkIn} au ${p.logistique.hotels[0].checkOut || '?'}` : ''
    }));

    // 3. Générer le fichier
    const ws = XLSX.utils.json_to_sheet(dataExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "A Réserver");
    XLSX.writeFile(wb, `Export_Agence_${selectedCongres.nom.replace(/ /g, '_')}_${new Date().toLocaleDateString()}.xlsx`);

    // 4. Marquer comme exportés dans la base
    updateParticipants(selectedCongres.id, ps =>
      ps.map(p => aExporter.some(ae => ae.id === p.id) ? { ...p, dejaExporte: true } : p)
    );

    // 5. Enregistrer dans l'historique
    setExportHistory(prev => [
      {
        id: crypto.randomUUID(),
        date: new Date().toLocaleString('fr-FR'),
        count: aExporter.length,
        congresName: selectedCongres.nom
      },
      ...prev
    ]);
  };

  const exportCongresToExcel = (congresId: string) => {
    const c = congres.find(x => x.id === congresId);
    if (!c) return;

    if (c.participants.length === 0) {
      alert("Cet événement n'a aucun participant à exporter !");
      return;
    }

    const dataExcel = c.participants.map(p => ({
      "Médecin": p.nom,
      "Email": p.email,
      "Téléphone": p.telephone,
      "Ville de départ": p.villeDepart,
      "Statut Participant": p.statut,
      "Billet envoyé": p.billetsEnvoyes ? 'Oui' : 'Non',
      "Traité agence": p.dejaExporte ? 'Oui' : 'Non',
      "Options Choisies": p.optionsChoisies || '',
      "Transport Aller": p.logistique?.transports && p.logistique.transports[0]?.aller.numero ? `N° ${p.logistique.transports[0].aller.numero} (${p.logistique.transports[0].aller.depart} -> ${p.logistique.transports[0].aller.arrivee})` : '',
      "Correspondance Aller": p.logistique?.transports && p.logistique.transports[0]?.aller.correspondanceLieu ? `${p.logistique.transports[0].aller.correspondanceLieu} (le ${p.logistique.transports[0].aller.correspondanceDate} à ${p.logistique.transports[0].aller.correspondanceHeure}) - N° ${p.logistique.transports[0].aller.correspondanceNumero || '?'}` : '',
      "Transport Retour": p.logistique?.transports && p.logistique.transports[0]?.retour.numero ? `N° ${p.logistique.transports[0].retour.numero} (${p.logistique.transports[0].retour.depart} -> ${p.logistique.transports[0].retour.arrivee})` : '',
      "Correspondance Retour": p.logistique?.transports && p.logistique.transports[0]?.retour.correspondanceLieu ? `${p.logistique.transports[0].retour.correspondanceLieu} (le ${p.logistique.transports[0].retour.correspondanceDate} à ${p.logistique.transports[0].retour.correspondanceHeure}) - N° ${p.logistique.transports[0].retour.correspondanceNumero || '?'}` : '',
      "Hôtel": p.logistique?.hotels && p.logistique.hotels.length > 0 ? p.logistique.hotels[0].nom : '',
      "Dates Hôtel": p.logistique?.hotels && p.logistique.hotels.length > 0 && p.logistique.hotels[0].checkIn ? `Du ${p.logistique.hotels[0].checkIn} au ${p.logistique.hotels[0].checkOut || '?'}` : ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Base de Données");

    XLSX.writeFile(wb, `Base_${c.nom.replace(/ /g, '_')}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`);
  };

  // ─── Actions Groupées ───
  const handleBulkValidate = () => {
    if (!selectedId || selectedParticipants.size === 0) return;
    updateParticipants(selectedId, ps =>
      ps.map(p => selectedParticipants.has(p.id) && p.statut === 'ATTENTE_REPONSE' ? { ...p, statut: 'VALIDE' } : p)
    );
    setSelectedParticipants(new Set());
  };

  const handleBulkDelete = () => {
    if (!selectedId || selectedParticipants.size === 0) return;
    if (!window.confirm(`Supprimer les ${selectedParticipants.size} participants sélectionnés ?`)) return;
    updateParticipants(selectedId, ps => ps.filter(p => !selectedParticipants.has(p.id)));
    setSelectedParticipants(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedParticipants.size === filteredParticipants.length) {
      setSelectedParticipants(new Set());
    } else {
      setSelectedParticipants(new Set(filteredParticipants.map(p => p.id)));
    }
  };

  const toggleSelect = (pid: string) => {
    setSelectedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  // ─── Chargement DB (Supabase avec repli LocalStorage) ───
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    async function initData() {
      const { data: dataCongres } = await supabase.from('congres').select('*');
      const { data: dataParticipants } = await supabase.from('participants').select('*');
      const { data: dataHistory } = await supabase.from('export_history').select('*');
      const { data: dataSettings } = await supabase.from('settings').select('*').eq('id', 1).single();

      // Si l'utilisateur a deja agi (cree un congres) pendant le chargement, on n'ecrase pas
      if (initializedRef.current) return;

      let finalCongres: Congres[] = [];
      let finalHistory: ExportHistory[] = [];
      let finalTemplate = {
        subject: "Proposition Logistique - {CONGRES}",
        body: "Bonjour {NOM},\n\nDans le cadre de votre participation au congrès \"{CONGRES}\", nous avons le plaisir de vous soumettre notre proposition logistique.\n\nVous trouverez en pièce jointe un PDF récapitulatif avec {NB_TRANS} option(s) de transport et {NB_HOTEL} option(s) d'hébergement.\n\nMerci d'indiquer l'Option N° qui vous convient.\n\nCordialement,\nL'équipe Logistique"
      };

      // dataCongres !== null signifie que Supabase est configure et a repondu
      if (dataCongres !== null && dataCongres.length > 0) {
        finalCongres = dataCongres.map((c: any) => normalizeCongres(c, dataParticipants || []));
        if (dataHistory && dataHistory.length > 0) {
          finalHistory = (dataHistory as ExportHistoryRow[]).map(normalizeHistoryRow);
        }
        if (dataSettings?.email_template) finalTemplate = dataSettings.email_template;
      } else {
        // Fallback LocalStorage (Supabase non configure, vide ou erreur)
        const saved = localStorage.getItem('logitools_data');
        const savedHistory = localStorage.getItem('logitools_history');
        const savedTemplate = localStorage.getItem('logitools_template');

        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            finalCongres = Array.isArray(parsed)
              ? parsed.map((c: any) => ({
                ...normalizeCongres(c, c.participants || []),
                participants: (c.participants || []).map(normalizeParticipant)
              }))
              : [];
          } catch (e) { console.error('[initData] localStorage parse error:', e); }
        }
        if (savedHistory) {
          try {
            const parsedHistory = JSON.parse(savedHistory);
            finalHistory = Array.isArray(parsedHistory) ? parsedHistory.map(normalizeHistoryRow) : [];
          } catch (e) { /* ignore */ }
        }
        if (savedTemplate) {
          try { finalTemplate = JSON.parse(savedTemplate); } catch (e) { /* ignore */ }
        }
      }

      initializedRef.current = true;
      setCongres(finalCongres);
      setExportHistory(finalHistory);
      setEmailTemplate(finalTemplate);
    }
    initData();
  }, []);

  // ─── Synchronisation DB & LocalStorage ───
  React.useEffect(() => {
    if (congres.length === 0 && exportHistory.length === 0) return; // Évite d'écraser la DB au mount initial

    // 1. Double sauvegarde locale par sécurité
    localStorage.setItem('logitools_data', JSON.stringify(congres));
    localStorage.setItem('logitools_history', JSON.stringify(exportHistory));
    localStorage.setItem('logitools_template', JSON.stringify(emailTemplate));

    // 2. Synchronisation en ligne (Supabase - Tables V2)
    const syncToDB = async () => {
      // Upsert des paramètres
      const { error: errSettings } = await supabase.from('settings').upsert({
        id: 1,
        email_template: emailTemplate
      }, { onConflict: 'id' });
      if (errSettings) console.error("Erreur Settings Supabase:", errSettings);

      // Upsert de l'historique
      const historyPayload = exportHistory.map((h, i) => ({
        id: h.id || `${h.date}-${i}`, // Stable ID if available, fallback for old data
        date: h.date,
        description: h.congresName,
        nb_participants: h.count
      }));
      if (historyPayload.length > 0) {
        const { error: errHist } = await supabase.from('export_history').upsert(historyPayload, { onConflict: 'id' });
        if (errHist) console.error("Erreur Historique Supabase:", errHist);
      }

      // Upsert des congrès
      const congresPayload = congres.map(c => ({
        id: c.id,
        nom: c.nom,
        date: c.date,
        date_debut: c.dateDebut || c.date,
        date_fin: c.dateFin,
        lieu: c.lieu,
        adresse: c.adresse,
        archive: c.archive || false
      }));
      if (congresPayload.length > 0) {
        const { error: errCongres } = await supabase.from('congres').upsert(congresPayload, { onConflict: 'id' });
        if (errCongres) console.error("Erreur Congrès Supabase:", errCongres);
      }

      // Upsert de TOUS les participants de TOUS les congrès
      const allParticipants = congres.flatMap(c =>
        c.participants.map(p => ({
          id: p.id,
          congres_id: c.id,
          nom: p.nom,
          email: p.email,
          telephone: p.telephone,
          ville_depart: p.villeDepart,
          statut: p.statut,
          deja_exporte: p.dejaExporte || false,
          date_debut: c.dateDebut || c.date,
          date_fin: c.dateFin,
          proposition_transport: p.logistique?.transports || [],
          proposition_hotel: p.logistique?.hotels || []
        }))
      );

      if (allParticipants.length > 0) {
        setSyncStatus('SYNCING');
        const { error: errPart } = await supabase.from('participants').upsert(
          allParticipants.map(p => ({
            ...p,
            options_choisies: congres.flatMap(c => c.participants).find(cp => cp.id === p.id)?.optionsChoisies || '',
            billets_envoyes: congres.flatMap(c => c.participants).find(cp => cp.id === p.id)?.billetsEnvoyes || false
          })), 
          { onConflict: 'id' }
        );
        
        if (errPart) {
          console.error("Erreur Participants Supabase:", errPart);
          setSyncStatus('ERROR');
          setDbError(errPart.message);
        } else {
          setSyncStatus('SUCCESS');
          setDbError(null);
          setTimeout(() => setSyncStatus(prev => prev === 'SUCCESS' ? 'IDLE' : prev), 2000);
        }
      }

      // ── SUPPRESSION des entrées Supabase qui n'existent plus localement ──
      // Stratégie : récupérer les IDs en base, calculer la différence, supprimer via .in()

      // 1. Congrès supprimés
      const currentCongresIds = congresPayload.map(c => c.id);
      const { data: existingCongres } = await supabase.from('congres').select('id');
      const congresIdsToDelete = (existingCongres || [])
        .map((r: any) => r.id)
        .filter((id: string) => !currentCongresIds.includes(id));
      if (congresIdsToDelete.length > 0) {
        const { error: errDelCongres } = await supabase
          .from('congres').delete().in('id', congresIdsToDelete);
        if (errDelCongres) console.error("Erreur DELETE congrès:", errDelCongres);
      }

      // 2. Participants supprimés définitivement (hors SUPPRIME qui reste en base)
      const currentParticipantIds = allParticipants.map(p => p.id);
      const { data: existingParticipants } = await supabase.from('participants').select('id');
      const participantsIdsToDelete = (existingParticipants || [])
        .map((r: any) => r.id)
        .filter((id: string) => !currentParticipantIds.includes(id));
      if (participantsIdsToDelete.length > 0) {
        const { error: errDelPart } = await supabase
          .from('participants').delete().in('id', participantsIdsToDelete);
        if (errDelPart) console.error("Erreur DELETE participants:", errDelPart);
      }

      // 3. Historique supprimé
      const currentHistoryIds = historyPayload.map(h => h.id);
      const { data: existingHistory } = await supabase.from('export_history').select('id');
      const historyIdsToDelete = (existingHistory || [])
        .map((r: any) => r.id)
        .filter((id: string) => !currentHistoryIds.includes(id));
      if (historyIdsToDelete.length > 0) {
        const { error: errDelHist } = await supabase
          .from('export_history').delete().in('id', historyIdsToDelete);
        if (errDelHist) console.error("Erreur DELETE historique:", errDelHist);
      }
    };

    syncToDB();
  }, [congres, exportHistory, emailTemplate]);

  // ─── Filtrage ─────────────────────────────────────────────────────────────
  const filteredParticipants = (selectedCongres?.participants ?? []).filter(p => {
    const matchesSearch = p.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.villeDepart.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' ? p.statut !== 'SUPPRIME' : p.statut === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ─── Rendu ───────────────────────────────────────────────────────────────────
  const participants = selectedCongres?.participants ?? [];
  const activeParticipants = participants.filter(p => p.statut !== 'SUPPRIME');
  const deletedParticipants = participants.filter(p => p.statut === 'SUPPRIME');

  const stats = {
    total: activeParticipants.length,
    aTraiter: activeParticipants.filter(p => p.statut === 'A_TRAITER').length,
    attente: activeParticipants.filter(p => p.statut === 'ATTENTE_REPONSE').length,
    valide: activeParticipants.filter(p => p.statut === 'VALIDE').length,
  };


  return (
    <div className="min-h-screen flex bg-[#F8F9FB] text-[#1D1D1D] font-sans selection:bg-blue-100">


      {/* ══════════════ SIDEBAR GAUCHE (STYLE FLOWDESK) ══════════════ */}
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`fixed lg:sticky top-0 z-50 lg:z-auto w-[260px] shrink-0 flex flex-col h-screen transition-transform duration-300 border-r ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isDark ? 'bg-[#161B27] border-[#1F2937]' : 'bg-white border-[#E8EAEF]'}`}>
        {/* Logo */}
        <div className={`px-6 py-8 flex items-center gap-3 border-b ${isDark ? 'border-[#1F2937]' : 'border-gray-50'}`}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <span className={`text-xl font-bold tracking-tight ${isDark ? 'text-gray-100' : 'text-[#1D1D1D]'}`}>LogiCongrès</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          <div className="px-3 mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3">Menu</p>
          </div>
          <button
            onClick={() => { setViewMode('BOARD'); setSelectedId(null); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${viewMode === 'BOARD' && !selectedId ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <LayoutDashboard className="w-5 h-5" /> Tableau de bord
          </button>
          <button
            onClick={() => { setViewMode('ARCHIVES'); setSelectedId(null); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${viewMode === 'ARCHIVES' ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Archive className="w-5 h-5" /> Événements Archivés
          </button>
          <button
            onClick={() => setEmailSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-100 transition-all font-medium"
          >
            <Mail className="w-5 h-5" /> Emails Settings
          </button>

          <button
            onClick={() => setExportModalOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-all font-medium mt-2 border border-emerald-100"
            title="Télécharger la base de données spécifique par événement."
          >
            <Database className="w-5 h-5" /> Exports Excel DB
          </button>

          <button
            onClick={() => { setTrashOpen(true); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${trashOpen ? 'bg-red-50 text-red-600 border border-red-100' : 'text-gray-500 hover:bg-red-50 hover:text-red-500'}`}
          >
            <Trash2 className="w-5 h-5" /> Corbeille {congres.flatMap(c => c.participants.filter(p => p.statut === 'SUPPRIME')).length > 0 && `(${congres.flatMap(c => c.participants.filter(p => p.statut === 'SUPPRIME')).length})`}
          </button>

          <div className="px-3 mt-10 mb-2 border-t border-gray-50 pt-6">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3">Congrès Actifs</p>
          </div>

          <div className="space-y-1">
            {congres.filter(c => !c.archive).map(c => {
              const isSelected = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setViewMode('BOARD'); }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 rounded-xl transition-all ${isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-600 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="truncate text-sm flex-1">{c.nom}</span>
                  <Archive
                    className="w-3.5 h-3.5 text-gray-300 hover:text-orange-500 transition-colors"
                    onClick={(e) => handleArchiveCongres(e, c.id)}
                  />
                </button>
              );
            })}
          </div>

          {/* Les congrès archivés ne sont plus montrés dans la sidebar, ils ont leur propre vue via le bouton Événements Archivés */}

          <button
            onClick={() => setAddCongressOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 mt-2 text-blue-600 font-bold text-sm hover:bg-blue-50 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" /> Nouveau Congrès
          </button>
        </nav>

        {/* User / Setting Bottom */}
        <div className={`p-4 border-t space-y-4 ${isDark ? 'border-[#1F2937]' : 'border-[#F0F2F5]'}`}>
          {selectedId && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${isDark ? 'bg-[#1F2937] hover:bg-[#374151] text-gray-300' : 'bg-[#F5F7FA] hover:bg-gray-200 text-gray-700'}`}
            >
              <FileUp className="w-4 h-4" /> Importer un Excel
            </button>
          )}

          {/* Toggle Dark Mode */}
          <button
            onClick={toggleDark}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all text-sm ${isDark
              ? 'bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? 'Mode Clair' : 'Mode Sombre'}
          </button>

          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center font-bold text-blue-600">JD</div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold truncate ${isDark ? 'text-gray-200' : ''}`}>Administrateur</p>
              <p className="text-[10px] text-gray-400 uppercase">Super Utilisateur</p>
            </div>
            <Settings className="w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-600" />
          </div>
        </div>
      </aside>

      {/* ══════════════ CONTENU PRINCIPAL ══════════════ */}
      <div className={`flex-1 flex flex-col h-screen overflow-hidden min-w-0 ${isDark ? 'bg-[#0F1117]' : 'bg-[#F8F9FB]'}`}>

        {/* TOP BAR SEARCH */}
        <header className={`h-[70px] md:h-[80px] shrink-0 border-b px-4 md:px-8 flex items-center justify-between gap-3 ${isDark ? 'bg-[#161B27] border-[#1F2937]' : 'bg-white border-[#E8EAEF]'
          }`}>
          {/* Hamburger mobile */}
          <button
            className="lg:hidden p-2 rounded-xl bg-gray-50 border border-gray-100 text-gray-500 hover:bg-gray-100 transition-all shrink-0"
            onClick={() => setSidebarOpen(o => !o)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="relative flex-1 max-w-[400px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full border-none rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:outline-none placeholder:text-gray-400 ${isDark ? 'bg-[#1F2937] text-gray-200' : 'bg-[#F5F7FA] text-gray-700'
                }`}
            />
          </div>

          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            {syncStatus === 'SYNCING' && (
              <div className="flex items-center gap-2 text-[10px] font-black italic text-blue-500 animate-pulse bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100">
                <Database className="w-3 h-3" /> SYNCHRONISATION...
              </div>
            )}
            {syncStatus === 'ERROR' && (
              <button 
                onClick={() => setHistoryOpen(true)} // Or some status modal
                title={dbError || "Erreur de connexion"}
                className="flex items-center gap-2 text-[10px] font-black italic text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 uppercase tracking-tighter"
              >
                <AlertCircle className="w-3 h-3" /> Base de données : Erreur
              </button>
            )}
            {syncStatus === 'SUCCESS' && (
              <div className="flex items-center gap-2 text-[10px] font-black italic text-emerald-500 bg-emerald-px-3 py-1.5 rounded-lg">
                <CheckCircle2 className="w-3 h-3" /> Sauvegardé
              </div>
            )}

            <button
              onClick={() => setHistoryOpen(true)}
              className="hidden sm:flex px-4 py-2.5 rounded-xl bg-gray-50 text-gray-500 hover:text-blue-600 transition-all border border-gray-100 items-center gap-2 text-xs font-bold"
            >
              <Clock className="w-4 h-4" /> Historique ({exportHistory.length})
            </button>
            <button className="p-2.5 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-600 transition-all border border-gray-100">
              <Bell className="w-5 h-5" />
            </button>
            {selectedCongres && (
              <button
                onClick={handleExportAgence}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-2xl text-xs md:text-sm font-bold transition-all shadow-lg shadow-blue-200 active:scale-95 flex items-center gap-2"
              >
                <span className="hidden md:inline">Envoyer à l'agence</span>
                <span className="md:hidden">Agence</span>
                ({participants.filter(p => !p.dejaExporte && p.statut === 'VALIDE').length})
              </button>
            )}
          </div>
        </header>

        {/* SCROLLABLE MAIN */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 pb-12">

          {viewMode === 'ARCHIVES' ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-4 border-b border-[#E8EAEF] pb-6">
                <div className="w-14 h-14 bg-gray-100 rounded-[20px] flex items-center justify-center shadow-inner">
                  <Archive className="w-7 h-7 text-gray-500" />
                </div>
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">Événements Archivés</h2>
                  <p className="text-gray-400 mt-1 font-medium">Retrouvez ici l'historique de tous les congrès terminés.</p>
                </div>
              </div>

              {congres.filter(c => c.archive).length === 0 ? (
                <div className="bg-white rounded-[40px] p-24 text-center shadow-sm border border-[#E8EAEF] flex flex-col items-center">
                  <div className="w-24 h-24 bg-[#F8F9FB] rounded-3xl flex items-center justify-center mb-6">
                    <Archive className="w-10 h-10 text-gray-300" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">Aucun événement archivé</h3>
                  <p className="text-gray-400 mt-2 font-medium max-w-sm">Dès que vous avez terminé de gérer un événement, archivez-le pour garder votre tableau de bord propre.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {congres.filter(c => c.archive).map(c => {
                    const stats = {
                      total: c.participants.length,
                      valide: c.participants.filter(p => p.statut === 'VALIDE').length,
                    };
                    return (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedId(c.id); setViewMode('BOARD'); }}
                        className="bg-white hover:bg-gray-50 rounded-[36px] p-8 shadow-sm hover:shadow-xl transition-all duration-300 border border-[#E8EAEF] cursor-pointer group flex flex-col space-y-6 relative overflow-hidden"
                      >
                        <div className="flex justify-between items-start">
                          <div className="w-16 h-16 bg-[#F8F9FB] group-hover:bg-blue-50 text-gray-400 group-hover:text-blue-600 rounded-3xl flex items-center justify-center transition-all duration-300 shadow-sm border border-white">
                            <Archive className="w-7 h-7" />
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleArchiveCongres(e, c.id); }}
                              className="p-3 bg-white border border-gray-100 text-gray-400 hover:text-green-500 hover:border-green-200 hover:bg-green-50 rounded-2xl transition-all shadow-sm"
                              title="Désarchiver l'événement"
                            >
                              <ArchiveRestore className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteCongres(e, c.id); }}
                              className="p-3 bg-white border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 rounded-2xl transition-all shadow-sm"
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-xl font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight leading-tight">{c.nom}</h3>
                          <p className="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">
                            {c.dateDebut ? (
                              <>Du {c.dateDebut.split('-').reverse().join('/')} {c.dateFin && c.dateFin !== c.dateDebut ? ` au ${c.dateFin.split('-').reverse().join('/')}` : ''}</>
                            ) : (c.date || "Date non spécifiée")}
                          </p>
                        </div>

                        <div className="w-full flex justify-between items-center bg-[#F8F9FB] border border-gray-100 rounded-[20px] p-5 mt-auto">
                          <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Participants</p>
                            <p className="text-2xl font-black text-gray-900 leading-none mt-1">{stats.total}</p>
                          </div>
                          <div className="h-8 border-r border-gray-200"></div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Validés</p>
                            <p className="text-2xl font-black text-emerald-500 leading-none mt-1">{stats.valide}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : !selectedCongres ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between border-b border-[#E8EAEF] pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-50 rounded-[20px] flex items-center justify-center shadow-inner">
                    <LayoutDashboard className="w-7 h-7 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">Événements Actifs</h2>
                    <p className="text-gray-400 mt-1 font-medium">Gérez vos congrès en cours.</p>
                  </div>
                </div>
                <button
                  onClick={() => setAddCongressOpen(true)}
                  className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Nouveau
                </button>
              </div>

              {congres.filter(c => !c.archive).length === 0 ? (
                <div className="bg-white rounded-[40px] p-24 text-center shadow-sm border border-[#E8EAEF] flex flex-col items-center">
                  <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mb-6">
                    <Calendar className="w-10 h-10 text-blue-300" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">Bienvenue sur LogiCongrès !</h3>
                  <p className="text-gray-400 mt-2 font-medium max-w-sm">Commencez par créer votre premier événement pour gérer votre logistique en toute sérénité.</p>
                  <button
                    onClick={() => setAddCongressOpen(true)}
                    className="mt-8 bg-blue-600 text-white px-8 py-4 rounded-3xl font-bold shadow-lg shadow-blue-200 hover:translate-y-[-2px] transition-all flex items-center gap-3"
                  >
                    <Plus className="w-5 h-5" /> Créer mon premier congrès
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {congres.filter(c => !c.archive).map(c => {
                    const stats = {
                      total: c.participants.length,
                      valide: c.participants.filter(p => p.statut === 'VALIDE').length,
                    };
                    return (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedId(c.id); setViewMode('BOARD'); }}
                        className="bg-white hover:bg-gray-50 rounded-[36px] p-8 shadow-sm hover:shadow-xl transition-all duration-300 border border-[#E8EAEF] cursor-pointer group flex flex-col space-y-6 relative overflow-hidden"
                      >
                        <div className="flex justify-between items-start">
                          <div className="w-16 h-16 bg-blue-50 text-blue-300 group-hover:bg-blue-600 group-hover:text-white rounded-3xl flex items-center justify-center transition-all duration-300 shadow-sm border border-white">
                            <Calendar className="w-7 h-7" />
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={(e) => handleArchiveCongres(e, c.id)}
                              className="p-3 bg-white border border-gray-100 text-gray-400 hover:text-orange-500 hover:border-orange-200 hover:bg-orange-50 rounded-2xl transition-all shadow-sm"
                              title="Archiver l'événement"
                            >
                              <Archive className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-xl font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight leading-tight">{c.nom}</h3>
                          <p className="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">
                            {c.dateDebut ? (
                              <>Du {c.dateDebut.split('-').reverse().join('/')} {c.dateFin && c.dateFin !== c.dateDebut ? ` au ${c.dateFin.split('-').reverse().join('/')}` : ''}</>
                            ) : (c.date || "Date non spécifiée")}
                          </p>
                        </div>

                        <div className="w-full flex justify-between items-center bg-[#F8F9FB] border border-gray-100 rounded-[20px] p-5 mt-auto">
                          <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Participants</p>
                            <p className="text-2xl font-black text-gray-900 leading-none mt-1">{stats.total}</p>
                          </div>
                          <div className="h-8 border-r border-gray-200"></div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Validés</p>
                            <p className="text-2xl font-black text-blue-500 leading-none mt-1">{stats.valide}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Header Info */}
              <div className="flex justify-between items-end">
                <div>
                  <h2 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{selectedCongres.nom}</h2>
                   <div className="text-gray-400 mt-2 font-bold flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      {selectedCongres.lieu && (
                        <span className="text-blue-500 bg-blue-50 px-3 py-1 rounded-lg uppercase text-[10px] tracking-widest flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" /> {selectedCongres.lieu}
                        </span>
                      )}
                      {selectedCongres.dateDebut ? (
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Calendar className="w-3.5 h-3.5" />
                          {selectedCongres.dateDebut.split('-').reverse().join('/')} {selectedCongres.dateFin && selectedCongres.dateFin !== selectedCongres.dateDebut ? ` au ${selectedCongres.dateFin.split('-').reverse().join('/')}` : ''}
                        </span>
                      ) : <span className="text-xs">{selectedCongres.date || "Événement planifié"}</span>}
                    </div>
                    {selectedCongres.adresse && (
                      <p className="text-[11px] text-gray-400 font-medium flex items-center gap-2 italic ml-1">
                        <MapPin className="w-3 h-3 text-red-400" /> {selectedCongres.adresse}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                    <Filter className="w-4 h-4" /> Filtrer
                  </button>
                </div>
              </div>

              {/* Stats Grid avec cercle de progression */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div className={`col-span-2 md:col-span-1 p-6 md:p-8 rounded-[40px] shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden group ${isDark ? 'bg-[#161B27]' : 'bg-white'}`}>
                  <div className="relative w-32 h-32 mb-4">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="64" cy="64" r="58" stroke="#F1F5F9" strokeWidth="8" fill="transparent" />
                      <circle cx="64" cy="64" r="58" stroke="#2563EB" strokeWidth="8" fill="transparent" strokeDasharray={364} strokeDashoffset={364 - (364 * (stats.valide / (stats.total || 1)))} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black">{Math.round((stats.valide / (stats.total || 1)) * 100)}%</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Validés</span>
                    </div>
                  </div>
                  <p className={`text-sm font-bold ${isDark ? 'text-gray-300' : 'text-gray-900'}`}>Progression Totale</p>
                </div>

                <div className="col-span-2 md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                  {[
                    { label: 'Total', val: stats.total, color: 'blue', icon: Users, sub: 'Importés' },
                    { label: 'À traiter', val: stats.aTraiter, color: 'amber', icon: AlertCircle, sub: 'Prioritaire' },
                    { label: 'En attente', val: stats.attente, color: 'indigo', icon: Clock, sub: 'PDF envoyés' },
                  ].map((s) => (
                    <div key={s.label} className={`p-6 md:p-8 rounded-[40px] shadow-sm flex flex-col justify-between hover:translate-y-[-4px] transition-all border ${isDark ? 'bg-[#161B27] border-[#1F2937]' : 'bg-white border-white'}`}>
                      <div className="flex justify-between items-start">
                        <div className={`p-4 rounded-3xl bg-${s.color}-50 text-${s.color}-600`}>
                          <s.icon className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{s.sub}</span>
                      </div>
                      <div className="mt-6">
                        <p className={`text-4xl font-black ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{s.val}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-1">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Table Section */}
              <div className={`rounded-[32px] shadow-sm overflow-hidden border ${isDark ? 'bg-[#161B27] border-[#1F2937]' : 'bg-white border-white'}`}>
                <div className={`px-8 py-6 border-b flex justify-between items-center ${isDark ? 'bg-[#161B27] border-[#1F2937]' : 'bg-white border-gray-50'}`}>
                  <div className="flex items-center gap-4">
                    <h3 className={`font-bold text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Suivi du Travail</h3>
                    {selectedParticipants.size > 0 && (
                      <div className="flex items-center gap-2 animate-in slide-in-from-left-4">
                        <span className="text-[10px] font-black bg-blue-600 text-white px-3 py-1.5 rounded-lg">{selectedParticipants.size} sélectionnés</span>
                        <button onClick={handleBulkValidate} className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Valider tout
                        </button>
                        <button onClick={handleBulkDelete} className="text-[10px] font-black bg-red-50 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-all flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                    <span className={`cursor-pointer hover:text-blue-600 ${statusFilter === 'ALL' ? 'text-blue-600' : ''}`} onClick={() => setStatusFilter('ALL')}>Tous</span>
                    <span className={`cursor-pointer hover:text-blue-600 ${statusFilter === 'A_TRAITER' ? 'text-blue-600' : ''}`} onClick={() => setStatusFilter('A_TRAITER')}>À traiter</span>
                    <span className={`cursor-pointer hover:text-blue-600 ${statusFilter === 'ATTENTE_REPONSE' ? 'text-blue-600' : ''}`} onClick={() => setStatusFilter('ATTENTE_REPONSE')}>En cours</span>
                    <span className={`cursor-pointer hover:text-blue-600 ${statusFilter === 'VALIDE' ? 'text-blue-600' : ''}`} onClick={() => setStatusFilter('VALIDE')}>Validés</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className={`text-[11px] font-bold text-gray-400 uppercase tracking-widest ${isDark ? 'bg-gray-900/50' : 'bg-gray-50/50'}`}>
                        <th className="px-8 py-4 w-10">
                          <input
                            type="checkbox"
                            checked={selectedParticipants.size === filteredParticipants.length && filteredParticipants.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="px-8 py-4">Contact</th>
                        <th className="px-8 py-4">Ville / Tel</th>
                        <th className="px-8 py-4">Détails Logistique</th>
                        <th className="px-8 py-4">Statut</th>
                        <th className="px-8 py-4 text-right pr-12">Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-gray-700/50' : 'divide-gray-50'}`}>
                      {filteredParticipants.map(p => {
                        const loading = loadingIds.has(p.id);
                        return (
                          <tr key={p.id} className={`group transition-all ${selectedParticipants.has(p.id) ? 'bg-blue-50/30' : isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50/50'}`}>
                            {/* Checkbox */}
                            <td className="px-8 py-6">
                              <input
                                type="checkbox"
                                checked={selectedParticipants.has(p.id)}
                                onChange={() => toggleSelect(p.id)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            {/* Contact */}
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-lg shadow-sm border border-white">
                                  {p.nom.charAt(0)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className={`font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{p.nom}</p>
                                    <button onClick={() => openContactModal(p)} className="p-1 hover:bg-gray-100 rounded-md transition-all">
                                      <Mail className={`w-3 h-3 ${validateEmail(p.email) ? 'text-emerald-500' : 'text-red-400'}`} />
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{p.email || 'Email manquant'}</p>
                                </div>
                              </div>
                            </td>

                            {/* Ville / Tel */}
                            <td className="px-8 py-6">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-gray-600">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>DE</span>
                                  <span className="text-sm font-bold truncate max-w-[150px]">{p.villeDepart}</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-400">
                                  <span className="text-[10px] font-black bg-gray-50 px-2 py-0.5 rounded text-gray-300">TEL</span>
                                  <span className="text-[11px] font-bold">{p.telephone || '--'}</span>
                                </div>
                              </div>
                            </td>

                            {/* Détails Logistique */}
                            <td className="px-8 py-6">
                              {!p.logistique ? (
                                <button
                                  onClick={() => openLogistiqueModal(p)}
                                  className="text-[10px] font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-all border border-blue-100"
                                >
                                  + SAISIR OPTIONS
                                </button>
                              ) : (
                                <div className="space-y-3 max-w-[280px]">
                                  {/* Aller */}
                                  {p.logistique.transports && p.logistique.transports[0] && p.logistique.transports[0].aller ? (
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5 text-blue-500">
                                        {p.logistique.transports[0].aller.type === 'TRAIN' ? <Train className="w-3.5 h-3.5" /> : <Plane className="w-3.5 h-3.5" />}
                                      </div>
                                      <div className="flex-1 text-xs">
                                        <p className="font-bold text-gray-800">{p.logistique.transports[0].aller.lieuDepart || '?'} → {p.logistique.transports[0].aller.lieuArrivee || '?'}</p>
                                        <p className="text-[10px] text-gray-500">
                                          {p.logistique.transports[0].aller.date && <>{p.logistique.transports[0].aller.date} • </>}
                                          {p.logistique.transports[0].aller.depart || '--:--'} à {p.logistique.transports[0].aller.arrivee || '--:--'}
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400 italic">Transport Aller non défini</div>
                                  )}
                                  {/* Retour */}
                                  {p.logistique.transports && p.logistique.transports[0] && p.logistique.transports[0].retour ? (
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5 text-orange-400">
                                        {p.logistique.transports[0].retour.type === 'TRAIN' ? <Train className="w-3.5 h-3.5" /> : <Plane className="w-3.5 h-3.5" />}
                                      </div>
                                      <div className="flex-1 text-xs">
                                        <p className="font-bold text-gray-800">{p.logistique.transports[0].retour.lieuDepart || '?'} → {p.logistique.transports[0].retour.lieuArrivee || '?'}</p>
                                        <p className="text-[10px] text-gray-500">
                                          {p.logistique.transports[0].retour.date && <>{p.logistique.transports[0].retour.date} • </>}
                                          {p.logistique.transports[0].retour.depart || '--:--'} à {p.logistique.transports[0].retour.arrivee || '--:--'}
                                        </p>
                                      </div>
                                    </div>
                                  ) : null}
                                  {/* Hotel */}
                                  {p.logistique.hotels && p.logistique.hotels[0]?.nom && (
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5 text-indigo-500">
                                        <Hotel className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1 text-xs">
                                        <p className="font-bold text-gray-800">{p.logistique.hotels[0].nom}</p>
                                        <p className="text-[10px] text-gray-500">
                                          {(p.logistique.hotels[0].checkIn || p.logistique.hotels[0].checkOut) ? (
                                            <>Du {p.logistique.hotels[0].checkIn} au {p.logistique.hotels[0].checkOut}</>
                                          ) : 'Dates non précisées'}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between mt-2">
                                    <button
                                      onClick={() => openLogistiqueModal(p)}
                                      className="text-[10px] font-black text-blue-400 hover:text-blue-600 transition-colors uppercase tracking-widest block"
                                    >
                                      Modifier
                                    </button>
                                    {p.logistique.transports.length > 1 && (
                                      <span className="text-[9px] font-black bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                        {p.logistique.transports.length} Options proposées
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Statut */}
                            <td className="px-8 py-6">
                              <div className="flex flex-col items-start gap-2">
                                <span className={`
                                px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5
                                ${p.statut === 'VALIDE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                    p.statut === 'ATTENTE_REPONSE' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                                      'bg-amber-50 text-amber-600 border border-amber-100'}
                                `}>
                                  {p.statut === 'VALIDE' && <CheckCircle2 className="w-3 h-3" />}
                                  {p.statut === 'VALIDE' ? 'Validé' : p.statut === 'ATTENTE_REPONSE' ? 'En attente' : 'À traiter'}
                                </span>
                                {p.billetsEnvoyes && p.statut === 'VALIDE' && (
                                  <span className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100 shadow-sm transition-all duration-300">
                                    <Ticket className="w-3 h-3" /> Billets Envoyés
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-8 py-6 text-right pr-12">
                              <div className="flex items-center justify-end gap-2">
                                {p.logistique && p.statut === 'A_TRAITER' && (
                                  <button
                                    onClick={() => handleGeneratePDFAndEmail(p)}
                                    disabled={loading}
                                    className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-100 disabled:opacity-50"
                                  >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                                  </button>
                                )}
                                {p.statut === 'ATTENTE_REPONSE' && (
                                  <button
                                    onClick={() => handleValidate(p.id)}
                                    className="p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
                                    title="Valider la réservation"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                )}
                                {p.dejaExporte && (
                                  <button
                                    onClick={() => handleReExportParticipant(p.id)}
                                    className="p-2.5 rounded-xl bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all border border-orange-100"
                                    title="Remettre dans l'export Agence (en cas de modification)"
                                  >
                                    <ArchiveRestore className="w-4 h-4" />
                                  </button>
                                )}
                                {p.statut === 'VALIDE' && (
                                  <button
                                    onClick={() => handleToggleBillet(p.id)}
                                    className={`p-2.5 rounded-xl transition-all shadow-md ${p.billetsEnvoyes ? 'bg-fuchsia-600 text-white shadow-fuchsia-100 hover:bg-fuchsia-700' : 'bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100 hover:bg-fuchsia-100'}`}
                                    title={p.billetsEnvoyes ? "Annuler l'envoi des billets" : "Marquer les billets comme envoyés"}
                                  >
                                    <Ticket className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteParticipant(p.id)}
                                  className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-300 hover:text-red-500 transition-all"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

      {/* ───── MODALE AJOUT CONGRÈS ───── */}
      {addCongressOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg p-10 animate-in fade-in zoom-in duration-300">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black">Nouvel Événement</h3>
              <p className="text-gray-400 text-sm mt-1 font-medium">Créez un nouvel espace de travail pour votre congrès.</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-4">Nom de l'événement <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Cardiology Forum 2025"
                  className={`w-full bg-gray-50 border-2 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all ${
                    newNom.trim() === '' ? 'border-red-200 focus:border-red-300' : 'border-transparent focus:border-blue-200'
                  }`}
                  value={newNom}
                  onChange={e => setNewNom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCongres()}
                  autoFocus
                />
                {newNom.trim() === '' && (
                  <p className="text-[11px] text-red-400 font-bold ml-4">⚠️ Le nom de l'événement est requis</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Date de début</label>
                  <input
                    type="date"
                    className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Date de fin</label>
                  <input
                    type="date"
                    className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                    value={newDateFin}
                    onChange={e => setNewDateFin(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Lieu / Ville</label>
                <input
                  type="text"
                  placeholder="ex: Paris, Palais des Congrès"
                  className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                  value={newLieu}
                  onChange={e => setNewLieu(e.target.value)}
                />
              </div>

              <div className="space-y-2 relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Adresse précise (avec Auto-complétion)</label>
                <input
                  id="event-address-input"
                  type="text"
                  placeholder="ex: 2 Place de la Porte Maillot, 75017 Paris"
                  className="w-full bg-blue-50/50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                  value={newAdresse}
                  onChange={async (e) => {
                    setNewAdresse(e.target.value);
                    if (e.target.value.length > 3) {
                      const res = await fetchAddressSuggestions(e.target.value);
                      setAddressSuggestions(res);
                    } else {
                      setAddressSuggestions([]);
                    }
                  }}
                  onBlur={() => setTimeout(() => setAddressSuggestions([]), 200)}
                />
                {addressSuggestions.length > 0 && (
                  <div className="absolute top-[100%] left-0 right-0 z-[100] mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    {addressSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setNewAdresse(s.label);
                          setAddressSuggestions([]);
                        }}
                        className="w-full text-left px-5 py-3 hover:bg-blue-50 text-xs font-bold text-gray-700 transition-all flex flex-col"
                      >
                        <span>{s.label}</span>
                        <span className="text-[8px] uppercase tracking-widest text-gray-400 font-medium">{s.postcode} {s.city}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Heure du rendez-vous / Début</label>
                <input
                  type="text"
                  placeholder="ex: à partir de 09:00"
                  className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                  value={newHeure}
                  onChange={e => setNewHeure(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-10 flex gap-4">
              <button
                onClick={() => setAddCongressOpen(false)}
                className="flex-1 px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleAddCongres}
                disabled={!newNom.trim()}
                className={`flex-1 px-8 py-4 rounded-2xl font-bold shadow-lg transition-all ${
                  newNom.trim()
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 hover:translate-y-[-1px]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Créer l'événement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── MODALE SAISIE LOGISTIQUE (MODERNISÉ) ───── */}
      {modalOpen && currentParticipant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
            {/* Header */}
            <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
              <div>
                <h3 className="text-3xl font-black tracking-tight">{currentParticipant.nom}</h3>
                <p className="text-gray-400 font-medium text-sm mt-1">Gestion logistique pour {selectedCongres?.nom}</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="relative group">
                  <button className="px-4 py-3 bg-white text-gray-500 hover:text-blue-600 rounded-2xl font-bold text-xs border border-gray-200 hover:border-blue-200 transition-all flex items-center gap-2 shadow-sm">
                    <Copy className="w-4 h-4" /> Copier depuis...
                  </button>
                  <div className="absolute right-0 top-[100%] mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[60] overflow-hidden max-h-[300px] overflow-y-auto">
                    {selectedCongres?.participants.filter(p => p.id !== currentParticipant.id && p.logistique).length === 0 ? (
                      <div className="p-4 text-xs text-gray-400 text-center font-medium">Aucun participant avec logistique validée</div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {selectedCongres?.participants.filter(p => p.id !== currentParticipant.id && p.logistique).map(p => (
                          <button
                            key={p.id}
                            onClick={() => {
                              if (p.logistique) {
                                setTransports(JSON.parse(JSON.stringify(p.logistique.transports)));
                                setHotels(JSON.parse(JSON.stringify(p.logistique.hotels)));
                              }
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-blue-50 text-gray-700 hover:text-blue-700 text-xs font-bold rounded-xl transition-all flex items-center justify-between"
                          >
                            <span className="truncate flex-1">{p.nom}</span>
                            <span className="text-[9px] uppercase tracking-widest text-blue-400 bg-blue-100 px-2 py-1 rounded ml-2 shrink-0">{p.logistique?.transports.length} opt</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => setModalOpen(false)} className="w-12 h-12 bg-white rounded-2xl border border-gray-200 text-gray-400 hover:text-gray-900 shadow-sm flex items-center justify-center transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-10 space-y-12">

              {/* Section Transports */}
              <section className="space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-xl font-black flex items-center gap-3 italic">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center not-italic">✈️</span>
                    Plan de Voyage
                  </h4>

                  <div className="flex gap-3">
                    {transports.length < 3 && (
                      <button
                        onClick={() => setTransports(t => [...t, propositionVide()])}
                        className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all border border-blue-100"
                      >
                        + Ajouter une Option
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  {transports.map((prop, idx) => (
                    <div key={idx} className="bg-blue-50/30 border border-blue-100 rounded-[32px] p-8 relative">
                      <div className="absolute top-6 right-6 flex gap-2">
                        <div className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center h-7">Option {idx + 1}</div>
                        {transports.length > 1 && (
                          <button onClick={() => setTransports([prop])} className="px-3 h-7 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-1.5" title="Le médecin a validé ce trajet">
                            <CheckCircle2 className="w-3 h-3" /> Validé
                          </button>
                        )}
                        {transports.length > 1 && (
                          <button onClick={() => setTransports(t => t.filter((_, i) => i !== idx))} className="w-7 h-7 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-100 transition-all shadow-sm shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Aller */}
                      <div className="space-y-4 pt-4">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" /> Aller (vers le congrès)
                          </p>
                          <div className="flex gap-2 mr-24">
                            <button
                              onClick={() => selectedCongres && openGoogleFlights(currentParticipant.villeDepart, selectedCongres.lieu || selectedCongres.nom, prop.aller.date || selectedCongres.dateDebut || selectedCongres.date, prop.retour.date || selectedCongres.dateFin, undefined, selectedCongres.id, currentParticipant.id)}
                              className="p-1 px-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-1 text-[8px] font-black uppercase"
                            >
                              <Plane className="w-2.5 h-2.5" /> Vols
                            </button>
                            <button
                              onClick={() => selectedCongres && openSNCF(currentParticipant.villeDepart, selectedCongres.lieu || selectedCongres.nom, prop.aller.date || selectedCongres.dateDebut || selectedCongres.date, prop.retour.date || selectedCongres.dateFin, undefined, selectedCongres.id, currentParticipant.id)}
                              className="p-1 px-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-1 text-[8px] font-black uppercase"
                            >
                              <Train className="w-2.5 h-2.5" /> Train
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <input type="text" placeholder="Départ (Gare / Aéroport)" className="w-full bg-white border border-blue-50 rounded-xl p-3 text-sm font-bold shadow-sm" value={prop.aller.lieuDepart} onChange={e => updateTransport(idx, 'aller', 'lieuDepart', e.target.value)} />
                          
                          <div className="relative px-6">
                            <div className="absolute left-10 top-[-8px] bottom-[-8px] border-l-2 border-dashed border-blue-100"></div>
                            <div className="flex gap-2 items-center bg-blue-50/50 p-2 rounded-xl">
                              <span className="text-[9px] font-black text-blue-300 uppercase shrink-0">Escale</span>
                              <input type="text" placeholder="Ville d'escale (optionnel)" className="flex-1 bg-transparent border-none p-1 text-xs font-bold focus:ring-0" value={prop.aller.correspondanceLieu || ''} onChange={e => updateTransport(idx, 'aller', 'correspondanceLieu', e.target.value)} />
                              <input type="time" className="bg-transparent border-none p-1 text-xs font-bold w-20" value={prop.aller.correspondanceHeure || ''} onChange={e => updateTransport(idx, 'aller', 'correspondanceHeure', e.target.value)} />
                            </div>
                          </div>

                          <input type="text" placeholder="Arrivée (Gare / Aéroport)" className="w-full bg-white border border-blue-50 rounded-xl p-3 text-sm font-bold shadow-sm" value={prop.aller.lieuArrivee} onChange={e => updateTransport(idx, 'aller', 'lieuArrivee', e.target.value)} />
                        </div>

                        <div className="flex gap-2 p-2 bg-gray-50 rounded-xl items-center">
                          <select className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest p-1" value={prop.aller.type} onChange={e => updateTransport(idx, 'aller', 'type', e.target.value as any)}>
                            <option value="TRAIN">🚆</option>
                            <option value="FLIGHT">✈️</option>
                          </select>
                          <input type="text" placeholder="Train/Vol n°" className="w-24 bg-transparent border-none p-1 text-xs font-bold" value={prop.aller.numero} onChange={e => updateTransport(idx, 'aller', 'numero', e.target.value)} />
                          <input type="date" className="flex-1 bg-transparent border-none p-1 text-xs font-bold" value={prop.aller.date} onChange={e => updateTransport(idx, 'aller', 'date', e.target.value)} />
                          <div className="flex items-center gap-1 px-2 border-l border-gray-200">
                             <input type="time" className="bg-transparent border-none p-1 text-xs font-bold w-16" value={prop.aller.depart} onChange={e => updateTransport(idx, 'aller', 'depart', e.target.value)} />
                             <span className="text-gray-300">→</span>
                             <input type="time" className="bg-transparent border-none p-1 text-xs font-bold w-16" value={prop.aller.arrivee} onChange={e => updateTransport(idx, 'aller', 'arrivee', e.target.value)} />
                          </div>
                        </div>
                      </div>

                      {/* Retour */}
                      <div className="space-y-4 pt-6 mt-6 border-t border-blue-100">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" /> Retour (vers domicile)
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => selectedCongres && openGoogleFlights(selectedCongres.lieu || selectedCongres.nom, currentParticipant.villeDepart, prop.retour.date || selectedCongres.dateFin || selectedCongres.date, undefined, undefined, selectedCongres.id, currentParticipant.id)}
                              className="p-1 px-2 bg-white border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-600 hover:text-white transition-all shadow-sm flex items-center gap-1 text-[8px] font-black uppercase"
                            >
                              <Plane className="w-2.5 h-2.5" /> Vols
                            </button>
                            <button
                              onClick={() => selectedCongres && openSNCF(selectedCongres.lieu || selectedCongres.nom, currentParticipant.villeDepart, prop.retour.date || selectedCongres.dateFin || selectedCongres.date, undefined, undefined, selectedCongres.id, currentParticipant.id)}
                              className="p-1 px-2 bg-white border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-600 hover:text-white transition-all shadow-sm flex items-center gap-1 text-[8px] font-black uppercase"
                            >
                              <Train className="w-2.5 h-2.5" /> Train
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <input type="text" placeholder="Départ (Gare / Aéroport)" className="w-full bg-white border border-orange-50 rounded-xl p-3 text-sm font-bold shadow-sm" value={prop.retour.lieuDepart} onChange={e => updateTransport(idx, 'retour', 'lieuDepart', e.target.value)} />
                          
                          <div className="relative px-6">
                            <div className="absolute left-10 top-[-8px] bottom-[-8px] border-l-2 border-dashed border-orange-100"></div>
                            <div className="flex gap-2 items-center bg-orange-50/50 p-2 rounded-xl">
                              <span className="text-[9px] font-black text-orange-300 uppercase tracking-widest shrink-0">Escale</span>
                              <input type="text" placeholder="Ville d'escale (optionnel)" className="flex-1 bg-transparent border-none p-1 text-xs font-bold focus:ring-0" value={prop.retour.correspondanceLieu || ''} onChange={e => updateTransport(idx, 'retour', 'correspondanceLieu', e.target.value)} />
                              <input type="time" className="bg-transparent border-none p-1 text-xs font-bold w-20" value={prop.retour.correspondanceHeure || ''} onChange={e => updateTransport(idx, 'retour', 'correspondanceHeure', e.target.value)} />
                            </div>
                          </div>

                          <input type="text" placeholder="Arrivée (Gare / Aéroport)" className="w-full bg-white border border-orange-50 rounded-xl p-3 text-sm font-bold shadow-sm" value={prop.retour.lieuArrivee} onChange={e => updateTransport(idx, 'retour', 'lieuArrivee', e.target.value)} />
                        </div>

                        <div className="flex gap-2 p-2 bg-gray-50 rounded-xl items-center">
                          <select className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest p-1" value={prop.retour.type} onChange={e => updateTransport(idx, 'retour', 'type', e.target.value as any)}>
                            <option value="TRAIN">🚆</option>
                            <option value="FLIGHT">✈️</option>
                          </select>
                          <input type="text" placeholder="Train/Vol n°" className="w-24 bg-transparent border-none p-1 text-xs font-bold" value={prop.retour.numero} onChange={e => updateTransport(idx, 'retour', 'numero', e.target.value)} />
                          <input type="date" className="flex-1 bg-transparent border-none p-1 text-xs font-bold" value={prop.retour.date} onChange={e => updateTransport(idx, 'retour', 'date', e.target.value)} />
                          <div className="flex items-center gap-1 px-2 border-l border-gray-200">
                             <input type="time" className="bg-transparent border-none p-1 text-xs font-bold w-16" value={prop.retour.depart} onChange={e => updateTransport(idx, 'retour', 'depart', e.target.value)} />
                             <span className="text-gray-300">→</span>
                             <input type="time" className="bg-transparent border-none p-1 text-xs font-bold w-16" value={prop.retour.arrivee} onChange={e => updateTransport(idx, 'retour', 'arrivee', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Section Hotels */}
              <section className="space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-xl font-black flex items-center gap-3 italic">
                    <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center not-italic">🏨</span>
                    Hébergement
                  </h4>
                  {selectedCongres && (
                    <button
                      onClick={() => openGoogleHotels(
                        selectedCongres.lieu || selectedCongres.nom,
                        selectedCongres.dateDebut || selectedCongres.date,
                        selectedCongres.dateFin,
                        selectedCongres.id,
                        currentParticipant.id
                      )}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                      title="Filtres auto : 3-4*, max 150€ TTC, petit-déjeuner inclus"
                    >
                      🏨 Rechercher (3-4*, max 150€)
                    </button>
                  )}
                  {hotels.length < 3 && (
                    <button onClick={() => setHotels(h => [...h, { nom: '' }])} className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all">
                      Ajouter un hôtel
                    </button>
                  )}
                </div>

                <div className="bg-indigo-50/20 border border-indigo-50 rounded-[32px] p-8 space-y-4">
                  {hotels.map((h, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-14 shrink-0 bg-white border border-gray-100 shadow-sm rounded-2xl flex items-center justify-center text-[10px] font-black italic">#{i + 1}</div>
                      <input
                        type="text"
                        placeholder="Rechercher le nom de l'hôtel..."
                        className="flex-[2] min-w-[150px] bg-white border-none rounded-2xl p-4 shadow-sm font-bold text-sm focus:ring-2 focus:ring-indigo-100"
                        value={h.nom}
                        onChange={e => updateHotel(i, 'nom', e.target.value)}
                      />
                      <div className="flex flex-col gap-1 w-24">
                        <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest pl-2">Check-in</label>
                        <input
                          type="time"
                          className="w-full bg-white border-none rounded-2xl p-3 shadow-sm font-bold text-xs focus:ring-2 focus:ring-indigo-100"
                          value={h.checkIn || ''}
                          onChange={e => updateHotel(i, 'checkIn', e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1 w-24">
                        <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest pl-2">Check-out</label>
                        <input
                          type="time"
                          className="w-full bg-white border-none rounded-2xl p-3 shadow-sm font-bold text-xs focus:ring-2 focus:ring-indigo-100"
                          value={h.checkOut || ''}
                          onChange={e => updateHotel(i, 'checkOut', e.target.value)}
                        />
                      </div>
                      <div className="flex items-end pb-[2px] gap-2">
                        {hotels.length > 1 && (
                          <button onClick={() => setHotels([h])} className="px-4 h-[46px] bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-all shadow-sm text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5" title="Le médecin a validé cet hôtel">
                            <CheckCircle2 className="w-3 h-3" /> Validé
                          </button>
                        )}
                        {hotels.length > 1 && (
                          <button onClick={() => setHotels(hs => hs.filter((_, idx) => idx !== i))} className="p-4 h-[46px] bg-red-50 text-red-400 rounded-2xl hover:bg-red-100 transition-all shadow-sm shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>

            {/* Footer */}
            <div className="p-10 border-t border-gray-50 flex gap-4 bg-gray-50/30">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-5 bg-white border border-gray-200 text-gray-700 rounded-3xl font-black text-sm hover:shadow-lg transition-all">
                Annuler
              </button>
              <button onClick={saveLogistique} className="flex-2 w-full max-w-sm py-5 bg-blue-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-blue-200 hover:translate-y-[-2px] transition-all">
                Enregistrer le plan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modale Historique ── */}
      {historyOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-10 border-b border-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black italic">Historique des Exports</h3>
                <p className="text-gray-400 text-sm font-medium mt-1">Trace de tous les fichiers envoyés à l'agence.</p>
              </div>
              <div className="flex items-center gap-3">
                {exportHistory.length > 0 && (
                  <div className="flex gap-2 mr-2">
                    <button
                      onClick={handleCleanHistoryDupes}
                      title="Supprimer les doublons"
                      className="w-10 h-10 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center transition-all"
                    >
                      <Wand2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleClearHistory}
                      title="Tout effacer"
                      className="w-10 h-10 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl flex items-center justify-center transition-all"
                    >
                      <Zap className="w-5 h-5" />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="w-12 h-12 bg-gray-50 hover:bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500 transition-all font-black text-xl italic"
                >
                  X
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-4">
              {exportHistory.length === 0 ? (
                <div className="py-20 text-center text-gray-400 font-bold italic">
                  Aucun export effectué pour le moment.
                </div>
              ) : (
                exportHistory.map((h, i) => (
                  <div key={i} className="flex items-center justify-between p-6 bg-[#F8F9FB] rounded-[30px] border border-white shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                        <FileDown className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{h.congresName}</p>
                        <p className="text-xs text-gray-400 font-medium">{h.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <span className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-black shadow-sm">
                        {h.count} MÉDECINS
                      </span>
                      <button
                        onClick={() => handleDeleteHistory(h.id || `${h.date}-${i}`)}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        title="Supprimer cette entrée"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modale Edition Contact ── */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-8 border-b border-gray-50">
              <h3 className="text-xl font-black italic">Informations Praticien</h3>
              <p className="text-gray-400 text-xs font-medium mt-1">Mettre à jour les coordonnées de contact.</p>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Nom Complet</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                  value={tempNom}
                  onChange={e => setTempNom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Email</label>
                <div className="relative">
                  <Mail className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 ${validateEmail(tempEmail) ? 'text-emerald-400' : 'text-red-300'}`} />
                  <input
                    type="email"
                    className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                    value={tempEmail}
                    onChange={e => setTempEmail(e.target.value)}
                    placeholder="exemple@mail.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Téléphone</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                  value={tempPhone}
                  onChange={e => setTempPhone(e.target.value)}
                  placeholder="06 -- -- -- --"
                />
              </div>
            </div>

            <div className="p-8 bg-gray-50/50 flex gap-3">
              <button
                onClick={() => setContactModalOpen(false)}
                className="flex-1 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl font-bold text-xs hover:bg-gray-100 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={saveContactInfo}
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale Email Settings ── */}
      {emailSettingsOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col scale-in-center">
            <div className="p-10 border-b border-gray-50">
              <h3 className="text-2xl font-black italic">Paramètres Email</h3>
              <p className="text-gray-400 text-sm font-medium mt-1">Personnalisez votre modèle de message Gmail.</p>
            </div>

            <div className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Objet de l'email</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500/10 focus:outline-none"
                  value={emailTemplate.subject}
                  onChange={e => setEmailTemplate(prev => ({ ...prev, subject: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Corps du message</label>
                <textarea
                  className="w-full bg-gray-50 border-none rounded-2xl p-6 text-sm font-medium focus:ring-2 focus:ring-blue-500/10 focus:outline-none min-h-[250px]"
                  value={emailTemplate.body}
                  onChange={e => setEmailTemplate(prev => ({ ...prev, body: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2 mt-2 px-2">
                  {["{NOM}", "{CONGRES}", "{NB_TRANS}", "{NB_HOTEL}"].map(tag => (
                    <span key={tag} className="text-[9px] font-black bg-blue-50 text-blue-500 px-2 py-1 rounded-md">{tag}</span>
                  ))}
                  <span className="text-[9px] text-gray-300 italic self-center ml-2">← Tags automatiques</span>
                </div>
              </div>
            </div>

            <div className="p-10 bg-gray-50/50 flex gap-4">
              <button
                onClick={() => setEmailSettingsOpen(false)}
                className="flex-1 py-5 bg-white border border-gray-200 text-gray-700 rounded-3xl font-black text-sm hover:shadow-lg transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale Exports Excel par événement ── */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col scale-in-center">
            <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-emerald-50/50">
              <div className="flex gap-4 items-center">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <Database className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black italic text-emerald-900">Bases de données</h3>
                  <p className="text-emerald-700/70 text-sm font-medium mt-1">Téléchargez l'Excel d'un événement spécifique.</p>
                </div>
              </div>
              <button onClick={() => setExportModalOpen(false)} className="p-4 bg-white text-gray-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all shadow-sm">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-10 overflow-y-auto max-h-[60vh] space-y-4">
              {congres.length === 0 ? (
                <p className="text-center text-gray-400 font-bold italic py-10">Aucun événement disponible dans votre base.</p>
              ) : (
                congres.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-6 bg-[#F8F9FB] rounded-2xl border border-gray-100 hover:shadow-md transition-all group">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-3">
                        <h4 className="font-bold text-gray-900 uppercase tracking-tight truncate">{c.nom}</h4>
                        {c.archive && <span className="px-2 py-0.5 bg-gray-200 text-gray-500 text-[10px] rounded-md font-bold uppercase">Archivé</span>}
                      </div>
                      <p className="text-sm text-gray-500 font-medium mt-1 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" /> {c.date || "Date inconnue"}
                        <span className="text-gray-300">|</span>
                        <Users className="w-4 h-4 text-gray-400" /> <strong className="text-gray-700">{c.participants.length}</strong> participants
                      </p>
                    </div>
                    <button
                      onClick={() => exportCongresToExcel(c.id)}
                      className="shrink-0 flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-[16px] font-bold hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-200 transition-all active:scale-95"
                    >
                      <FileDown className="w-5 h-5" /> Télécharger
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Modale Corbeille ── */}
      {trashOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col scale-in-center max-h-[85vh]">
            <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-red-50/50">
              <div className="flex gap-4 items-center">
                <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <Trash2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black italic text-red-900">Corbeille</h3>
                  <p className="text-red-700/70 text-sm font-medium mt-1">Gérez les dossiers supprimés par erreur.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {congres.flatMap(c => c.participants.filter(p => p.statut === 'SUPPRIME')).length > 0 && (
                  <button
                    onClick={handleEmptyTrash}
                    className="px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                  >
                    Vider la corbeille
                  </button>
                )}
                <button onClick={() => setTrashOpen(false)} className="p-4 bg-white text-gray-400 rounded-2xl hover:bg-gray-100 transition-all shadow-sm">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-4 bg-gray-50/30">
              {congres.every(c => c.participants.filter(p => p.statut === 'SUPPRIME').length === 0) ? (
                <div className="py-20 text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-4 border border-gray-100">
                    <CheckCircle2 className="w-10 h-10 text-gray-200" />
                  </div>
                  <p className="text-gray-400 font-bold italic">La corbeille est vide.</p>
                </div>
              ) : (
                congres.map(c => {
                  const deletedInC = c.participants.filter(p => p.statut === 'SUPPRIME');
                  if (deletedInC.length === 0) return null;
                  return (
                    <div key={c.id} className="space-y-3">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full" /> {c.nom}
                      </h4>
                      {deletedInC.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:shadow-md transition-all group">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 font-bold flex items-center justify-center text-lg shadow-sm border border-white">
                              {p.nom.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{p.nom}</p>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                                {c.nom} • {p.email || 'Email manquant'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedId(c.id);
                                handleRestoreParticipant(p.id);
                              }}
                              className="px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-bold text-xs uppercase hover:bg-emerald-100 transition-all flex items-center gap-2"
                              title="Restaurer ce participant"
                            >
                              <ArchiveRestore className="w-4 h-4" /> Restaurer
                            </button>
                            <button
                              onClick={() => {
                                setSelectedId(c.id);
                                if (window.confirm("Supprimer définitivement ce participant de la corbeille ?")) {
                                  updateParticipants(c.id, ps => ps.filter(part => part.id !== p.id));
                                }
                              }}
                              className="p-3 bg-white border border-gray-100 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

