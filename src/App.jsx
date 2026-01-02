import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  signInAnonymously
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  onSnapshot, 
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { 
  Plus, 
  Printer, 
  Trash2, 
  ChevronLeft, 
  MapPin, 
  Calendar as CalendarIcon,
  User, 
  Plane, 
  FileText,
  PenTool,
  X,
  Link as LinkIcon,
  Save, 
  Loader2, 
  LogOut, 
  Shield, 
  Maximize, 
  Play, 
  Square, 
  Phone, 
  QrCode, 
  Check, 
  Clock, 
  Users,
  LayoutGrid,
  Map as MapIcon,
  ExternalLink,
  Info,
  AlertCircle,
  Wrench,
  BatteryCharging,
  ChevronRight,
  Wind,
  Thermometer,
  CloudSun
} from 'lucide-react';

// --- 1. CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDFFj87UudgUlxbmt1gdi2iRj_rZQTeu1k",
  authDomain: "aerothau-manager.firebaseapp.com",
  projectId: "aerothau-manager",
  storageBucket: "aerothau-manager.firebasestorage.app",
  messagingSenderId: "435855047920",
  appId: "1:435855047920:web:7544e4fbbfd4bdcabe5635"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const LOGO_URL = "logo.png"; 

// --- CONSTANTES MÉTIER ---
const SCENARIO_INFOS = {
    'A1': { title: "Open A1", description: "Survol de personnes isolées possible (pas de rassemblement).", zet: "ZET: Éviter le survol. Pas de distance minimale." },
    'A2': { title: "Open A2", description: "Vol proximité personnes.", zet: "ZET: 30m des tiers (5m si lent)." },
    'A3': { title: "Open A3", description: "Vol hors zones habitées.", zet: "ZET: > 150m zones urbaines. Aucun tiers." },
    'STS-01': { title: "Spécifique STS-01", description: "VLOS zone peuplée.", zet: "Zone contrôlée au sol. Rayon = Hauteur." },
    'STS-02': { title: "Spécifique STS-02", description: "BVLOS hors zone peuplée.", zet: "Zone tampon 30m min autour emprise." },
};

const MISSION_TYPES = ['Inspection Technique', 'Photogrammétrie', 'Audiovisuel', 'Nettoyage (AirFlyClean)', 'Relevé Lidars', 'Thermographie'];

const BASE_CHECKLIST = [
  {k:'meteo',l:'Météo / Vent ok'}, {k:'zet',l:'Balisage ZET'}, {k:'auth',l:'Protocoles / Autorisations'}, 
  {k:'notam',l:'NOTAM / Geoportail'}, {k:'drone_state',l:'État mécanique'}, {k:'batteries',l:'Batteries'}, 
  {k:'sd_card',l:'Carte SD'}, {k:'rtn',l:'Point RTH'}
];

const SPECIFIC_CHECKLISTS = {
  'Relevé Lidars': [{k:'imu_warmup',l:'Chauffe IMU (3 min)'}, {k:'gnss_fix',l:'Fix RTK stable'}],
  'Inspection Technique': [{k:'sensor_calib',l:'Calibration nacelle/capteur'}, {k:'obs_check',l:'Distance sécurité obstacle'}],
  'Photogrammétrie': [{k:'overlap',l:'Taux recouvrement réglé'}, {k:'gcp',l:'Cibles de calage posées'}],
  'Nettoyage (AirFlyClean)': [{k:'hose',l:'Tuyau raccordé/pression'}, {k:'area_sec',l:'Protection projections tiers'}],
};

// --- FONCTIONS UTILITAIRES ---
const calculateDuration = (start, end) => {
  if (!start || !end) return 0;
  try {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const d1 = new Date(0, 0, 0, h1, m1);
    const d2 = new Date(0, 0, 0, h2, m2);
    let diff = d2 - d1;
    if (diff < 0) diff += 86400000;
    return diff / 60000;
  } catch(e) { return 0; }
};

const formatDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h > 0 ? h + 'h ' : ''}${m}m`;
};

const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

// --- COMPOSANT : CARTE SATELLITE ---
const MapView = ({ location }) => {
  const mapUrl = useMemo(() => {
    if (!location) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed&t=k`;
  }, [location]);

  if (!location) return (
    <div className="h-48 bg-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 print:hidden">
      <MapIcon size={32} className="mb-2 opacity-20"/>
      <p className="text-[10px] font-black uppercase tracking-widest text-center px-4">Localisation requise pour la carte</p>
    </div>
  );

  return (
    <div className="h-64 rounded-[32px] overflow-hidden border-4 border-white shadow-xl bg-slate-200 relative animate-in fade-in print:h-48 print:shadow-none print:border-slate-200">
      <iframe title="Map" width="100%" height="100%" frameBorder="0" src={mapUrl} allowFullScreen></iframe>
      <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-md text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest print:hidden">Vue Satellite</div>
    </div>
  );
};

// --- COMPOSANT : SIGNATURE ---
const SignaturePad = ({ title, onSave, savedData }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!savedData);

  useEffect(() => {
    if (savedData && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
      img.src = savedData;
    }
  }, [savedData]);

  const getCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getCoords(e);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 3; ctx.strokeStyle = "#0f172a"; ctx.lineCap = "round";
    setIsDrawing(true); setIsEmpty(false);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y); ctx.stroke();
  };

  const clear = () => {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0,0,600,300);
      onSave(null);
      setIsEmpty(true);
  };

  return (
    <div className="border border-slate-200 rounded-[32px] p-6 bg-white shadow-sm print:shadow-none print:border-slate-300">
      <div className="flex justify-between items-center mb-3">
        <label className="text-[10px] font-black uppercase text-slate-400">{title}</label>
        <button onClick={clear} className="text-[10px] text-red-500 font-black print:hidden">EFFACER</button>
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-[24px] bg-slate-50 h-32 md:h-40 w-full touch-none overflow-hidden group print:bg-white print:border-slate-300">
        {savedData ? <img src={savedData} className="w-full h-full object-contain" alt="sign" /> : (
          <canvas ref={canvasRef} width={600} height={300} className="w-full h-full cursor-crosshair print:hidden" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => {setIsDrawing(false); onSave(canvasRef.current.toDataURL());}} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={() => {setIsDrawing(false); onSave(canvasRef.current.toDataURL());}} />
        )}
        {isEmpty && !savedData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest">Signer ici</div>}
      </div>
    </div>
  );
};

