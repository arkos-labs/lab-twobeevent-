---
description: Processus de création de la "Feuille de Route Logistique" finale (J-15)
---

# Génération Automatique de la Feuille de Route Initiale

Une fois que l'agence de voyage a réservé le transport et l'hôtel, l'administrateur doit générer une feuille de route finale qui récapitule toutes les informations pour le médecin invité, avant son départ.

## 1. Structure de données requise
Le participant `VALIDE` doit se voir attribuer des informations supplémentaires, stockées dans la base de données ou importées :
- `numeroBillet` (Ex: PNR SNCF ou Vol)
- `siegeAssigne`
- `nomHotel`, `adresseHotel`
- `dateCheckIn`, `dateCheckOut`

## 2. Nouveau Générateur de PDF (`src/lib/pdfFeuilleRoute.ts`)
Créer un fichier spécifique pour la feuille de route, en utilisant `jspdf` et potentiellement `jspdf-autotable`.

```typescript
import { jsPDF } from 'jspdf';
import { ParticipantDetails } from '@/types';

export function genererFeuilleDeRouteFinale(participant: ParticipantDetails) {
  const doc = new jsPDF();
  
  // Design de l'en-tête, Logo
  doc.setFillColor(230, 240, 255);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setFontSize(24);
  doc.text('VOTRE FEUILLE DE ROUTE OFFICIELLE', 105, 25, { align: 'center' });

  // Blocs d'informations...
  // Section TRANSPORT (Aller/Retour)
  doc.setFont("helvetica", 'bold');
  doc.text('🚄 VOTRE TRANSPORT', 20, 60);
  doc.setFont("helvetica", 'normal');
  doc.text(`Trajet : ${participant.villeDepart} -> Paris`, 25, 70);
  doc.text(`Billet Confirmé : N° ${participant.numeroBillet}`, 25, 78);
  doc.text(`Siège : ${participant.siegeAssigne}`, 25, 86);

  // Section HÉBERGEMENT
  doc.setFont("helvetica", 'bold');
  doc.text('🏨 VOTRE HÉBERGEMENT', 20, 110);
  doc.setFont("helvetica", 'normal');
  doc.text(`Hôtel : ${participant.nomHotel}`, 25, 120);
  doc.text(`Adresse : ${participant.adresseHotel}`, 25, 128);

  // Astuce : Ajouter un QR code généré via 'qrcode' library pour pointer vers Google Maps
  // doc.addImage(qrCodeDataUri, 'PNG', 160, 110, 30, 30);

  doc.save(`Feuille_De_Route_${participant.nom.replace(/ /g, '_')}.pdf`);
}
```

## 3. Ajout dans l'interface (Dashboard)
- Ajouter l'option dans le tableau pour les participants ayant le statut `VALIDE`.
- Ajouter un bouton (ex: Icône "Luggage" ou "Map") qui déclenche `genererFeuilleDeRouteFinale` puis ouvre Gmail pour l'envoi, de la même manière que pour l'invitation.
