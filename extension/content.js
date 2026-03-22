console.log("Twobeevent Capture Content Script injecté.");

// Fonction pour extraire les données selon le site
function extractAllDetails() {
  const url = window.location.href;
  let data = {
    hotel: null,
    transport: null
  };

  if (url.includes("sncf-connect.com")) {
    console.log("Détection SNCF Connect...");
    
    // Le volet de détail (Drawer)
    const detailPanel = document.querySelector('[role="dialog"]') || document.querySelector('aside') || document.body;
    const text = detailPanel.innerText;

    // Détection du type de trajet (Aller vs Retour)
    const isReturn = text.toLowerCase().includes('retour') || !!document.querySelector('[aria-label^="Retour"]');
    const tripType = isReturn ? "RETOUR" : "ALLER";

    // Extraction des Gares et Horaires
    console.log("[Twobeevent] Détection des gares...");
    const blocks = Array.from(detailPanel.querySelectorAll('div, p, span'))
      .filter(el => {
          const t = el.innerText.trim();
          // Patterns: "HH:mm Station" ou "Station HH:mm"
          return /^(\d{2}:\d{2})\s*(.+)$/.test(t) || /^(.+)\s*(\d{2}:\d{2})$/.test(t);
      })
      .filter((el, index, self) => !self.some((other, otherIdx) => index !== otherIdx && el.contains(other)));
    
    const cleanStationName = (name) => {
      if (!name) return "";
      // Prendre uniquement la première ligne
      let clean = name.split('\n')[0].trim();
      
      // Supprimer les types de train au début
      clean = clean.replace(/^(TGV INOUI|OUIGO|TER|INTERCITÉ|TGV|Bus|Ligne|Train|Car)\s*/i, "");
      clean = clean.replace(/^(Grande Vitesse|Nomade|Fluo|Aléop)\s*/i, "");
      
      // Supprimer les mentions de services ou arrêts parasites s'ils sont dans la ligne
      clean = clean.replace(/\d+\s*min\s+d'arrêt.*/i, ""); 
      clean = clean.replace(/(Wifi|Bar|Nurserie|Vélos|Service).*/i, "");
      
      // Supprimer les horaires si collés à la fin (ex: "Gare 12:30")
      clean = clean.replace(/\d{2}:\d{2}$/, "");
      
      // Garder uniquement les 12 premiers mots max (évite les paragraphes, garde les noms longs)
      const words = clean.split(/\s+/);
      if (words.length > 12) {
          clean = words.slice(0, 12).join(' ');
      }

      return clean.trim();
    };

    const parsedStations = blocks.map(el => {
      // On ignore les éléments qui contiennent manifestement trop de texte ou de sauts de ligne
      const text = el.innerText;
      if (text.length > 150 || (text.match(/\n/g) || []).length > 2) return null;

      const t = text.trim();
      let match = t.match(/^(\d{2}:\d{2})\s*[-•]?\s*(.+)$/);
      if (match) return { time: match[1], name: cleanStationName(match[2]) };
      
      match = t.match(/^(.+)\s*[-•]?\s*(\d{2}:\d{2})$/);
      if (match) return { time: match[2], name: cleanStationName(match[1]) };
      
      return null;
    }).filter(Boolean);
    console.log("[Twobeevent] Gares trouvées (clean):", parsedStations);

    // Extraction des trains (ex: TGV INOUI n° 6805 -> 6805)
    const trainRawMatches = text.match(/(?:TGV INOUI|OUIGO|TER|INTERCITÉ|TGV|Bus)\s+(?:Grande Vitesse\s+)?(?:n°\s+)?(\d+)/gi) || [];
    const trainNumbers = trainRawMatches.map(m => m.match(/\d+/)[0]);

    // Extraction de la correspondance
    let layoverInfo = null;
    const corrMatch = text.match(/Correspondance\s+-\s+(\d+h\d+|\d+\s*min)\s+(.+)/);
    if (corrMatch) {
        layoverInfo = {
            duration: corrMatch[1],
            location: cleanStationName(corrMatch[2])
        };
    }

    // Extraction de la date
    const dateMatch = Array.from(detailPanel.querySelectorAll('p, span')).find(el => el.innerText.match(/(?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\. \d+/i))?.innerText || "";
    const cleanDate = dateMatch.split('.').pop()?.trim() || dateMatch;

    // Extraction des durées, CO2, Classe et Placement
    const totalDuration = text.match(/Durée\s+de\s+trajet\s*[:\s]*(\d+h\d+|\d+\s*min)/i)?.[1] || "";
    const co2Match = text.match(/(\d+(?:[.,]\d+)?)\s*kg\s*de\s*CO2/i);
    const classeMatch = text.match(/(1ère|2de)\s+classe/i)?.[0] || "2de classe";
    const placementMatch = text.match(/(Placement\s+libre|Fenêtre|Couloir|Duo|Place\s+isolée)/i)?.[0] || "Placement libre";

    // Construction de l'objet de transport final
    if (parsedStations.length >= 2) {
      console.log("[Twobeevent] Construction des segments...");
      const segments = [];
      const step = (parsedStations.length > 2 && (parsedStations[1].name === parsedStations[2].name || parsedStations[1].time === parsedStations[2].time)) ? 2 : 1;
      
      for (let i = 0; i < parsedStations.length - 1; i += step) {
          segments.push({
              depart: parsedStations[i].time,
              arrivee: parsedStations[i+1].time,
              lieuDepart: parsedStations[i].name,
              lieuArrivee: parsedStations[i+1].name,
              numero: trainNumbers[segments.length] || "",
              duree: segments.length === 0 ? totalDuration : "" // On met la durée totale sur le segment 1 par défaut si pas de détail par segment
          });
      }

      data.transport = {
        site: "SNCF Connect",
        isReturn: isReturn,
        tripType: tripType,
        type: "TRAIN",
        numero: trainNumbers[0] || "",
        depart: parsedStations[0].time,
        arrivee: parsedStations[parsedStations.length - 1].time,
        lieuDepart: parsedStations[0].name,
        lieuArrivee: parsedStations[parsedStations.length - 1].name,
        duration: totalDuration,
        co2: co2Match ? co2Match[1] : null,
        date: cleanDate,
        classe: classeMatch,
        placement: placementMatch,
        correspondanceLieu: segments.length > 1 ? segments[0].lieuArrivee : "",
        correspondanceNumero: trainNumbers.length > 1 ? trainNumbers[1] : "",
        correspondanceHeure: segments.length > 1 ? segments[1].depart : "",
        correspondanceArrivee: segments.length > 1 ? segments[0].arrivee : "",
        correspondanceDuree: layoverInfo ? layoverInfo.duration : "",
        segments: segments
      };
      console.log("[Twobeevent] Extraction réussie (clean):", data.transport);
    }


    console.log("Scraping SNCF réussi:", data.transport);

  } else if (url.includes("google.com/travel")) {
    // Google Flights extraction logic if needed...
  }

  return data;
}

// Écouter les messages du popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    const data = extractAllDetails();
    sendResponse(data);
  }
});