// --- COMPOSANT : COCKPIT TERRAIN ---
const FieldModeView = ({ mission, onExit, onUpdate }) => {
    const [isFlying, setIsFlying] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [startTime, setStartTime] = useState(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (isFlying) {
            timerRef.current = setInterval(() => {
                setElapsed(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isFlying, startTime]);

    const handleFlight = () => {
        if (!isFlying) {
            setStartTime(Date.now());
            setIsFlying(true);
            setElapsed(0);
        } else {
            setIsFlying(false);
            const startStr = new Date(startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const endStr = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const battery = prompt("Batterie restante (%) ?") || "0";
            onUpdate('logs', [...(mission.logs || []), { id: Date.now(), start: startStr, end: endStr, battery, notes: 'Vol Terrain' }]);
        }
    };

    const activeChecks = [...BASE_CHECKLIST, ...(SPECIFIC_CHECKLISTS[mission.type] || [])];
    const checkedCount = Object.values(mission.checklist || {}).filter(Boolean).length;
    const progress = Math.round((checkedCount / Math.max(activeChecks.length, 1)) * 100);

    return (
        <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col p-4 overflow-y-auto animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onExit} className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg active:scale-90 transition-transform"><ChevronLeft size={24}/></button>
                <div className="text-center">
                    <h2 className="text-emerald-400 font-black tracking-tighter text-xl uppercase leading-none">Cockpit Terrain</h2>
                    <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase">{mission.ref}</p>
                </div>
                <div className="w-12"></div>
            </div>

            <div className="flex-1 space-y-6 pb-20 max-w-lg mx-auto w-full">
                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 text-center shadow-2xl">
                    <div className="text-[10px] font-black text-slate-500 uppercase mb-2">Chronomètre de Vol</div>
                    <div className="text-7xl font-mono font-black mb-10 tabular-nums text-white tracking-tighter">{formatTimer(elapsed)}</div>
                    <button onClick={handleFlight} className={`w-full py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 transition-all active:scale-95 ${isFlying ? 'bg-red-600 animate-pulse' : 'bg-emerald-600 shadow-emerald-900/40 shadow-xl'}`}>
                        {isFlying ? <><Square fill="currentColor" size={24}/> ATTERRIR</> : <><Play fill="currentColor" size={24}/> DÉCOLLER</>}
                    </button>
                </div>

                <div className="space-y-3">
                    {(mission.contacts || []).map((c, i) => (
                        <a key={i} href={`tel:${c.phone}`} className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-3xl flex justify-between items-center active:bg-blue-600/30">
                            <div>
                                <div className="font-black text-blue-100 uppercase text-xs">{c.name}</div>
                                <div className="text-[10px] text-blue-400 font-bold uppercase">{c.role}</div>
                            </div>
                            <div className="bg-blue-600 p-3 rounded-full text-white"><Phone size={20}/></div>
                        </a>
                    ))}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                    <div className="flex justify-between mb-2 text-[10px] font-black uppercase">
                        <span className="text-slate-500">Checklist Sécurité</span>
                        <span className={progress === 100 ? 'text-emerald-400' : 'text-orange-400'}>{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{width: `${progress}%`}}></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- COMPOSANT PRINCIPAL : APP ---
export default function App() {
  const [user, setUser] = useState(null);
  const [missions, setMissions] = useState([]);
  const [currentMission, setCurrentMission] = useState(null);
  const [view, setView] = useState('list'); // 'list', 'calendar', 'edit'
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [isFieldMode, setIsFieldMode] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, 'users', user.uid, 'missions')), s => {
        setMissions(s.docs.map(d => ({id: d.id, ...d.data()})));
    });
    return () => unsub();
  }, [user]);

  const handleUpdate = async (f, v) => {
    if (!currentMission) return;
    const updated = { ...currentMission, [f]: v };
    setCurrentMission(updated);
    await updateDoc(doc(db, 'users', user.uid, 'missions', currentMission.id), { [f]: v });
  };

  const handleCreate = async () => {
    const m = { 
        ref: `ATH-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
        date: new Date().toISOString().split('T')[0], title: '', client: '', location: '', type: 'Inspection Technique', 
        category: 'Open', scenario: 'A3', checklist: {}, contacts: [], logs: [], documents: [], 
        flightNotes: '', techNotes: '', meteoVent: '', meteoTemp: '', meteoKP: '', createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'users', user.uid, 'missions'), m);
    setCurrentMission({ id: docRef.id, ...m }); setView('edit'); setActiveTab('general');
  };

  const activeChecklistItems = currentMission ? [...BASE_CHECKLIST, ...(SPECIFIC_CHECKLISTS[currentMission.type] || [])] : [];
  const checkedCount = currentMission ? Object.values(currentMission.checklist || {}).filter(Boolean).length : 0;
  const safetyScore = Math.round((checkedCount / Math.max(activeChecklistItems.length, 1)) * 100);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-sky-500" /></div>;
  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-screen font-sans text-slate-800 bg-slate-50 pb-20 print:bg-white print:pb-0">
      <nav className="sticky top-0 z-50 shadow-xl border-b border-slate-700 px-4 md:px-8 py-4 flex justify-between items-center bg-slate-900 text-white print:hidden">
        <div className="flex items-center gap-5">
          {view !== 'list' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all"><ChevronLeft size={24} /></button>}
          <img src={LOGO_URL} alt="Logo" className="h-10 brightness-0 invert object-contain" onError={(e) => { e.target.style.display='none'; }} /> 
          <span className="font-black text-2xl tracking-tighter uppercase">Aerothau</span>
        </div>
        <div className="flex gap-2">
          {view === 'list' && (
            <>
              <button onClick={() => setView('calendar')} className="p-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-white"><CalendarIcon size={22}/></button>
              <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl transition-all active:scale-95"><Plus size={20}/> Mission</button>
            </>
          )}
          {view === 'edit' && (
              <div className="flex gap-2">
                  <button onClick={() => window.print()} className="bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 border border-slate-700"><Printer size={18}/> Imprimer</button>
                  <button onClick={()=>setIsFieldMode(true)} className="bg-orange-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-lg"><Maximize size={20}/> Cockpit</button>
              </div>
          )}
          <button onClick={()=>signOut(auth)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:bg-red-900/40 print:hidden"><LogOut size={22}/></button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8 print:p-0">
        {view === 'list' && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in">
                {missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} className="bg-white p-8 rounded-[48px] shadow-sm hover:shadow-2xl transition-all cursor-pointer border border-slate-100 group relative overflow-hidden">
                    <div className="flex justify-between mb-5">
                      <span className="text-[10px] font-black tracking-widest bg-slate-50 text-slate-400 px-4 py-1.5 rounded-full border border-slate-100 uppercase">{m.ref}</span>
                      <span className="text-[9px] font-black uppercase text-sky-600 px-3 py-1 bg-sky-50 rounded-full">{m.scenario}</span>
                    </div>
                    <h3 className="font-black text-2xl text-slate-900 mb-2 uppercase leading-tight">{m.title || m.client || "Nouvelle Mission"}</h3>
                    <p className="text-xs text-slate-500 font-bold flex items-center gap-2 uppercase"><MapPin size={16} className="text-slate-300"/>{m.location || "Lieu non défini"}</p>
                </div>
                ))}
            </div>
        )}

        {view === 'calendar' && (
          <div className="bg-white p-10 rounded-[56px] shadow-xl border border-slate-200 animate-in zoom-in-95 print:hidden">
            <div className="flex justify-between items-center mb-10">
                <h2 className="text-3xl font-black uppercase tracking-tighter">Planning Missions</h2>
                <button onClick={() => setView('list')} className="text-sky-600 font-black text-xs uppercase flex items-center gap-2 hover:bg-sky-50 px-4 py-2 rounded-xl transition-all"><ChevronLeft size={16}/> Retour Menu</button>
            </div>
            <div className="space-y-4">
              {missions.length > 0 ? missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} className="flex items-center gap-8 p-6 hover:bg-slate-50 rounded-[40px] transition-all cursor-pointer border-2 border-transparent hover:border-slate-100 group">
                  <div className="bg-sky-100 text-sky-600 w-20 h-20 rounded-[28px] flex flex-col items-center justify-center font-black">
                    <span className="text-[10px] uppercase">{new Date(m.date).toLocaleDateString('fr-FR', {month:'short'})}</span>
                    <span className="text-2xl leading-none">{new Date(m.date).getDate()}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-xl text-slate-900 uppercase leading-tight">{m.title || m.client || "Sans titre"}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{m.location}</p>
                  </div>
                  <ChevronRight size={28} className="text-slate-200 group-hover:text-sky-400 group-hover:translate-x-2 transition-all"/>
                </div>
              )) : <p className="text-center py-20 text-slate-400 uppercase font-black text-xs tracking-widest">Aucune mission planifiée</p>}
            </div>
          </div>
        )}

        {view === 'edit' && currentMission && (
            <div className="bg-white rounded-[56px] shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:rounded-none">
                <div className="flex border-b border-slate-100 bg-slate-50 px-8 gap-8 sticky top-0 z-10 overflow-x-auto print:hidden">
                    {['general', 'technical', 'check', 'flight', 'sign'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`py-6 text-[10px] font-black uppercase tracking-widest relative whitespace-nowrap ${activeTab === t ? 'text-sky-600' : 'text-slate-400'}`}>
                            {t === 'general' ? 'Informations' : t === 'technical' ? 'Opérations' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                            {activeTab === t && <div className="absolute bottom-0 left-0 w-full h-1 bg-sky-600 rounded-full"></div>}
                        </button>
                    ))}
                </div>
                
                <div className="p-8 md:p-14 print:p-0">
                    {/* EN-TETE IMPRESSION */}
                    <div className="hidden print:flex justify-between items-center border-b-4 border-slate-900 pb-8 mb-10">
                        <div>
                            <h1 className="text-4xl font-black uppercase tracking-tighter">Fiche d'intervention</h1>
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm mt-1">Référence : {currentMission.ref}</p>
                        </div>
                        <img src={LOGO_URL} className="h-16 object-contain" alt="Logo" />
                    </div>

                    {(activeTab === 'general' || window.matchMedia('print').matches) && (
                        <div className="space-y-12">
                            <div className="grid md:grid-cols-2 gap-12 items-start print:grid-cols-2">
                                <div className="space-y-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Titre de la mission</label>
                                        <input className="w-full border-2 border-slate-100 p-6 rounded-[32px] bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-black text-3xl text-slate-900 transition-all print:border-none print:p-0 print:bg-white print:text-2xl" value={currentMission.title || ''} onChange={e => handleUpdate('title', e.target.value)} />
                                        <input className="w-full border-2 border-slate-100 p-5 rounded-2xl bg-slate-50 outline-none font-bold text-slate-700 print:border-none print:p-0 print:bg-white" placeholder="Client" value={currentMission.client || ''} onChange={e => handleUpdate('client', e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date d'opération</label>
                                            <input type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold print:border-none print:p-0" value={currentMission.date || ''} onChange={e => handleUpdate('date', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type</label>
                                            <select className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold print:appearance-none print:border-none print:p-0" value={currentMission.type || ''} onChange={e => handleUpdate('type', e.target.value)}>
                                                {MISSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Localisation</label>
                                        <input className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold print:border-none print:p-0" value={currentMission.location || ''} onChange={e => handleUpdate('location', e.target.value)} />
                                    </div>
                                </div>
                                <MapView location={currentMission.location} />
                            </div>
                        </div>
                    )}

                    {(activeTab === 'technical' || window.matchMedia('print').matches) && (
                        <div className="space-y-10 animate-in fade-in duration-500 print:mt-10 print:pt-10 print:border-t print:border-slate-200">
                            {/* SECTION METEO */}
                            <div className="grid md:grid-cols-3 gap-6 print:grid-cols-3 print:mb-8">
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 print:border-none print:bg-white print:p-0">
                                    <Wind className="text-sky-500" size={28}/>
                                    <div className="flex-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Vent (km/h)</p>
                                        <input className="w-full bg-transparent font-black text-lg outline-none" value={currentMission.meteoVent || ''} onChange={e=>handleUpdate('meteoVent', e.target.value)} />
                                    </div>
                                </div>
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 print:border-none print:bg-white print:p-0">
                                    <Thermometer className="text-orange-500" size={28}/>
                                    <div className="flex-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Temp. (°C)</p>
                                        <input className="w-full bg-transparent font-black text-lg outline-none" value={currentMission.meteoTemp || ''} onChange={e=>handleUpdate('meteoTemp', e.target.value)} />
                                    </div>
                                </div>
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 print:border-none print:bg-white print:p-0">
                                    <CloudSun className="text-emerald-500" size={28}/>
                                    <div className="flex-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Indice KP</p>
                                        <input className="w-full bg-transparent font-black text-lg outline-none" value={currentMission.meteoKP || ''} onChange={e=>handleUpdate('meteoKP', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-12 print:grid-cols-1">
                                <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-6 print:bg-white print:text-slate-900 print:p-0 print:border-none">
                                    <div className="flex items-center gap-4 text-orange-400 mb-6 border-b border-slate-800 pb-6 print:border-slate-900 print:text-slate-900">
                                        <Plane size={28}/><h4 className="font-black uppercase tracking-widest text-sm">Consignes de Vol / ATC</h4>
                                    </div>
                                    <textarea className="w-full bg-slate-800/50 border-2 border-slate-700 p-5 rounded-3xl outline-none h-40 text-sm font-medium print:bg-white print:border-none print:p-0 print:h-auto" placeholder="..." value={currentMission.flightNotes || ''} onChange={e=>handleUpdate('flightNotes', e.target.value)}></textarea>
                                    
                                    <div className="flex items-center gap-4 text-emerald-400 mt-10 mb-6 border-b border-slate-800 pb-6 print:border-slate-900 print:text-slate-900 print:mt-6">
                                        <Wrench size={28}/><h4 className="font-black uppercase tracking-widest text-sm">Objectifs Techniques</h4>
                                    </div>
                                    <textarea className="w-full bg-slate-800/50 border-2 border-slate-700 p-5 rounded-3xl outline-none h-40 text-sm font-medium print:bg-white print:border-none print:p-0 print:h-auto" placeholder="..." value={currentMission.techNotes || ''} onChange={e=>handleUpdate('techNotes', e.target.value)}></textarea>
                                </div>
                            </div>
                        </div>
                    )}

                    {(activeTab === 'check' || window.matchMedia('print').matches) && (
                        <div className="grid md:grid-cols-2 gap-12 animate-in slide-in-from-right-10 duration-500 print:mt-10">
                            <div className="bg-slate-900 text-white p-12 rounded-[56px] relative overflow-hidden print:bg-white print:text-slate-900 print:p-0">
                                <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6 print:border-slate-900">
                                    <div className="text-emerald-400 font-black text-3xl uppercase print:text-slate-900">{SCENARIO_INFOS[currentMission.scenario]?.title}</div>
                                    <select className="bg-slate-800 text-white px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest border border-slate-700 print:hidden" value={currentMission.scenario || 'A3'} onChange={e => handleUpdate('scenario', e.target.value)}>
                                        <option value="A1">Open A1</option>
                                        <option value="A2">Open A2</option>
                                        <option value="A3">Open A3</option>
                                        <option value="STS-01">STS-01</option>
                                        <option value="STS-02">STS-02</option>
                                    </select>
                                </div>
                                <p className="text-slate-400 text-sm mb-12 print:text-slate-500 print:mb-4">{SCENARIO_INFOS[currentMission.scenario]?.description}</p>
                                <div className="text-sm"><strong className="block text-sky-400 text-[10px] uppercase font-black mb-1 print:text-slate-900">Périmètre ZET</strong><span className="font-bold print:text-slate-700">{SCENARIO_INFOS[currentMission.scenario]?.zet}</span></div>
                            </div>
                            <div className="space-y-6">
                                <div className="flex justify-between items-center mb-4 print:mb-2">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-slate-900">Checklist Sécurité ({safetyScore}%)</h4>
                                    <button onClick={() => { const allChecked = {}; activeChecklistItems.forEach(i => allChecked[i.k] = true); handleUpdate('checklist', allChecked); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg print:hidden">Tout valider</button>
                                </div>
                                <div className="space-y-3 print:space-y-1">
                                    {activeChecklistItems.map(i => (
                                        <div key={i.k} onClick={() => handleUpdate('checklist', {...(currentMission.checklist||{}), [i.k]: !currentMission.checklist?.[i.k]})} className={`flex items-center gap-5 p-5 rounded-[32px] border-2 cursor-pointer transition-all active:scale-[0.98] ${currentMission.checklist?.[i.k] ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'} print:p-2 print:border-none`}>
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 ${currentMission.checklist?.[i.k] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-transparent'} print:w-4 print:h-4 print:border-slate-900`}>
                                                <Check size={18} strokeWidth={4} className="print:hidden"/>
                                            </div>
                                            <span className={`font-black uppercase text-xs ${currentMission.checklist?.[i.k] ? 'text-emerald-900' : 'text-slate-400'} print:text-slate-900 print:text-[10px]`}>{i.l}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {(activeTab === 'flight' || window.matchMedia('print').matches) && (
                        <div className="animate-in fade-in duration-500 space-y-10 print:mt-10 print:pt-10 print:border-t print:border-slate-900">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900">Logbook Opérationnel</h4>
                            <div className="bg-white border-2 border-slate-100 rounded-[48px] overflow-hidden shadow-sm print:rounded-none">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 print:bg-white print:text-slate-900 print:border-slate-900">
                                        <tr><th className="p-7"># Vol</th><th className="p-7">Détails</th><th className="p-7 text-right">Durée</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                                        {(currentMission.logs || []).map((l, i) => (
                                            <tr key={l.id}>
                                                <td className="p-7 text-slate-300 font-black">{i+1}</td>
                                                <td className="p-7 text-xs uppercase">
                                                    {l.start} ➔ {l.end} | Batt: {l.battery}% | {l.notes}
                                                </td>
                                                <td className="p-7 text-right font-black text-slate-900 tabular-nums">{formatDuration(calculateDuration(l.start, l.end))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button onClick={()=>handleUpdate('logs', [...(currentMission.logs||[]), {id:Date.now(), start:'12:00', end:'12:20', battery:'40', notes:'Vol manuel'}])} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 font-black uppercase text-xs print:hidden">+ Saisie manuelle</button>
                        </div>
                    )}

                    {(activeTab === 'sign' || window.matchMedia('print').matches) && (
                        <div className="animate-in fade-in duration-500 space-y-12 print:mt-10">
                            <div className="grid md:grid-cols-2 gap-10">
                                <SignaturePad title="Visa Télépilote" savedData={currentMission.signaturePilote} onSave={d => handleUpdate('signaturePilote', d)} />
                                <SignaturePad title="Visa Client" savedData={currentMission.signatureClient} onSave={d => handleUpdate('signatureClient', d)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {isFieldMode && currentMission && <FieldModeView mission={currentMission} onExit={()=>setIsFieldMode(false)} onUpdate={handleUpdate} />}
      </main>
    </div>
  );
}

// --- LOGIN SCREEN ---
const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    const login = async (e) => {
        e.preventDefault(); setLoading(true); setErr('');
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (e) { setErr("Identifiants incorrects."); }
        finally { setLoading(false); }
    };

    return (
        <div className="h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="bg-white p-10 md:p-14 rounded-[56px] shadow-2xl w-full max-w-md text-center border-t-8 border-sky-500 animate-in zoom-in-95">
                <img src={LOGO_URL} className="h-20 mx-auto mb-8 object-contain" alt="Logo" onError={(e) => { e.target.style.display='none'; }} />
                <h2 className="text-3xl font-black mb-1 uppercase tracking-tighter">Pilote Manager</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-10 tracking-widest">Aerothau Operational Center</p>
                <form onSubmit={login} className="space-y-5 text-left">
                    <input required type="email" placeholder="EMAIL" className="w-full bg-slate-50 border-2 p-4 rounded-2xl outline-none font-bold" value={email} onChange={e=>setEmail(e.target.value)} />
                    <input required type="password" placeholder="MOT DE PASSE" className="w-full bg-slate-50 border-2 p-4 rounded-2xl outline-none font-bold" value={password} onChange={e=>setPassword(e.target.value)} />
                    {err && <div className="text-red-600 text-xs font-black text-center bg-red-50 p-4 rounded-2xl">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 text-white font-black py-6 rounded-3xl uppercase tracking-widest text-sm">
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : "ACCÉDER AU COCKPIT"}
                    </button>
                </form>
            </div>
        </div>
    );
};