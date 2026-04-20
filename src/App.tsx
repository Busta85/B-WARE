import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { Shield, MapPin, Truck, AlertTriangle, Clock, Map as MapIcon, Siren, Camera, Info, CarFront, Flame, Stethoscope, Phone, ChevronRight, DollarSign, CheckCircle2, Pin, Trash2, X, ChevronLeft, Mail, FileText, PenTool } from 'lucide-react';
import socket from './lib/socket';
import { Incident, Driver, Location, InspectionPhoto } from './types';
import SignaturePad from './components/SignaturePad';

const MOCK_DRIVER_ID = `driver_${Math.random().toString(36).substr(2, 5)}`;

type IncidentCategory = 'fender' | 'totaled' | 'medical';
type DriverState = 'idle' | 'alerting' | 'en_route' | 'arriving' | 'inspecting' | 'towing' | 'delivering' | 'completed';

const CAR_SIDES: (InspectionPhoto['side'])[] = ['Front', 'Back', 'Left', 'Right', 'VIN', 'Delivery'];

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncident, setActiveIncident] = useState<Incident | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [myLocation, setMyLocation] = useState<Location>({ lat: 40.7128, lng: -74.006, address: "123 Maple Ave, NY" });
  const [appState, setAppState] = useState<'idle' | 'reporting' | 'tracked'>('idle');
  
  // Driver UI States
  const [driverState, setDriverState] = useState<DriverState>('idle');
  const [claimedByMe, setClaimedByMe] = useState<Incident | null>(null);
  const [alertCountdown, setAlertCountdown] = useState(30);
  const [inspectionPhotos, setInspectionPhotos] = useState<InspectionPhoto[]>(
    CAR_SIDES.map(side => ({
      id: side,
      side,
      timestamp: 0,
      location: { lat: 0, lng: 0 },
      pins: [],
      isCaptured: false
    }))
  );
  const [activeCameraSide, setActiveCameraSide] = useState<InspectionPhoto['side'] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [policeBadge, setPoliceBadge] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [signature, setSignature] = useState('');
  
  // Slide to confirm logic
  const x = useMotionValue(0);
  const acceptX = useMotionValue(0);
  const confirmThreshold = 180;
  const opacity = useTransform(x, [0, confirmThreshold], [1, 0]);
  const acceptOpacity = useTransform(acceptX, [0, confirmThreshold], [1, 0]);

  // Reporter UI States
  const [holdProgress, setHoldProgress] = useState(0);
  const [category, setCategory] = useState<IncidentCategory>('fender');
  const [isDrivable, setIsDrivable] = useState<boolean | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const alertTimerRef = useRef<number | null>(null);

  const [showJobTaken, setShowJobTaken] = useState(false);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition((pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude, address: "Current Location Locked" };
        setMyLocation(newLoc);
        socket.emit('driver:updateLocation', MOCK_DRIVER_ID, newLoc);
      });
    }

    socket.on('incident:new', (incident) => {
      setIncidents(prev => [...prev, incident]);
      if (driverState === 'idle') {
        setActiveIncident(incident);
        setDriverState('alerting');
        setAlertCountdown(30);
        startAlertCountdown();
      }
    });

    socket.on('incident:updated', (updatedIncident) => {
      setIncidents(prev => prev.map(i => i.id === updatedIncident.id ? updatedIncident : i));
      
      if (updatedIncident.claimedBy === MOCK_DRIVER_ID) {
        setClaimedByMe(updatedIncident);
        setDriverState('en_route');
        stopAlertCountdown();
      } else if (activeIncident?.id === updatedIncident.id && updatedIncident.status === 'claimed') {
        setDriverState('idle');
        setActiveIncident(null);
        stopAlertCountdown();
        setShowJobTaken(true);
        setTimeout(() => setShowJobTaken(false), 3000);
      }
      
      if (appState === 'reporting' && updatedIncident.status === 'claimed') {
        setAppState('tracked');
      }
    });

    socket.on('drivers:updated', (newDrivers) => {
      setDrivers(newDrivers);
    });

    return () => {
      socket.off('incident:new');
      socket.off('incident:updated');
      socket.off('drivers:updated');
      stopAlertCountdown();
    };
  }, [activeIncident, appState, driverState]);

  const startAlertCountdown = () => {
    if (alertTimerRef.current) clearInterval(alertTimerRef.current);
    alertTimerRef.current = window.setInterval(() => {
      setAlertCountdown(prev => {
        if (prev <= 1) {
          stopAlertCountdown();
          setDriverState('idle');
          setActiveIncident(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopAlertCountdown = () => {
    if (alertTimerRef.current) clearInterval(alertTimerRef.current);
  };

  const startHold = () => {
    if (appState !== 'idle') return;
    holdTimerRef.current = window.setInterval(() => {
      setHoldProgress(prev => {
        if (prev >= 100) {
          stopHold();
          triggerReport();
          return 100;
        }
        return prev + 2;
      });
    }, 20);
  };

  const stopHold = () => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    if (holdProgress < 100) setHoldProgress(0);
  };

  const triggerReport = () => {
    if (isDrivable === null) {
      alert("Please select vehicle condition (Drivable / Not Drivable) to optimize dispatch.");
      setHoldProgress(0);
      return;
    }
    setAppState('reporting');
    socket.emit('incident:report', { ...myLocation, isDrivable });
  };

  const handleClaim = (incidentId: string) => {
    socket.emit('incident:claim', incidentId, MOCK_DRIVER_ID);
  };

  const onConfirmArrival = () => {
    setDriverState('inspecting');
    x.set(0);
  };

  const capturePhoto = (side: InspectionPhoto['side']) => {
    setInspectionPhotos(prev => prev.map(p => 
      p.side === side ? { 
        ...p, 
        isCaptured: true, 
        timestamp: Date.now(), 
        location: { ...myLocation } 
      } : p
    ));
    setActiveCameraSide(null);
    setIsUploading(true);
    setTimeout(() => setIsUploading(false), 2000);

    // Auto-advance if it was the delivery photo
    if (side === 'Delivery') {
      setTimeout(() => {
        setDriverState('completed');
        socket.emit('incident:updateStatus', claimedByMe?.id, 'completed');
      }, 1000);
    }
  };

  const addTag = (side: InspectionPhoto['side'], e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xCoord = ((e.clientX - rect.left) / rect.width) * 100;
    const yCoord = ((e.clientY - rect.top) / rect.height) * 100;

    setInspectionPhotos(prev => prev.map(p => 
      p.side === side ? { 
        ...p, 
        pins: [...p.pins, { x: xCoord, y: yCoord, type: 'dent' }] 
      } : p
    ));
  };

  const capturedCount = inspectionPhotos.filter(p => p.isCaptured && !['VIN', 'Delivery'].includes(p.side)).length;
  const isSafetyUnlocked = capturedCount >= 3 && inspectionPhotos.find(p => p.side === 'VIN')?.isCaptured;

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-accent selection:text-black overflow-hidden flex flex-col border-[12px] border-card">
      {/* Global Header */}
      <header className="p-8 pb-4 flex justify-between items-end border-b border-line">
        <div className="flex flex-col">
          <h1 className="logo font-display text-5xl tracking-tighter text-accent leading-none uppercase italic">
            B-WARE
          </h1>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mt-1">
            Fleet Intelligence v2.4
          </span>
        </div>
        <div className="flex items-center gap-4">
           {isUploading && (
             <div className="flex items-center gap-2 bg-accent/20 px-3 py-1 rounded-full border border-accent/40">
                <div className="w-1.5 h-1.5 bg-accent rounded-full animate-ping" />
                <span className="text-[8px] font-black uppercase text-accent tracking-widest">Uploading Metadata...</span>
             </div>
           )}
           <div className="hidden md:flex items-center gap-2 bg-line/50 px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest text-text/80">
              <Siren className="w-3 h-3 text-accent" />
              Live Fleet Monitor
           </div>
        </div>
      </header>

      {/* App Panes */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-10 p-8 map-gradient overflow-y-auto">
        
        {/* REPORTER INTERFACE */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
             <span className="text-[11px] font-black uppercase tracking-[0.3em] text-muted">Reporter UX</span>
             <div className="flex-1 h-px bg-line" />
          </div>

          <div className="phone-mock relative bg-black border-[12px] border-[#18181b] rounded-[48px] h-[600px] shadow-2xl overflow-hidden flex flex-col font-body">
            {/* ... REPORTER CONTENT ... */}
            <div className="p-6 bg-card/80 backdrop-blur-md border-b border-line flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-dot" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-green-500">Location Secured</span>
                </div>
                <div className="text-sm font-bold truncate max-w-[200px] text-white/90">
                  {myLocation.address}
                </div>
              </div>
              <MapPin className="w-4 h-4 text-accent" />
            </div>

            <div className="flex-1 relative flex flex-col items-center justify-center p-8">
               <AnimatePresence mode="wait">
                 {appState === 'idle' && (
                   <motion.div key="idle" className="flex flex-col items-center gap-6">
                      <button 
                        onMouseDown={startHold} onTouchStart={startHold} onMouseUp={stopHold} onTouchEnd={stopHold}
                        className="relative w-52 h-52 rounded-full bg-accent text-black font-display text-2xl uppercase shadow-[0_0_60px_rgba(255,92,0,0.3)] flex items-center justify-center select-none active:scale-95 transition-transform"
                      >
                         <svg className="absolute inset-0 w-full h-full -rotate-90">
                            <circle cx="104" cy="104" r="100" fill="none" stroke="white" strokeWidth="8" strokeDasharray={`${holdProgress * 6.28} 1000`} className="opacity-30" />
                         </svg>
                         <span className="text-center font-black">Dispatch<br/>Assist</span>
                      </button>
                      <p className="text-[9px] font-black text-muted uppercase tracking-[0.3em] animate-pulse">Force-press for emergency help</p>
                   </motion.div>
                 )}

                 {appState === 'reporting' && (
                    <div className="flex flex-col items-center gap-10">
                       <div className="w-32 h-32 relative">
                          <div className="absolute inset-0 bg-accent rounded-full animate-radar" />
                          <div className="absolute inset-0 bg-accent rounded-full animate-radar [animation-delay:1s]" />
                          <div className="relative z-10 w-full h-full bg-card border-4 border-accent rounded-full flex items-center justify-center">
                             <Truck className="w-10 h-10 text-accent animate-bounce" />
                          </div>
                       </div>
                       <h3 className="text-xl font-display uppercase italic text-accent">Alerting Fleet...</h3>
                    </div>
                 )}

                 {appState === 'tracked' && (
                   <div className="space-y-8 text-center w-full">
                      <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-10 h-10 text-green-500" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-display uppercase tracking-tight text-white leading-none">HELP SECURED</h3>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Unit BT-502 Arrival: 4 min</p>
                      </div>
                   </div>
                 )}
               </AnimatePresence>
            </div>

            <div className="p-6 bg-card/40 border-t border-line/50">
               <div className="flex gap-2 mb-4">
                  {(['fender', 'totaled', 'medical'] as const).map(id => (
                    <button key={id} onClick={() => setCategory(id)} className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-1 ${category === id ? 'bg-accent text-black' : 'text-muted border border-line/40'}`}>
                      <span className="text-[8px] font-black uppercase">{id}</span>
                    </button>
                  ))}
               </div>
               
               <div className="flex gap-2 mb-4">
                  <button onClick={() => setIsDrivable(true)} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg border transition-all ${isDrivable === true ? 'bg-white text-black border-white' : 'text-muted border-line/40'}`}>Drivable</button>
                  <button onClick={() => setIsDrivable(false)} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg border transition-all ${isDrivable === false ? 'bg-red-500 text-white border-red-500 font-bold' : 'text-muted border-line/40'}`}>Not Drivable</button>
               </div>

               <div className="flex justify-center text-[9px] font-bold text-muted uppercase tracking-widest opacity-40">Privacy Protected Platform</div>
            </div>
          </div>
        </section>

        {/* DRIVER INTERFACE */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
             <span className="text-[11px] font-black uppercase tracking-[0.3em] text-muted">Mission Control</span>
             <div className="flex-1 h-px bg-line" />
          </div>

          <div className="phone-mock relative bg-black border-[12px] border-[#18181b] rounded-[48px] h-[600px] shadow-2xl overflow-hidden flex flex-col font-body">
            
            {/* ALERTING MONITOR OVERLAY */}
            <AnimatePresence>
              {driverState === 'alerting' && activeIncident && (
                <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="absolute inset-0 z-50 bg-bg p-6 flex flex-col">
                   <div className="flex-1 flex flex-col gap-6">
                      <div className="flex justify-between items-center border-b border-line pb-4">
                        <h3 className="text-2xl font-display uppercase italic tracking-tighter text-accent">New Dispatch Info</h3>
                        <span className="bg-accent text-black px-3 py-1 font-display text-sm italic">{alertCountdown}s</span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Reporting Site</div>
                        <div className="text-2xl font-display text-white italic tracking-tighter leading-none">{activeIncident.location.address}</div>
                      </div>

                      <div className="bg-orange-600/20 p-5 rounded-2xl border-2 border-orange-600/40 flex items-center justify-between shadow-[0_0_40px_rgba(234,88,12,0.15)]">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-orange-500 uppercase tracking-[0.3em] mb-1">Vehicle Match</span>
                          <div className="text-lg font-display text-white italic tracking-tighter leading-tight uppercase">{activeIncident.vehicleDescription}</div>
                          <div className="text-[10px] font-black text-orange-500 uppercase mt-1">Status: {activeIncident.vehicleType} REQUIRED</div>
                        </div>
                        <Truck className="w-10 h-10 text-orange-600/60" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                         <div className="glass-card p-4 bg-white/5 border border-line rounded-xl">
                            <div className="text-[9px] font-black text-muted uppercase mb-1">Est. Payout</div>
                            <div className="text-xl font-display text-white italic tracking-tighter leading-none">${activeIncident.payout} <span className="text-[10px] opacity-40">+ Mi</span></div>
                         </div>
                         <div className="glass-card p-4 bg-white/5 border border-line rounded-xl">
                            <div className="text-[9px] font-black text-muted uppercase mb-1">Proximity</div>
                            <div className="text-xl font-display text-white italic tracking-tighter leading-none">1.2 Mi</div>
                         </div>
                      </div>
                   </div>
                   
                   <div className="mt-8 space-y-4">
                      {/* SLIDE TO ACCEPT MONITOR */}
                      <div className="relative h-20 w-full bg-orange-600/10 rounded-full border-2 border-orange-600/30 overflow-hidden flex items-center p-1.5 shadow-[0_0_30px_rgba(234,88,12,0.2)]">
                         <motion.div 
                          drag="x"
                          dragConstraints={{ left: 0, right: 280 }}
                          onDragEnd={() => {
                             if (acceptX.get() > 140) {
                               handleClaim(activeIncident.id);
                             }
                             acceptX.set(0);
                          }}
                          style={{ x: acceptX, opacity: acceptOpacity }}
                          className="absolute z-20 w-[160px] h-[68px] bg-orange-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(234,88,12,0.4)] cursor-grab active:cursor-grabbing"
                         >
                            <span className="text-[12px] font-black text-black uppercase tracking-widest flex items-center gap-1 font-display mt-1">
                              Slide Accept <ChevronRight className="w-4 h-4" />
                            </span>
                         </motion.div>
                         <div className="w-full text-center text-[11px] font-black text-orange-500 uppercase tracking-[0.4em] z-10 select-none ml-20 animate-pulse">
                            Secure Asset
                         </div>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setDriverState('idle');
                          setActiveIncident(null);
                          stopAlertCountdown();
                        }}
                        className="w-full text-[10px] font-black text-muted uppercase tracking-[0.3em] flex items-center justify-center gap-2"
                      >
                         <X className="w-3 h-3" /> Decline Priority Job
                      </button>
                   </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* CONCURRENCY OVERLAY */}
            <AnimatePresence>
               {showJobTaken && (
                 <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-xl flex items-center justify-center p-12 text-center">
                    <div className="space-y-4">
                       <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
                       <h2 className="text-2xl font-display uppercase italic text-white tracking-tighter">Job Locked</h2>
                       <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Another unit accepted first. Returning to patrol.</p>
                    </div>
                 </div>
               )}
            </AnimatePresence>

            {/* INSPECTION VIEW OVERLAY */}
            <AnimatePresence>
               {driverState === 'inspecting' && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-40 bg-bg p-6 flex flex-col">
                    <div className="mb-6 flex items-center justify-between">
                       <h3 className="text-xl font-display uppercase italic tracking-tighter text-accent">Condition Report</h3>
                       <div className="text-[9px] font-black text-muted uppercase">
                          {capturedCount}/4 Body • {inspectionPhotos.find(p => p.side === 'VIN')?.isCaptured ? '1' : '0'}/1 VIN
                       </div>
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-3 overflow-y-auto pr-2 custom-scrollbar">
                       {inspectionPhotos.filter(p => p.side !== 'Delivery').map(photo => (
                         <div key={photo.side} className="relative group">
                            <button 
                              onClick={() => photo.isCaptured ? null : setActiveCameraSide(photo.side)}
                              className={`w-full aspect-video rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all overflow-hidden ${photo.isCaptured ? 'border-green-500 bg-green-500/5' : 'border-line/40 hover:border-accent bg-card/50'}`}
                            >
                               {photo.isCaptured ? (
                                  <div className="relative w-full h-full" onClick={(e) => photo.side !== 'VIN' && addTag(photo.side, e)}>
                                     <div className="absolute inset-0 flex items-center justify-center opacity-30 grayscale pointer-events-none">
                                        <Truck className="w-12 h-12" />
                                     </div>
                                     <div className="absolute top-2 left-2 bg-green-500 text-black px-2 py-0.5 rounded text-[8px] font-black uppercase leading-none mt-1">{photo.side}</div>
                                     {photo.pins.map((pin, i) => (
                                        <div key={i} className="absolute w-3 h-3 bg-red-500 rounded-full border border-white shadow-lg pointer-events-none" style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%, -50%)' }} />
                                     ))}
                                  </div>
                               ) : (
                                  <>
                                    <Camera className="w-5 h-5 text-muted" />
                                    <span className="text-[9px] font-black text-muted uppercase tracking-widest">{photo.side}</span>
                                  </>
                               )}
                            </button>
                            {photo.isCaptured && (
                               <button onClick={() => setInspectionPhotos(prev => prev.map(p => p.side === photo.side ? {...p, isCaptured: false, pins: []} : p))} className="absolute -top-1 -right-1 bg-black p-1.5 rounded-full border border-line z-10">
                                  <X className="w-3 h-3 text-muted" />
                               </button>
                            )}
                         </div>
                       ))}
                    </div>

                    <div className="mt-6 space-y-4">
                       <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                             <span className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Badge #</span>
                             <input 
                               value={policeBadge}
                               onChange={(e) => setPoliceBadge(e.target.value)}
                               placeholder="Badge ID"
                               className="w-full bg-black border border-line rounded-lg px-3 py-2 text-xs focus:border-accent outline-none"
                             />
                          </div>
                          <div className="space-y-1">
                             <span className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Case #</span>
                             <input 
                               value={caseNumber}
                               onChange={(e) => setCaseNumber(e.target.value)}
                               placeholder="Incident ID"
                               className="w-full bg-black border border-line rounded-lg px-3 py-2 text-xs focus:border-accent outline-none"
                             />
                          </div>
                       </div>
                       <p className="text-[9px] font-bold text-muted uppercase text-center tracking-widest leading-relaxed">
                          Secure scene metadata. AI extraction active for Plate/VIN.
                       </p>
                       <button 
                        disabled={!isSafetyUnlocked}
                        onClick={() => {
                          setDriverState('towing');
                          socket.emit('incident:updateStatus', claimedByMe?.id, { status: 'towing', policeInfo: { badgeNumber: policeBadge, caseNumber } });
                        }}
                        className={`w-full py-5 rounded-2xl font-display text-lg uppercase tracking-widest transition-all ${isSafetyUnlocked ? 'bg-accent text-black shadow-glow font-black italic' : 'bg-card text-muted cursor-not-allowed opacity-50'}`}
                       >
                          {isSafetyUnlocked ? 'Confirm Towing' : 'Safety Lock: Missing Snaps'}
                       </button>
                    </div>
                 </motion.div>
               )}
            </AnimatePresence>

            {/* CAMERA MODE OVERLAY */}
            <AnimatePresence>
                {activeCameraSide && (
                  <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="absolute inset-0 z-50 bg-black flex flex-col p-6">
                      <div className="flex items-center justify-between">
                         <button onClick={() => setActiveCameraSide(null)} className="p-3 bg-white/10 rounded-full"><ChevronLeft className="w-5 h-5" /></button>
                         <span className="text-xl font-display uppercase tracking-tighter italic text-accent">{activeCameraSide} Snapshot</span>
                         <div className="w-12 h-12" />
                      </div>

                      <div className="flex-1 relative my-8 border-2 border-dashed border-white/20 rounded-3xl flex items-center justify-center overflow-hidden">
                         {/* DYNAMIC CAMERA OVERLAY */}
                         {['Front', 'Back', 'Left', 'Right'].includes(activeCameraSide) ? (
                            <svg width="240" height="120" viewBox="0 0 240 120" className="opacity-40 animate-pulse text-white fill-none stroke-current" strokeWidth="2">
                               <path d="M40,80 L20,80 L20,40 L40,40 L60,20 L180,20 L200,40 L220,40 L220,80 L200,80" />
                               <circle cx="60" cy="90" r="15" />
                               <circle cx="180" cy="90" r="15" />
                            </svg>
                         ) : activeCameraSide === 'VIN' ? (
                            <div className="relative w-72 h-40 border border-accent/40 bg-accent/5 rounded-lg flex flex-col items-center justify-center">
                               <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-accent" />
                               <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-accent" />
                               <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-accent" />
                               <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-accent" />
                               <div className="w-full h-px bg-accent/20 animate-[scan_2s_linear_infinite]" />
                               <span className="text-[10px] font-black text-accent uppercase tracking-widest mt-4">Frame VIN / Plate</span>
                            </div>
                         ) : (
                            <div className="flex flex-col items-center gap-4 opacity-40">
                               <CheckCircle2 className="w-16 h-16 text-white" />
                               <span className="text-[10px] font-black uppercase text-white tracking-[0.4em]">Proof of Delivery</span>
                            </div>
                         )}

                         <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {!['VIN', 'Delivery'].includes(activeCameraSide) && <span className="text-[10px] font-black uppercase text-white tracking-[0.4em] opacity-40">Align {activeCameraSide} in Frame</span>}
                         </div>
                         <div className="absolute top-4 right-4 bg-accent/20 border border-accent/40 rounded px-2 py-1 text-[8px] font-black text-accent uppercase tracking-widest italic">2026-04-18 / TAMPER-PROOF</div>
                      </div>

                      <button onClick={() => capturePhoto(activeCameraSide)} className="w-24 h-24 bg-white rounded-full border-8 border-white/30 self-center active:scale-95 transition-transform" />
                      <div className="text-center mt-6 text-[10px] font-black text-muted uppercase tracking-widest">Tap to snap metadata valid image</div>
                  </motion.div>
                )}
            </AnimatePresence>

            {/* BASE MAP LAYER */}
            <div className="flex-1 bg-[#0a0a0c] relative">
               <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
               {driverState === 'en_route' && (
                 <div className="absolute inset-x-0 top-0 p-6 z-20">
                    <div className="bg-card/90 backdrop-blur border border-line p-4 rounded-2xl flex items-center justify-between shadow-2xl">
                       <div className="flex items-center gap-3">
                          <Truck className="w-6 h-6 text-accent" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-accent uppercase tracking-widest">Navigating</span>
                            <span className="text-xs font-bold">5m 20s • 2.1 mi</span>
                          </div>
                       </div>
                       <button className="p-3 bg-white/5 border border-line rounded-xl"><Phone className="w-4 h-4" /></button>
                    </div>
                 </div>
               )}
            </div>

            {/* DASHBOARD SHEET */}
            <div className="bg-card border-t border-line/50 p-6">
                <AnimatePresence mode="wait">
                   {driverState === 'idle' && (
                     <div className="flex flex-col items-center justify-center opacity-40 py-6 gap-2">
                        <Truck className="w-10 h-10 text-muted" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">Sector Active</span>
                     </div>
                   )}
                   {driverState === 'en_route' && claimedByMe && (
                      <div className="space-y-6">
                         <div className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-line">
                            <div className="flex flex-col">
                               <span className="text-[9px] font-black text-muted uppercase mb-1">On-Site Reporter</span>
                               <span className="text-sm font-bold uppercase italic">{claimedByMe.reporterName} • {claimedByMe.vehicleDescription}</span>
                            </div>
                            <Truck className="w-5 h-5 text-accent" />
                         </div>
                         <div className="relative h-16 bg-black/60 rounded-full border border-line flex items-center p-1 overflow-hidden">
                            <motion.div 
                              drag="x" dragConstraints={{ left: 0, right: 280 }}
                              onDragEnd={(_, info) => info.offset.x > confirmThreshold ? onConfirmArrival() : x.set(0)}
                              style={{ x, opacity }} className="absolute z-20 w-32 h-14 bg-accent rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-glow"
                            >
                               <span className="text-[10px] font-black text-black uppercase tracking-widest flex items-center gap-1 leading-none mt-1">Arrival <ChevronRight className="w-4 h-4" /></span>
                            </motion.div>
                            <span className="w-full text-center text-[10px] font-black text-muted uppercase tracking-widest px-32 select-none">Slide to Arrive</span>
                         </div>
                      </div>
                   )}
                   {driverState === 'towing' && claimedByMe && (
                      <div className="text-center space-y-6 py-4">
                         <div className="relative flex justify-center">
                            <Truck className="w-16 h-16 text-accent animate-pulse" />
                            <motion.div animate={{ x: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute -bottom-2">
                               <div className="w-12 h-1 bg-accent/20 rounded-full blur-sm" />
                            </motion.div>
                         </div>
                         <div className="space-y-1">
                            <h3 className="text-2xl font-display uppercase italic tracking-tighter text-white">Transit Active</h3>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest">En Route to Destination</p>
                         </div>
                         <div className="bg-black/40 p-4 rounded-xl border border-line flex items-center justify-between mx-4">
                            <div className="text-left">
                               <div className="text-[8px] font-black text-muted uppercase">Payout Tracker</div>
                               <div className="text-xl font-display text-accent tracking-tighter">${claimedByMe.payout} <span className="text-[10px] opacity-50">+ $4.20 / mi</span></div>
                            </div>
                            <button 
                              onClick={() => {
                                setDriverState('delivering');
                                socket.emit('incident:updateStatus', claimedByMe.id, 'delivering');
                              }}
                              className="bg-accent text-black px-4 py-2 rounded-lg font-display text-xs uppercase italic"
                            >
                               Arrived Drop-off
                            </button>
                         </div>
                      </div>
                   )}

                   {driverState === 'delivering' && (
                      <div className="text-center space-y-6 py-4">
                         <div className="flex justify-center text-accent"><CheckCircle2 className="w-16 h-16" /></div>
                         <div className="space-y-1">
                            <h3 className="text-2xl font-display uppercase italic tracking-tighter text-white">SAFE ARRIVAL</h3>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Mandatory Drop-off photo</p>
                         </div>
                         <button 
                            onClick={() => setActiveCameraSide('Delivery')}
                            className="w-full bg-accent text-black py-5 rounded-2xl font-display text-lg uppercase shadow-glow"
                         >
                            Take Delivery Photo
                         </button>
                      </div>
                   )}

                   {driverState === 'completed' && claimedByMe && (
                      <div className="flex-1 flex flex-col p-4 custom-scrollbar overflow-y-auto">
                         <div className="text-center mb-6">
                            <div className="inline-block bg-accent/20 border border-accent/40 px-3 py-1 rounded text-[10px] font-black text-accent uppercase tracking-[0.3em] mb-2 italic">Official Record</div>
                            <h3 className="text-2xl font-display uppercase italic tracking-tighter text-white">Tow-Sync Receipt</h3>
                            <p className="text-[9px] font-bold text-muted uppercase tracking-widest">Completed: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                         </div>

                         <div className="space-y-4">
                            <div className="glass-card p-4 space-y-3">
                               <div className="flex justify-between items-start">
                                  <div>
                                     <div className="text-[8px] font-black text-muted uppercase tracking-tighter">Assigned Destination</div>
                                     <div className="text-sm font-bold text-white uppercase italic">{claimedByMe.destination || "Not Specified"}</div>
                                  </div>
                                  <FileText className="w-5 h-5 text-accent" />
                               </div>
                               <div className="h-px bg-line w-full" />
                               <div className="grid grid-cols-2 gap-4">
                                  <div>
                                     <div className="text-[8px] font-black text-muted uppercase">Payout</div>
                                     <div className="text-lg font-display text-accent tracking-tighter">${claimedByMe.payout}</div>
                                  </div>
                                  <div>
                                     <div className="text-[8px] font-black text-muted uppercase">Fleet ID</div>
                                     <div className="text-lg font-display text-white tracking-tighter">BT-502</div>
                                  </div>
                               </div>
                            </div>

                            <div className="space-y-2">
                               <span className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Pre-Tow Gallery</span>
                               <div className="flex gap-2 p-1 overflow-x-auto custom-scrollbar pb-2">
                                  {inspectionPhotos.filter(p => !['VIN', 'Delivery'].includes(p.side)).map(p => (
                                     <div key={p.side} className="relative flex-shrink-0 w-24 aspect-video bg-card border border-line rounded-lg overflow-hidden grayscale-(50)">
                                        <div className="absolute inset-0 flex items-center justify-center opacity-20"><Camera className="w-5 h-5" /></div>
                                        <div className="absolute top-1 left-1 bg-black/60 text-[6px] font-black text-white px-1 rounded uppercase tracking-[0.1em]">{p.side}</div>
                                     </div>
                                  ))}
                               </div>
                            </div>

                            <div className="glass-card p-4 space-y-3 border-accent/20 bg-accent/5">
                               <div className="flex items-center gap-2 mb-2">
                                  <PenTool className="w-4 h-4 text-accent" />
                                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">Manager / Owner Auth</span>
                               </div>
                               <SignaturePad onSave={setSignature} />
                               <p className="text-[8px] font-bold text-muted uppercase text-center">Digitally signed record of delivery</p>
                            </div>
                         </div>

                         <div className="mt-8 grid grid-cols-1 gap-3">
                            <button className="w-full bg-accent text-black py-5 rounded-2xl font-display text-lg uppercase tracking-widest shadow-glow flex items-center justify-center gap-3 active:scale-95 transition-all">
                               <Mail className="w-5 h-5" /> Send Digital Receipt
                            </button>
                            <button 
                               onClick={() => { setDriverState('idle'); setClaimedByMe(null); setInspectionPhotos(CAR_SIDES.map(side => ({ id: side, side, timestamp: 0, location: { lat: 0, lng: 0 }, pins: [], isCaptured: false }))); setSignature(''); }} 
                               className="w-full py-3 text-[10px] font-black text-muted uppercase tracking-[0.4em]"
                            >
                               Return to Patrol
                            </button>
                         </div>
                      </div>
                   )}
                </AnimatePresence>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-10 py-6 border-t border-line grid grid-cols-2 md:grid-cols-4 gap-8 bg-card/10">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black text-muted uppercase tracking-widest italic decoration-accent/40 underline underline-offset-4">Legal Protocol</span>
          <span className="text-xs font-bold text-white/80">Documentation Mandatory</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black text-muted uppercase tracking-widest italic decoration-accent/40 underline underline-offset-4">Security</span>
          <span className="text-xs font-bold text-white/80">Metadata Tamper-Proof</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black text-muted uppercase tracking-widest italic decoration-accent/40 underline underline-offset-4">Fleet</span>
          <span className="text-xs font-bold text-white/80">{drivers.length} Units Online</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black text-muted uppercase tracking-widest italic decoration-accent/40 underline underline-offset-4">Status</span>
          <span className="text-xs font-bold text-white/80">System Optimized</span>
        </div>
      </footer>
    </div>
  );
}
