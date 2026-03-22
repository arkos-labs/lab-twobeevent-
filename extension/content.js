console.log("Twobeevent Capture Content Script injecté.");

function extractAllDetails() {
  const url = window.location.href;
  let data = { hotel: null, transport: null };

  if (url.includes("sncf-connect.com")) {
    console.log("Détection SNCF Connect...");

    const detailPanel = document.querySelector('[role="dialog"]') || document.querySelector('aside') || document.body;
    const text = detailPanel.innerText;

    const isReturn = text.toLowerCase().includes('retour') || !!document.querySelector('[aria-label^="Retour"]');
    const tripType = isReturn ? "RETOUR" : "ALLER";

    // ─── Extraction des segments de train ───────────────────────────────────
    // On cherche les blocs avec numéro de train + gares + horaires
    // Structure SNCF Connect : "HH:MM\nNom Gare\n...\nHH:MM\nNom Gare"

    const BLACKLIST = [
      /^dur[eé]e/i,
      /^trajet/i,
      /^correspondance/i,
      /^accueil/i,
      /^placement/i,
      /^voiture/i,
      /^place\s+\d/i,
      /^restauration/i,
      /^wifi/i,
      /^espace/i,
      /^prise/i,
      /^CO2/i,
      /^\d+[.,]\d+\s*kg/i,
      /^opéré/i,
      /^une\s+réservation/i,
      /^2de\s+classe/i,
      /^1[eè]re\s+classe/i,
      /^classe/i,
      /^banquette/i,
      /^couloir/i,
      /^fenêtre/i,
      /^duo/i,
      /^club/i,
      /^\*/,
    ];

    const isBlacklisted = (str) => BLACKLIST.some(r => r.test(str.trim()));
    const isTime = (str) => /^\d{2}:\d{2}$/.test(str.trim());

    // Extraire toutes les lignes du panel
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // ─── Parser les segments ────────────────────────────────────────────────
    // On cherche des paires : TIME → STATION_NAME (les lignes qui suivent un TIME)
    const stops = []; // { time, name }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isTime(line)) {
        // La ligne suivante devrait être le nom de la gare
        let stationName = "";
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const candidate = lines[j];
          if (isTime(candidate)) break; // prochain horaire, on s'arrête
          if (!isBlacklisted(candidate) && candidate.length > 2 && candidate.length < 60) {
            // Nettoyer le nom de gare
            let cleaned = candidate
              .replace(/^(TGV INOUI|OUIGO|TER|INTERCITÉS?|TGV|Bus|Ligne|Train|Car|INTERCITES)\s*/i, "")
              .replace(/\d+\s*min\s+d'arrêt.*/i, "")
              .replace(/Durée.*$/i, "")
              .replace(/\s+/g, ' ')
              .trim();

            if (cleaned.length > 1 && !isBlacklisted(cleaned)) {
              stationName = cleaned;
              break;
            }
          }
        }
        if (stationName) {
          stops.push({ time: line.trim(), name: stationName });
        }
      }
    }

    console.log("[Twobeevent] Stops détectés:", stops);

    // ─── Extraire les numéros de trains ─────────────────────────────────────
    const trainMatches = text.match(/(INTERCITÉS?\s+\d+|TGV\s+INOUI\s+\d+|OUIGO\s+\d+|TER\s+\d+|Train\s+li[Oo]\s+\d+|Train\s+Rémi\s+Exp\s+\d+|INTERCITES\s*\d+)/gi) || [];
    const trainNumbers = trainMatches.map(m => m.replace(/\s+/g, ' ').trim());

    // ─── Détecter la correspondance ─────────────────────────────────────────
    const corrMatch = text.match(/Correspondance\s*[-–]?\s*(?:Durée\s+du\s+trajet\s*)?(\d+\s*h\s*\d*|\d+\s*min)/i);
    const corrDuree = corrMatch ? corrMatch[1].trim() : "";

    // ─── Date ───────────────────────────────────────────────────────────────
    const dateEl = Array.from(detailPanel.querySelectorAll('p, span, div'))
      .find(el => /(?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?\s+\d+\s+\w+/i.test(el.innerText?.trim() || ""));
    const rawDate = dateEl?.innerText?.trim() || "";
    // Extraire juste la partie "Dim. 22 mars" ou "22 mars"
    const dateMatch = rawDate.match(/((?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?\s+\d+\s+\w+)/i);
    const cleanDate = dateMatch ? dateMatch[1] : rawDate;

    // ─── Durée totale ────────────────────────────────────────────────────────
    const durationMatch = text.match(/Durée\s+du\s+trajet[\s\n]+(\d+h\d+|\d+\s*h\s*\d+|\d+\s*min)/i);
    const totalDuration = durationMatch ? durationMatch[1].replace(/\s+/g, '') : "";

    // ─── Classe et placement ─────────────────────────────────────────────────
    const classeMatch = text.match(/(1[eè]re|2de)\s+classe/i);
    const classeText = classeMatch ? classeMatch[0] : "2de classe";
    const placementMatch = text.match(/(Placement\s+libre|Fenêtre|Couloir|Duo|Place\s+isolée|Banquette|Club)/i);
    const placementText = placementMatch ? placementMatch[0] : "";

    // ─── Construire les segments ─────────────────────────────────────────────
    // stops = liste des gares dans l'ordre
    // Si 2 stops → trajet direct (1 segment)
    // Si 3 stops → 1 correspondance (2 segments : stop[0]→stop[1], stop[1]→stop[2])
    // Si 4 stops → cas rare avec doublons de gare de correspondance

    // Dédupliquer les stops consécutifs identiques (même gare apparaît 2x lors d'une correspondance)
    const dedupedStops = [];
    for (let i = 0; i < stops.length; i++) {
      if (i === 0 || stops[i].name !== stops[i-1].name) {
        dedupedStops.push(stops[i]);
      }
    }

    console.log("[Twobeevent] Stops dédupliqués:", dedupedStops);

    if (dedupedStops.length < 2) {
      console.warn("[Twobeevent] Pas assez de gares détectées");
      return data;
    }

    // Construire TOUS les segments détectés
    const segments = [];
    for (let i = 0; i < dedupedStops.length - 1; i++) {
      segments.push({
        depart: dedupedStops[i].time,
        arrivee: dedupedStops[i+1].time,
        lieuDepart: dedupedStops[i].name,
        lieuArrivee: dedupedStops[i+1].name,
        numero: trainNumbers[i] || trainNumbers[0] || "",
        date: cleanDate,
        duree: "", // Durée du segment si dispo
      });
    }

    // ─── Construire l'objet transport final ──────────────────────────────────
    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];
    const hasCorrrespondance = segments.length > 1;

    data.transport = {
      site: "SNCF Connect",
      isReturn: isReturn,
      tripType: tripType,
      type: "TRAIN",
      // Global
      numero: firstSeg.numero,
      date: cleanDate,
      depart: firstSeg.depart,
      arrivee: lastSeg.arrivee,
      lieuDepart: firstSeg.lieuDepart,
      lieuArrivee: lastSeg.lieuArrivee,
      duration: totalDuration,
      classe: classeText,
      placement: placementText,
      // Correspondance (rempli seulement si > 1 segment)
      correspondanceLieu: hasCorrrespondance ? firstSeg.lieuArrivee : "",
      correspondanceArrivee: hasCorrrespondance ? firstSeg.arrivee : "",
      correspondanceHeure: hasCorrrespondance ? segments[1].depart : "",
      correspondanceNumero: hasCorrrespondance ? segments[1].numero : "",
      correspondanceDuree: corrDuree,
      // Segments détaillés
      segments: segments,
    };

    console.log("[Twobeevent] Transport extrait:", data.transport);
  }

  return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    const data = extractAllDetails();
    sendResponse(data);
  }
});
