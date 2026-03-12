---
description: Comment modifier visuellement les PDF (ajout de logos, chartes graphiques) pour les courriers
---

# Personnalisation Avancée des Documents PDF

Ce workflow détaille la procédure pour passer d'un PDF généré en "texte brut" via `jspdf` à un PDF professionnel comportant les éléments graphiques et visuels de l'entreprise ou du congrès.

## 1. Structure Recommandée
Plutôt que d'intégrer toutes les coordonnées graphiques directement dans la logique métier, séparer le générateur.
Utiliser un dossier : `src/assets/pdf-templates/`
Convertir les logos en Base64 pour qu'ils soient injectables facilement par `jspdf` (évite les problèmes de chargement asynchrone d'image locale).

## 2. Injection de Logo (Base64)
1. Convertir le logo `.png` en base64 (via un utilitaire en ligne ou un script Node).
2. Dans le fichier de génération PDF (`src/lib/pdfGenerator.ts`) :

```typescript
import { jsPDF } from 'jspdf';
import { monLogoBase64 } from '@/assets/logos';

export function addHeaderToPDF(doc: jsPDF, title: string) {
  // Ajouter le logo en haut à gauche
  doc.addImage(monLogoBase64, 'PNG', 15, 10, 40, 20); // x, y, width, height
  
  // Ajouter les couleurs de l'entreprise (ex: bleu marine)
  doc.setTextColor(15, 32, 67);  // Code RGB : rgb(15, 32, 67)
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 200, 25, { align: 'right' });
  
  // Ajouter une ligne de séparation
  doc.setDrawColor(200, 200, 200); // Gris clair
  doc.setLineWidth(0.5);
  doc.line(15, 35, 195, 35);
}
```

## 3. Ajout d'une signature numérique / Cachet d'entreprise
S'il est nécessaire d'apposer la signature de la Direction sur le PDF d'invitation initial pour le valider légalement :
1. Stocker la signature scannée propre en Base64.
2. L'injecter au bas de la proposition avec la mention *"Pour accord, la Direction des Affaires Médicales"*.

## 4. Polices Personnalisées
`jspdf` supporte par défaut Helvetica, Times et Courier. Pour utiliser une autre police (ex: Roboto ou Arial) :
- Convertir le fichier `.ttf` en JavaScript contenant le Base64.
- Ajouter la police en invoquant `doc.addFileToVFS('Roboto.ttf', base64)` et `doc.addFont()`.
- L'appliquer via `doc.setFont('Roboto')`.
