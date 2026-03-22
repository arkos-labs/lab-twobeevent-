console.log("Twobeevent Capture Content Script injecté.");

function extractAllDetails() {
  const url = window.location.href;
  let data = { hotel: null, transport: null };

  if (url.includes("sncf-connect.com")) {
    console.log("[Twobeevent] Page SNCF Connect détectée.");

    const fullText = document.body.innerText;

    // === ÉTAPE 1 : Trouver les horaires ===
    // SNCF Connect écrit: "de 18:04 à 22:52" ou "18h04 à 22h52"
    const timeRangeRegex = /(\d{1,2})[h:](\d{2})\s+à\s+(\d{1,2})[h:](\d{2})/g;
    const pad = (n) => String(n).padStart(2, '0');
    const timeRanges = [];
    let m;
    while ((m = timeRangeRegex.exec(fullText)) !== null) {
      timeRanges.push({ 
        depart: `${pad(m[1])}:${m[2]}`, 
        arrivee: `${pad(m[3])}:${m[4]}` 
      });
    }
    console.log("[Twobeevent] TimeRanges trouvés:", timeRanges);

    // === ÉTAPE 2 : Trouver les gares ===
    // Mots-clés qui ne sont PAS des gares
    const NOT_STATION = new RegExp([
      'voyager','billets','offres','compte','panier','total','valider',
      'ajouter','assurer','frais','annulat','retard','trajet','durée',
      'classe','voiture','place','prise','wifi','espace','couloir',
      'salle','co2','accueil','embarquement','placement','detail',
      'détail','fermer','options?','soutene','donnez','choix','souhait',
      'tgv','ouigo','ter ','inoui','intercit','thalys','eurostar',
      'vols?','trains?','recherch','modifier'
    ].map(w => `^${w}`).join('|'), 'i');

    const lines = fullText.split('\n')
      .map(l => l.replace(/^[^A-Za-zÀ-ü]+/, '').trim()) // RETIRE les icones/symbols en début
      .filter(l => l.length >= 3);

    const isStation = (line) => {
      if (NOT_STATION.test(line)) return false;
      if (/\d{1,2}[h:]\d{2}/.test(line)) return false; // a un horaire
      if (/^\d/.test(line)) return false;               // commence par chiffre
      if (line.length > 50 || line.length < 3) return false;
      if (!/^[A-ZÀ-Ü]/.test(line)) return false;       // doit commencer par majuscule
      if (/^[A-Z]{2,}\s+\d+/.test(line)) return false;  // code train (ex: TGV 8517)
      return true;
    };

    const cleanStation = (s) => {
      if (!s) return "";
      let r = s.trim();
      r = r.replace(/\b\d{1,2}[h:]\d{2}\b/g, '').trim();
      r = r.replace(/\s+\d+\s+(?:et|&)\s+\d+$/i, '').trim(); // "1 Et 2" 
      r = r.replace(/\s+\d+$/i, '').trim();                    // trailing number
      return r;
    };

    const stations = [];
    for (const line of lines) {
      if (!isStation(line)) continue;
      const c = cleanStation(line);
      if (c.length < 3) continue;
      if (!stations.find(s => s.toLowerCase() === c.toLowerCase())) {
        stations.push(c);
      }
      if (stations.length >= 4) break; // Max 4 gares (aller/retour)
    }
    console.log("[Twobeevent] Gares trouvées:", stations);

    // === ÉTAPE 3 : Numéros de trains et dates ===
    const trainNums = fullText.match(/(?:TGV INOUI|OUIGO|TER|INTERCITÉS?|THALYS|EUROSTAR|LYRIA)\s*\d+/gi) || [];
    const dateMatches = fullText.match(/(?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?\s+\d+\s+\w+/gi) || [];
    const cleanDate = (d) => (d || '').replace(/^(?:aller|retour)\s*:?\s*/i, '').trim();

    // === ÉTAPE 4 : Assembler les trajets ===
    // Règle SNCF : gare[0] = Paris (départ Aller)
    //              gare[1] = Toulouse (arrivée Aller = départ Retour)
    // Les gares apparaissent dans l'ordre du voyage dans la page
    
    // Si on a 2+ gares et 2+ plages horaires → on a tout ce qu'il faut
    const gare1 = stations[0] || "";  // Ex: Paris Montparnasse
    const gare2 = stations[1] || "";  // Ex: Toulouse Matabiau

    const allerTimes = timeRanges[0] || null;
    const retourTimes = timeRanges[1] || null;

    const allerTrajet = (gare1 && allerTimes) ? {
      type: "TRAIN",
      date: cleanDate(dateMatches[0] || ""),
      numero: trainNums[0] || "",
      depart: allerTimes.depart,
      arrivee: allerTimes.arrivee,
      lieuDepart: gare1,
      lieuArrivee: gare2,
      correspondanceLieu: "",
      correspondanceArrivee: "",
      correspondanceHeure: "",
      correspondanceNumero: "",
      segments: []
    } : null;

    const retourTrajet = (gare2 && retourTimes) ? {
      type: "TRAIN",
      date: cleanDate(dateMatches[1] || dateMatches[0] || ""),
      numero: trainNums[1] || trainNums[0] || "",
      depart: retourTimes.depart,
      arrivee: retourTimes.arrivee,
      lieuDepart: gare2,
      lieuArrivee: gare1,
      correspondanceLieu: "",
      correspondanceArrivee: "",
      correspondanceHeure: "",
      correspondanceNumero: "",
      segments: []
    } : null;

    console.log("[Twobeevent] ✅ Aller:", allerTrajet);
    console.log("[Twobeevent] ✅ Retour:", retourTrajet);
    console.log("[Twobeevent] TimeRanges:", timeRanges, "| Stations:", stations);

    // On envoie toujours quelque chose pour écraser le cache
    data.transport = {
      aller: allerTrajet,
      retour: retourTrajet,
      site: "SNCF Connect",
      type: "TRAIN"
    };
  }

  return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    try {
      const data = extractAllDetails();
      sendResponse(data);
    } catch(e) {
      console.error("[Twobeevent] Erreur extraction:", e);
      sendResponse({ hotel: null, transport: null });
    }
  }
});
