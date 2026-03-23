const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'Modele JNI 2026  copie.xlsx');

try {
  const content = fs.readFileSync(filePath);
  const base64Content = content.toString('base64');
  console.log(`\n\n=== JNI_EXCEL ===\n${base64Content}\n=== END ===\n\n`);
} catch (err) {
  console.error("File not found with 2 spaces, trying 1 space...");
  try {
      const filePath2 = path.join(__dirname, 'Modele JNI 2026 copie.xlsx');
      const content = fs.readFileSync(filePath2);
      const base64Content = content.toString('base64');
      console.log(`\n\n=== JNI_EXCEL ===\n${base64Content}\n=== END ===\n\n`);
  } catch(e) {
      console.error("Not found with 1 space either.");
  }
}
