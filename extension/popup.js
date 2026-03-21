document.addEventListener('DOMContentLoaded', async () => {
    const hotelNameEl = document.getElementById('hotelName');
    const transportInfoEl = document.getElementById('transportInfo');
    const sendBtn = document.getElementById('sendBtn');
    const statusEl = document.getElementById('status');
    const participantIdInput = document.getElementById('participantId');

    let currentData = null;

    // Demander au content script d'extraire les données
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "extract" }, (response) => {
            if (response) {
                currentData = response;
                if (response.hotel) {
                    hotelNameEl.innerText = response.hotel.name || "Détecté";
                }
                if (response.transport) {
                    transportInfoEl.innerText = `${response.transport.type || "Train/Vol"} : ${response.transport.date || ""}`;
                }
                
                if (response.hotel || response.transport) {
                    sendBtn.disabled = false;
                }
            } else {
                statusEl.innerText = "Aucun site compatible détecté.";
                statusEl.style.color = "#64748b";
            }
        });
    });

    // Envoyer vers Twobeevent
    sendBtn.addEventListener('click', async () => {
        const pId = participantIdInput.value.trim();
        if (!pId) {
            statusEl.innerText = "Erreur : ID Participant requis.";
            statusEl.style.color = "#ef4444";
            return;
        }

        sendBtn.disabled = true;
        statusEl.innerText = "Envoi aux serveurs...";
        statusEl.style.color = "#2563eb";

        try {
            // Envoi vers l'API Next.js de la plateforme
            // NOTE : L'URL de l'API doit être confirmée
            const response = await fetch('http://localhost:3000/api/logistique/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participantId: pId,
                    hotel: currentData.hotel,
                    transport: currentData.transport
                })
            });

            if (response.ok) {
                statusEl.innerText = "Succès ! Données envoyées.";
                statusEl.style.color = "#16a34a";
            } else {
                throw new Error("Erreur serveur.");
            }
        } catch (error) {
            statusEl.innerText = "Erreur : Impossible de joindre la plateforme.";
            statusEl.style.color = "#ef4444";
            sendBtn.disabled = false;
        }
    });

    // Permet d'activer le bouton si un ID est entré (au cas où les données ont été détectées sans ID)
    participantIdInput.addEventListener('input', () => {
        if (currentData && (currentData.hotel || currentData.transport)) {
            sendBtn.disabled = !participantIdInput.value.trim();
        }
    });
});
