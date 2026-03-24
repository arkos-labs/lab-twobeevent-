console.log("Twobeevent Capture Content Script injecté.");

function extractAllDetails() {
  const url = window.location.href;
  const urlParams = new URLSearchParams(window.location.search);
  
  // Noms de paramètres utilisés par la plateforme Twobeevent
  let pId = urlParams.get('twobeevent_participant_id') || 
            urlParams.get('pId') || 
            urlParams.get('participantId') || 
            urlParams.get('id');
  
  // Si on est sur la plateforme elle-même, on peut lire l'attribut data mis par la plateforme
  if (!pId) {
      pId = document.body.getAttribute('data-twb-active-pid');
  }
  
  // Si toujours pas d'ID, on cherche dans tout le document s'il y a un input avec le nom 'participantId' (cas rare)
  if (!pId) {
    const input = document.querySelector('[name*="participantId"], [id*="participantId"]');
    if (input && input.value) pId = input.value;
  }
  
  let data = { 
    hotel: null, 
    transport: null,
    participantId: pId || null
  };

  const fullText = document.body.innerText;
  
  console.log("[Twobeevent] Début extraction ultra-large...");

  // --- LOGIQUE SNCF CONNECT ---
  if (url.includes("sncf-connect.com")) {
    console.log("[Twobeevent] Analyse SNCF Connect...");

    // On cherche les horaires du type "08h12" ou "08:12"
    const times = Array.from(fullText.matchAll(/(\d{1,2}[h:]\d{2})/g)).map(m => m[1].replace('h', ':'));
    
    // On essaye de trouver les gares (souvent en début de ligne après l'horaire dans le détail)
    const stations = [];
    const lines = fullText.split('\n');
    lines.forEach(line => {
      if (line.match(/\d{1,2}[h:]\d{2}/) && line.length > 10) {
        stations.push(line.replace(/\d{1,2}[h:]\d{2}/, '').trim());
      }
    });

    // RECHERCHE ULTRA-AGGRESSIVE (Numéros de Train, Vol, Bus, Car)
    const trainKeywords = "TGV|OUIGO|TER|INTERCITES|INOUI|ICE|LYRIA|THALYS|EUROSTAR|CAR|BUS|VOL|FLIGHT|TRAIN";
    const trainReg = new RegExp(`\\b(${trainKeywords})?\\s*(\\d{4,6})\\b`, "gi");
    const allFindings = [];
    let match;
    while ((match = trainReg.exec(fullText)) !== null) {
      const type = (match[1] || "TRAIN").toUpperCase();
      const num = match[2];
      if (!["2024", "2025", "2026"].includes(num)) {
        allFindings.push(`${type} ${num}`);
      }
    }
    const uniqueTrainNums = [...new Set(allFindings)];
    
    if (times.length >= 2) {
      data.transport = {
        aller: {
          type: "TRAIN",
          lieuDepart: stations[0] || "Inconnu",
          lieuArrivee: stations[stations.length - 1] || "Inconnu",
          depart: times[0],
          arrivee: times[times.length - 1],
          numero: uniqueTrainNums.join(' / '),
          date: "", 
          correspondanceLieu: ""
        },
        site: "SNCF Connect",
        type: "TRAIN"
      };
    }
  }

  // --- LOGIQUE GOOGLE FLIGHTS (BÉTON ARMÉ) ---
  if (url.includes("google.com/travel/flights")) {
    console.log("[Twobeevent] Analyse Multi-Segments Google Flights...");
    
    // On cherche TOUT ce qui ressemble à un horaire HH:MM partout dans le texte
    const allTimes = Array.from(fullText.matchAll(/(\b\d{1,2}:\d{2}\b)/g)).map(m => m[1]);
    // On cherche TOUT ce qui ressemble à un code IATA entre parenthèses
    const allIatas = Array.from(fullText.matchAll(/\(([A-Z]{3})\)/g)).map(m => m[1]);

    // Stratégie par lignes (plus sûr pour l'ordre)
    const legs = [];
    const lines = fullText.split('\n');
    lines.forEach(line => {
       const t = line.match(/(\d{1,2}:\d{2})/);
       const i = line.match(/\(([A-Z]{3})\)/);
       if (t && i) {
          legs.push({ time: t[1], iata: i[1] });
       }
    });

    const flightNums = (fullText.match(/\b([A-Z]{2}\s?\d{2,5})\b/g) || [])
      .map(f => f.replace(/\s/g, ''))
      .filter(f => !['CO2','TTC','USD','EUR','JPY'].includes(f));

    // Dates
    const dates = Array.from(fullText.matchAll(/(?:\w+\.?\s+)?\d+\s+\w+/gi)).map(m => m[0]);

    if (legs.length >= 2) {
      const aller = {
        type: "FLIGHT", lieuDepart: legs[0].iata, lieuArrivee: legs[legs.length - 1].iata,
        depart: legs[0].time, arrivee: legs[legs.length - 1].time,
        numero: flightNums[0] || "", date: dates[0] || "", correspondanceLieu: ""
      };
      
      // On sauvegarde tous les segments si présents
      if (legs.length > 2) {
          aller.segments = legs.map((l, idx) => ({
              depart: l.time,
              lieuDepart: l.iata,
              lieuArrivee: legs[idx+1]?.iata || "",
              numero: flightNums[idx] || flightNums[0] || ""
          })).slice(0, -1);
          
          // After creating segments, update the main 'aller' object's numero
          // to join all segment numbers, similar to what prepareData would do.
          const allNums = [...new Set(aller.segments.map(s => s.numero).filter(n => !!n))];
          aller.numero = allNums.join(' / ') || aller.numero;
      }

      let retour = null;
      // ... (Simplifié pour le test)

      data.transport = {
        aller: aller,
        retour: null,
        site: "Google Flights",
        type: "FLIGHT"
      };
    }
  }

  // --- LOGIQUE HOTELS ---
  if (url.includes("booking.com") || url.includes("hotels.com") || url.includes("google.com/travel/hotels")) {
     const titleSel = "h2.pp-header__title, #hp_hotel_name, .hotel-name, [data-testid='header-title'], h1";
     const hotelName = document.querySelector(titleSel)?.innerText;
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
