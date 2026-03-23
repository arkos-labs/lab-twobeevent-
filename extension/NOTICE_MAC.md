# Extension Twobeevent sur macOS 🍎

L'extension Twobeevent Capture est compatible avec macOS via les navigateurs basés sur Chromium (Google Chrome, Brave, Arc, Microsoft Edge).

## ✅ Compatibilité Confirmée
L'extension utilise les APIs standards `chrome.*` (Manifest V3), ce qui garantit son fonctionnement identique sur PC et Mac. Les polices d'écriture ont été optimisées pour utiliser les polices système de macOS (-apple-system) pour un rendu "natif" et élégant.

## 🛠️ Comment l'installer sur un Mac (Procédure Développeur)

Puisque l'extension n'est pas encore sur le Chrome Web Store, voici comment l'installer manuellement :

1. **Ouvrez Google Chrome** (ou Brave/Edge/Arc).
2. Tapez `chrome://extensions` dans la barre d'adresse.
3. Activez le **"Mode développeur"** (en haut à droite).
4. Cliquez sur **"Charger l'extension non empaquetée"** (Load unpacked).
5. Sélectionnez le dossier `extension/` de ce projet.
6. L'icône Twobeevent apparaîtra dans votre barre d'outils !

## 🧭 Note sur Safari
Si vous souhaitez que l'extension soit disponible sur **Safari**, la procédure est différente car Apple demande de passer par Xcode :
- Utiliser l'outil d'Apple : `xcrun safari-web-extension-converter path/to/extension`
- Cela créera un projet Xcode pour compiler une application Mac contenant l'extension.

---

### Améliorations apportées pour Mac :
- **Stack de polices native** : Utilisation de `San Francisco` (via `-apple-system`) pour une intégration visuelle parfaite.
- **Support Retina** : Les icônes et le design utilisent des unités relatives pour une netteté maximale sur les écrans haute densité des Mac.
