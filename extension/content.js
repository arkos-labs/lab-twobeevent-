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

  // --- LOGIQUE SNCF CONNECT RÉVOLUTIONNAIRE ---
  if (url.includes("sncf-connect.com")) {
    console.log("[Twobeevent] Analyse Segmentée SNCF...");
    
    // On divise par "ALLER" et "RETOUR" si présents
    const sections = fullText.split(/(?=RETOUR|VOYAGE DE RETOUR)/i);
    const allerText = sections[0];
    const retourText = sections[1] || "";

    const extractSegments = (text) => {
        // Un segment commence souvent par un horaire suivi d'une ville
        // On cherche les blocs de type "HH:mm Ville ... Train N°"
        const segs = [];
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        
        let currentSeg = null;
        const trainKeywords = "TGV|OUIGO|TER|INTERCITES|INOUI|ICE|LYRIA|THALYS|EUROSTAR|CAR|BUS|VOL|FLIGHT|TRAIN";
        const trainReg = new RegExp(`\\b(${trainKeywords})?\\s*(\\d{4,6})\\b`, "i");

        lines.forEach(line => {
            const timeMatch = line.match(/(\d{1,2}[h:]\d{2})/);
            if (timeMatch) {
                const time = timeMatch[1].replace('h', ':');
                const ville = line.replace(timeMatch[0], '').trim();
                
                if (!currentSeg) {
                    currentSeg = { depart: time, lieuDepart: ville, numero: "" };
                } else {
                    currentSeg.arrivee = time;
                    currentSeg.lieuArrivee = ville;
                    segs.push(currentSeg);
                    // On commence le segment suivant avec l'arrivée du précédent (correspondance)
                    currentSeg = { depart: time, lieuDepart: ville, numero: "" };
                }
            }
            
            const trainMatch = line.match(trainReg);
            if (trainMatch && currentSeg) {
                currentSeg.numero = `${(trainMatch[1] || "TRAIN").toUpperCase()} ${trainMatch[2]}`;
            }
        });
        return segs.filter(s => s.arrivee);
    };

    const allerSegs = extractSegments(allerText);
    const retourSegs = extractSegments(retourText);

    if (allerSegs.length > 0) {
        data.transport = {
            aller: {
                ...allerSegs[0],
                lieuArrivee: allerSegs[allerSegs.length-1].lieuArrivee,
                arrivee: allerSegs[allerSegs.length-1].arrivee,
                segments: allerSegs,
                numero: [...new Set(allerSegs.map(s => s.numero).filter(n => !!n))].join(' / ')
            },
            retour: retourSegs.length > 0 ? {
                ...retourSegs[0],
                lieuArrivee: retourSegs[retourSegs.length-1].lieuArrivee,
                arrivee: retourSegs[retourSegs.length-1].arrivee,
                segments: retourSegs,
                numero: [...new Set(retourSegs.map(s => s.numero).filter(n => !!n))].join(' / ')
            } : null,
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
