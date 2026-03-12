import { jsPDF } from 'jspdf';
import { LogistiqueSaisie, Congres } from '@/lib/types';

export function generateInvitationPDF(doctorName: string, congres: Congres, logistique: LogistiqueSaisie) {
    const doc = new jsPDF();

    // Palette de couleurs
    const blue = [28, 55, 103]; // Bleu nuit plus pro
    const orange = [230, 126, 34];
    const dark = [44, 62, 80];
    const gray = [100, 100, 100];
    const light = [248, 249, 250];

    // 1. EN-TÊTE COMPACT (Réduit pour tout faire tenir sur 1 page)
    doc.setFillColor(blue[0], blue[1], blue[2]);
    doc.rect(0, 0, 210, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text('PROPOSITION LOGISTIQUE', 105, 18, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text('Document de réservation officiel - Confirmation requise', 105, 25, { align: 'center' });

    // 2. RÉCAPITULATIF ÉVÉNEMENT
    let y = 45;
    doc.setFillColor(light[0], light[1], light[2]);
    doc.roundedRect(15, y, 180, 25, 2, 2, 'F');

    doc.setTextColor(blue[0], blue[1], blue[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(congres.nom.toUpperCase(), 20, y + 8);

    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`DATE : ${congres.date || '--'}`, 20, y + 16);
    doc.text(`LIEU : ${congres.lieu || '--'}`, 80, y + 16);
    doc.text(`DÉBUT : ${congres.heure || '--'}`, 150, y + 16);

    y += 35;

    // 3. DESTINATAIRE
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`DESTINATAIRE : Dr. ${doctorName}`, 15, y);

    doc.setFont("helvetica", "normal");
    doc.text(`Nous avons sélectionné les meilleures options de transport et d'hébergement pour vous.`, 15, y + 6);

    y += 15;

    // 4. TRANSPORT (MAXIMISATION DE L'ESPACE)
    doc.setTextColor(blue[0], blue[1], blue[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text('OPTIONS DE TRANSPORT (ALLER & RETOUR)', 15, y);
    y += 6;

    logistique.transports.forEach((prop, index) => {
        // Hauteur dynamique réduite
        let boxHeight = 32;
        if (prop.aller.correspondanceLieu) boxHeight += 6;
        if (prop.retour.correspondanceLieu) boxHeight += 6;

        doc.setDrawColor(230, 230, 230);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(15, y, 180, boxHeight, 1, 1, 'FD');

        // Label Option
        doc.setFillColor(blue[0], blue[1], blue[2]);
        doc.rect(15, y, 25, 6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text(`OPTION ${index + 1}`, 27.5, y + 4.5, { align: 'center' });

        // ALLER
        doc.setTextColor(blue[0], blue[1], blue[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const typeA = prop.aller.type === 'TRAIN' ? 'TRAIN' : 'AVION';
        doc.text(`${typeA} ${prop.aller.numero || ''}`, 20, y + 12);

        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.setFont("helvetica", "normal");
        const depA = `${prop.aller.lieuDepart || '...'} (${prop.aller.depart})`;
        const arrA = `${prop.aller.lieuArrivee || '...'} (${prop.aller.arrivee})`;
        doc.text(`${depA}  ->  ${arrA}`, 55, y + 12);
        doc.text(`Date: ${prop.aller.date}`, 155, y + 12);

        let curY = y + 12;
        if (prop.aller.correspondanceLieu) {
            curY += 6;
            doc.setTextColor(orange[0], orange[1], orange[2]);
            doc.setFontSize(8);
            doc.text(`   CORRESPONDANCE : ${prop.aller.correspondanceLieu} (le ${prop.aller.correspondanceDate} à ${prop.aller.correspondanceHeure})`, 55, curY);
        }

        // RETOUR
        curY += 8;
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const typeR = prop.retour.type === 'TRAIN' ? 'TRAIN' : 'AVION';
        doc.text(`${typeR} ${prop.retour.numero || ''}`, 20, curY);

        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.setFont("helvetica", "normal");
        const depR = `${prop.retour.lieuDepart || '...'} (${prop.retour.depart})`;
        const arrR = `${prop.retour.lieuArrivee || '...'} (${prop.retour.arrivee})`;
        doc.text(`${depR}  ->  ${arrR}`, 55, curY);
        doc.text(`Date: ${prop.retour.date}`, 155, curY);

        if (prop.retour.correspondanceLieu) {
            curY += 6;
            doc.setTextColor(orange[0], orange[1], orange[2]);
            doc.setFontSize(8);
            doc.text(`   CORRESPONDANCE : ${prop.retour.correspondanceLieu} (le ${prop.retour.correspondanceDate} à ${prop.retour.correspondanceHeure})`, 55, curY);
        }

        y += boxHeight + 4;
    });

    // 5. HÉBERGEMENT (Compact)
    if (logistique.hotels && logistique.hotels.length > 0) {
        y += 2;
        doc.setTextColor(blue[0], blue[1], blue[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text('OPTIONS D\'HÉBERGEMENT', 15, y);
        y += 5;

        logistique.hotels.forEach((hotel, idx) => {
            doc.setFillColor(light[0], light[1], light[2]);
            doc.rect(15, y, 180, 10, 'F');
            doc.setTextColor(blue[0], blue[1], blue[2]);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text(`Hôtel Option ${idx + 1} :`, 20, y + 6.5);
            doc.setTextColor(dark[0], dark[1], dark[2]);
            doc.setFont("helvetica", "normal");
            doc.text(hotel.nom || 'À préciser', 55, y + 6.5);
            doc.setFontSize(7);
            doc.setTextColor(gray[0], gray[1], gray[2]);
            doc.text('(Check-in 15h00 | Petit-déjeuner inclus)', 140, y + 6.5);
            y += 12;
        });
    }

    // 6. INSTRUCTIONS & FOOTER (Fait tout tenir sur la page)
    const footerY = 270;
    doc.setDrawColor(blue[0], blue[1], blue[2]);
    doc.setLineWidth(0.2);
    doc.line(15, footerY - 5, 195, footerY - 5);

    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text('COMMENT RÉSERVER ?', 15, footerY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text('1. Choisissez vos options préférées.', 15, footerY + 5);
    doc.text('2. Répondez à l\'email avec les numéros d\'options.', 15, footerY + 10);
    doc.text('3. Nous validons avec l\'agence sous 48h.', 15, footerY + 15);

    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.setFontSize(7);
    const dateGen = new Date().toLocaleDateString('fr-FR');
    doc.text(`Généré le ${dateGen} | Dossier LOG-${Date.now().toString().slice(-6)}`, 105, 290, { align: 'center' });

    const filename = `Prop_Log_Dr_${doctorName.replace(/ /g, '_')}.pdf`;
    doc.save(filename);
}
