export interface RouteOption {
    id: string;
    type: 'TRAIN' | 'FLIGHT';
    departureTime: string;
    arrivalTime: string;
    duration: string;
    price: number;
}

export async function searchTransport(origin: string, destination: string, date: string): Promise<RouteOption[]> {
    // Dans le futur, ici on appellera les vraies API (SNCF / Google Flights)
    console.log(`Recherche de trajets de ${origin} vers ${destination} le ${date}`);

    // Simulation du temps de recherche de l'API (1.5 secondes)
    await new Promise(resolve => setTimeout(resolve, 1500));

    return [
        {
            id: 't-1',
            type: 'TRAIN',
            departureTime: '08:32',
            arrivalTime: '10:45',
            duration: '2h13',
            price: 85,
        },
        {
            id: 't-2',
            type: 'TRAIN',
            departureTime: '10:04',
            arrivalTime: '12:15',
            duration: '2h11',
            price: 110,
        },
        {
            id: 'f-1',
            type: 'FLIGHT',
            departureTime: '09:15',
            arrivalTime: '10:30',
            duration: '1h15',
            price: 165,
        }
    ];
}
