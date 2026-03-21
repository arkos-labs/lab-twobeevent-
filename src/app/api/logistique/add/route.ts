import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { PropositionTransport, PropositionHotel, Trajet } from '@/lib/types';

/**
 * Route API pour recevoir les données capturées par l'extension
 * Endpoint: /api/logistique/add
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { participantId, hotel, transport } = body;

        if (!participantId) {
            return NextResponse.json({ error: "Participant ID manquant" }, { status: 400 });
        }

        // 1. Récupérer le participant actuel pour avoir ses propositions existantes
        const { data: participant, error: fetchError } = await supabase
            .from('participants')
            .select('proposition_transport, proposition_hotel')
            .eq('id', participantId)
            .single();

        if (fetchError || !participant) {
            return NextResponse.json({ error: "Participant non trouvé dans Supabase" }, { status: 404 });
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
            // L'extension envoie généralement un trajet (Aller) 
            // On le prépare selon le type PropositionTransport qui attend (Aller + Retour)
            const trajetVide = (): Trajet => ({
                type: transport.type || 'TRAIN',
                numero: '',
                date: '',
                depart: '',
                arrivee: '',
                lieuDepart: '',
                lieuArrivee: ''
            });

            const transportToAdd: PropositionTransport = {
                aller: {
                    ...trajetVide(),
                    ...transport, // On écrase les champs par les données capturées
                    // S'il y a des champs mappés différemment (ex: name vs lieuDepart)
                    lieuDepart: transport.departure || transport.lieuDepart || '',
                    lieuArrivee: transport.arrival || transport.lieuArrivee || '',
                    date: transport.date || '',
                    numero: transport.number || transport.numero || ''
                },
                retour: trajetVide() // Par défaut le retour est vide, à compléter manuellement ou par une autre capture
            };
            newTransports.push(transportToAdd);
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
        });

    } catch (error: any) {
        console.error("[API Logistique Error]:", error);
        return NextResponse.json({ 
            error: "Erreur lors de l'enregistrement des données", 
            details: error.message 
        }, { status: 500 });
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
