document.addEventListener('DOMContentLoaded', async () => {
    const hotelNameEl = document.getElementById('hotelName');
    const transportInfoEl = document.getElementById('transportInfo');
    const sendBtn = document.getElementById('sendBtn');
    const statusEl = document.getElementById('status');
    const participantIdInput = document.getElementById('participantId');

    let transportData = { aller: null, retour: null };
    let hotelData = null;

    // Charger les données précédemment stockées
    chrome.storage.local.get(['twobeevent_transport', 'twobeevent_hotel', 'twobeevent_pid'], (result) => {
        if (result.twobeevent_transport) transportData = result.twobeevent_transport;
        if (result.twobeevent_hotel) hotelData = result.twobeevent_hotel;
        if (result.twobeevent_pid) participantIdInput.value = result.twobeevent_pid;
        updateUI();
    });

    // Demander une extraction fraîche au tab actif
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: "extract" }, (response) => {
            if (response) {
                if (response.hotel) hotelData = response.hotel;
                if (response.transport) {
                    if (response.transport.isReturn) {
                        transportData.retour = response.transport;
                    } else {
                        transportData.aller = response.transport;
                    }
                }
                if (response.participantId) {
                    participantIdInput.value = response.participantId;
                    chrome.storage.local.set({ 'twobeevent_pid': response.participantId });
                }

                // Sauvegarder
                chrome.storage.local.set({ 
                    'twobeevent_transport': transportData,
                    'twobeevent_hotel': hotelData
                });
                
                updateUI();
            }
        });
    });

    function updateUI() {
        if (hotelData) {
            hotelNameEl.innerText = hotelData.name || "Hôtel détecté";
        }

        let transportSummary = "";
        if (transportData.aller) {
            const a = transportData.aller;
            transportSummary += `🔵 ALLER (${a.date || ''})\n`;
            transportSummary += `${a.depart} **${a.departureTime}** ${a.numero ? `(N°${a.numero})` : ''} → ${a.correspondanceLieu || a.arrivee} **${a.correspondanceArrivee || a.arrivalTime}**\n`;
            if (a.correspondanceLieu) {
                transportSummary += `${a.correspondanceLieu} **${a.correspondanceHeure}** ${a.correspondanceNumero ? `(N°${a.correspondanceNumero})` : ''} → ${a.arrivee} **${a.arrivalTime}**\n`;
            }
        }

        if (transportData.retour) {
            const r = transportData.retour;
            transportSummary += `\n🟠 RETOUR (${r.date || ''})\n`;
            transportSummary += `${r.depart} **${r.departureTime}** ${r.numero ? `(N°${r.numero})` : ''} → ${r.correspondanceLieu || r.arrivee} **${r.correspondanceArrivee || r.arrivalTime}**\n`;
            if (r.correspondanceLieu) {
                transportSummary += `${r.correspondanceLieu} **${r.correspondanceHeure}** ${r.correspondanceNumero ? `(N°${r.correspondanceNumero})` : ''} → ${r.arrivee} **${r.arrivalTime}**\n`;
            }
        }

        transportInfoEl.innerHTML = transportSummary.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        transportInfoEl.style.fontSize = '10px';

        sendBtn.disabled = !(hotelData || transportData.aller || transportData.retour) || !participantIdInput.value.trim();
    }

    // Envoyer vers Twobeevent
    sendBtn.addEventListener('click', async () => {
        const pId = participantIdInput.value.trim();
        if (!pId) return;

        sendBtn.disabled = true;
        statusEl.innerText = "Envoi aux serveurs...";
        statusEl.style.color = "#2563eb";

        try {
            const response = await fetch('http://localhost:3000/api/logistique/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participantId: pId,
                    hotel: hotelData,
                    transport: {
                        aller: transportData.aller,
                        retour: transportData.retour,
                        segmentsAller: transportData.aller?.segments || [],
                        segmentsRetour: transportData.retour?.segments || []
                    }

                })
            });

            if (response.ok) {
                statusEl.innerText = "Succès ! Données enregistrées.";
                statusEl.style.color = "#16a34a";
                // Optionnel: Vider le storage après succès
                // chrome.storage.local.remove(['twobeevent_transport', 'twobeevent_hotel']);
            } else {
                throw new Error("Erreur serveur.");
            }
        } catch (error) {
            statusEl.innerText = "Erreur de connexion.";
            statusEl.style.color = "#ef4444";
            sendBtn.disabled = false;
        }
    });

    participantIdInput.addEventListener('input', () => {
        chrome.storage.local.set({ 'twobeevent_pid': participantIdInput.value });
        updateUI();
    });
});

