'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  FileUp, Users, CheckCircle2, Loader2, FileDown,
  MailCheck, Mail, MapPin, Edit3, X, Plus, Trash2, Calendar,
  AlertCircle, AlertTriangle, RotateCcw, Clock, ChevronRight, Train, Plane, Hotel,
  Search, Bell, LayoutDashboard, Settings, Filter, MoreHorizontal, Archive, ArchiveRestore, Copy, Database, Ticket,
  Moon, Sun, Wand2, Zap, ArrowRight, Eye, FileCheck, FilePlus2, FileText
} from 'lucide-react';
import { ParticipantDetailsModal } from './ParticipantDetailsModal';
import { generateInvitationPDF } from '@/lib/pdfGenerator';
import { openGoogleFlights, openGoogleHotels, openSNCF, openTrainline } from '@/lib/searchUtils';
import { fetchAddressSuggestions } from '@/lib/autocomplete';
import * as XLSX from 'xlsx';
import { createReport } from 'docx-templates';
import { supabase } from '@/lib/supabase';
import { JNI_EXCEL, JNI_DOCX, JNI_BULLETIN_PDF } from './jni_templates';
import type { Congres, ExportHistory, ExportHistoryRow, Participant, PropositionHotel, PropositionTransport, Segment, Trajet } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const trajetVide = (): Trajet => ({
  type: 'TRAIN',
  numero: '',
  date: '',
  depart: '',
  arrivee: '',
  lieuDepart: '',
  lieuArrivee: '',
  correspondanceLieu: '',
  correspondanceHeure: '',
  correspondanceArrivee: '',
  correspondanceDate: '',
  correspondanceNumero: '',
  duree: '',
  classe: '',
  placement: '',
  correspondanceDuree: ''
});


const validateEmail = (email: string) => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const propositionVide = (): PropositionTransport => ({ aller: trajetVide(), retour: trajetVide() });

