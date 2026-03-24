import * as StyledXLSX from 'xlsx-js-style';
import { Participant } from './types';

export const EXCEL_COLORS = {
  VALIDE: { bg: "059669", font: "FFFFFF", bold: true }, // Emerald 600
  ATTENTE_REPONSE: { bg: "60A5FA", font: "000000", bold: false }, // Blue 400
  ANNULE: { bg: "9CA3AF", font: "000000", bold: false }, // Gray 400
  DEFAULT: { bg: "FFFFFF", font: "000000", bold: false }
};

/**
 * Applique le style de ligne complet (A -> AT) basé sur le statut du participant.
 * @param ws - La feuille de calcul (Worksheet)
 * @param rIdx - L'index de la ligne (0-based)
 * @param p - L'objet participant
 */
export function applyRowStyle(ws: any, rIdx: number, p: Participant) {
  const isAnnule = p.statut === 'ANNULE' || p.statut === 'SUPPRIME';
  const isFini = p.statut === 'VALIDE' || p.billetsEnvoyes;

  let style = EXCEL_COLORS.DEFAULT;
  if (isFini) style = EXCEL_COLORS.VALIDE;
  else if (p.statut === 'ATTENTE_REPONSE') style = EXCEL_COLORS.ATTENTE_REPONSE;
  else if (isAnnule) style = EXCEL_COLORS.ANNULE;

  if (style === EXCEL_COLORS.DEFAULT) return;

  // On couvre de A (0) à AT (45) minimum
  for (let cIdx = 0; cIdx <= 50; cIdx++) {
    const addr = StyledXLSX.utils.encode_cell({ r: rIdx, c: cIdx });
    const existing = ws[addr];
    
    // On force un contenu (-) si la case est vide ou contient juste un espace
    const rawVal = existing && existing.v !== undefined && existing.v !== null ? String(existing.v).trim() : "";
    const val = rawVal === "" ? "-" : existing.v;
    const fontColor = rawVal === "" ? style.bg : style.font;

    ws[addr] = {
      v: val,
      t: (existing && existing.t) ? existing.t : "s",
      s: {
        fill: { 
          patternType: "solid",
          fgColor: { rgb: style.bg },
          bgColor: { rgb: style.bg }
        },
        font: { 
          color: { rgb: fontColor }, 
          bold: style.bold 
        },
        alignment: { vertical: "center", horizontal: "left" },
        border: {
          top: { style: "thin", color: { rgb: "C0C0C0" } },
          bottom: { style: "thin", color: { rgb: "C0C0C0" } },
          left: { style: "thin", color: { rgb: "C0C0C0" } },
          right: { style: "thin", color: { rgb: "C0C0C0" } }
        }
      }
    };
  }
}

/**
 * Met à jour le range (!ref) de la feuille pour inclure la zone cible.
 */
export function ensureSheetRange(ws: any, maxRow: number, maxCol: number = 45) {
  const range = StyledXLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  range.e.r = Math.max(range.e.r, maxRow);
  range.e.c = Math.max(range.e.c, maxCol);
  ws['!ref'] = StyledXLSX.utils.encode_range(range);
}
