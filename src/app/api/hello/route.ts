import { NextResponse } from 'next/server';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET() {
    return NextResponse.json(
      { message: "Hello API" },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
}
