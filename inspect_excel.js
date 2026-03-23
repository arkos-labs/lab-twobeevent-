const XLSX = require('xlsx');
const fs = require('fs');

try {
    const filePath = 'c:\\Users\\CHERK\\OneDrive\\Desktop\\twobeevent\\lab-twobeevent--main\\src\\Modele_JNI_2026.xlsx';
    if (!fs.existsSync(filePath)) {
        console.log("File not found: " + filePath);
        process.exit(1);
    }
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Get headers (first 20 rows to be safe)
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    console.log("Range: " + worksheet['!ref']);
    
    for (let r = 0; r <= Math.min(20, range.e.r); r++) {
        let row = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = worksheet[XLSX.utils.encode_cell({r, c})];
            row.push(cell ? cell.v : "");
        }
        console.log(`Row ${r}: ${row.join(' | ')}`);
    }
} catch (e) {
    console.error(e);
}
