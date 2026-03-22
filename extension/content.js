console.log("Twobeevent Capture Content Script injecté.");

function extractAllDetails() {
  const url = window.location.href;
  let data = { hotel: null, transport: null };

  // --- LOGIQUE SNCF CONNECT ---
  if (url.includes("sncf-connect.com")) {
    console.log("[Twobeevent] Page SNCF Connect détectée.");
    const fullText = document.body.innerText;
    const timeRangeRegex = /(\d{1,2})[h:](\d{2})\s+à\s+(\d{1,2})[h:](\d{2})/g;
    const pad = (n) => String(n).padStart(2, '0');
    const timeRanges = [];
    let m;
    while ((m = timeRangeRegex.exec(fullText)) !== null) {
      timeRanges.push({ depart: `${pad(m[1])}:${m[2]}`, arrivee: `${pad(m[3])}:${m[4]}` });
    }
    const NOT_STATION = new RegExp(['voyager','billets','offres','compte','panier','total','valider','ajouter','assurer','frais','annulat','retard','trajet','durée','classe','voiture','place','prise','wifi','espace','couloir','salle','co2','accueil','embarquement','placement','detail','détail','fermer','options?','soutene','donnez','choix','souhait','tgv','ouigo','ter ','inoui','intercit','thalys','eurostar','vols?','trains?','recherch','modifier'].map(w => `^${w}`).join('|'), 'i');
    const lines = fullText.split('\n').map(l => l.replace(/^[^A-Za-zÀ-ü]+/, '').trim()).filter(l => l.length >= 3);
    const isStation = (line) => !NOT_STATION.test(line) && !/\d{1,2}[h:]\d{2}/.test(line) && !/^\d/.test(line) && line.length <= 50 && line.length >= 3 && /^[A-ZÀ-Ü]/.test(line) && !/^[A-Z]{2,}\s+\d+/.test(line);
    const cleanStation = (s) => (s || "").replace(/\b\d{1,2}[h:]\d{2}\b/g, '').replace(/\s+\d+\s+(?:et|&)\s+\d+$/i, '').replace(/\s+\d+$/i, '').trim();
    const stations = [];
    for (const line of lines) {
      if (!isStation(line)) continue;
      const c = cleanStation(line);
      if (c.length < 3) continue;
      if (!stations.find(s => s.toLowerCase() === c.toLowerCase())) stations.push(c);
      if (stations.length >= 4) break;
    }
    const trainNums = fullText.match(/(?:TGV INOUI|OUIGO|TER|INTERCITÉS?|THALYS|EUROSTAR|LYRIA)\s*\d+/gi) || [];
    const dateMatches = fullText.match(/(?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?\s+\d+\s+\w+/gi) || [];
    const gare1 = stations[0] || "";
    const gare2 = stations[1] || "";
    const allerTimes = timeRanges[0] || null;
    const retourTimes = timeRanges[1] || null;
    const allerTrajet = (gare1 && allerTimes) ? { type: "TRAIN", date: (dateMatches[0] || "").trim(), numero: trainNums[0] || "", depart: allerTimes.depart, arrivee: allerTimes.arrivee, lieuDepart: gare1, lieuArrivee: gare2, correspondanceLieu: "", segments: [] } : null;
    const retourTrajet = (gare2 && retourTimes) ? { type: "TRAIN", date: (dateMatches[1] || dateMatches[0] || "").trim(), numero: trainNums[1] || trainNums[0] || "", depart: retourTimes.depart, arrivee: retourTimes.arrivee, lieuDepart: gare2, lieuArrivee: gare1, correspondanceLieu: "", segments: [] } : null;
    data.transport = { aller: allerTrajet, retour: retourTrajet, site: "SNCF Connect", type: "TRAIN" };
  }

  // --- LOGIQUE GOOGLE FLIGHTS (BÉTON) ---
  if (url.includes("google.com/travel/flights")) {
    console.log("[Twobeevent] Page Google Flights détectée.");
    const fullText = document.body.innerText;
    
    // 1. Extraire TOUTES les paires (Horaire, Code Aeroport)
    // On cherche les lignes : "19:00 · Aéroport de Paris... (CDG)"
    const flightLegs = [];
    const legRegex = /(\d{1,2}:\d{2})\s*·\s*[^()]+\((([A-Z]{3}))\)/g;
    let match;
    while ((match = legRegex.exec(fullText)) !== null) {
      flightLegs.push({ time: match[1], iata: match[2] });
    }

    // 2. Extraire les numéros de vol AF 1234
    const flightNumRegex = /\b([A-Z]{2}\d{3,5}|[A-Z]{2}\s\d{3,5})\b/g;
    const flightNums = (fullText.match(flightNumRegex) || [])
      .map(f => f.replace(/\s/g, ''))
      .filter(f => !['CO2','TTC','USD','EUR','JPY'].includes(f));

    // 3. Identifier si c'est un retour
    const isRetour = /retour\s*[·.]\s*\w+/i.test(fullText.substring(0, 500));
    const extractedDate = (fullText.match(/(?:aller|retour)\s*[·.]\s*((?:\w+\.?\s+)?\d+\s+\w+)/i) || [])[1] || "";

    if (flightLegs.length >= 2) {
      const trajet = {
        type: "FLIGHT",
        lieuDepart: flightLegs[0].iata,
        lieuArrivee: flightLegs[flightLegs.length - 1].iata,
        depart: flightLegs[0].time,
        arrivee: flightLegs[flightLegs.length - 1].time,
        numero: flightNums[0] || "",
        date: extractedDate,
        correspondanceLieu: flightLegs.length > 2 ? `Escale à ${flightLegs.slice(1, -1).map(l => l.iata).join(', ')}` : ""
      };

      data.transport = {
        aller: !isRetour ? trajet : null,
        retour: isRetour ? trajet : null,
        site: "Google Flights",
        type: "FLIGHT"
      };
    }
  }

  // --- LOGIQUE HOTELS ---
  if (url.includes("booking.com") || url.includes("hotels.com")) {
     const hotelName = document.querySelector("h2.pp-header__title, #hp_hotel_name, .hotel-name")?.innerText;
     if (hotelName) data.hotel = { name: hotelName.trim() };
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
