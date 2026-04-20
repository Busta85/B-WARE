import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Incident, Driver, Location } from './src/types';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

const PORT = 3000;

// In-memory store
let incidents: Incident[] = [];
let drivers: Record<string, Driver> = {};

// Helper: Calculate distance in km
function getDistance(loc1: Location, loc2: Location) {
  const R = 6371; // Radius of the earth in km
  const dLat = (loc2.lat - loc1.lat) * (Math.PI / 180);
  const dLng = (loc2.lng - loc1.lng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(loc1.lat * (Math.PI / 180)) * Math.cos(loc2.lat * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial state
  socket.emit('drivers:updated', Object.values(drivers));

  socket.on('incident:report', (data: Location & { isDrivable?: boolean | null }) => {
    const vehicles = [
      { desc: 'Tesla Model 3 - Midnight Silver', type: 'Flatbed' },
      { desc: 'Ford F-150 - Oxford White', type: 'Tow Truck' },
      { desc: 'Honda Civic - Rallye Red', type: 'Tow Truck' },
      { desc: 'Mercedes C-Class - Obsidian Black', type: 'Flatbed' }
    ];
    const pickedVehicle = vehicles[Math.floor(Math.random() * vehicles.length)];

    const newIncident: Incident = {
      id: Math.random().toString(36).substr(2, 9),
      location: { lat: data.lat, lng: data.lng, address: data.address || 'Hwy 101 - Exit 42' },
      reportedAt: Date.now(),
      status: 'reported',
      isDrivable: !!data.isDrivable,
      payout: 150 + Math.floor(Math.random() * 50),
      vehicleType: (data.isDrivable ? 'Tow Truck' : pickedVehicle.type) as any,
      reporterName: ['John Smith', 'Jane Doe', 'Michael Chen', 'Sarah Miller'][Math.floor(Math.random() * 4)],
      vehicleDescription: pickedVehicle.desc,
      destination: "Smith's Collision Center"
    };
    incidents.push(newIncident);
    console.log('New Incident:', newIncident.id);

    // Broadcast to all (Radius search logic could go here)
    // For prototype, we broadcast to all available drivers
    io.emit('incident:new', newIncident);
  });

  socket.on('driver:updateLocation', (driverId: string, location: Location) => {
    if (!drivers[driverId]) {
      drivers[driverId] = {
        id: driverId,
        name: `Driver ${driverId.slice(0, 4)}`,
        location,
        status: 'available',
      };
    } else {
      drivers[driverId].location = location;
    }
    io.emit('drivers:updated', Object.values(drivers));
  });

  socket.on('incident:claim', (incidentId: string, driverId: string) => {
    const incidentIndex = incidents.findIndex((i) => i.id === incidentId);
    if (incidentIndex !== -1 && incidents[incidentIndex].status === 'reported') {
      incidents[incidentIndex].status = 'claimed';
      incidents[incidentIndex].claimedBy = driverId;
      incidents[incidentIndex].claimedAt = Date.now();
      
      console.log(`Incident ${incidentId} claimed by ${driverId}`);
      io.emit('incident:updated', incidents[incidentIndex]);
    }
  });

  socket.on('incident:updateStatus', (incidentId: string, statusOrData: Incident['status'] | Partial<Incident>, maybeData?: Partial<Incident>) => {
    const incidentIndex = incidents.findIndex((i) => i.id === incidentId);
    if (incidentIndex !== -1) {
      if (typeof statusOrData === 'string') {
        incidents[incidentIndex] = { ...incidents[incidentIndex], status: statusOrData, ...maybeData };
      } else {
        incidents[incidentIndex] = { ...incidents[incidentIndex], ...statusOrData };
      }
      io.emit('incident:updated', incidents[incidentIndex]);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
