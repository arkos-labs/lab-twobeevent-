
const fs = require('fs');
const e = fs.readFileSync('src/Modele_base64.txt', 'utf8').trim();
const d = fs.readFileSync('src/Bulletin_base64.txt', 'utf8').trim();
const content = `export const JNI_EXCEL = "${e}";\nexport const JNI_DOCX = "${d}";\n`;
fs.writeFileSync('src/app/jni_templates.ts', content);
console.log('✅ File src/app/jni_templates.ts created successfully!');
