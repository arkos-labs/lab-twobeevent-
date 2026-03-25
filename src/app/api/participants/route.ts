import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET() {
  try {
    // Récupérer tous les participants
    const { data: raw, error } = await supabase
      .from('participants')
      .select('*')
      .order('nom', { ascending: true });

    if (error) throw error;

    // Supprimer les doublons par Nom + Prénom (logique JS plus sûre sur Supabase sans RPC)
    const uniqueMap = new Map();
    raw?.forEach(p => {
        const key = `${p.nom}-${p.prenom}`.toLowerCase();
        if (!uniqueMap.has(key)) uniqueMap.set(key, p);
    });
    const participants = Array.from(uniqueMap.values());

    return NextResponse.json(
      { participants },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
