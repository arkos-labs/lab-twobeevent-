console.log("Twobeevent Capture Content Script injecté.");

// Fonction pour extraire les données selon le site
function extractData() {
  const url = window.location.href;
  let data = {
    hotel: null,
    transport: null
  };

  if (url.includes("sncf-connect.com")) {
    console.log("Détection SNCF Connect...");
    // Logique d'extraction SNCF
    // Exemple (à affiner selon le DOM réel) :
    // data.transport = {
    //   type: "TRAIN",
    //   date: document.querySelector('.date-selector')?.innerText,
    //   departure: document.querySelector('.origin-city')?.innerText,
    //   ...
    // };
  } else if (url.includes("google.com/travel")) {
    console.log("Détection Google Flights/Travel...");
    // Logique d'extraction Google
  } else if (url.includes("booking.com")) {
    console.log("Détection Booking.com...");
    // Logique d'extraction Hotel
    // data.hotel = {
    //   name: document.querySelector('.sr-hotel__name')?.innerText,
    //   ...
    // };
  }

  return data;
}

// Écouter les messages du popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    const data = extractData();
    sendResponse(data);
  }
});
