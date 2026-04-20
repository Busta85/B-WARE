export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

export interface InspectionPhoto {
  id: string;
  side: 'Front' | 'Back' | 'Left' | 'Right' | 'VIN' | 'Delivery';
  timestamp: number;
  location: Location;
  pins: { x: number; y: number; type: string }[];
  isCaptured: boolean;
}

export interface Incident {
  id: string;
  location: Location;
  reportedAt: number;
  status: 'reported' | 'claimed' | 'arrived' | 'towing' | 'delivering' | 'completed';
  claimedBy?: string; // Driver ID
  claimedAt?: number;
  payout?: number;
  vehicleType?: 'Flatbed' | 'Tow Truck';
  reporterName?: string;
  vehicleDescription?: string;
  inspectionPhotos?: InspectionPhoto[];
  isDrivable?: boolean;
  policeInfo?: {
    badgeNumber: string;
    caseNumber: string;
  };
  signatureData?: string; // Base64 signature
  destination?: string;
}

export interface Driver {
  id: string;
  name: string;
  location: Location;
  status: 'available' | 'busy' | 'offline';
}

export interface ServerToClientEvents {
  'incident:new': (incident: Incident) => void;
  'incident:updated': (incident: Incident) => void;
  'drivers:updated': (drivers: Driver[]) => void;
}

export interface ClientToServerEvents {
  'incident:report': (data: Location & { isDrivable?: boolean | null }) => void;
  'incident:claim': (incidentId: string, driverId: string) => void;
  'incident:updateStatus': (incidentId: string, statusOrData: Incident['status'] | Partial<Incident>, maybeData?: Partial<Incident>) => void;
  'driver:updateLocation': (driverId: string, location: Location) => void;
}
