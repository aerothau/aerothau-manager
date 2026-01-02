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
  Plane, 
  FileText,
  X, 
  Link as LinkIcon,
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
  Map as MapIcon,
  Info,
  Wrench,
  BatteryCharging,
  ChevronRight,
  Wind,
  Thermometer,
  CloudSun,
  Car,
  Moon,
  CheckCircle2,
  FolderOpen,
  Eye,
  UserPlus,
  RefreshCw,
  MessageSquare,
  Navigation,
  Lock,
  Unlock,
  AlertCircle
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

// --- 2. IA WEATHER INTEGRATION ---
const apiKey = ""; 

const fetchWeatherWithIA = async (location) => {
  if (!location) return null;
  const systemPrompt = "Tu es un expert météo aéronautique. Récupère la météo actuelle (temp en °C, vent en km/h, KP) pour le lieu fourni via Google Search. Réponds uniquement en JSON : {\"temp\": \"valeur\", \"wind\": \"valeur\", \"kp\": \"valeur\", \"desc\": \"météo\"}.";
  const userQuery = `Météo précise à cet instant pour : ${location}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  } catch (err) { 
    console.error("Météo IA Erreur:", err);
    return null; 
  }
};

// --- 3. CONSTANTES MÉTIER ---
const SCENARIO_INFOS = {
    'A1': { title: "Open A1", description: "Survol de personnes isolées possible.", zet: "ZET : Éviter le survol. Pas de distance minimale." },
    'A2': { title: "Open A2", description: "Vol proximité personnes.", zet: "ZET : 30m des tiers (5m si mode basse vitesse)." },
    'A3': { title: "Open A3", description: "Vol hors zones habitées.", zet: "ZET : > 150m zones urbaines. Aucun tiers." },
    'STS-01': { title: "Spécifique STS-01", description: "VLOS zone peuplée.", zet: "Zone contrôlée au sol. Rayon = Hauteur." },
    'STS-02': { title: "Spécifique STS-02", description: "BVLOS hors zone peuplée.", zet: "Zone tampon 30m min autour emprise." },
};

const MISSION_STATUS = [
    { value: 'En cours', color: 'bg-sky-500', text: 'text-sky-600', border: 'border-sky-200', light: 'bg-sky-50' },
    { value: 'Validé', color: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50' },
    { value: 'Reporté', color: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200', light: 'bg-amber-50' },
    { value: 'Annulé', color: 'bg-red-500', text: 'text-red-600', border: 'border-red-200', light: 'bg-red-50' }
];

const MISSION_TYPES = ['Inspection Technique', 'Photogrammétrie', 'Audiovisuel', 'Nettoyage', 'Lidars', 'Thermographie'];
const DOC_TYPES = ['Arrêté Préfectoral', 'Protocole ATC', 'Assurance RC', 'DNC Pilote', 'Plan de prévention', 'Autre'];

const BASE_CHECKLIST = [
  {k:'meteo',l:'Météo / Vent ok'}, {k:'zet',l:'Balisage ZET'}, {k:'auth',l:'Protocoles / Autorisations'}, 
  {k:'notam',l:'NOTAM / Geoportail'}, {k:'drone_state',l:'État mécanique'}, {k:'batteries',l:'Batteries'}, 
  {k:'sd_card',l:'Carte SD'}, {k:'rtn',l:'Point RTH'}
];
const SPECIFIC_CHECKLISTS = {
  'Lidars': [{k:'imu_warmup',l:'Chauffe IMU (3 min)'}, {k:'gnss_fix',l:'Fix RTK stable'}],
  'Photogrammétrie': [{k:'overlap',l:'Taux recouvrement réglé'}],
};

// --- 4. HELPERS ---
const calculateDuration = (start, end) => {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return 0;
  try {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const d1 = new Date(0, 0, 0, h1, m1);
    const d2 = new Date(0, 0, 0, h2, m2);
    let diff = (d2.getTime() - d1.getTime()) / 60000;
    return diff < 0 ? diff + 1440 : diff;
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

// --- 5. COMPOSANTS UI ---

function LoginScreen() {
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
            <div className="bg-white p-12 md:p-16 rounded-[64px] shadow-2xl w-full max-w-md text-center border-t-8 border-sky-500 animate-in zoom-in-95 leading-none">
                <img src={LOGO_URL} className="h-24 mx-auto mb-10 object-contain leading-none" alt="Aerothau" onError={(e) => { e.target.style.display='none'; }} />
                <h2 className="text-4xl font-black mb-1 uppercase tracking-tighter leading-none text-slate-900">Pilote Manager</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-12 tracking-widest leading-none">Aerothau Operational Center</p>
                <form onSubmit={login} className="space-y-6 text-left leading-none">
                    <div className="space-y-1 leading-none">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 leading-none">Email</label>
                        <input required type="email" placeholder="Saisir email..." className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-[24px] outline-none focus:border-sky-500 focus:bg-white transition-all font-bold text-black leading-none" value={email} onChange={e=>setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1 leading-none">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 leading-none">Mot de passe</label>
                        <input required type="password" placeholder="••••••••" className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-[24px] outline-none focus:border-sky-500 focus:bg-white transition-all font-bold text-black leading-none" value={password} onChange={e=>setPassword(e.target.value)} />
                    </div>
                    {err && <div className="text-red-600 text-xs font-black text-center bg-red-50 p-4 rounded-[20px] border border-red-100 leading-none">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 text-white font-black py-6 rounded-[28px] uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all leading-none">
                        {loading ? <Loader2 className="animate-spin mx-auto leading-none" /> : "ACCÉDER AU COCKPIT"}
                    </button>
                </form>
            </div>
        </div>
    );
}

function SignaturePad({ title, onSave, savedData, isLocked }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!savedData);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const renderData = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (savedData) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = savedData;
      }
    };
    renderData();

    if (isLocked) return;

    const getCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { 
        x: (clientX - rect.left) * (canvas.width / rect.width), 
        y: (clientY - rect.top) * (canvas.height / rect.height) 
      };
    };

    const start = (e) => {
      isDrawing.current = true;
      const { x, y } = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0f172a";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      setIsEmpty(false);
    };

    const move = (e) => {
      if (!isDrawing.current) return;
      if (e.cancelable) e.preventDefault();
      const { x, y } = getCoords(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const stop = () => {
      if (isDrawing.current) {
        isDrawing.current = false;
        onSave(canvas.toDataURL());
      }
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    canvas.addEventListener('touchstart', (e) => { if(e.cancelable) e.preventDefault(); start(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { if(e.cancelable) e.preventDefault(); move(e); }, { passive: false });
    canvas.addEventListener('touchend', stop);

    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', stop);
    };
  }, [savedData, onSave, isLocked]);

  const clear = () => {
    if (isLocked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSave(null);
    setIsEmpty(true);
  };

  return (
    <div className="border border-slate-200 rounded-[32px] p-6 bg-white shadow-sm leading-none">
      <div className="flex justify-between items-center mb-3 leading-none text-left">
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">{title}</label>
        {!isLocked && <button onClick={clear} className="text-[10px] text-red-500 font-black print:hidden uppercase leading-none">Effacer</button>}
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-[24px] bg-slate-50 h-32 md:h-40 w-full touch-none overflow-hidden print:bg-white print:border-slate-300 leading-none">
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          className={`w-full h-full ${isLocked ? 'cursor-default' : 'cursor-crosshair'} leading-none`}
        />
        {isEmpty && !savedData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest leading-none">Signer ici</div>}
      </div>
    </div>
  );
}

function DashboardStats({ missions }) {
  const stats = useMemo(() => {
    const totalMinutes = missions.reduce((acc, m) => {
        const flightTime = (m.logs || []).reduce((sum, l) => sum + calculateDuration(l.start, l.end), 0);
        return acc + flightTime;
    }, 0);

    const totalKm = missions.reduce((acc, m) => {
        const start = parseFloat(m.kmStart) || 0;
        const end = parseFloat(m.kmEnd) || 0;
        return acc + Math.max(0, end - start);
    }, 0);

    return {
        count: missions.length,
        hours: (totalMinutes / 60).toFixed(1),
        km: totalKm,
        nights: missions.filter(m => m.overnight).length
    };
  }, [missions]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:hidden text-left leading-none">
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 leading-none text-black">
        <div className="bg-sky-100 p-3 rounded-2xl text-sky-600 leading-none"><Plane size={24} className="leading-none"/></div>
        <div className="leading-none">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Missions</p>
          <p className="text-2xl font-black text-slate-900 leading-none">{stats.count}</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 leading-none text-black">
        <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600 leading-none"><Clock size={24} className="leading-none"/></div>
        <div className="leading-none">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Heures Vol</p>
          <p className="text-2xl font-black text-emerald-600 leading-none">{stats.hours}h</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 leading-none text-black text-left">
        <div className="bg-orange-100 p-3 rounded-2xl text-orange-600 leading-none"><Car size={24} className="leading-none"/></div>
        <div className="leading-none">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Km</p>
          <p className="text-2xl font-black text-orange-600 leading-none">{stats.km}</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 leading-none text-black text-left">
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600 leading-none"><Moon size={24} className="leading-none"/></div>
        <div className="leading-none text-left">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Découchers</p>
          <p className="text-2xl font-black text-indigo-600 leading-none">{stats.nights}</p>
        </div>
      </div>
    </div>
  );
}

function MapView({ location }) {
  const mapUrl = useMemo(() => {
    if (!location) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed&t=k`;
  }, [location]);

  if (!location) return (
    <div className="h-48 bg-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 print:hidden leading-none text-center">
      <MapIcon size={32} className="mb-2 opacity-20 leading-none"/>
      <p className="text-[10px] font-black uppercase tracking-widest leading-none">Localisation requise</p>
    </div>
  );

  return (
    <div className="h-64 rounded-[40px] overflow-hidden border-4 border-white shadow-xl bg-slate-200 relative animate-in fade-in print:h-48 print:shadow-none print:border-slate-300 leading-none">
      <iframe title="Map" width="100%" height="100%" frameBorder="0" src={mapUrl} allowFullScreen className="leading-none"></iframe>
    </div>
  );
}