const normalizeParticipant = (p: any): Participant => {
  const cleanTransport = (t: any) => {
    const cleanStr = (s: any) => {
      if (!s || typeof s !== 'string') return s;
      const lowered = s.toLowerCase();
      if (lowered.includes('durée') || lowered.includes('trajet') || lowered.includes('correspondance') || lowered.length < 2) return '';
      return s;
    };
    return {
      ...t,
      aller: t.aller ? {
        ...t.aller,
        lieuDepart: cleanStr(t.aller.lieuDepart),
        lieuArrivee: cleanStr(t.aller.lieuArrivee),
        correspondanceLieu: cleanStr(t.aller.correspondanceLieu)
      } : undefined,
      retour: t.retour ? {
        ...t.retour,
        lieuDepart: cleanStr(t.retour.lieuDepart),
        lieuArrivee: cleanStr(t.retour.lieuArrivee),
        correspondanceLieu: cleanStr(t.retour.correspondanceLieu)
      } : undefined
    };
  };

  const transports = (p.logistique?.transports || p.proposition_transport || p.transports || []).map(cleanTransport);
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

const isJNIEvent = (name?: string) => {
  if (!name) return false;
  const n = name.toUpperCase();
  return n.includes('JNI') || n.includes('INFECTIOLOGIE') || n.includes('MUNDIPHARMA');
};

const normalizeCongres = (c: any, allParticipants: any[] = []): Congres => ({
  id: c.id,
  nom: c.nom || 'Sans nom',
  date: c.date_debut || c.date || '',
  dateDebut: c.date_debut || '',
  dateFin: c.date_fin || '',
  lieu: c.lieu || '',
  adresse: c.adresse || '',
  heure: c.heure || '',
  archive: c.archive || false,
  emailTemplate: c.email_template ? JSON.parse(c.email_template) : undefined,
  bulletinTemplate: isJNIEvent(c.nom)
    ? ('data:application/pdf;base64,' + JNI_BULLETIN_PDF)
    : (c.bulletin_template || undefined),
  logisticsTemplate: (c.logistics_template && c.logistics_template.length > 200) 
    ? c.logistics_template 
    : (isJNIEvent(c.nom) ? ('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + JNI_EXCEL) : undefined),
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [participantForDetails, setParticipantForDetails] = useState<Participant | null>(null);
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
  const [editingCongresId, setEditingCongresId] = useState<string | null>(null);
  const [tempBulletin, setTempBulletin] = useState<string | null>(null);
  const [tempLogistics, setTempLogistics] = useState<string | null>(null);
  const [emailTemplate, setEmailTemplate] = useState({
    subject: "Mundipharma – 27es Journées Nationales d'Infectiologie 2026 – Invitation",
    body: "Chère/Cher Dr,\n\nLe laboratoire Mundipharma a le plaisir de vous compter parmi ses invités au Congrès JNI, qui se déroulera du 18 au 20 juin 2026 à Paris au :\nPalais des Congrès de Paris\n2 Place de la Porte Maillot, 75017 Paris\n\nL’organisation logistique de votre participation nous a été confiée par le laboratoire. Afin d’organiser au mieux votre séjour, merci de bien vouloir remplir le formulaire ci-joint et nous le retourner dès réception à l’adresse suivante : keisha.khoto-thinu@twobevents.fr.\n\nNous nous tenons à votre disposition pour toute information complémentaire au 01 84 25 94 89.\n\nDans l’attente de vous lire, nous vous prions de croire, Chère/Cher Madame/Monsieur, à l’assurance de notre considération distinguée.\n\n\nKeïsha KHOTO-THINU pour le laboratoire Mundipharma"
  });
  
  const [globalEmailTemplate, setGlobalEmailTemplate] = useState({
    subject: "Mundipharma – 27es Journées Nationales d'Infectiologie 2026 – Invitation",
    body: "Chère/Cher Dr,\n\nLe laboratoire Mundipharma a le plaisir de vous compter parmi ses invités au Congrès JNI, qui se déroulera du 18 au 20 juin 2026 à Paris au :\nPalais des Congrès de Paris\n2 Place de la Porte Maillot, 75017 Paris\n\nL’organisation logistique de votre participation nous a été confiée par le laboratoire. Afin d’organiser au mieux votre séjour, merci de bien vouloir remplir le formulaire ci-joint et nous le retourner dès réception à l’adresse suivante : keisha.khoto-thinu@twobevents.fr.\n\nNous nous tenons à votre disposition pour toute information complémentaire au 01 84 25 94 89.\n\nDans l’attente de vous lire, nous vous prions de croire, Chère/Cher Madame/Monsieur, à l’assurance de notre considération distinguée.\n\n\nKeïsha KHOTO-THINU pour le laboratoire Mundipharma"
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
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const isRealtimeUpdate = useRef(false);

  React.useEffect(() => {
    setMounted(true);
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
  // --- Synchronisation avec l'extension Twobeevent ---
  React.useEffect(() => {
    if (modalOpen && currentParticipant?.id) {
      document.body.setAttribute('data-twb-active-pid', currentParticipant.id);
    } else {
      document.body.removeAttribute('data-twb-active-pid');
    }
  }, [modalOpen, currentParticipant]);

  const selectedCongres = congres.find(c => c.id === selectedId) ?? null;

  const updateParticipants = (congresId: string, updater: (ps: Participant[]) => Participant[]) => {
    setCongres(prev => prev.map(c =>
      c.id === congresId ? { ...c, participants: updater(c.participants) } : c
    ));
  };

  // ─── Ajout d'un congrès ──────────────────────────────────────────────────────
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  };

  const handleAddCongres = () => {
    if (!newNom.trim()) {
      alert("Le nom de l'événement est obligatoire !");
      return;
    }
    
    const id = generateId();
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
    setCongres(prev => [...prev, newCongres]);
    
    // Marquer que l'utilisateur a deja agi pour activer la synchro
    initializedRef.current = true;

    // S'assurer de basculer sur le Tableau de Bord pour voir la création
    setViewMode('BOARD');
    setSelectedId(id);
    
    // Reset du formulaire
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
    reader.onload = async (evt) => {
      const arrayBuffer = evt.target?.result as ArrayBuffer;
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
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

      const imported: Participant[] = rows.map((row) => {
        const prenom = String(row['K'] || '').trim();
        const nom = String(row['L'] || '').trim();
        const email = String(row['P'] || '').trim();
        const telephone = String(row['O'] || '').trim();
        const codePostal = String(row['T'] || '').trim();
        const ville = String(row['U'] || '').trim();
        const etablissement = String(row['Q'] || '').trim();

        return {
          id: generateId(), // Utilisation du helper sécurisé
          nom: `${prenom} ${nom}`.trim() || 'Inconnu',
          email,
          telephone,
          villeDepart: ville
            ? `${ville}${codePostal ? ` (${codePostal})` : ''}`
            : etablissement || 'Inconnue',
          statut: 'A_TRAITER',
        };
      });

      // Conversion de l'ArrayBuffer en Base64 pour le template
      const base64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = (re) => resolve(re.target?.result as string);
        r.readAsDataURL(file);
      });

      // Mise à jour intelligente (Upsert) pour ne pas perdre les données déjà capturées
      setCongres(prev => prev.map(c => {
        if (c.id !== selectedId) return c;

        const mergedParticipants = [...c.participants];
        imported.forEach(imp => {
          const idx = mergedParticipants.findIndex(p => 
            (imp.email && p.email.toLowerCase() === imp.email.toLowerCase()) ||
            (p.nom.toLowerCase() === imp.nom.toLowerCase())
          );

          if (idx !== -1) {
            // Mise à jour de l'existant sans écraser l'ID ni la logistique déjà capturée
            mergedParticipants[idx] = {
              ...mergedParticipants[idx],
              telephone: imp.telephone || mergedParticipants[idx].telephone,
              villeDepart: imp.villeDepart || mergedParticipants[idx].villeDepart,
              // On ne touche pas au statut s'il a déjà été traité
              statut: mergedParticipants[idx].statut === 'A_TRAITER' ? imp.statut : mergedParticipants[idx].statut
            };
          } else {
            // Nouveau participant
            mergedParticipants.push(imp);
          }
        });

        return { ...c, participants: mergedParticipants, logisticsTemplate: base64 };
      }));

      console.log(`✅ Import terminé : ${imported.length} lignes traitées.`);
    };
    reader.readAsArrayBuffer(file);
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

  const saveLogistique = (andEmail: boolean = false) => {
    if (!currentParticipant || !selectedId) return;
    const updatedPart: Participant = { ...currentParticipant, logistique: { transports, hotels } };

    updateParticipants(selectedId, ps =>
      ps.map(p => p.id === currentParticipant.id ? updatedPart : p)
    );
    setModalOpen(false);

    if (andEmail) {
      handleGeneratePDFAndEmail(updatedPart);
    }
  };

  // ─── Gmail ───────────────────────────────────────────────────────────────────
  const openGmailDraft = (participant: Participant) => {
    if (!participant.email) return;
    const nb = participant.logistique?.transports.length ?? 0;
    const nbH = participant.logistique?.hotels.length ?? 0;

    let subject = (selectedCongres?.emailTemplate?.subject || emailTemplate.subject)
      .replace(/{CONGRES}/g, selectedCongres?.nom ?? '');

    let body = (selectedCongres?.emailTemplate?.body || emailTemplate.body)
      .replace(/{NOM}/g, participant.nom)
      .replace(/{CONGRES}/g, selectedCongres?.nom ?? '')
      .replace(/{NB_TRANS}/g, nb.toString())
      .replace(/{NB_HOTEL}/g, nbH.toString());

    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${participant.email}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const aHost = document.createElement('a');
    aHost.href = url;
    aHost.target = '_blank';
    aHost.rel = 'noopener noreferrer';
    aHost.click();
  };

  const downloadBase64File = (base64: string, filename: string) => {
    const a = document.createElement('a');
    a.href = base64;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getParticipantTemplateData = (participant: Participant, congres: Congres): Record<string, string> => {
    const log = participant.logistique;
    const aller = log?.transports?.[0]?.aller;
    const retour = log?.transports?.[0]?.retour;
    const hotel = log?.hotels?.[0];

    return {
      // Identité (Générique)
      NOM: participant.nom.toUpperCase(),
      PRENOM: participant.nom.split(' ')[1] || participant.nom.split(' ')[0], // Souvent NOM Prénom
      'Prénom': participant.nom.includes(' ') ? participant.nom.split(' ').slice(1).join(' ') : '',
      'nom': participant.nom.split(' ')[0],
      NOM_COMPLET: participant.nom,
      NOM_PRENOM: participant.nom,
      EMAIL: participant.email,
      'Adresse e-mail': participant.email,
      Téléphone: participant.telephone || '',
      
      // Congrès
      CONGRES: congres.nom,
      "Nom de l'événement": congres.nom,
      DATE: congres.date || '',
      LIEU: congres.lieu || '',
      ADRESSE: congres.adresse || '',
      
      // Acheminement Aller
      ALLER_DEPART: aller?.lieuDepart || '',
      ALLER_ARRIVEE: aller?.lieuArrivee || '',
      ALLER_TYPE: aller?.type || '',
      ALLER_NUM: aller?.numero || '',
      ALLER_H_DEP: aller?.depart || '',
      ALLER_H_ARR: aller?.arrivee || '',
      'Date aller': aller?.date || '',
      'date aller': aller?.date || '',
      'moyen de transport aller': aller?.type === 'FLIGHT' ? 'Avion' : 'Train',
      'gare de départ aller': aller?.lieuDepart || '',
      'correspondance aller': aller?.correspondanceLieu || '',
      "gare d'arrivee aller": aller?.lieuArrivee || '',
      "gare d'arrivée aller": aller?.lieuArrivee || '',
      'heure de depart aller': aller?.depart || '',
      "heure d'arrivee aller": aller?.arrivee || '',
      'reference aller': aller?.numero || '',

      // Acheminement Retour
      RETOUR_DEPART: retour?.lieuDepart || '',
      RETOUR_ARRIVEE: retour?.lieuArrivee || '',
      RETOUR_TYPE: retour?.type || '',
      RETOUR_NUM: retour?.numero || '',
      RETOUR_H_DEP: retour?.depart || '',
      RETOUR_H_ARR: retour?.arrivee || '',
      'date de retour': retour?.date || '',
      'moyen de transport retour': retour?.type === 'FLIGHT' ? 'Avion' : 'Train',
      'gare de depart retour': retour?.lieuDepart || '',
      'correspondance retour': retour?.correspondanceLieu || '',
      "gare d'arrivée retour": retour?.lieuArrivee || '',
      "gare d'arrivee retour": retour?.lieuArrivee || '',
      'heure de depart retour': retour?.depart || '',
      "heure d'arrivee retour": retour?.arrivee || '',
      'reference retour': retour?.numero || '',

      // Hotel
      HOTEL_NOM: hotel?.nom || '',
      CHECK_IN: hotel?.checkIn || '',
      CHECK_OUT: hotel?.checkOut || '',
      'Nuit du 18 juin': hotel?.checkIn?.includes('18/06') ? 'OUI' : '',
      'Nuit du 19 juin': hotel?.checkOut?.includes('20/06') ? 'OUI' : '',

      // Keys for JNI Formula support
      'NOM PRENOM': participant.nom,
      'GARE DEPART ALLER': aller?.lieuDepart || '',
      'GARE ARRIVEE ALLER': aller?.lieuArrivee || '',
      'HEURE DEPART ALLER': aller?.depart || '',
      'HEURE ARRIVEE ALLER': aller?.arrivee || '',
      'NUMERO TRAIN ALLER': aller?.numero || '',
      'GARE DEPART RETOUR': retour?.lieuDepart || '',
      'GARE ARRIVEE RETOUR': retour?.lieuArrivee || '',
      'HEURE DEPART RETOUR': retour?.depart || '',
      'HEURE ARRIVEE RETOUR': retour?.arrivee || '',
      'NUMERO TRAIN RETOUR': retour?.numero || '',
    };
  };

  const fillAndDownloadTemplate = async (templateB64: string, participant: Participant, congres: Congres, type: string) => {
    let filename = `${type}_${participant.nom.replace(/\s+/g, '_')}`;
    // Si c'est le modèle par défaut ou JNI
    if (templateB64.includes(JNI_EXCEL.substring(0, 20)) || (congres.nom && congres.nom.toUpperCase().includes('JNI'))) {
      if (type === 'Proposition' || type === 'Logistique') filename = `Modele_JNI_2026_REMPLI_${participant.nom.replace(/\s+/g, '_')}`;
      if (type === 'Bulletin') filename = `Bulletin_Invitation_JNI_2026_${participant.nom.replace(/\s+/g, '_')}`;
    }
    const data = getParticipantTemplateData(participant, congres);

    const isXlsx = templateB64.includes('spreadsheetml') || templateB64.includes('excel');
    const isDocx = templateB64.includes('wordprocessingml') || templateB64.includes('officedocument.word');
    const isPdf = templateB64.includes('application/pdf');

    if (isXlsx) {
      try {
        console.log("🛠️ Remplissage Excel (avec conservation des formules)...");
        const base64Data = templateB64.includes(',') ? templateB64.split(',')[1] : templateB64;
        
        // IMPORTANT: Lire avec cellFormula: true pour ne pas perdre les formules existantes
        const wb = XLSX.read(base64Data, { type: 'base64', cellFormula: true, cellStyles: true });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // 1. Détection des en-têtes et remplissage par correspondance (pour formulaires)
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z200');
        const headerMap: Record<string, {r: number, c: number}> = {};
        
        for (let r = range.s.r; r <= Math.min(range.e.r, 150); r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && cell.v) {
              const val = String(cell.v).trim().toLowerCase();
              Object.keys(data).forEach(k => {
                const keyLower = k.toLowerCase();
                if (val === keyLower || val === keyLower + ':') {
                  headerMap[k] = {r, c};
                }
              });
            }
          }
        }

        // Remplissage à droite du label trouvé
        Object.entries(headerMap).forEach(([key, pos]) => {
          const targetAddr = XLSX.utils.encode_cell({ r: pos.r, c: pos.c + 1 });
          ws[targetAddr] = { v: data[key], t: 's' };
        });

        // 2. Remplacement des placeholders type {NOM} dans tout le document
        Object.keys(ws).forEach(addr => {
          if (addr[0] === '!') return;
          const cell = ws[addr];
          if (cell && cell.v && typeof cell.v === 'string') {
            let newVal = cell.v;
            let replaced = false;
            Object.entries(data).forEach(([key, val]) => {
              const patterns = [`{${key}}`, `«${key}»`, `{{${key}}}`];
              patterns.forEach(p => {
                if (newVal.includes(p)) {
                  newVal = newVal.replace(p, val || '');
                  replaced = true;
                }
              });
            });
            if (replaced) cell.v = newVal;
          }
        });

        const outB64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        downloadBase64File(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${outB64}`, `${filename}.xlsx`);
      } catch (err) {
        console.error("❌ EXCEL Fill Error:", err);
        downloadBase64File(templateB64, `${filename}.xlsx`);
      }
    } else if (isDocx) {
      try {
        const base64Part = templateB64.includes(',') ? templateB64.split(',')[1] : templateB64;
        const binaryString = window.atob(base64Part);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const report = await createReport({
          template: bytes,
          cmdDelimiter: ['«', '»'],
          data: data,
          noSandbox: true,
          fixEmptyTags: true
        } as any);

        const blob = new Blob([report as any], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("❌ WORD Fill Error:", err);
        downloadBase64File(templateB64, `${filename}.docx`);
      }
    } else if (isPdf) {
      downloadBase64File(templateB64, `${filename}.pdf`);
    }
  };

  // ─── Génération PDF + Gmail ──────────────────────────────────────────────────
  const handleGeneratePDFAndEmail = async (participant: Participant) => {
    if (!participant.logistique || !selectedId) return;
    setLoadingIds(prev => new Set(prev).add(participant.id));

    console.log("🚀 Lancement export pour:", participant.nom);
    console.log("📅 Congrès:", selectedCongres?.nom);
    console.log("📂 Templates présents:", { 
      prop: !!selectedCongres?.logisticsTemplate, 
      bulletin: !!selectedCongres?.bulletinTemplate 
    });

    try {
      if (selectedCongres) {
        let templateUsed = false;
        const isJNI = isJNIEvent(selectedCongres.nom);
        
        console.log(`🧐 Analyse JNI pour "${selectedCongres.nom}":`, isJNI ? "OUI" : "NON");

        // 1. Modèle Logistique / Proposition (Excel)
        if (selectedCongres.logisticsTemplate) {
          console.log("🟢 Remplissage du modèle Excel (Logistique/Proposition)...");
          await fillAndDownloadTemplate(selectedCongres.logisticsTemplate, participant, selectedCongres, 'Proposition');
          templateUsed = true;
        } else if (isJNI) {
          // Sécurité JNI si le template n'est pas chargé en base
          const jniB64 = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + JNI_EXCEL;
          console.log("🟠 JNI fallback (Excel)...");
          await fillAndDownloadTemplate(jniB64, participant, selectedCongres, 'Proposition');
          templateUsed = true;
        }
        
        // 2. Modèle Bulletin (PDF pour JNI, Word sinon)
        if (selectedCongres.bulletinTemplate) {
          const typeLabel = selectedCongres.bulletinTemplate.includes('pdf') ? 'PDF' : 'Word';
          console.log(`🟢 Téléchargement/Remplissage du bulletin (${typeLabel})...`);
          await fillAndDownloadTemplate(selectedCongres.bulletinTemplate, participant, selectedCongres, 'Bulletin');
          templateUsed = true;
        } else if (isJNI) {
          // Sécurité JNI si le template n'est pas chargé en base
          const jniB64 = 'data:application/pdf;base64,' + JNI_BULLETIN_PDF;
          console.log("🟠 JNI fallback (PDF Bulletin)...");
          await fillAndDownloadTemplate(jniB64, participant, selectedCongres, 'Bulletin');
          templateUsed = true;
        }

        if (!templateUsed) {
          console.log("⚠️ Aucun template trouvé, génération du PDF standard.");
          generateInvitationPDF(participant.nom, selectedCongres, participant.logistique);
        }
      }
      
      if (participant.email) {
        console.log("📧 Ouverture Gmail...");
        setTimeout(() => {
          openGmailDraft(participant);
        }, 500);
      }

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
    const isJNI = isJNIEvent(selectedCongres.nom);
    const templateB64 = selectedCongres.logisticsTemplate || (isJNI ? 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + JNI_EXCEL : null);

    if (templateB64 && templateB64.includes('spreadsheetml')) {
      // UTILISATION DU MODÈLE (ex: JNI 2026)
      try {
        console.log("🛠️ Export via modèle agence...");
        const base64Data = templateB64.includes(',') ? templateB64.split(',')[1] : templateB64;
        const wb = XLSX.read(base64Data, { type: 'base64' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Détection des en-têtes (on utilise le premier participant pour avoir les clés)
        const sampleData = getParticipantTemplateData(aExporter[0], selectedCongres);
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z100');
        const headerMap: Record<string, number> = {};
        
        // On scanne les 100 premières lignes pour trouver les colonnes
        for (let r = 0; r <= 100; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && cell.v) {
              const val = String(cell.v).trim().toLowerCase();
              Object.keys(sampleData).forEach(k => {
                if (k.toLowerCase() === val || val.includes(k.toLowerCase())) {
                  headerMap[k] = c;
                }
              });
            }
          }
        }

        if (Object.keys(headerMap).length > 0) {
          // On ajoute chaque participant sur une nouvelle ligne
          let startRow = 1;
          const firstCol = headerMap['NOM'] || 0;
          while (ws[XLSX.utils.encode_cell({ r: startRow, c: firstCol })]?.v) {
            startRow++;
          }

          aExporter.forEach((p, index) => {
            const rowData = getParticipantTemplateData(p, selectedCongres);
            const currentRow = startRow + index;
            Object.entries(headerMap).forEach(([key, col]) => {
              const addr = XLSX.utils.encode_cell({ r: currentRow, c: col });
              ws[addr] = { v: rowData[key as keyof typeof rowData], t: 's' };
            });
          });
          
          console.log(`✅ ${aExporter.length} participants ajoutés au modèle.`);
        }

        XLSX.writeFile(wb, `Export_Agence_${selectedCongres.nom.replace(/ /g, '_')}_${new Date().toLocaleDateString()}.xlsx`);
      } catch (err) {
        console.error("❌ Erreur remplissage modèle agence, fallback standard:", err);
        const ws = XLSX.utils.json_to_sheet(dataExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "A Réserver");
        XLSX.writeFile(wb, `Export_Agence_${selectedCongres.nom.replace(/ /g, '_')}_${new Date().toLocaleDateString()}.xlsx`);
      }
    } else {
      // GÉNÉRATION STANDARD
      const ws = XLSX.utils.json_to_sheet(dataExcel);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "A Réserver");
      XLSX.writeFile(wb, `Export_Agence_${selectedCongres.nom.replace(/ /g, '_')}_${new Date().toLocaleDateString()}.xlsx`);
    }

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

    // Si on a un modèle (typiquement le fichier importé), on l'utilise pour conserver la structure
    if (c.logisticsTemplate && (c.logisticsTemplate.includes('spreadsheetml') || c.logisticsTemplate.includes('excel'))) {
      try {
        console.log("🧬 Export synchronisé avec le fichier source...");
        const base64Data = c.logisticsTemplate.includes(',') ? c.logisticsTemplate.split(',')[1] : c.logisticsTemplate;
        const wb = XLSX.read(base64Data, { type: 'base64', cellFormula: true, cellStyles: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 'A', defval: '' });
        
        // On garde trace des participants déjà insérés dans les lignes existantes
        const matchedIds = new Set<string>();

        rows.forEach((row, idx) => {
          const prenom = String(row['K'] || '').trim();
          const nom = String(row['L'] || '').trim();
          const email = String(row['P'] || '').trim();

          if (!prenom && !nom && !email) return;

          const p = c.participants.find(part => 
            (email && part.email.toLowerCase() === email.toLowerCase()) ||
            (part.nom.toLowerCase().includes(nom.toLowerCase()) && part.nom.toLowerCase().includes(prenom.toLowerCase()))
          );

            if (p) {
              matchedIds.add(p.id);
              if (p.logistique) {
                const aller = p.logistique.transports[0]?.aller;
                const retour = p.logistique.transports[0]?.retour;
                const hotel = p.logistique.hotels[0];

                if (aller) {
                  // ALLER : AC(28) Type, AE(30) Corresp, AF(31) Gare Dep, AG(32) H.Dep, AH(33) H.Arr, AI(34) Ref
                  if (aller.type) ws[XLSX.utils.encode_cell({r: idx, c: 28})] = { v: aller.type === 'TRAIN' ? 'Train' : 'Avion' }; 
                  if (aller.correspondanceLieu) ws[XLSX.utils.encode_cell({r: idx, c: 30})] = { v: aller.correspondanceLieu }; // AE(30)
                  if (aller.lieuDepart) ws[XLSX.utils.encode_cell({r: idx, c: 31})] = { v: aller.lieuDepart }; // AF
                  if (aller.depart) ws[XLSX.utils.encode_cell({r: idx, c: 32})] = { v: aller.depart };      // AG
                  if (aller.arrivee) ws[XLSX.utils.encode_cell({r: idx, c: 33})] = { v: aller.arrivee };     // AH
                  if (aller.numero) ws[XLSX.utils.encode_cell({r: idx, c: 34})] = { v: aller.numero };       // AI
                }
                if (retour) {
                  // RETOUR : AJ(35) Date, AK(36) Type, AL(37) Gare Dep, AM(38) Corresp, AN(39) Gare Arr, AO(40) H.Dep, AP(41) H.Arr, AQ(42) Ref
                  if (retour.date) ws[XLSX.utils.encode_cell({r: idx, c: 35})] = { v: retour.date };
                  if (retour.type) ws[XLSX.utils.encode_cell({r: idx, c: 36})] = { v: retour.type === 'TRAIN' ? 'Train' : 'Avion' };
                  if (retour.lieuDepart) ws[XLSX.utils.encode_cell({r: idx, c: 37})] = { v: retour.lieuDepart };
                  if (retour.correspondanceLieu) ws[XLSX.utils.encode_cell({r: idx, c: 38})] = { v: retour.correspondanceLieu };
                  if (retour.lieuArrivee) ws[XLSX.utils.encode_cell({r: idx, c: 39})] = { v: retour.lieuArrivee };
                  if (retour.depart) ws[XLSX.utils.encode_cell({r: idx, c: 40})] = { v: retour.depart };
                  if (retour.arrivee) ws[XLSX.utils.encode_cell({r: idx, c: 41})] = { v: retour.arrivee };
                  if (retour.numero) ws[XLSX.utils.encode_cell({r: idx, c: 42})] = { v: retour.numero };
                }
                if (hotel && hotel.nom) {
                  ws[XLSX.utils.encode_cell({r: idx, c: 43})] = { v: hotel.nom }; // AR(43)
                }
              }
            }
        });

        // 3. Ajouter les participants qui n'étaient pas dans le fichier d'origine à la fin
        const unmatched = c.participants.filter(p => !matchedIds.has(p.id) && p.statut !== 'SUPPRIME');
        if (unmatched.length > 0) {
          let nextRow = rows.length;
          unmatched.forEach(p => {
            // Identifier le médecin
            const names = p.nom.split(' ');
            ws[XLSX.utils.encode_cell({r: nextRow, c: 10})] = { v: names[0] || '' }; // K
            ws[XLSX.utils.encode_cell({r: nextRow, c: 11})] = { v: names.slice(1).join(' ') || '' }; // L
            ws[XLSX.utils.encode_cell({r: nextRow, c: 15})] = { v: p.email }; // P
            ws[XLSX.utils.encode_cell({r: nextRow, c: 14})] = { v: p.telephone }; // O

            if (p.logistique) {
              const aller = p.logistique.transports[0]?.aller;
              const retour = p.logistique.transports[0]?.retour;
              const hotel = p.logistique.hotels[0];

              if (aller) {
                if (aller.type) ws[XLSX.utils.encode_cell({r: nextRow, c: 28})] = { v: aller.type === 'TRAIN' ? 'Train' : 'Avion' }; 
                if (aller.lieuDepart) ws[XLSX.utils.encode_cell({r: nextRow, c: 31})] = { v: aller.lieuDepart }; 
                if (aller.depart) ws[XLSX.utils.encode_cell({r: nextRow, c: 32})] = { v: aller.depart };      
                if (aller.numero) ws[XLSX.utils.encode_cell({r: nextRow, c: 34})] = { v: aller.numero };       
              }
              if (retour) {
                if (retour.type) ws[XLSX.utils.encode_cell({r: nextRow, c: 36})] = { v: retour.type === 'TRAIN' ? 'Train' : 'Avion' };
                if (retour.depart) ws[XLSX.utils.encode_cell({r: nextRow, c: 40})] = { v: retour.depart };
              }
              if (hotel && hotel.nom) ws[XLSX.utils.encode_cell({r: nextRow, c: 43})] = { v: hotel.nom };
            }
            nextRow++;
          });
        }

        const outB64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        downloadBase64File(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${outB64}`, `Base_Sync_${c.nom}.xlsx`);
        return;
      } catch (err) {
        console.error("Erreur Sync Export:", err);
      }
    }

    // Fallback : Export standard
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

  // ─── Chargement DB (Supabase Uniquement) ───
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    async function initData() {
      setLoading(true);
      try {
        const { data: dataCongres } = await supabase.from('congres').select('*');
        const { data: dataParticipants } = await supabase.from('participants').select('*');
        const { data: dataHistory } = await supabase.from('export_history').select('*');
        const { data: dataSettings } = await supabase.from('settings').select('*').eq('id', 1).single();

        if (initializedRef.current) return;

        let finalCongres: Congres[] = [];
        let finalHistory: ExportHistory[] = [];
        let finalTemplate = {
          subject: "Mundipharma – 27es Journées Nationales d'Infectiologie 2026 – Invitation",
          body: "Chère/Cher Dr,\n\nLe laboratoire Mundipharma a le plaisir de vous compter parmi ses invités au Congrès JNI, qui se déroulera du 18 au 20 juin 2026 à Paris au :\nPalais des Congrès de Paris\n2 Place de la Porte Maillot, 75017 Paris\n\nL’organisation logistique de votre participation nous a été confiée par le laboratoire. Afin d’organiser au mieux votre séjour, merci de bien vouloir remplir le formulaire ci-joint et nous le retourner dès réception à l’adresse suivante : keisha.khoto-thinu@twobevents.fr.\n\nNous nous tenons à votre disposition pour toute information complémentaire au 01 84 25 94 89.\n\nDans l’attente de vous lire, nous vous prions de croire, Chère/Cher Madame/Monsieur, à l’assurance de notre considération distinguée.\n\n\nKeïsha KHOTO-THINU pour le laboratoire Mundipharma"
        };

        if (dataCongres) {
          finalCongres = dataCongres.map((c: any) => normalizeCongres(c, dataParticipants || []));
          if (dataHistory) {
            finalHistory = (dataHistory as ExportHistoryRow[]).map(normalizeHistoryRow);
          }
          if (dataSettings?.email_template) {
            const dbTemplate = dataSettings.email_template;
            // Si le template en base est l'ancien (générique), on le remplace par le nouveau Mundipharma
            if (dbTemplate.subject && dbTemplate.subject.includes("Proposition Logistique")) {
              // On garde finalTemplate qui est déjà initialisé avec Mundipharma
            } else {
              finalTemplate = dbTemplate;
            }
          }
        }

        setCongres(finalCongres);
        setExportHistory(finalHistory);
        setEmailTemplate(finalTemplate);
        initializedRef.current = true;
      } catch (err) {
        console.error("Init Error:", err);
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, []);

  // ─── Realtime Supabase ───
  useEffect(() => {
    if (loading) return;
    
    console.log("⚡ [Realtime] Initialisation du canal participants...");
    const channel = supabase
      .channel('realtime-participants')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'participants' 
      }, (payload: any) => {
        if (!payload.new || !payload.new.id) return;
        
        const updatedPart = normalizeParticipant(payload.new);
        const congresId = payload.new.congres_id;

        // 1. Désactiver temporairement la synchro montante pour éviter la boucle
        isRealtimeUpdate.current = true;
        
        // 2. Mettre à jour l'état global
        setCongres(prev => prev.map(c => 
          c.id === congresId 
            ? { 
                ...c, 
                participants: c.participants.some(p => p.id === updatedPart.id)
                  ? c.participants.map(p => p.id === updatedPart.id ? updatedPart : p)
                  : [...c.participants, updatedPart]
              }
            : c
        ));

        // 3. Mettre à jour les vues ouvertes si c'est le même participant
        setCurrentParticipant(prev => prev?.id === updatedPart.id ? updatedPart : prev);
        if (updatedPart.logistique) {
          setTransports(prev => currentParticipant?.id === updatedPart.id ? updatedPart.logistique!.transports : prev);
          setHotels(prev => currentParticipant?.id === updatedPart.id ? updatedPart.logistique!.hotels : prev);
        }
        setParticipantForDetails(prev => prev?.id === updatedPart.id ? updatedPart : prev);
        
        // 4. Feedback visuel
        setSyncStatus('SUCCESS');
        setTimeout(() => setSyncStatus(prev => prev === 'SUCCESS' ? 'IDLE' : prev), 2000);
      })
      .subscribe();

    // -- Canal pour la table congres (Modèles et réglages) --
    const congressChannel = supabase
      .channel('realtime-congres')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'congres' 
      }, (payload: any) => {
        if (!payload.new || !payload.new.id) return;
        const updatedRaw = payload.new;
        setCongres(prev => {
          // On récupère tous les participants actuels de l'état pour la normalisation
          const currentAllParticipants = prev.flatMap(c => c.participants);
          const normalized = normalizeCongres(updatedRaw, currentAllParticipants);
          return prev.map(c => c.id === updatedRaw.id ? normalized : c);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(congressChannel);
    };
  }, [loading, currentParticipant?.id]);

  // ─── Synchronisation Supabase Uniquement ───
  React.useEffect(() => {
    if (loading) return;
    if (!initializedRef.current || congres.length === 0) return;
    
    if (isRealtimeUpdate.current) {
      isRealtimeUpdate.current = false;
      return;
    }

    const syncToDB = async () => {
      setSyncStatus('SYNCING');
      try {
        // 1. Upsert des données principales
        const congresPayload = congres.map(c => ({
          id: c.id,
          nom: c.nom,
          date: c.date,
          date_debut: c.dateDebut || c.date,
          date_fin: c.dateFin,
          lieu: c.lieu,
          adresse: c.adresse,
          archive: c.archive || false,
          email_template: c.emailTemplate || null,
          bulletin_template: c.bulletinTemplate || null,
          logistics_template: c.logisticsTemplate || null
        }));

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
            proposition_transport: p.logistique?.transports || [],
            proposition_hotel: p.logistique?.hotels || [],
            billets_envoyes: p.billetsEnvoyes || false
          }))
        );

        const historyPayload = exportHistory.map((h, i) => ({
          id: h.id || `${h.date}-${i}`,
          date: h.date,
          description: h.congresName,
          nb_participants: h.count
        }));

        // Exécution des Upserts
        await supabase.from('congres').upsert(congresPayload);
        await supabase.from('participants').upsert(allParticipants);
        await supabase.from('export_history').upsert(historyPayload);

        // 2. NETTOYAGE (DELETE) - ORDRE CRITIQUE : PARTICIPANTS D'ABORD
        // A. Participants
        const { data: dbParticipants } = await supabase.from('participants').select('id');
        const currentPIds = allParticipants.map(p => p.id);
        const pToDelete = (dbParticipants || []).map((r: any) => r.id).filter((id: string) => !currentPIds.includes(id));
        if (pToDelete.length > 0) {
          await supabase.from('participants').delete().in('id', pToDelete);
        }

        // B. Congrès
        const { data: dbCongres } = await supabase.from('congres').select('id');
        const currentCIds = congresPayload.map(c => c.id);
        const cToDelete = (dbCongres || []).map((r: any) => r.id).filter((id: string) => !currentCIds.includes(id));
        if (cToDelete.length > 0) {
          await supabase.from('congres').delete().in('id', cToDelete);
        }

        // C. Historique
        const { data: dbHistory } = await supabase.from('export_history').select('id');
        const currentHIds = historyPayload.map(h => h.id);
        const hToDelete = (dbHistory || []).map((r: any) => r.id).filter((id: string) => !currentHIds.includes(id));
        if (hToDelete.length > 0) {
          await supabase.from('export_history').delete().in('id', hToDelete);
        }

        setSyncStatus('SUCCESS');
        setDbError(null);
        setTimeout(() => setSyncStatus(prev => prev === 'SUCCESS' ? 'IDLE' : prev), 3000);

      } catch (err: any) {
        console.warn("Sync Issue (UI Not Blocked):", err);
        setSyncStatus('ERROR');
        setDbError(err.message || String(err));
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


  if (!mounted) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-950 z-[200] flex flex-col items-center justify-center gap-6" suppressHydrationWarning>
        <div className="relative">
          <div className="w-24 h-24 border-4 border-blue-100 dark:border-blue-900/30 rounded-full animate-spin border-t-blue-600" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Database className="w-8 h-8 text-blue-600 animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-black italic tracking-tighter text-slate-800 dark:text-white uppercase">Initialisation LogiCongrès</h2>
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 tracking-widest uppercase animate-pulse">Récupération des données sécurisées...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#F8F9FB] text-[#1D1D1D] font-sans selection:bg-blue-100" suppressHydrationWarning>


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
            onClick={() => {
              setEditingCongresId(null);
              setEmailTemplate(globalEmailTemplate);
              setEmailSettingsOpen(true);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-100 transition-all font-medium"
          >
            <Mail className="w-5 h-5" /> Emails Settings (Global)
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
                <div
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setViewMode('BOARD'); }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 rounded-xl transition-all group cursor-pointer ${isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                >
                  <div className={`w-2 h-2 rounded-full shadow-sm ${isSelected ? 'bg-blue-600 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="truncate text-sm flex-1 flex items-center gap-2">
                    {c.nom}
                    {c.logisticsTemplate && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Modèle Excel JNI OK" />
                    )}
                  </span>
                  <div className="flex gap-2 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCongresId(c.id);
                        setEmailTemplate(c.emailTemplate || globalEmailTemplate);
                        setTempBulletin(c.bulletinTemplate || null);
                        setTempLogistics(c.logisticsTemplate || null);
                        setEmailSettingsOpen(true);
                      }}
                      className="p-1 hover:text-blue-600 transition-colors"
                      title="Modifier le modèle d'email pour cet événement"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleArchiveCongres(e, c.id)}
                      className="p-1 hover:text-orange-500 transition-colors"
                      title="Archiver"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
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

          <div className="mt-4 px-2 text-[8px] font-black text-gray-300 uppercase tracking-widest text-center">
            Logitools v1.5.1 • Supabase Sync
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
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => alert(`Détails de l'erreur : ${dbError}`)}
                  className="flex items-center gap-2 text-[10px] font-black italic text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 uppercase tracking-tighter hover:bg-red-100 transition-all"
                >
                  <AlertCircle className="w-3 h-4" /> Erreur de synchro (F12)
                </button>
                <button onClick={() => window.location.reload()} className="p-2 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-xl border border-gray-100 transition-all">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
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
                  <h2 className={`text-4xl font-black tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{selectedCongres.nom}</h2>
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
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setEditingCongresId(selectedCongres.id);
                      setEmailTemplate(selectedCongres.emailTemplate || globalEmailTemplate);
                      setTempBulletin(selectedCongres.bulletinTemplate || null);
                      setTempLogistics(selectedCongres.logisticsTemplate || null);
                      setEmailSettingsOpen(true);
                    }}
                    className={`px-6 py-4 rounded-[20px] font-black text-xs transition-all flex items-center gap-3 shadow-xl ${
                      (selectedCongres.bulletinTemplate || selectedCongres.logisticsTemplate)
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                    {(selectedCongres.bulletinTemplate || selectedCongres.logisticsTemplate) 
                      ? "MODÈLES PRÊTS (DOCX/XLSX)" 
                      : "CONFIGURER MODÈLES"}
                  </button>
                  <button className="px-6 py-4 bg-white border border-gray-200 rounded-[20px] text-xs font-black text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                    <Filter className="w-4 h-4" /> FILTRER
                  </button>
                </div>
              </div>

              {/* Stats Grid avec cercle de progression */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div className={`col-span-2 md:col-span-1 p-6 md:p-8 rounded-[48px] shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden group ${isDark ? 'bg-[#161B27]' : 'bg-white'}`}>
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
                    <div key={s.label} className={`p-6 md:p-8 rounded-[48px] shadow-sm flex flex-col justify-between hover:translate-y-[-4px] transition-all border ${isDark ? 'bg-[#161B27] border-[#1F2937]' : 'bg-white border-white'}`}>
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
                      <tr className={`text-[12px] font-black text-gray-600 dark:text-gray-300 uppercase tracking-[0.15em] ${isDark ? 'bg-gray-900/50' : 'bg-gray-50/50'}`}>
                        <th className="px-8 py-4 w-10">
                          <input
                            type="checkbox"
                            checked={selectedParticipants.size === filteredParticipants.length && filteredParticipants.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="px-6 py-4">Contact</th>
                        <th className="px-6 py-4">Ville</th>
                        <th className="px-6 py-4">Aller (Trajet)</th>
                        <th className="px-6 py-4">Retour (Trajet)</th>
                        <th className="px-6 py-4 text-indigo-500">H\u00e9bergement</th>
                        <th className="px-6 py-4 text-center">Statut</th>
                        <th className="px-6 py-4 text-right pr-8">Modifier</th>
                        <th className="px-6 py-4 text-right pr-12">Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-gray-700/50' : 'divide-gray-50'}`}>
                      {filteredParticipants.map(p => {
                        const loading = loadingIds.has(p.id);
                        const transport = p.logistique?.transports?.[0];
                        const hotel = p.logistique?.hotels?.[0];

                        return (
                          <tr key={p.id} className={`group transition-all ${selectedParticipants.has(p.id) ? 'bg-blue-50/30' : isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50/50'}`}>
                            {/* Checkbox */}
                            <td className="px-6 py-6 transition-all">
                              <input
                                type="checkbox"
                                checked={selectedParticipants.has(p.id)}
                                onChange={() => toggleSelect(p.id)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            {/* Contact */}
                            <td className="px-6 py-6 transition-all">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-sm border border-white shrink-0">
                                  {p.nom.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className={`font-black text-base truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{p.nom}</p>
                                    <button onClick={() => openContactModal(p)} className="p-0.5 hover:bg-gray-100 rounded transition-all">
                                      <Mail className={`w-3.5 h-3.5 ${validateEmail(p.email) ? 'text-emerald-500' : 'text-red-400'}`} />
                                    </button>
                                  </div>
                                  <p className="text-xs text-gray-400 font-bold truncate uppercase tracking-tight">{p.email || 'Email manquant'}</p>
                                </div>
                              </div>
                            </td>

                            {/* Ville */}
                            <td className="px-6 py-6 transition-all">
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate block max-w-[100px]">{p.villeDepart}</span>
                            </td>

                            {/* Aller (En ligne) */}
                             <td className="px-6 py-6 transition-all min-w-[320px]">
                               {transport?.aller ? (
                                 <div className="flex flex-col gap-1.5 bg-blue-50/50 dark:bg-blue-900/10 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/30 shadow-sm">
                                   <div className="flex items-center gap-2">
                                     <div className="bg-blue-600 text-white p-1 rounded-md shadow-sm">
                                       {transport.aller.type === 'FLIGHT' ? <Plane className="w-3 h-3" /> : <Train className="w-3 h-3" />}
                                     </div>
                                     <span className="font-black text-gray-900 dark:text-gray-50 text-xs truncate max-w-[90px]">{transport.aller.lieuDepart}</span>
                                     <ArrowRight className="w-3 h-3 text-blue-400 shrink-0" />
                                     
                                     {transport.aller.correspondanceLieu && (
                                       <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-lg border-2 border-amber-200 dark:border-amber-800/50 shadow-sm shrink-0 group/escale relative">
                                         <MapPin className="w-3 h-3 text-amber-600 animate-bounce" />
                                         <span className="font-black text-amber-800 dark:text-amber-200 text-[9px] tracking-widest uppercase">ESCALE : {transport.aller.correspondanceLieu}</span>
                                         <ArrowRight className="w-2 h-2 text-amber-400 shrink-0" />
                                       </div>
                                     )}
                                     
                                     <span className="font-black text-gray-900 dark:text-gray-50 text-xs truncate max-w-[90px]">{transport.aller.lieuArrivee}</span>
                                   </div>

                                   <div className="flex items-center justify-between text-[10px]">
                                     <div className="flex items-center gap-2">
                                       <Calendar className="w-3 h-3 text-blue-500" />
                                       <span className="font-black text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded">{transport.aller.date || '??'}</span>
                                       {transport.aller.correspondanceLieu && (
                                         <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-950/20 px-2 py-0.5 rounded-md border border-amber-200/50 ml-2 italic">
                                           Via {transport.aller.correspondanceLieu}
                                         </span>
                                       )}
                                     </div>
                                     <div className="flex items-center bg-white dark:bg-gray-800 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-900/50 shadow-sm font-black text-blue-600 dark:text-blue-400 gap-1.5 ml-auto">
                                       <span>{transport.aller.depart}</span>
                                       {transport.aller.arrivee && (
                                         <>
                                           <span className="text-[8px] text-blue-300">-</span>
                                           <span>{transport.aller.arrivee}</span>
                                         </>
                                       )}
                                     </div>
                                   </div>
                                 </div>
                               ) : (
                                 <span className="text-[10px] font-black text-gray-300 uppercase italic">Aller non saisi</span>
                               )}
                             </td>

                             {/* Retour (En ligne) */}
                             <td className="px-6 py-6 transition-all min-w-[320px]">
                               {transport?.retour ? (
                                 <div className="flex flex-col gap-1.5 bg-orange-50/50 dark:bg-orange-900/10 p-2.5 rounded-xl border border-orange-100 dark:border-orange-900/30 shadow-sm">
                                   <div className="flex items-center gap-2">
                                     <div className="bg-orange-600 text-white p-1 rounded-md shadow-sm">
                                       {transport.retour.type === 'FLIGHT' ? <Plane className="w-3 h-3" /> : <Train className="w-3 h-3" />}
                                     </div>
                                     <span className="font-black text-gray-900 dark:text-gray-50 text-xs truncate max-w-[90px]">{transport.retour.lieuDepart}</span>
                                     <ArrowRight className="w-3 h-3 text-orange-400 shrink-0" />
                                     
                                     {transport.retour.correspondanceLieu && (
                                       <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-lg border-2 border-amber-200 dark:border-amber-800/50 shadow-sm shrink-0 group/escale relative">
                                         <MapPin className="w-3 h-3 text-amber-600 animate-bounce" />
                                         <span className="font-black text-amber-800 dark:text-amber-200 text-[9px] tracking-widest uppercase">ESCALE : {transport.retour.correspondanceLieu}</span>
                                         <ArrowRight className="w-2 h-2 text-amber-400 shrink-0" />
                                       </div>
                                     )}
                                     
                                     <span className="font-black text-gray-900 dark:text-gray-50 text-xs truncate max-w-[90px]">{transport.retour.lieuArrivee}</span>
                                   </div>

                                   <div className="flex items-center justify-between text-[10px]">
                                     <div className="flex items-center gap-2">
                                       <Calendar className="w-3 h-3 text-orange-500" />
                                       <span className="font-black text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50 px-1.5 py-0.5 rounded">{transport.retour.date || '??'}</span>
                                       {transport.retour.correspondanceLieu && (
                                         <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-950/20 px-2 py-0.5 rounded-md border border-amber-200/50 ml-2 italic">
                                           Via {transport.retour.correspondanceLieu}
                                         </span>
                                       )}
                                     </div>
                                     <div className="flex items-center bg-white dark:bg-gray-800 px-2 py-0.5 rounded-lg border border-orange-100 dark:border-orange-900/50 shadow-sm font-black text-orange-600 dark:text-orange-400 gap-1.5 ml-auto">
                                       <span>{transport.retour.depart}</span>
                                       {transport.retour.arrivee && (
                                         <>
                                           <span className="text-[8px] text-orange-300">-</span>
                                           <span>{transport.retour.arrivee}</span>
                                         </>
                                       )}
                                     </div>
                                   </div>
                                 </div>
                               ) : (
                                 <span className="text-[10px] font-black text-gray-300 uppercase italic">Retour non saisi</span>
                               )}
                             </td>
                            {/* Hotel */}
                            <td className="px-6 py-6 transition-all">
                              {hotel?.nom ? (
                                <div className="flex items-center gap-2 text-sm">
                                  <Hotel className="w-4 h-4 text-indigo-500" />
                                  <span className="font-black text-gray-900 dark:text-gray-100 truncate max-w-[140px] underline decoration-indigo-100 underline-offset-4">{hotel.nom}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-gray-300 uppercase font-black">-</span>
                              )}
                            </td>

                            {/* Statut (Pastille) */}
                            <td className="px-6 py-4 text-center">
                              <span className={`
                                w-2.5 h-2.5 rounded-full inline-block shadow-sm ring-4 ring-offset-0 
                                ${p.statut === 'VALIDE' ? 'bg-emerald-500 ring-emerald-50' :
                                  p.statut === 'ATTENTE_REPONSE' ? 'bg-indigo-500 ring-indigo-50' :
                                  'bg-amber-400 ring-amber-50'}
                              `} title={p.statut}></span>
                            </td>

                            {/* Modifier Rapide */}
                            <td className="px-6 py-6 text-right pr-8 transition-all">
                              <button onClick={() => openLogistiqueModal(p)} className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg transition-all">
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </td>

                            {/* Actions Globales */}
                            <td className="px-6 py-6 text-right pr-12 transition-all">
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={() => { setParticipantForDetails(p); setDetailsOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Voir l'itinéraire complet">
                                  <Eye className="w-4 h-4" />
                                </button>
                                {p.logistique && p.statut === 'A_TRAITER' && (
                                  <button onClick={() => handleGeneratePDFAndEmail(p)} disabled={loading} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50">
                                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MailCheck className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                                {p.statut === 'ATTENTE_REPONSE' && (
                                  <button onClick={() => handleValidate(p.id)} className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {p.statut === 'VALIDE' && (
                                  <button onClick={() => handleToggleBillet(p.id)} className={`p-2 rounded-lg ${p.billetsEnvoyes ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-100 text-fuchsia-600'}`}>
                                    <Ticket className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button onClick={() => handleDeleteParticipant(p.id)} className="p-2 text-gray-300 hover:text-red-500">
                                  <Trash2 className="w-3.5 h-3.5" />
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

      {detailsOpen && (
        <ParticipantDetailsModal 
          open={detailsOpen} 
          onClose={() => setDetailsOpen(false)} 
          participant={participantForDetails} 
        />
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

      {/* ───── MODALE AJOUT CONGRÈS ───── */}
      {addCongressOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
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
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4 selection:bg-blue-200">
          <div className="bg-white dark:bg-slate-900 rounded-[48px] shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-500 border-4 border-blue-600/10">
            {/* Header VIP */}
            <div className="p-10 border-b-2 border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-blue-600 text-white rounded-[32px] flex items-center justify-center text-3xl font-black italic shadow-2xl shadow-blue-100 ring-8 ring-white dark:ring-slate-800">
                  {currentParticipant.nom.charAt(0)}
                </div>
                <div>
                  <h3 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white uppercase italic">{currentParticipant.nom}</h3>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-[12px] font-black uppercase text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-4 py-1.5 rounded-xl tracking-widest border-2 border-blue-100 dark:border-blue-800/50 shadow-sm">CONCIERGE LOGISTIQUE</span>
                    <div className="h-4 w-[2px] bg-slate-200 dark:bg-slate-700" />
                    <span 
                      className="text-xs font-mono text-slate-400 cursor-pointer hover:text-blue-600 transition-colors"
                      title="Cliquez pour copier l'ID"
                      onClick={() => {
                        navigator.clipboard.writeText(currentParticipant.id);
                        alert("ID Copié : " + currentParticipant.id);
                      }}
                    >
                      ID: {currentParticipant.id} 📋
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <div className="relative group">
                  <button className="px-6 py-4 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-blue-600 rounded-2xl font-black text-xs border-2 border-slate-100 dark:border-slate-700 hover:border-blue-200 transition-all flex items-center gap-3 shadow-xl hover:shadow-2xl hover:translate-y-[-2px]">
                    <Copy className="w-5 h-5" /> COPIER D'UN COLLÈGUE
                  </button>
                  <div className="absolute right-0 top-[100%] mt-3 w-80 bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl border-2 border-slate-50 dark:border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[60] overflow-hidden max-h-[400px] overflow-y-auto ring-1 ring-slate-100">
                    {selectedCongres?.participants.filter(p => p.id !== currentParticipant.id && p.logistique).length === 0 ? (
                      <div className="p-8 text-xs text-slate-400 text-center font-black italic">AUCUN DOSSIER DISPONIBLE</div>
                    ) : (
                      <div className="p-4 space-y-2">
                        {selectedCongres?.participants.filter(p => p.id !== currentParticipant.id && p.logistique).map(p => (
                          <button
                            key={p.id}
                            onClick={() => {
                              if (p.logistique) {
                                setTransports(JSON.parse(JSON.stringify(p.logistique.transports)));
                                setHotels(JSON.parse(JSON.stringify(p.logistique.hotels)));
                              }
                            }}
                            className="w-full text-left px-5 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-900 dark:text-slate-100 hover:text-blue-700 text-xs font-black rounded-2xl transition-all flex items-center justify-between group/item"
                          >
                            <span className="truncate flex-1">{p.nom}</span>
                            <span className="text-[9px] font-black text-blue-500 bg-blue-100 dark:bg-blue-900/50 px-3 py-1 rounded-lg opacity-0 group-hover/item:opacity-100 transition-opacity">COPIER</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => setModalOpen(false)} className="w-16 h-16 bg-white dark:bg-slate-800 rounded-3xl border-2 border-slate-100 dark:border-slate-700 text-slate-400 hover:text-red-500 shadow-xl flex items-center justify-center transition-all hover:rotate-90 hover:scale-110">
                  <X className="w-10 h-10" />
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
                    <button
                      onClick={() => {
                        const text = prompt("Collez ici le texte complet du récapitulatif de voyage (SNCF Connect) :");
                        if (!text) return;

                        const parseSNCF = (rawText: string) => {
                          const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                          const timeRegex = /\b(\d{2})[hH:](\d{2})\b/;
                          const extractTime = (s: string) => {
                            const m = s.match(timeRegex);
                            return m ? `${m[1]}:${m[2]}` : null;
                          };
                          const BLACKLIST = [/dur[eé]e/i, /trajet/i, /correspondance/i, /accueil/i, /placement/i, /voiture/i, /place/i, /classe/i, /^opéré/i, /wifi/i, /restauration/i, /bagage/i, /billet/i, /ouverture/i, /fermeture/i, /embarquement/i, /portes/i, /accès/i, /quai/i, /^aller/i, /^retour/i, /voyage/i, /récapitulatif/i, /details/i, /^option/i];
                          const isBlacklisted = (s: string) => BLACKLIST.some(r => r.test(s));

                          const cleanStation = (s: string) => s.replace(timeRegex, '')
                            .replace(/Arrivée|Départ|à|le|Vers|De|Pour/gi, '')
                            .replace(/^(TGV INOUI|OUIGO|TER|INTERCITÉS?|TGV|Bus|Ligne|Train|Car|INTERCITES)\s*\d*/i, "")
                            .replace(/\d+\s*min\s+d'arrêt.*/i, "")
                            .replace(/Durée.*$/i, "")
                            .replace(/Paris Montparnasse\s*\d+\s*Et\s*\d+/i, "Paris Montparnasse") // Normalisation Paris
                            .replace(/\s+/g, ' ')
                            .trim();

                          const stops: { time: string, name: string }[] = [];
                          for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            const tStr = extractTime(line);
                            if (tStr) {
                              if (isBlacklisted(line)) continue;
                              
                              let name = cleanStation(line);

                              if (name.length <= 2 || /^\d+$/.test(name.replace(/\s+/g, ''))) {
                                // 1. Look ahead
                                for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                                  if (timeRegex.test(lines[j]) && j > i + 1) break;
                                  if (isBlacklisted(lines[j])) continue;
                                  let c = cleanStation(lines[j]);
                                  if (c.length > 2 && !/^\d+$/.test(c.replace(/\s+/g, ''))) {
                                    name = c;
                                    break;
                                  }
                                }
                                // 2. Look behind
                                if (!name) {
                                  for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
                                    if (timeRegex.test(lines[j])) break;
                                    if (isBlacklisted(lines[j])) continue;
                                    let c = cleanStation(lines[j]);
                                    if (c.length > 2 && !/^\d+$/.test(c.replace(/\s+/g, ''))) {
                                      name = c;
                                      break;
                                    }
                                  }
                                }
                              }
                              if (name) stops.push({ time: tStr, name: name });
                            }
                          }

                          // Heuristic Globale
                          const journeyMatch = rawText.match(/([A-Z][^0-9\n\r→>]+)(?:\s*[→>]\s*)([A-Z][^0-9\n\r]+)/i);
                          let mainEnd = journeyMatch ? journeyMatch[2].trim() : "";
                          if (!mainEnd) {
                             const destMatch = rawText.match(/(?:Destination|Voyage\s+pour|Arrivée\s+à|Vers|Pour)\s*[:\s]+([A-Z][a-zàâéèêëïîôûùç]+(?:\s+[A-Z][a-zàâéèêëïîôûùç]+)*)/i);
                             mainEnd = destMatch ? destMatch[1].trim() : "";
                          }

                          const deduped: { time: string, name: string }[] = [];
                          for (let i = 0; i < stops.length; i++) {
                            const currentName = stops[i].name.toLowerCase().replace(/[\s-]/g, '');
                            const lastAdded = deduped[deduped.length - 1];
                            const lastName = lastAdded ? lastAdded.name.toLowerCase().replace(/[\s-]/g, '') : null;
                            
                            if (!lastAdded || currentName !== lastName) {
                              deduped.push(stops[i]);
                            } else {
                              // Même gare, on garde l'horaire le plus récent pour le segment suivant
                              deduped[deduped.length - 1].time = stops[i].time;
                            }
                          }

                          const trainNumbers = rawText.match(/(?:INTERCITÉS?|TGV INOUI|OUIGO|TER|Train li[Oo]|Autocar Rémi Exp|TGV)\s+\d+/gi) || [];
                          const cleanDate = (rawText.match(/((?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?\s+\d+\s+\w+)/i) || ["", ""])[1];

                          const createTransportDetails = (stopList: any[]) => {
                            if (stopList.length < 1) return null;
                            
                            // Si un seul stop, on essaie de compléter avec mainEnd
                            if (stopList.length === 1 && mainEnd && mainEnd.toLowerCase() !== stopList[0].name.toLowerCase()) {
                               stopList.push({ time: "", name: mainEnd });
                            }

                            if (stopList.length < 2) return null;
                            
                            const segs: Segment[] = [];
                            for (let i = 0; i < stopList.length - 1; i++) {
                              segs.push({
                                depart: stopList[i].time,
                                arrivee: stopList[i+1].time,
                                lieuDepart: stopList[i].name,
                                lieuArrivee: stopList[i+1].name,
                                numero: (trainNumbers[i] || trainNumbers[0] || "").replace(/\s+/g, ' ').trim(),
                                date: cleanDate
                              });
                            }
                            return {
                              date: cleanDate,
                              depart: segs[0].depart,
                              arrivee: segs[segs.length - 1].arrivee,
                              lieuDepart: segs[0].lieuDepart,
                              lieuArrivee: segs[segs.length - 1].lieuArrivee,
                              numero: segs[0].numero,
                              type: 'TRAIN' as const,
                              correspondanceLieu: segs.length > 1 ? segs[0].lieuArrivee : "",
                              correspondanceHeure: segs.length > 1 ? segs[1].depart : "",
                              correspondanceArrivee: segs.length > 1 ? segs[0].arrivee : "",
                              correspondanceNumero: segs.length > 1 ? segs[1].numero : "",
                              correspondanceDate: cleanDate
                            };
                          };

                          const retourIdx = rawText.toLowerCase().indexOf('retour :');
                          const splitPoint = retourIdx !== -1 ? retourIdx : 999999;
                          const transport = propositionVide();
                          
                          const allerStops = deduped.filter(s => rawText.indexOf(s.time) < splitPoint);
                          const retourStops = deduped.filter(s => rawText.indexOf(s.time) >= splitPoint);

                          const resAller = createTransportDetails(allerStops);
                          const resRetour = createTransportDetails(retourStops);

                          // Intelligence croisée : si l'aller n'a qu'une gare (départ) 
                          // et le retour en a une (qui est l'arrivée de l'aller), on complète.
                          if (!resAller && allerStops.length === 1 && retourStops.length >= 1) {
                             const inferedAller = [...allerStops, { time: "", name: retourStops[0].name }];
                             const details = createTransportDetails(inferedAller);
                             if (details) transport.aller = { ...transport.aller, ...details };
                          } else if (resAller) {
                             transport.aller = { ...transport.aller, ...resAller };
                          }
                          
                          if (resRetour) transport.retour = { ...transport.retour, ...resRetour };
                          
                          return transport;
                        };

                        const extracted = parseSNCF(text);
                        setTransports(t => [...t, extracted]);
                      }}
                      className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black hover:bg-indigo-100 transition-all border border-indigo-100 flex items-center gap-2"
                    >
                      <Zap className="w-3.5 h-3.5 fill-indigo-600" /> Remplissage Intelligent
                    </button>
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
                              <Train className="w-2.5 h-2.5" /> Train (SNCF)
                            </button>
                            <button
                              onClick={() => selectedCongres && openTrainline(currentParticipant.villeDepart, selectedCongres.lieu || selectedCongres.nom, prop.aller.date || selectedCongres.dateDebut || selectedCongres.date, prop.retour.date || selectedCongres.dateFin, undefined, selectedCongres.id, currentParticipant.id)}
                              className="p-1 px-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-1 text-[8px] font-black uppercase"
                            >
                              <Train className="w-2.5 h-2.5" /> Trainline
                            </button>
                          </div>
                        </div>

                         <div className="grid grid-cols-1 gap-4">
                           {/* Segment 1 : Aller */}
                           <div className="bg-white dark:bg-gray-900 rounded-3xl border border-blue-100 dark:border-blue-900/50 p-6 shadow-sm hover:shadow-md transition-all group">
                             <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black italic shadow-lg shadow-blue-200">1</div>
                                  <label className="text-[11px] font-black text-blue-600 uppercase tracking-[0.15em]">Aller Principal</label>
                                </div>
                             </div>

                             <div className="space-y-3">
                               {/* Ligne 1 : Les Gares et Horaires */}
                               <div className="flex items-center gap-4 bg-blue-50/30 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-50/50 dark:border-blue-900/20">
                                 <input type="text" placeholder="Gare de départ" className="flex-1 bg-transparent border-none p-1 text-sm font-black text-gray-900 dark:text-gray-100 focus:ring-0 placeholder:text-gray-300" value={prop.aller.lieuDepart} onChange={e => updateTransport(idx, 'aller', 'lieuDepart', e.target.value)} />
                                 <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-blue-100 dark:border-blue-900/40 shadow-sm group-hover:border-blue-300 transition-colors">
                                   <Clock className="w-3 h-3 text-blue-400" />
                                   <input type="time" className="bg-transparent border-none p-0 text-sm font-black text-blue-600 w-16 focus:ring-0" value={prop.aller.depart} onChange={e => updateTransport(idx, 'aller', 'depart', e.target.value)} />
                                 </div>
                                 <ArrowRight className="w-4 h-4 text-blue-300 flex-shrink-0" />
                                 <input type="text" placeholder={prop.aller.correspondanceLieu ? "Ville d'escale" : "Gare d'arrivée"} className="flex-1 bg-transparent border-none p-1 text-sm font-black text-blue-600 focus:ring-0 placeholder:text-blue-200" value={prop.aller.correspondanceLieu || prop.aller.lieuArrivee} onChange={e => updateTransport(idx, 'aller', prop.aller.correspondanceLieu ? 'correspondanceLieu' : 'lieuArrivee', e.target.value)} />
                                 <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-blue-100 dark:border-blue-900/40 shadow-sm group-hover:border-blue-300 transition-colors">
                                   <Clock className="w-3 h-3 text-blue-400" />
                                   <input type="time" className="bg-transparent border-none p-0 text-sm font-black text-blue-600 w-16 focus:ring-0" value={prop.aller.correspondanceLieu ? (prop.aller.correspondanceArrivee || '') : (prop.aller.arrivee || '')} onChange={e => updateTransport(idx, 'aller', prop.aller.correspondanceLieu ? 'correspondanceArrivee' : 'arrivee', e.target.value)} />
                                 </div>
                               </div>

                               {/* Ligne 2 : Détails Techniques */}
                               <div className="flex items-center gap-6 px-4 py-1">
                                 <div className="flex items-center gap-2 text-[11px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 dark:border-slate-800 pr-4">
                                   <select className="bg-transparent border-none p-0 cursor-pointer hover:scale-110 transition-transform text-sm" value={prop.aller.type} onChange={e => updateTransport(idx, 'aller', 'type', e.target.value as any)}>
                                     <option value="TRAIN">🚆</option>
                                     <option value="FLIGHT">✈️</option>
                                   </select>
                                   <input 
                                     type="text" 
                                     placeholder="Date (ex: 24/03)" 
                                     className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-2 py-1 w-32 text-xs font-black text-blue-700 dark:text-blue-300 outline-none focus:ring-2 focus:ring-blue-500/20" 
                                     value={prop.aller.date || ''} 
                                     onChange={e => updateTransport(idx, 'aller', 'date', e.target.value)} 
                                   />
                                 </div>
                                 <div className="flex items-center gap-4 flex-1">
                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/40 px-3 py-1 rounded-lg">
                                      <Train className="w-3 h-3 text-gray-300" />
                                      <input type="text" placeholder="N° DE TRAIN / VOL" className="bg-transparent border-none p-0 text-[10px] font-black uppercase text-gray-500 placeholder:text-gray-300 w-32 focus:ring-0" value={prop.aller.numero} onChange={e => updateTransport(idx, 'aller', 'numero', e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/40 px-3 py-1 rounded-lg">
                                      <Users className="w-3 h-3 text-gray-300" />
                                      <input type="text" placeholder="PLACEMENT (VOITURE 4, PLACE 52...)" className="bg-transparent border-none p-0 text-[10px] font-black uppercase text-gray-500 placeholder:text-gray-300 flex-1 focus:ring-0" value={prop.aller.placement || ''} onChange={e => updateTransport(idx, 'aller', 'placement', e.target.value)} />
                                    </div>
                                 </div>
                               </div>
                             </div>

                             {prop.aller.correspondanceLieu && (
                               <div className="mt-8 pt-6 border-t border-gray-50 dark:border-gray-800 border-dashed">
                                  <div className="flex items-center gap-2 mb-4">
                                    <div className="w-6 h-6 bg-blue-400 text-white rounded-full flex items-center justify-center text-[10px] font-black italic shadow-lg shadow-blue-100 dark:shadow-none">2</div>
                                    <label className="text-[11px] font-black text-blue-400 uppercase tracking-[0.1em]">Correspondance / Vol 2</label>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-4 bg-blue-50/10 dark:bg-blue-900/5 p-4 rounded-2xl border border-blue-50/30 dark:border-blue-900/10">
                                      <div className="flex-1 flex flex-col">
                                        <label className="text-[8px] font-bold text-blue-400 uppercase ml-1 mb-1">Escale</label>
                                        <input type="text" placeholder="Ville d'escale" className="bg-transparent border-none p-1 text-sm font-black text-blue-600 focus:ring-0 placeholder:text-blue-200 h-6" value={prop.aller.correspondanceLieu || ''} onChange={e => updateTransport(idx, 'aller', 'correspondanceLieu', e.target.value)} />
                                      </div>
                                      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-blue-100 dark:border-blue-900/40 shadow-sm">
                                        <div className="flex flex-col">
                                          <label className="text-[8px] font-bold text-blue-300 uppercase leading-none mb-1">Départ</label>
                                          <input type="time" className="bg-transparent border-none p-0 text-sm font-black text-blue-600 w-16 focus:ring-0" value={prop.aller.correspondanceHeure || ''} onChange={e => updateTransport(idx, 'aller', 'correspondanceHeure', e.target.value)} />
                                        </div>
                                      </div>
                                      <ArrowRight className="w-4 h-4 text-blue-100 flex-shrink-0" />
                                      <div className="flex-1 flex flex-col">
                                        <label className="text-[8px] font-bold text-gray-400 uppercase ml-1 mb-1">Arrivée Finale</label>
                                        <input type="text" placeholder="Destination finale" className="bg-transparent border-none p-1 text-sm font-black text-gray-900 dark:text-gray-100 focus:ring-0" value={prop.aller.lieuArrivee} onChange={e => updateTransport(idx, 'aller', 'lieuArrivee', e.target.value)} />
                                      </div>
                                      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-blue-100 dark:border-blue-900/40 shadow-sm">
                                        <div className="flex flex-col">
                                          <label className="text-[8px] font-bold text-gray-400 uppercase leading-none mb-1">Arrivée</label>
                                          <input type="time" className="bg-transparent border-none p-0 text-sm font-black text-gray-900 dark:text-gray-100 w-16 focus:ring-0" value={prop.aller.arrivee || ''} onChange={e => updateTransport(idx, 'aller', 'arrivee', e.target.value)} />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-6 px-4 py-1">
                                      <input 
                                        type="text" 
                                        placeholder="Date" 
                                        className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-2 py-1 w-32 text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 outline-none focus:ring-2 focus:ring-blue-500/20" 
                                        value={prop.aller.correspondanceDate || ''} 
                                        onChange={e => updateTransport(idx, 'aller', 'correspondanceDate', e.target.value)} 
                                      />
                                      <input type="text" placeholder="N° TRAIN 2" className="flex-1 bg-transparent border-none p-0 text-[10px] font-black uppercase text-gray-400 placeholder:text-gray-200" value={prop.aller.correspondanceNumero || ''} onChange={e => updateTransport(idx, 'aller', 'correspondanceNumero', e.target.value)} />
                                      <div className="flex items-center gap-1 bg-orange-50 dark:bg-orange-950/20 px-2 py-1 rounded-lg">
                                        <Clock className="w-2.5 h-2.5 text-orange-400" />
                                        <input type="text" placeholder="ESCALE" className="bg-transparent border-none p-0 text-[9px] font-black uppercase text-orange-400 placeholder:text-orange-200 w-16 focus:ring-0" value={prop.aller.correspondanceDuree || ''} onChange={e => updateTransport(idx, 'aller', 'correspondanceDuree', e.target.value)} />
                                      </div>
                                    </div>
                                  </div>
                               </div>
                             )}
                           </div>
                         </div>
                       </div>

                       {/* Retour */}
                       <div className="space-y-4 pt-10 mt-10 border-t border-orange-100 dark:border-orange-900/30">
                        <div className="flex justify-between items-center not-italic bg-orange-50/50 dark:bg-orange-900/10 p-4 rounded-3xl border border-orange-100/50 dark:border-orange-900/20 mb-6">
                          <p className="text-[11px] font-black text-orange-600 uppercase tracking-[0.2em] flex items-center gap-3">
                             <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" /> Retour domicile
                          </p>
                          <div className="flex gap-2">
                             {/* Boutons existants pour Google Flights/SNCF */}
                             <button onClick={() => selectedCongres && openGoogleFlights(selectedCongres.lieu || selectedCongres.nom, currentParticipant.villeDepart, prop.retour.date || selectedCongres.dateFin || selectedCongres.date, undefined, undefined, selectedCongres.id, currentParticipant.id)} className="p-1 px-3 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-900/40 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm text-[9px] font-black uppercase">✈️ Vols</button>
                             <button onClick={() => selectedCongres && openSNCF(selectedCongres.lieu || selectedCongres.nom, currentParticipant.villeDepart, prop.retour.date || selectedCongres.dateFin || selectedCongres.date, undefined, undefined, selectedCongres.id, currentParticipant.id)} className="p-1 px-3 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-900/40 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm text-[9px] font-black uppercase">🚆 Train</button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 not-italic">
                           {/* Segment 1 : Retour */}
                           <div className="bg-white dark:bg-gray-900 rounded-3xl border border-orange-100 dark:border-orange-900/50 p-6 shadow-sm hover:shadow-md transition-all group">
                             <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-[10px] font-black italic shadow-lg shadow-orange-200">1</div>
                                  <label className="text-[11px] font-black text-orange-500 uppercase tracking-[0.15em]">Retour Principal</label>
                                </div>
                             </div>

                             <div className="space-y-3">
                               <div className="flex items-center gap-4 bg-orange-50/30 dark:bg-orange-900/10 p-4 rounded-2xl border border-orange-50/50 dark:border-orange-900/20">
                                 <input type="text" placeholder="Départ" className="flex-1 bg-transparent border-none p-1 text-sm font-black text-gray-900 dark:text-gray-100 focus:ring-0 placeholder:text-gray-300" value={prop.retour.lieuDepart} onChange={e => updateTransport(idx, 'retour', 'lieuDepart', e.target.value)} />
                                 <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-orange-100 dark:border-orange-900/40 shadow-sm">
                                   <Clock className="w-3 h-3 text-orange-400" />
                                   <input type="time" className="bg-transparent border-none p-0 text-sm font-black text-orange-600 w-16 focus:ring-0" value={prop.retour.depart} onChange={e => updateTransport(idx, 'retour', 'depart', e.target.value)} />
                                 </div>
                                 <ArrowRight className="w-4 h-4 text-orange-300 flex-shrink-0" />
                                 <input type="text" placeholder={prop.retour.correspondanceLieu ? "Ville d'escale" : "Destination"} className="flex-1 bg-transparent border-none p-1 text-sm font-black text-orange-600 focus:ring-0 placeholder:text-orange-200" value={prop.retour.correspondanceLieu || prop.retour.lieuArrivee} onChange={e => updateTransport(idx, 'retour', prop.retour.correspondanceLieu ? 'correspondanceLieu' : 'lieuArrivee', e.target.value)} />
                                 <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-orange-100 dark:border-orange-900/40 shadow-sm">
                                   <Clock className="w-3 h-3 text-orange-400" />
                                   <input type="time" className="bg-transparent border-none p-0 text-sm font-black text-orange-600 w-16 focus:ring-0" value={prop.retour.correspondanceLieu ? (prop.retour.correspondanceArrivee || '') : (prop.retour.arrivee || '')} onChange={e => updateTransport(idx, 'retour', prop.retour.correspondanceLieu ? 'correspondanceArrivee' : 'arrivee', e.target.value)} />
                                 </div>
                               </div>

                               <div className="flex items-center gap-6 px-4 py-1">
                                 <div className="flex items-center gap-2 text-[11px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 dark:border-slate-800 pr-4">
                                   <select className="bg-transparent border-none p-0 cursor-pointer hover:scale-110 transition-transform text-sm" value={prop.retour.type} onChange={e => updateTransport(idx, 'retour', 'type', e.target.value as any)}>
                                     <option value="TRAIN">🚆</option>
                                     <option value="FLIGHT">✈️</option>
                                   </select>
                                   <input 
                                     type="text" 
                                     placeholder="Date (ex: 24/03)" 
                                     className="bg-orange-50/50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-lg px-2 py-1 w-32 text-xs font-black text-orange-700 dark:text-orange-300 outline-none focus:ring-2 focus:ring-orange-500/20" 
                                     value={prop.retour.date || ''} 
                                     onChange={e => updateTransport(idx, 'retour', 'date', e.target.value)} 
                                   />
                                 </div>
                                 <div className="flex items-center gap-4 flex-1">
                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/40 px-3 py-1 rounded-lg">
                                      <Train className="w-3 h-3 text-gray-300" />
                                      <input type="text" placeholder="N° DE TRAIN / VOL" className="bg-transparent border-none p-0 text-[10px] font-black uppercase text-gray-500 placeholder:text-gray-300 w-32 focus:ring-0" value={prop.retour.numero} onChange={e => updateTransport(idx, 'retour', 'numero', e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/40 px-3 py-1 rounded-lg">
                                      <Users className="w-3 h-3 text-gray-300" />
                                      <input type="text" placeholder="PLACEMENT" className="bg-transparent border-none p-0 text-[10px] font-black uppercase text-gray-500 placeholder:text-gray-300 flex-1 focus:ring-0" value={prop.retour.placement || ''} onChange={e => updateTransport(idx, 'retour', 'placement', e.target.value)} />
                                    </div>
                                 </div>
                               </div>
                             </div>

                             {prop.retour.correspondanceLieu && (
                               <div className="mt-8 pt-6 border-t border-gray-50 dark:border-gray-800 border-dashed">
                                  <div className="flex items-center gap-2 mb-4">
                                    <div className="w-6 h-6 bg-orange-400 text-white rounded-full flex items-center justify-center text-[10px] font-black italic shadow-lg shadow-orange-100">2</div>
                                    <label className="text-[11px] font-black text-orange-400 uppercase tracking-[0.1em]">Correspondance / Vol 2</label>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-4 bg-orange-50/10 dark:bg-orange-900/5 p-4 rounded-2xl border border-orange-50/30 dark:border-orange-900/10">
                                      <div className="flex-1 flex flex-col">
                                        <label className="text-[8px] font-bold text-orange-400 uppercase ml-1 mb-1">Escale</label>
                                        <input type="text" placeholder="Ville d'escale" className="bg-transparent border-none p-1 text-sm font-black text-orange-600 focus:ring-0 placeholder:text-blue-200 h-6" value={prop.retour.correspondanceLieu || ''} onChange={e => updateTransport(idx, 'retour', 'correspondanceLieu', e.target.value)} />
                                      </div>
                                      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-orange-100 dark:border-orange-900/40 shadow-sm">
                                        <div className="flex flex-col">
                                          <label className="text-[8px] font-bold text-orange-300 uppercase leading-none mb-1">Départ</label>
                                          <input type="time" className="bg-transparent border-none p-0 text-sm font-black text-orange-600 w-16 focus:ring-0" value={prop.retour.correspondanceHeure || ''} onChange={e => updateTransport(idx, 'retour', 'correspondanceHeure', e.target.value)} />
                                        </div>
                                      </div>
                                      <ArrowRight className="w-4 h-4 text-orange-100 flex-shrink-0" />
                                      <input type="text" placeholder="Arrivée Finale" className="flex-1 bg-transparent border-none p-1 text-sm font-black text-gray-900 dark:text-gray-100 focus:ring-0" value={prop.retour.lieuArrivee} onChange={e => updateTransport(idx, 'retour', 'lieuArrivee', e.target.value)} />
                                      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 border border-orange-100 dark:border-orange-900/40 shadow-sm">
                                        <Clock className="w-3 h-3 text-orange-300" />
                                        <input type="time" className="bg-transparent border-none p-0 text-sm font-black text-gray-900 dark:text-gray-100 w-16 focus:ring-0" value={prop.retour.arrivee || ''} onChange={e => updateTransport(idx, 'retour', 'arrivee', e.target.value)} />
                                      </div>
                                    </div>
                                    {/* Row 2 : Détails Techniques (Date, Numéro...) */}
                                    <div className="flex items-center gap-6 px-4 py-1">
                                      <input 
                                        type="text" 
                                        placeholder="Date" 
                                        className="bg-orange-50/50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-lg px-2 py-1 w-32 text-[10px] font-black uppercase text-orange-600 dark:text-orange-400 outline-none focus:ring-2 focus:ring-orange-500/20" 
                                        value={prop.retour.correspondanceDate || ''} 
                                        onChange={e => updateTransport(idx, 'retour', 'correspondanceDate', e.target.value)} 
                                      />
                                      <input type="text" placeholder="N° TRAIN 2" className="flex-1 bg-transparent border-none p-0 text-[10px] font-black uppercase text-gray-400 placeholder:text-gray-200" value={prop.retour.correspondanceNumero || ''} onChange={e => updateTransport(idx, 'retour', 'correspondanceNumero', e.target.value)} />
                                      {prop.retour.correspondanceDuree && (
                                        <div className="flex items-center gap-1 bg-orange-50 dark:bg-orange-950/20 px-2 py-1 rounded-lg">
                                          <Clock className="w-2.5 h-2.5 text-orange-400" />
                                          <p className="text-[9px] font-black uppercase text-orange-400">{prop.retour.correspondanceDuree}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                               </div>
                             )}
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
              <button onClick={() => saveLogistique(true)} className="flex-2 w-full max-w-sm py-5 bg-emerald-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-emerald-100 hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2">
                <MailCheck className="w-5 h-5" /> Enregistrer & Envoyer
              </button>
              <button 
                onClick={async () => {
                  const cong = congres.find(c => c.id === selectedId);
                  if (!cong || !currentParticipant) return;
                  console.log("🧪 Test Manuel lancé pour :", currentParticipant.nom);
                  const isJNI = isJNIEvent(cong.nom);
                  const bull = cong.bulletinTemplate || (isJNI ? 'data:application/pdf;base64,' + JNI_BULLETIN_PDF : null);
                  const logi = cong.logisticsTemplate || (isJNI ? 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + JNI_EXCEL : null);

                  if (bull) await fillAndDownloadTemplate(bull, currentParticipant, cong, 'Test_Bulletin');
                  if (logi) await fillAndDownloadTemplate(logi, currentParticipant, cong, 'Test_Logistique');
                  if (!bull && !logi) alert("Aucun modèle configuré.");
                }}
                className="px-6 py-5 bg-emerald-50 text-emerald-600 rounded-3xl font-black text-xs hover:bg-emerald-100 transition-all flex items-center gap-2"
                title="Tester le remplissage Docx/Xlsx"
              >
                <FileText className="w-4 h-4" /> TESTER
              </button>
              <button onClick={() => saveLogistique(false)} className="flex-1 py-5 bg-blue-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-blue-100 hover:translate-y-[-2px] transition-all">
                Enregistrer
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
            <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-blue-50/30">
              <div>
                <h3 className="text-2xl font-black italic">
                  {editingCongresId ? `Modèle : ${congres.find(c => c.id === editingCongresId)?.nom}` : "Paramètres Email Globaux"}
                </h3>
                <p className="text-gray-400 text-sm font-medium mt-1">Personnalisez votre modèle de message Gmail.</p>
              </div>
              <button onClick={() => setEmailSettingsOpen(false)} className="p-4 bg-white text-gray-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all shadow-sm">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-10 space-y-8 max-h-[60vh] overflow-y-auto">
              {/* Section Email */}
              <div className="space-y-6">
                <h4 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> MODÈLE D'EMAIL
                </h4>
                <div className="space-y-4">
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
                      className="w-full bg-gray-50 border-none rounded-2xl p-6 text-sm font-medium focus:ring-2 focus:ring-blue-500/10 focus:outline-none min-h-[200px]"
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
              </div>

              {/* Section Fichiers Modèles uniquement pour événement */}
              {editingCongresId && (
                <div className="space-y-6 pt-8 border-t border-gray-50">
                  <h4 className="text-sm font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> MODÈLES DE DOCUMENTS (.docx, .xlsx)
                  </h4>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Bulletin d'invitation</label>
                      <div className="relative group aspect-video bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden hover:border-blue-400 transition-all">
                        {tempBulletin ? (
                          <div className="flex flex-col items-center p-4">
                            <FileCheck className="w-10 h-10 text-emerald-500 mb-2" />
                            <p className="text-[10px] font-bold text-gray-500">Document Chargé</p>
                            <button 
                              onClick={(e) => { e.stopPropagation(); downloadBase64File(tempBulletin!, 'Bulletin_Template.xlsx'); }}
                              className="mt-2 text-[8px] font-black text-blue-600 underline uppercase"
                            >
                              Vérifier le fichier
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setTempBulletin(null); }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-center p-6">
                            <FileUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-[10px] font-bold text-gray-400">IMPORTER LE .DOCX / .XLSX</p>
                          </div>
                        )}
                        <input
                          type="file"
                          accept=".docx,.xlsx,.xls"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (evt) => setTempBulletin(evt.target?.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Proposition Logistique</label>
                      <div className="relative group aspect-video bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden hover:border-emerald-400 transition-all">
                        {tempLogistics ? (
                          <div className="flex flex-col items-center p-4">
                            <FileCheck className="w-10 h-10 text-emerald-500 mb-2" />
                            <p className="text-[10px] font-bold text-gray-500">Document Chargé</p>
                            <button 
                              onClick={(e) => { e.stopPropagation(); downloadBase64File(tempLogistics!, 'Proposition_Template.xlsx'); }}
                              className="mt-2 text-[8px] font-black text-emerald-600 underline uppercase"
                            >
                              Vérifier le fichier
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setTempLogistics(null); }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-center p-6">
                            <FilePlus2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-[10px] font-bold text-gray-400">IMPORTER LE .DOCX / .XLSX</p>
                          </div>
                        )}
                        <input
                          type="file"
                          accept=".docx,.xlsx,.xls"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (evt) => setTempLogistics(evt.target?.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex flex-col gap-3">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Balises automatiques disponibles :</p>
                    <div className="flex flex-wrap gap-2">
                      {["{NOM}", "{PRENOM}", "{DATE}", "{LIEU}", "{ALLER_DEPART}", "{RETOUR_DEPART}", "{HOTEL_NOM}"].map(tag => (
                        <span key={tag} className="text-[9px] font-bold bg-white text-blue-500 border border-blue-100 px-2 py-1 rounded-lg shadow-sm">{tag}</span>
                      ))}
                    </div>
                    <p className="text-[9px] text-blue-400 italic">Le logiciel remplira ces cases automatiquement si elles sont présentes dans votre Excel.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-10 bg-gray-50/50 flex gap-4">
              <button
                onClick={() => {
                  if (editingCongresId) {
                    setCongres(prev => prev.map(c => c.id === editingCongresId ? { ...c, emailTemplate, bulletinTemplate: tempBulletin || undefined, logisticsTemplate: tempLogistics || undefined } : c));
                  } else {
                    setGlobalEmailTemplate(emailTemplate);
                  }
                  setEmailSettingsOpen(false);
                }}
                className="flex-1 py-5 bg-blue-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-blue-200 hover:translate-y-[-2px] transition-all"
              >
                {editingCongresId ? "Enregistrer pour cet événement" : "Enregistrer Globalement"}
              </button>
              <button
                onClick={() => setEmailSettingsOpen(false)}
                className="flex-1 py-5 bg-white border border-gray-200 text-gray-700 rounded-3xl font-black text-sm hover:shadow-lg transition-all"
              >
                Annuler
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

