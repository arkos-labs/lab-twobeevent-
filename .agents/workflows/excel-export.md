---
description: Comment exporter des données Excel avec un formatage professionnel (couleurs, styles)
---

# Flux d'Exportation Excel Professionnel

Ce processus utilise le module `src/lib/excelStyles.ts` pour garantir que les fichiers Excel téléchargés respectent scrupuleusement le code couleur de la plateforme.

## Étapes de fonctionnement :
1. **Identification du Participant** : Le système associe chaque ligne du fichier Excel à un participant du dashboard via Email ou Nom/Prénom.
2. **Détermination du Statut** : Si un participant est **Validé** ou si ses **Billets sont Envoyés**, il est marqué comme "Fini" (Vert). S'il est en **Attente de réponse**, il est marqué en "Bleu". S'il est **Annulé**, il est marqué en "Gris".
3. **Coloration Intensive** : Le système ne se contente pas de colorer les cases avec du texte. Il parcourt chaque cellule de la colonne **A** jusqu'à la colonne **AT** (colonne 46).
4. **Correction de Transparence** : Pour les cellules vides, le système injecte un point (`.`) dont la couleur de texte est identique à la couleur de fond, ce qui force Excel à afficher le fond coloré sans que le point ne soit visible.

## Maintenance :
- Pour changer les couleurs, modifiez l'objet `EXCEL_COLORS` dans [excelStyles.ts](file:///c:/Users/CHERK/OneDrive/Desktop/twobeevent/lab-twobeevent--main/src/lib/excelStyles.ts).
- Pour changer la portée de la coloration (ex: aller au-delà de AT), changez la variable `cIdx` dans la boucle d'export.
