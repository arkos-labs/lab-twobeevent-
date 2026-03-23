const fs = require('fs');
const pdf = fs.readFileSync('src/Bulletin invitation - Inscription Prėsentielle - JNI 2026 (1).pdf');
const b64 = pdf.toString('base64');
const current = fs.readFileSync('src/app/jni_templates.ts', 'utf8').split('\n');
// On ajoute la nouvelle ligne
const newline = `export const JNI_BULLETIN_PDF = "${b64}";`;
const updated = [...current, newline].join('\n');
fs.writeFileSync('src/app/jni_templates.ts', updated);
console.log("Updated jni_templates.ts with JNI_BULLETIN_PDF");
