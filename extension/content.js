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
    
    const parsedStations = blocks.map(el => {
      const t = el.innerText.trim();
      let match = t.match(/^(\d{2}:\d{2})\s*[-•]?\s*(.+)$/);
      if (match) return { time: match[1], name: match[2].trim() };
      
      match = t.match(/^(.+)\s*[-•]?\s*(\d{2}:\d{2})$/);
      if (match) return { time: match[2], name: match[1].trim() };
      
      return null;
    }).filter(Boolean);
    console.log("[Twobeevent] Gares trouvées:", parsedStations);



    // Extraction des trains (ex: TGV INOUI n° 6805)
    const trainMatches = text.match(/(TGV INOUI|OUIGO|TER|INTERCIT|TGV|Bus)\s+(?:Grande Vitesse\s+)?(?:n°\s+)?(\d+)/g) || [];

    // Extraction de la correspondance
    let layoverInfo = null;
    const corrMatch = text.match(/Correspondance\s+-\s+(\d+h\d+|\d+\s*min)\s+(.+)/);
    if (corrMatch) {
        layoverInfo = {
            duration: corrMatch[1],
            location: corrMatch[2].trim()
        };
    }


    // Durée totale
    const durationMatch = text.match(/Durée du trajet\s+(\d+h\d+)/) || text.match(/(\d+h\d+)/);
    const totalDuration = durationMatch ? durationMatch[1] : null;

    // CO2
    const co2Match = text.match(/(\d+[.,]?\d*\s*kg)\s+de\s+CO2/i) || text.match(/(\d+[.,]?\d*\s*kg)/);

    // Construction de l'objet de transport final
    if (parsedStations.length >= 2) {
      console.log("[Twobeevent] Construction des segments...");
      const segments = [];
      const step = (parsedStations.length > 2 && parsedStations[1].name === parsedStations[2].name) ? 2 : 1;
      
      for (let i = 0; i < parsedStations.length - 1; i += step) {
          segments.push({
              depart: parsedStations[i].time,
              arrivee: parsedStations[i+1].time,
              lieuDepart: parsedStations[i].name,
              lieuArrivee: parsedStations[i+1].name,
              numero: trainMatches[segments.length] || ""
          });
      }

      data.transport = {
        site: "SNCF Connect",
        isReturn: isReturn,
        tripType: tripType,
        type: "TRAIN",
        numero: trainMatches[0] || "",
        depart: parsedStations[0].time,
        arrivee: parsedStations[parsedStations.length - 1].time,
        lieuDepart: parsedStations[0].name,
        lieuArrivee: parsedStations[parsedStations.length - 1].name,
        duration: totalDuration,
        co2: co2Match ? co2Match[1] : null,
        date: Array.from(detailPanel.querySelectorAll('p, span')).find(el => el.innerText.match(/(?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\. \d+/i))?.innerText || "",
        correspondanceLieu: layoverInfo ? layoverInfo.location : "",
        correspondanceNumero: trainMatches.length > 1 ? trainMatches[1] : "",
        segments: segments
      };
      console.log("[Twobeevent] Extraction réussie:", data.transport);
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



