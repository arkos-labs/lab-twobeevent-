
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function upload() {
  const url = 'https://lodmdmedioqndcvrmdzy.supabase.co';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZG1kbWVkaW9xbmRjdnJtZHp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDE1NTEsImV4cCI6MjA4ODkxNzU1MX0.LJQwEi3xv2ASGkRC3w5dCSC1R3So-PjjYLpSix4rMG8';
  const supabase = createClient(url, key);

  const excelBase64 = fs.readFileSync('src/Modele_base64.txt', 'utf8').trim();
  const docxBase64 = fs.readFileSync('src/Bulletin_base64.txt', 'utf8').trim();

  const excelData = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + excelBase64;
  const docxData = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + docxBase64;

  const congressId = '5fa3c9e2-77fc-4a31-9c66-2703c963f0bc';

  console.log('🚀 Mise à jour des modèles pour le congrès JNI 2026...');

  const { data, error } = await supabase
    .from('congres')
    .update({ 
      bulletinTemplate: docxData, 
      logisticsTemplate: excelData 
    })
    .eq('id', congressId);

  if (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
  } else {
    console.log('✅ Modèles mis à jour avec succès dans la base de données !');
  }
}

upload();
