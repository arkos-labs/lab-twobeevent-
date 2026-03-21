import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { PropositionTransport, PropositionHotel, Trajet } from '@/lib/types';

/**
 * Route API pour recevoir les données capturées par l'extension
 * Endpoint: /api/logistique/add
 */
export async function POST(req: Request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    try {
        const body = await req.json();
        const { participantId, hotel, transport } = body;

        if (!participantId) {
            return NextResponse.json({ error: "Participant ID manquant" }, { status: 400, headers: corsHeaders });
        }

        // 1. Récupérer le participant actuel pour avoir ses propositions existantes
        const { data: participant, error: fetchError } = await supabase
            .from('participants')
            .select('proposition_transport, proposition_hotel')
            .eq('id', participantId)
            .single();

        if (fetchError || !participant) {
            return NextResponse.json({ error: "Participant non trouvé dans Supabase" }, { status: 404, headers: corsHeaders });
        }

        let newHotels = participant.proposition_hotel || [];
        let newTransports = participant.proposition_transport || [];

        // Asegurer que ce sont des tableaux
        if (!Array.isArray(newHotels)) newHotels = [];
        if (!Array.isArray(newTransports)) newTransports = [];

        // 2. Traiter l'ajout de l'hôtel si présent
        if (hotel) {
            // On mappe les données reçues au type PropositionHotel
            const hotelToAdd: PropositionHotel = {
                nom: hotel.name || hotel.nom || "Hôtel Inconnu",
                checkIn: hotel.checkIn || hotel.date || undefined,
                checkOut: hotel.checkOut || undefined
            };
            newHotels.push(hotelToAdd);
        }

        // 3. Traiter l'ajout du transport si présent
        if (transport) {
            const parseDateLabel = (label?: string) => {
                if (!label) return '';
                // Example: "Aller : Lun. 23 mars 05:31"
                const months: Record<string, string> = {
                    'janvier': '01', 'février': '02', 'fevrier': '02', 'mars': '03', 'avril': '04',
                    'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08', 'aout': '08',
                    'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12', 'decembre': '12'
                };
                const m = label.toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\b/);
                if (!m) return '';
                const day = m[1].padStart(2, '0');
                const month = months[m[2]];
                if (!month) return '';
                const year = new Date().getFullYear().toString();
                return `${year}-${month}-${day}`;
            };

            const mapTrajet = (t: any): Trajet => ({
                type: t?.type || 'TRAIN',
                numero: t?.numero || t?.trainNumber || '',
                date: t?.date || parseDateLabel(t?.dateLabel) || t?.dateLabel || '',
                depart: t?.depart || t?.departureTime || '',
                arrivee: t?.arrivee || t?.arrivalTime || '',
                lieuDepart: t?.lieuDepart || t?.depart || t?.departure || '',
                lieuArrivee: t?.lieuArrivee || t?.arrivee || t?.arrival || '',
                correspondanceLieu: t?.correspondanceLieu || '',
                correspondanceHeure: t?.correspondanceHeure || '',
                correspondanceArrivee: t?.correspondanceArrivee || '',
                correspondanceNumero: t?.correspondanceNumero || ''
            });

            const applyCorrespondance = (trajet: Trajet, segments: any[] = []) => {
                if (!trajet) return trajet;
                
                // Si on a des segments détaillés, on les utilise pour enrichir le trajet
                if (Array.isArray(segments) && segments.length > 1) {
                    const firstLeg = segments[0];
                    const secondLeg = segments[1];
                    
                    // On ne remplit que si les champs sont vides ou si on veut forcer la précision des segments
                    if (!trajet.correspondanceLieu) trajet.correspondanceLieu = firstLeg?.lieuArrivee || '';
                    if (!trajet.correspondanceArrivee) trajet.correspondanceArrivee = firstLeg?.arrivee || '';
                    if (!trajet.correspondanceHeure) trajet.correspondanceHeure = secondLeg?.depart || '';
                    if (!trajet.correspondanceNumero) trajet.correspondanceNumero = secondLeg?.numero || '';
                    if (!trajet.correspondanceDate) trajet.correspondanceDate = trajet.date || '';
                }
                return trajet;
            };



            // Si l'extension envoie déjà un objet avec aller/retour
            if (transport.aller || transport.retour) {
                const aller = applyCorrespondance(mapTrajet(transport.aller), transport.segmentsAller);
                const retour = applyCorrespondance(mapTrajet(transport.retour), transport.segmentsRetour);
                const transportToAdd: PropositionTransport = { aller, retour };
                newTransports.push(transportToAdd);
            } else {
                // Ancien format (un seul trajet envoyé)
                const transportToAdd: PropositionTransport = {
                    aller: mapTrajet(transport),
                    retour: mapTrajet(null) // Retour vide
                };
                newTransports.push(transportToAdd);
            }
        }


        // 4. Mettre à jour Supabase
        const { error: updateError } = await supabase
            .from('participants')
            .update({
                proposition_hotel: newHotels,
                proposition_transport: newTransports
            })
            .eq('id', participantId);

        if (updateError) {
            throw updateError;
        }

        return NextResponse.json({ 
            success: true, 
            message: "Données ajoutées avec succès",
            data: { hotelsCount: newHotels.length, transportsCount: newTransports.length }
        }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[API Logistique Error]:", error);
        return NextResponse.json({ 
            error: "Erreur lors de l'enregistrement des données", 
            details: error.message 
        }, { status: 500, headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }});
    }
}

// Option de test: GET 
export async function GET() {
    return NextResponse.json({ 
        message: "API Logistique Active",
        status: "ready"
    });
}
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
