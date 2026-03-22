document.addEventListener('DOMContentLoaded', async () => {
    const hotelNameEl = document.getElementById('hotelName');
    const segmentsContainer = document.getElementById('segmentsContainer');
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
                    if (response.transport.aller) transportData.aller = response.transport.aller;
                    if (response.transport.retour) transportData.retour = response.transport.retour;
                    // Compatibilité avec les sites qui envoient encore le format à plat
                    if (response.transport.isReturn !== undefined) {
                      if (response.transport.isReturn) transportData.retour = response.transport;
                      else transportData.aller = response.transport;
                    }
                }
                if (response.participantId) {
                    participantIdInput.value = response.participantId;
                    chrome.storage.local.set({ 'twobeevent_pid': response.participantId });
                }

                chrome.storage.local.set({ 
                    'twobeevent_transport': transportData,
                    'twobeevent_hotel': hotelData
                });
                updateUI();
            }
        });
    });

    function createSegmentRow(segment, section, index) {
        const row = document.createElement('div');
        row.className = 'segment-input';
        
        const timeInput = document.createElement('input');
        timeInput.type = 'text';
        timeInput.className = 'time';
        timeInput.value = segment.depart || "";
        timeInput.addEventListener('input', (e) => {
            transportData[section].segments[index].depart = e.target.value;
            saveData();
        });

        const garesInput = document.createElement('input');
        garesInput.type = 'text';
        garesInput.value = `${segment.lieuDepart} → ${segment.lieuArrivee}`;
        garesInput.addEventListener('input', (e) => {
            const parts = e.target.value.split('→').map(p => p.trim());
            transportData[section].segments[index].lieuDepart = parts[0] || "";
            transportData[section].segments[index].lieuArrivee = parts[1] || "";
            saveData();
        });

        const trainInput = document.createElement('input');
        trainInput.type = 'text';
        trainInput.className = 'train';
        trainInput.placeholder = 'N° Train';
        trainInput.value = segment.numero || "";
        trainInput.addEventListener('input', (e) => {
            transportData[section].segments[index].numero = e.target.value;
            saveData();
        });

        row.appendChild(timeInput);
        row.appendChild(garesInput);
        row.appendChild(trainInput);
        return row;
    }

    function updateUI() {
        if (hotelData) {
            hotelNameEl.innerText = hotelData.name || "Hôtel détecté";
        }

        segmentsContainer.innerHTML = "";
        
        const renderSection = (title, data, key) => {
            if (!data) return;
            
            // Si pas de segments, on crée un segment virtuel depuis les champs top-level
            const segsToShow = (data.segments && data.segments.length > 0)
                ? data.segments
                : [{
                    depart: data.depart || "",
                    arrivee: data.arrivee || "",
                    lieuDepart: data.lieuDepart || "",
                    lieuArrivee: data.lieuArrivee || "",
                    numero: data.numero || ""
                  }];

            if (!segsToShow[0].lieuDepart && !segsToShow[0].depart) return;
            
            const titleEl = document.createElement('div');
            titleEl.className = 'section-title';
            titleEl.innerText = title;
            segmentsContainer.appendChild(titleEl);
            
            segsToShow.forEach((seg, idx) => {
                segmentsContainer.appendChild(createSegmentRow(seg, key, idx));
            });

            // Ajouter le champ Notes (Correspondance)
            const notesLabel = document.createElement('div');
            notesLabel.className = 'label-small';
            notesLabel.innerText = "Notes / Correspondance";
            segmentsContainer.appendChild(notesLabel);

            const notesInput = document.createElement('textarea');
            notesInput.className = 'notes-area';
            notesInput.placeholder = "Résumé des escales...";
            notesInput.value = data.correspondanceLieu || "";
            notesInput.addEventListener('input', (e) => {
                transportData[key].correspondanceLieu = e.target.value;
                saveData();
            });
            segmentsContainer.appendChild(notesInput);
        };

        renderSection('🔵 Aller', transportData.aller, 'aller');
        renderSection('🟠 Retour', transportData.retour, 'retour');

        if (segmentsContainer.innerHTML === "") {
            segmentsContainer.innerHTML = '<p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 10px 0;">Aucun transport détecté.<br>Ouvrez un détail de trajet sur SNCF Connect.</p>';
        }

        sendBtn.disabled = !(hotelData || transportData.aller || transportData.retour) || !participantIdInput.value.trim();
    }

    function saveData() {
        chrome.storage.local.set({ 'twobeevent_transport': transportData });
    }

    // Envoyer vers Twobeevent
    sendBtn.addEventListener('click', async () => {
        const pId = participantIdInput.value.trim();
        if (!pId) return;

        sendBtn.disabled = true;
        statusEl.innerText = "Envoi aux serveurs...";
        statusEl.style.color = "#2563eb";

        try {
            // S'assurer que les champs globaux sont à jour s'il y a des segments
            const prepareData = (data) => {
                if (!data || !data.segments || data.segments.length === 0) return data;
                const first = data.segments[0];
                const last = data.segments[data.segments.length - 1];
                return {
                    ...data,
                    depart: first.depart,
                    lieuDepart: first.lieuDepart,
                    arrivee: last.arrivee,
                    lieuArrivee: last.lieuArrivee,
                    numero: first.numero,
                    segments: data.segments
                };
            };

            const response = await fetch('http://localhost:3000/api/logistique/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participantId: pId,
                    hotel: hotelData,
                    transport: {
                        aller: prepareData(transportData.aller),
                        retour: prepareData(transportData.retour),
                        segmentsAller: transportData.aller?.segments || [],
                        segmentsRetour: transportData.retour?.segments || []
                    }
                })
            });

            if (response.ok) {
                statusEl.innerText = "Succès ! Données enregistrées.";
                statusEl.style.color = "#16a34a";
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
        sendBtn.disabled = !participantIdInput.value.trim();
    });
});

