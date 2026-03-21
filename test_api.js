async function test() {
    console.log("🚀 Test de la route API Twobeevent...");
    
    const testData = {
        participantId: "f81d4fae-7dec-11d0-a765-00a0c91e6bf0", // ID fictif pour test
        hotel: {
            name: "Hôtel Plaza Paris (Test Extension)",
            checkIn: "2024-05-20"
        },
        transport: {
            type: "TRAIN",
            number: "TGV 9876",
            date: "2024-05-20",
            departure: "Lyon Part-Dieu",
            arrival: "Paris Gare de Lyon"
        }
    };

    try {
        const response = await fetch('http://localhost:3000/api/logistique/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testData)
        });

        const result = await response.json();
        console.log("Status:", response.status);
        console.log("Resultat:", JSON.stringify(result, null, 2));

        if (response.status === 404 && result.error.includes("Supabase")) {
            console.log("\n⚠️ Note: L'erreur est attendue si Supabase n'est pas encore configuré avec des vraies clés.");
        }
    } catch (e) {
        console.error("❌ Erreur lors du test (le serveur est-il bien lancé sur le port 3000 ?):", e.message);
    }
}

test();