function FieldModeView({ mission, onExit, onUpdate }) {
    const [isFlying, setIsFlying] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [startTime, setStartTime] = useState(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (isFlying) {
            timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
        } else { clearInterval(timerRef.current); }
        return () => clearInterval(timerRef.current);
    }, [isFlying, startTime]);

    const handleFlight = () => {
        if (!isFlying) {
            setStartTime(Date.now()); setIsFlying(true); setElapsed(0);
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
        <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col p-4 overflow-y-auto animate-in slide-in-from-bottom-10 duration-500 text-left leading-none">
            <div className="flex justify-between items-center mb-6 leading-none">
                <button onClick={onExit} className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg active:scale-90 leading-none"><ChevronLeft size={24} className="leading-none"/></button>
                <div className="text-center leading-none text-white">
                    <h2 className="text-emerald-400 font-black tracking-tighter text-xl uppercase leading-none">OPERATIONAL COCKPIT</h2>
                    <p className="text-[9px] text-slate-500 font-mono mt-1 uppercase tracking-widest leading-none">{mission.ref} | {mission.type}</p>
                </div>
                <div className="bg-slate-800 p-3 rounded-2xl border border-slate-700 shadow-lg leading-none">
                    <BatteryCharging size={24} className={isFlying ? "text-emerald-400 animate-pulse leading-none" : "text-slate-500 leading-none"} />
                </div>
            </div>

            <div className="flex-1 space-y-6 pb-20 max-w-lg mx-auto w-full leading-none text-white">
                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 text-center shadow-2xl relative overflow-hidden leading-none text-white">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-4 leading-none">Temps de Vol</div>
                    <div className="text-7xl font-mono font-black mb-10 tabular-nums text-white leading-none">{formatTimer(elapsed)}</div>
                    <button onClick={handleFlight} className={`w-full py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 transition-all active:scale-95 leading-none ${isFlying ? 'bg-red-600 animate-pulse text-white leading-none' : 'bg-emerald-600 shadow-emerald-900/40 shadow-xl text-white leading-none'}`}>
                        {isFlying ? <><Square fill="currentColor" size={24} className="leading-none"/> ATTERRIR</> : <><Play fill="currentColor" size={24} className="leading-none"/> DÉCOLLER</>}
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4 leading-none text-white text-left">
                    <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 text-left leading-none text-white">
                         <div className="flex items-center gap-3 mb-4 leading-none text-white text-left">
                            <CloudSun size={20} className="text-sky-400 leading-none"/>
                            <h3 className="text-[10px] font-black uppercase text-slate-400 leading-none">Environnement</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center leading-none text-white text-left">
                            <div className="leading-none text-white"><Wind size={18} className="mx-auto text-slate-500 mb-1 leading-none text-white"/><p className="text-xs font-black leading-none text-white">{mission.meteoVent || '--'}</p></div>
                            <div className="border-x border-slate-800 leading-none text-white"><Thermometer size={18} className="mx-auto text-slate-500 mb-1 leading-none text-white"/><p className="text-xs font-black leading-none text-white">{mission.meteoTemp || '--'}</p></div>
                            <div className="leading-none text-white text-left"><Shield size={18} className="mx-auto text-slate-500 mb-1 leading-none text-white"/><p className="text-xs font-black leading-none text-white">{mission.meteoKP || '--'}</p></div>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 text-left leading-none text-white">
                        <div className="flex items-center gap-3 mb-2 leading-none text-white text-left">
                            <Shield size={20} className="text-emerald-400 leading-none text-white"/>
                            <h3 className="text-[10px] font-black uppercase text-slate-400 leading-none text-white text-left">Scénario</h3>
                        </div>
                        <p className="text-xs font-black text-emerald-400 uppercase leading-none mb-1 leading-none text-white text-left">{SCENARIO_INFOS[mission.scenario]?.title || "N/A"}</p>
                        <p className="text-[8px] text-slate-400 leading-tight font-medium uppercase tracking-tight leading-none text-white text-left">{SCENARIO_INFOS[mission.scenario]?.zet}</p>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 text-left space-y-6 leading-none text-white">
                    <div className="flex items-center gap-3 leading-none text-white"><Info size={24} className="text-orange-400 leading-none"/><h3 className="text-xs font-black uppercase text-slate-200 leading-none text-white">Consignes</h3></div>
                    <div className="space-y-4 leading-none text-white text-left">
                        {mission.flightNotes && <div className="bg-orange-500/10 border-l-4 border-orange-500 p-4 rounded-r-2xl leading-none text-white text-left"><h4 className="text-[9px] font-black text-orange-400 uppercase leading-none mb-1 text-white">VOL / ATC</h4><p className="text-xs font-medium leading-relaxed text-slate-200 leading-none text-white">{mission.flightNotes}</p></div>}
                        {mission.techNotes && <div className="bg-sky-500/10 border-l-4 border-sky-500 p-4 rounded-r-2xl leading-none text-white text-left"><h4 className="text-[9px] font-black text-sky-400 uppercase leading-none mb-1 text-white">TECHNIQUE</h4><p className="text-xs font-medium leading-relaxed text-slate-200 leading-none text-white text-left">{mission.techNotes}</p></div>}
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 leading-none text-white">
                    <div className="flex justify-between mb-2 text-[10px] font-black uppercase tracking-widest leading-none text-white text-left">
                        <span className="text-slate-500 leading-none text-white">Sécurité</span>
                        <span className={progress === 100 ? 'text-emerald-400' : 'text-orange-400'} leading-none text-white>{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner leading-none text-white">
                        <div className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-emerald-500' : 'bg-orange-500'} leading-none text-white`} style={{width: `${progress}%`}}></div>
                    </div>
                </div>

                <div className="space-y-3 leading-none text-white text-left">
                    {(mission.contacts || []).map((c, i) => (
                        <a key={i} href={`tel:${c.phone}`} className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-3xl flex justify-between items-center active:bg-blue-600/30 transition-all leading-none text-white">
                            <div className="text-left leading-none text-white">
                                <div className="font-black text-blue-100 uppercase text-xs leading-none mb-1 text-white">{c.name}</div>
                                <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest leading-none text-white">{c.role}</div>
                            </div>
                            <div className="bg-blue-600 p-3 rounded-full text-white shadow-lg leading-none text-white"><Phone size={20} className="leading-none text-white"/></div>
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}

function AdminScreen({ onClose, userUid }) {
    const [tab, setTab] = useState('team');
    const [employees, setEmployees] = useState([]);
    const [fleet, setFleet] = useState([]);
    const [clients, setClients] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', detail: '' });

    useEffect(() => {
        const uTeam = onSnapshot(query(collection(db, 'employees')), (s) => setEmployees(s.docs.map(d => ({id: d.id, ...d.data()}))));
        const uFleet = onSnapshot(query(collection(db, 'users', userUid, 'fleet')), (s) => setFleet(s.docs.map(d => ({id: d.id, ...d.data()}))));
        const uClients = onSnapshot(query(collection(db, 'users', userUid, 'clients')), (s) => setClients(s.docs.map(d => ({id: d.id, ...d.data()}))));
        return () => { uTeam(); uFleet(); uClients(); };
    }, [userUid]);

    const handleAdd = async (e) => {
        e.preventDefault();
        const collectionRef = tab === 'team' ? collection(db, 'employees') : collection(db, 'users', userUid, tab);
        await addDoc(collectionRef, { ...form, createdAt: serverTimestamp() });
        setIsCreating(false); setForm({ name: '', email: '', detail: '' });
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen leading-none text-black text-left">
            <button onClick={onClose} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 font-black text-xs uppercase tracking-widest leading-none text-left"><ChevronLeft size={16}/> Missions</button>
            <div className="flex flex-col md:flex-row justify-between gap-6 mb-10 border-b border-slate-200 pb-8 text-left leading-none text-black">
                <div><h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none text-black">Administration</h1><p className="text-slate-500 text-sm font-medium mt-1 leading-none text-black text-left">Gestion globale du cockpit.</p></div>
                <div className="flex gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto w-fit h-fit leading-none text-black">
                    {['team', 'fleet', 'clients'].map(t => (
                        <button key={t} onClick={() => {setTab(t); setIsCreating(false);}} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400'} leading-none text-black text-left`}>{t === 'team' ? 'Équipe' : t === 'fleet' ? 'Flotte' : 'Clients'}</button>
                    ))}
                </div>
            </div>
            {isCreating ? (
                <form onSubmit={handleAdd} className="bg-white p-8 rounded-[40px] shadow-2xl border border-slate-200 mb-8 grid md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 text-left leading-none text-black">
                    <input className="border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 bg-slate-50 focus:bg-white transition-all font-bold text-black placeholder:text-slate-400 leading-none text-black text-left" placeholder="Nom complet" required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                    <input className="border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 bg-slate-50 focus:bg-white transition-all font-bold text-black placeholder:text-slate-400 leading-none text-black text-left" placeholder={tab==='team' ? 'Email' : 'Détail'} required value={tab==='team'?form.email:form.detail} onChange={e=>tab==='team'?setForm({...form, email:e.target.value}):setForm({...form, detail:e.target.value})} />
                    <div className="flex gap-2 leading-none text-black"><button className="flex-1 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl leading-none text-white">Valider</button><button type="button" onClick={()=>setIsCreating(false)} className="bg-slate-100 p-4 rounded-2xl text-slate-500 leading-none text-black"><X size={20} className="leading-none text-black"/></button></div>
                </form>
            ) : (
                <button onClick={()=>setIsCreating(true)} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 font-black uppercase text-xs tracking-widest mb-8 hover:bg-white hover:border-sky-300 transition-all leading-none text-black">+ Ajouter à {tab}</button>
            )}
            <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm leading-none text-black">
                <table className="w-full text-left leading-none text-black">
                    <tbody className="divide-y divide-slate-100 text-black leading-none text-black text-left">
                        {(tab === 'team' ? employees : tab === 'fleet' ? fleet : clients).map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors leading-none text-black">
                                <td className="p-6 leading-none text-black text-left leading-none"><div className="font-black uppercase text-sm leading-none text-black text-left">{item.name}</div><div className="text-xs text-slate-400 font-bold uppercase tracking-wide leading-none text-black leading-none text-left">{item.email || item.detail || "Sans précision"}</div></td>
                                <td className="p-6 text-right leading-none text-black text-left"><button onClick={async () => { if(confirm("Supprimer?")) await deleteDoc(doc(db, tab==='team'?'employees':'users', tab==='team'?item.id:userUid, tab==='team'?'':tab, item.id)); }} className="text-slate-200 hover:text-red-500 active:scale-90 transition-all leading-none text-black text-left"><Trash2 size={20} className="leading-none text-black text-left"/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// --- APPLICATION PRINCIPALE ---
export default function App() {
  const [user, setUser] = useState(null);
  const [missions, setMissions] = useState([]);
  const [currentMission, setCurrentMission] = useState(null);
  const [view, setView] = useState('list'); 
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [isLocked, setIsLocked] = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [isFieldMode, setIsFieldMode] = useState(false);
  const [qrModal, setQrModal] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
    return () => unsub();
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
    const isValidation = ['status', 'debriefing', 'signaturePilote', 'signatureClient'].includes(f);
    if (isLocked && !isValidation) return;
    const updated = { ...currentMission, [f]: v };
    setCurrentMission(updated);
    await updateDoc(doc(db, 'users', user.uid, 'missions', currentMission.id), { [f]: v });
  };

  const handleCreate = async () => {
    const m = { 
        ref: `ATH-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
        date: new Date().toISOString().split('T')[0], title: '', client: '', location: '', type: 'Inspection Technique', 
        category: 'Open', scenario: 'A3', status: 'En cours', debriefing: '', checklist: {}, contacts: [], logs: [], documents: [], 
        takeOffPoints: [], flightNotes: '', techNotes: '', meteoVent: '', meteoTemp: '', meteoKP: '', overnight: false, travel: false, kmStart: '', kmEnd: '', createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'users', user.uid, 'missions'), m);
    setCurrentMission({ id: docRef.id, ...m }); setView('edit'); setActiveTab('general'); setIsLocked(false);
  };

  const refreshWeather = async () => {
      if (!currentMission?.location || isLocked) return;
      setWeatherLoading(true);
      try {
          const w = await fetchWeatherWithIA(currentMission.location);
          if (w) { await handleUpdate('meteoVent', w.wind); await handleUpdate('meteoTemp', w.temp); await handleUpdate('meteoKP', w.kp); }
      } catch (err) {} finally { setWeatherLoading(false); }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 leading-none text-black"><Loader2 className="animate-spin text-sky-500 leading-none" /></div>;
  if (!user) return <LoginScreen />;
  if (isAdminView) return <AdminScreen onClose={()=>setIsAdminView(false)} userUid={user.uid} />;
  if (view === 'edit' && isFieldMode && currentMission) return <FieldModeView mission={currentMission} onExit={()=>setIsFieldMode(false)} onUpdate={handleUpdate} />;

  return (
    <div className="min-h-screen font-sans bg-slate-50 pb-20 print:bg-white text-left leading-none text-black">
      <nav className="sticky top-0 z-50 shadow-xl border-b border-slate-700 px-4 md:px-8 py-4 flex justify-between items-center bg-slate-900 text-white print:hidden leading-none">
        <div className="flex items-center gap-5 leading-none text-white text-left">
          {view !== 'list' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all active:scale-90 text-white leading-none"><ChevronLeft size={24} className="leading-none text-white"/></button>}
          <img src={LOGO_URL} alt="Logo" className="h-10 brightness-0 invert object-contain leading-none" onError={(e)=>e.target.style.display='none'} /> 
          <span className="font-black text-2xl tracking-tighter uppercase leading-none text-white text-left">Aerothau</span>
        </div>
        <div className="flex gap-2 leading-none text-black text-left">
          {view === 'list' ? (
            <>
              <button onClick={() => setView('calendar')} className={`p-2.5 rounded-xl border border-slate-700 ${view === 'calendar' ? 'bg-sky-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'} transition-all leading-none text-black`}><CalendarIcon size={22} className="text-white"/></button>
              <button onClick={()=>setIsAdminView(true)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:bg-slate-700 hover:text-white transition-all shadow-md leading-none text-black text-left"><Shield size={22} className="text-white"/></button>
              <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl active:scale-95 transition-all leading-none text-white text-left"><Plus size={20} className="text-white"/> Mission</button>
            </>
          ) : (
            <div className="flex gap-2 leading-none text-black text-left">
                <button onClick={() => setIsLocked(!isLocked)} className={`p-2.5 rounded-2xl shadow-lg active:scale-90 leading-none text-black ${isLocked ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>{isLocked ? <Lock size={20}/> : <Unlock size={20}/>}</button>
                {!isLocked && <button onClick={async () => { if(confirm("Supprimer?")) { await deleteDoc(doc(db, 'users', user.uid, 'missions', currentMission.id)); setView('list'); } }} className="bg-red-500 text-white p-2.5 rounded-2xl shadow-lg active:scale-90 leading-none text-black"><Trash2 size={20} className="text-white"/></button>}
                <button onClick={() => window.print()} className="bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 border border-slate-700 active:scale-95 shadow-lg leading-none text-black"><Printer size={18} className="text-white"/> Rapport</button>
                <button onClick={()=>setIsFieldMode(true)} className="bg-orange-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl active:scale-95 transition-all leading-none text-black"><Maximize size={20} className="text-white"/> Cockpit</button>
                <button onClick={() => setView('list')} className="bg-sky-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl active:scale-95 transition-all leading-none text-black text-left"><Save size={18} className="text-white"/> Finir</button>
            </div>
          )}
          <button onClick={()=>signOut(auth)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:bg-red-900/40 transition-colors print:hidden leading-none text-black"><LogOut size={22} className="text-white"/></button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8 print:p-0 print:max-w-none text-left leading-none text-black">
        {view === 'list' && (
          <div className="animate-in fade-in duration-500 leading-none text-black text-left">
            <DashboardStats missions={missions} />
            <div className="flex justify-between items-center mb-8 leading-none text-black text-left">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none text-black text-left text-black">Opérations en cours</h2>
                <div className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase leading-none leading-none text-black text-left">Actif</div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 leading-none text-black text-left">
                {missions.map(m => {
                    const currentStatus = MISSION_STATUS.find(s => s.value === m.status) || MISSION_STATUS[0];
                    return (
                        <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit'); setIsLocked(true);}} 
                            className={`bg-white p-8 rounded-[48px] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border-2 ${currentStatus.border} group relative overflow-hidden text-left leading-none text-black text-left`}>
                            <div className="flex justify-between mb-5 leading-none text-black text-left"><span className="text-[10px] font-black tracking-widest bg-slate-50 text-slate-400 px-4 py-1.5 rounded-full border border-slate-100 uppercase leading-none text-black text-left">{m.ref}</span><span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full text-white ${currentStatus.color} leading-none text-white text-left`}>{m.status}</span></div>
                            <h3 className="font-black text-2xl text-slate-900 mb-2 uppercase leading-tight group-hover:text-sky-600 transition-colors tracking-tighter text-black leading-none text-black text-left">{m.title || m.client || "Nouvelle Mission"}</h3>
                            <p className="text-xs text-slate-500 font-bold flex items-center gap-2 uppercase tracking-wide leading-none leading-none text-black text-left"><MapPin size={16} className="text-slate-300 leading-none text-black text-left"/>{m.location || "Non localisée"}</p>
                            {m.overnight && <span className="absolute top-10 -right-6 bg-indigo-500 text-white text-[8px] font-black px-8 py-1 rotate-45 uppercase shadow-sm leading-none text-black text-left">Découcher</span>}
                        </div>
                    );
                })}
            </div>
          </div>
        )}

        {view === 'edit' && currentMission && (
            <div className="bg-white rounded-[56px] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in print:border-none print:shadow-none print:rounded-none leading-none text-black text-left text-black text-left">
                <div className="flex border-b border-slate-100 bg-slate-50 px-8 gap-8 sticky top-0 z-10 overflow-x-auto scrollbar-hide print:hidden leading-none text-black text-left">
                    {['general', 'technical', 'check', 'flight', 'sign'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`py-6 text-[10px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === t ? 'text-sky-600' : 'text-slate-400 hover:text-slate-900'} leading-none text-black text-left`}>
                            {t === 'general' ? 'Informations' : t === 'technical' ? 'Opérations' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                            {activeTab === t && <div className="absolute bottom-0 left-0 w-full h-1 bg-sky-600 rounded-full leading-none text-black text-left"></div>}
                        </button>
                    ))}
                </div>
                
                <div className="p-8 md:p-14 print:p-0 leading-none text-black text-left text-black text-left text-black text-left">
                    <div className={`${activeTab === 'general' ? 'block' : 'hidden print:block'} space-y-12 animate-in slide-in-from-bottom-5 print:space-y-8 text-left leading-none text-black text-left`}>
                        <div className="grid md:grid-cols-2 gap-12 items-start print:grid-cols-2 leading-none text-black text-left">
                            <div className="space-y-8 print:space-y-6 leading-none text-black text-left">
                                <div className="space-y-4 leading-none text-black text-left">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900 leading-none text-black text-left">Mission & Client</label>
                                    <input disabled={isLocked} className="w-full border-2 border-slate-100 p-6 rounded-[32px] bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-black text-3xl text-black transition-all shadow-inner print:border-none print:p-0 print:bg-white print:text-2xl leading-none text-black text-left text-black" placeholder="Titre..." value={currentMission.title || ''} onChange={e => handleUpdate('title', e.target.value)} />
                                    <input disabled={isLocked} className="w-full border-2 border-slate-100 p-5 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold text-slate-700 print:border-none print:p-0 print:text-xl leading-none text-black text-left text-black" placeholder="Nom du client" value={currentMission.client || ''} onChange={e => handleUpdate('client', e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-4 leading-none text-black text-left">
                                    <div className="space-y-2 leading-none text-black text-left"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 print:text-slate-900 leading-none text-black text-left text-black">Date</label><input disabled={isLocked} type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black print:border-none print:p-0 leading-none text-black text-left text-black" value={currentMission.date || ''} onChange={e => handleUpdate('date', e.target.value)} /></div>
                                    <div className="space-y-2 leading-none text-black text-left"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 print:text-slate-900 leading-none text-black text-left text-black">Prestation</label><select disabled={isLocked} className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black print:appearance-none print:border-none print:p-0 leading-none text-black text-left text-black" value={currentMission.type || ''} onChange={e => handleUpdate('type', e.target.value)}>{MISSION_TYPES.map(t => <option key={t} value={t} className="leading-none text-black text-left">{t}</option>)}</select></div>
                                </div>
                                <div className="space-y-2 leading-none text-black text-left text-black text-left text-black"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 print:text-slate-900 leading-none text-black text-left text-black text-left text-black">Lieu d'intervention</label><input disabled={isLocked} className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black print:border-none print:p-0 print:text-lg leading-none text-black text-left text-black text-left text-black" value={currentMission.location || ''} onChange={e => handleUpdate('location', e.target.value)} /></div>

                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:bg-white print:border-slate-300 print:shadow-none text-left leading-none text-black text-left text-black">
                                    <div className="flex items-center justify-between text-sky-600 leading-none text-black text-left"><div className="flex items-center gap-3 text-black text-left leading-none text-black text-left text-black"><Navigation size={24} className="leading-none text-black"/><h4 className="text-xs font-black uppercase text-black text-left leading-none text-black">Décollage GPS</h4></div>{!isLocked && <button onClick={()=>handleUpdate('takeOffPoints', [...(currentMission.takeOffPoints||[]), {name:'', coords:''}])} className="bg-sky-600 text-white p-2 rounded-xl leading-none text-black text-left text-black"><Plus size={18} className="text-white"/></button>}</div>
                                    <div className="space-y-4 text-black text-left leading-none text-black text-left text-black">{(currentMission.takeOffPoints || []).map((p, i) => (<div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl relative text-black text-left leading-none text-black text-left text-black">{!isLocked && <button onClick={()=>{const n=[...currentMission.takeOffPoints]; n.splice(i,1); handleUpdate('takeOffPoints',n)}} className="absolute top-4 right-4 text-red-300 leading-none text-black text-left text-black"><Trash2 size={16} className="text-red-400 leading-none"/></button>}<input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-black text-black outline-none w-full text-black text-left leading-none" value={p.name} placeholder="Nom du point..." onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].name=e.target.value; handleUpdate('takeOffPoints',n)}} /><input disabled={isLocked} className="w-full bg-transparent text-xs font-black text-sky-600 outline-none mt-2 text-black text-left leading-none" value={p.coords} placeholder="Coordonnées GPS..." onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].coords=e.target.value; handleUpdate('takeOffPoints',n)}} /></div>))}</div>
                                </div>
                            </div>
                            <div className="space-y-8 text-black text-left leading-none text-black text-left text-black">
                                <MapView location={currentMission.location} />
                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 text-left leading-none text-black text-left text-black">
                                    <div className="flex items-center justify-between text-indigo-600 leading-none text-black text-left"><div className="flex items-center gap-3 text-black text-left leading-none text-black text-left text-black text-black"><Users size={24} className="text-black text-left"/><h4 className="text-xs font-black uppercase text-black text-left leading-none text-black text-left">Interlocuteurs</h4></div>{!isLocked && <button onClick={()=>handleUpdate('contacts', [...(currentMission.contacts||[]), {name:'', phone:'', role:''}])} className="bg-indigo-600 text-white p-2 rounded-xl leading-none text-black text-left text-black text-left text-black text-black"><UserPlus size={18} className="text-white text-left"/></button>}</div>
                                    <div className="space-y-4 text-black text-left leading-none text-black text-left text-black text-black">{(currentMission.contacts || []).map((c, i) => (<div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative text-black text-left text-black text-left text-black text-black">{!isLocked && <button onClick={()=>{const n=[...currentMission.contacts]; n.splice(i,1); handleUpdate('contacts',n)}} className="absolute top-4 right-4 text-red-300 leading-none text-black text-left text-black text-left text-black text-black"><Trash2 size={16} className="text-red-400 text-left"/></button>}<div className="grid grid-cols-2 gap-4 text-black text-left text-black text-left text-black text-black"><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-black text-black outline-none text-black text-left leading-none text-black text-left text-black text-black" value={c.name} placeholder="Nom..." onChange={e=>{const n=[...currentMission.contacts]; n[i].name=e.target.value; handleUpdate('contacts',n)}} /><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-black outline-none leading-none text-black text-left text-black text-left text-black text-black" value={c.role} placeholder="Rôle..." onChange={e=>{const n=[...currentMission.contacts]; n[i].role=e.target.value; handleUpdate('contacts',n)}} /></div><div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-black leading-none text-black text-left text-black text-left text-black text-black text-black text-black"><Phone size={14} className="text-slate-400 text-left"/><input disabled={isLocked} className="flex-1 bg-transparent text-xs font-black text-indigo-600 outline-none text-black text-left leading-none text-black text-left text-black text-black text-black text-black" value={c.phone} placeholder="Tél..." onChange={e=>{const n=[...currentMission.contacts]; n[i].phone=e.target.value; handleUpdate('contacts',n)}} /></div></div>))}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`${activeTab === 'sign' ? 'block' : 'hidden print:block'} animate-in fade-in duration-500 space-y-12 print:mt-16 text-left text-black text-left`}>
                        <div className="grid md:grid-cols-2 gap-8 text-black text-left text-black text-left text-black text-left">
                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 text-black text-left text-black text-left text-black text-left text-black text-left">
                                <div className="flex items-center gap-3 text-indigo-600 leading-none text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left"><MessageSquare size={24} className="text-black text-left text-black text-left"/><h4 className="text-xs font-black uppercase text-black text-left text-black text-left leading-none text-black text-left text-black text-left text-black text-left">Débriefing</h4></div>
                                <textarea className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl outline-none h-40 text-sm font-medium leading-relaxed text-black print:bg-white print:border-none print:p-0 print:h-auto text-black text-left text-black text-left leading-none text-black text-left text-black text-left text-black text-left" placeholder="Observations..." value={currentMission.debriefing || ''} onChange={e=>handleUpdate('debriefing', e.target.value)}></textarea>
                            </div>
                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-center text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left">
                                <div className="flex items-center gap-3 text-emerald-600 leading-none text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left"><CheckCircle2 size={24} className="text-black text-left text-black text-left text-black text-left"/><h4 className="text-xs font-black uppercase text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left">Statut</h4></div>
                                <div className="grid grid-cols-2 gap-3 print:hidden text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left">
                                    {MISSION_STATUS.map(s => (<button key={s.value} onClick={()=>handleUpdate('status', s.value)} className={`p-4 rounded-2xl font-black text-[10px] uppercase transition-all active:scale-95 border-2 ${currentMission.status === s.value ? `${s.color} text-white` : `bg-white text-slate-400 border-slate-100`} text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left`}>{s.value}</button>))}
                                </div>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-10 text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left text-black text-left">
                            <SignaturePad isLocked={false} title="Visa Télépilote (Aerothau)" savedData={currentMission.signaturePilote} onSave={d => handleUpdate('signaturePilote', d)} />
                            <SignaturePad isLocked={false} title="Visa Client" savedData={currentMission.signatureClient} onSave={d => handleUpdate('signatureClient', d)} />
                        </div>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}