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
  CloudSun,
  Car,
  Moon,
  CheckCircle2,
  FolderOpen,
  Eye,
  UserPlus,
  RefreshCw,
  MessageSquare,
  Navigation
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

// --- 2. GEMINI API POUR LA MÉTÉO ---
const apiKey = ""; 

const fetchWeatherWithIA = async (location) => {
  if (!location) return null;
  
  const systemPrompt = "Tu es un expert météo aéronautique pour drones. Récupère la météo en temps réel (vent en km/h, température en °C, indice KP) pour le lieu fourni. Retourne les données en JSON.";
  const userQuery = `Donne-moi la météo (vent, température, indice KP) pour : ${location}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }],
        generationConfig: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              temp: { type: "STRING" },
              wind: { type: "STRING" },
              kp: { type: "STRING" },
              desc: { type: "STRING" }
            },
            required: ["temp", "wind", "kp", "desc"]
          }
        }
      })
    });
    const data = await response.json();
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch (error) {
    console.error("Weather IA Error:", error);
    return null;
  }
};

// --- 3. CONSTANTES MÉTIER ---
const SCENARIO_INFOS = {
    'A1': { title: "Open A1", description: "Survol de personnes isolées possible.", zet: "ZET: Éviter le survol. Pas de distance minimale." },
    'A2': { title: "Open A2", description: "Vol proximité personnes.", zet: "ZET: 30m des tiers (5m si lent)." },
    'A3': { title: "Open A3", description: "Vol hors zones habitées.", zet: "ZET: > 150m zones urbaines. Aucun tiers." },
    'STS-01': { title: "Spécifique STS-01", description: "VLOS zone peuplée.", zet: "Zone contrôlée au sol. Rayon = Hauteur." },
    'STS-02': { title: "Spécifique STS-02", description: "BVLOS hors zone peuplée.", zet: "Zone tampon 30m min autour emprise." },
};

const MISSION_TYPES = ['Inspection Technique', 'Photogrammétrie', 'Audiovisuel', 'Nettoyage (AirFlyClean)', 'Relevé Lidars', 'Thermographie'];
const DOC_TYPES = ['Arrêté Préfectoral', 'Protocole ATC', 'Assurance RC', 'DNC Pilote', 'Plan de prévention', 'Autre'];
const MISSION_STATUS = [
    { value: 'En cours', color: 'bg-sky-500', text: 'text-sky-600', border: 'border-sky-200' },
    { value: 'Validé', color: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200' },
    { value: 'Reporté', color: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200' },
    { value: 'Annulé', color: 'bg-red-500', text: 'text-red-600', border: 'border-red-200' }
];

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

// --- 4. HELPERS ---
const calculateDuration = (start, end) => {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return 0;
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

// --- 5. COMPOSANTS UI ---

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
            <div className="bg-white p-12 md:p-16 rounded-[64px] shadow-2xl w-full max-w-md text-center border-t-8 border-sky-500 animate-in zoom-in-95">
                <img src={LOGO_URL} className="h-24 mx-auto mb-10 object-contain" alt="Aerothau" onError={(e) => { e.target.style.display='none'; }} />
                <h2 className="text-4xl font-black mb-1 uppercase tracking-tighter leading-none text-slate-900">Pilote Manager</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-12 tracking-widest text-center">Aerothau Operational Center</p>
                <form onSubmit={login} className="space-y-6 text-left text-black">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 leading-none">Email</label>
                        <input required type="email" placeholder="Saisir email..." className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-[24px] outline-none focus:border-sky-500 focus:bg-white transition-all font-bold text-black" value={email} onChange={e=>setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 leading-none">Mot de passe</label>
                        <input required type="password" placeholder="••••••••" className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-[24px] outline-none focus:border-sky-500 focus:bg-white transition-all font-bold text-black" value={password} onChange={e=>setPassword(e.target.value)} />
                    </div>
                    {err && <div className="text-red-600 text-xs font-black text-center bg-red-50 p-4 rounded-[20px] border border-red-100">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 text-white font-black py-6 rounded-[28px] uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : "ACCÉDER AU COCKPIT"}
                    </button>
                </form>
            </div>
        </div>
    );
};

const DashboardStats = ({ missions }) => {
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:hidden text-left">
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="bg-sky-100 p-3 rounded-2xl text-sky-600"><Plane size={24}/></div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Missions</p>
          <p className="text-2xl font-black text-slate-900 leading-none">{stats.count}</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600"><Clock size={24}/></div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 text-black">Vol</p>
          <p className="text-2xl font-black text-emerald-600 leading-none">{stats.hours}h</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="bg-orange-100 p-3 rounded-2xl text-orange-600"><Car size={24}/></div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Km</p>
          <p className="text-2xl font-black text-orange-600 leading-none">{stats.km}</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><Moon size={24}/></div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Découchers</p>
          <p className="text-2xl font-black text-indigo-600">{stats.nights}</p>
        </div>
      </div>
    </div>
  );
};

const MapView = ({ location }) => {
  const mapUrl = useMemo(() => {
    if (!location) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed&t=k`;
  }, [location]);

  if (!location) return (
    <div className="h-48 bg-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 print:hidden">
      <MapIcon size={32} className="mb-2 opacity-20"/>
      <p className="text-[10px] font-black uppercase tracking-widest px-6 text-center leading-none">Localisation requise</p>
    </div>
  );

  return (
    <div className="h-64 rounded-[40px] overflow-hidden border-4 border-white shadow-xl bg-slate-200 relative animate-in fade-in print:h-48 print:shadow-none print:border-slate-300">
      <iframe title="Map" width="100%" height="100%" frameBorder="0" src={mapUrl} allowFullScreen></iframe>
    </div>
  );
};

const SignaturePad = ({ title, onSave, savedData }) => {
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
  }, [savedData, onSave]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSave(null);
    setIsEmpty(true);
  };

  return (
    <div className="border border-slate-200 rounded-[32px] p-6 bg-white shadow-sm print:border-slate-300 print:shadow-none text-left">
      <div className="flex justify-between items-center mb-3 leading-none">
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">{title}</label>
        <button onClick={clear} className="text-[10px] text-red-500 font-black print:hidden uppercase leading-none">Effacer</button>
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-[24px] bg-slate-50 h-32 md:h-40 w-full touch-none overflow-hidden print:bg-white print:border-slate-300 leading-none">
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          className={`w-full h-full cursor-crosshair ${savedData ? 'pointer-events-none' : ''}`}
        />
        {isEmpty && !savedData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest leading-none">Signer ici</div>}
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

    const formatTimer = (sec) => {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

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
        <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col p-4 overflow-y-auto animate-in slide-in-from-bottom-10 duration-500 text-left leading-none">
            <div className="flex justify-between items-center mb-6 leading-none">
                <button onClick={onExit} className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg active:scale-90 leading-none"><ChevronLeft size={24}/></button>
                <div className="text-center leading-none">
                    <h2 className="text-emerald-400 font-black tracking-tighter text-xl uppercase leading-none">OPERATIONAL COCKPIT</h2>
                    <p className="text-[9px] text-slate-500 font-mono mt-1 uppercase tracking-widest leading-none">{mission.ref} | {mission.type}</p>
                </div>
                <div className="bg-slate-800 p-3 rounded-2xl border border-slate-700 shadow-lg leading-none">
                    <BatteryCharging size={24} className={isFlying ? "text-emerald-400 animate-pulse" : "text-slate-500"} />
                </div>
            </div>

            <div className="flex-1 space-y-6 pb-20 max-w-lg mx-auto w-full leading-none">
                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 text-center shadow-2xl relative overflow-hidden leading-none">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-4">Temps de Vol</div>
                    <div className="text-7xl font-mono font-black mb-10 tabular-nums text-white tracking-tighter leading-none">{formatTimer(elapsed)}</div>
                    <button onClick={handleFlight} className={`w-full py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 transition-all active:scale-95 leading-none ${isFlying ? 'bg-red-600 animate-pulse' : 'bg-emerald-600 shadow-emerald-900/40 shadow-xl'}`}>
                        {isFlying ? <Square fill="currentColor" size={24}/> : <Play fill="currentColor" size={24}/>}
                        {isFlying ? 'ATTERRISSAGE' : 'DÉCOLLAGE'}
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4 leading-none">
                    <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 text-left leading-none">
                         <div className="flex items-center gap-3 mb-4 leading-none">
                            <CloudSun size={20} className="text-sky-400"/>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Environnement</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center leading-none">
                            <div><Wind size={18} className="mx-auto text-slate-500 mb-1 leading-none"/><p className="text-xs font-black leading-none">{mission.meteoVent || '--'}</p></div>
                            <div className="border-x border-slate-800 leading-none"><Thermometer size={18} className="mx-auto text-slate-500 mb-1 leading-none"/><p className="text-xs font-black leading-none">{mission.meteoTemp || '--'}</p></div>
                            <div><Shield size={18} className="mx-auto text-slate-500 mb-1 leading-none"/><p className="text-xs font-black leading-none">{mission.meteoKP || '--'}</p></div>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 text-left leading-none">
                        <div className="flex items-center gap-3 mb-2 leading-none">
                            <Shield size={20} className="text-emerald-400"/>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Scénario</h3>
                        </div>
                        <p className="text-xs font-black text-emerald-400 uppercase leading-none mb-1 leading-none">{SCENARIO_INFOS[mission.scenario]?.title || "N/A"}</p>
                        <p className="text-[8px] text-slate-400 leading-tight font-medium uppercase tracking-tight leading-none">{SCENARIO_INFOS[mission.scenario]?.zet}</p>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 text-left space-y-6 leading-none">
                    <div className="flex items-center gap-3 leading-none"><Info size={24} className="text-orange-400"/><h3 className="text-xs font-black uppercase tracking-widest text-slate-200 leading-none">Consignes</h3></div>
                    <div className="space-y-4 leading-none">
                        {mission.flightNotes && <div className="bg-orange-500/10 border-l-4 border-orange-500 p-4 rounded-r-2xl leading-none"><h4 className="text-[9px] font-black text-orange-400 uppercase leading-none mb-1 leading-none">VOL / ATC</h4><p className="text-xs font-medium leading-relaxed text-slate-200 leading-none">{mission.flightNotes}</p></div>}
                        {mission.techNotes && <div className="bg-sky-500/10 border-l-4 border-sky-500 p-4 rounded-r-2xl leading-none"><h4 className="text-[9px] font-black text-sky-400 uppercase leading-none mb-1 leading-none">TECHNIQUE</h4><p className="text-xs font-medium leading-relaxed text-slate-200 leading-none">{mission.techNotes}</p></div>}
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 leading-none">
                    <div className="flex justify-between mb-2 text-[10px] font-black uppercase tracking-widest leading-none">
                        <span className="text-slate-500 leading-none">Sécurité</span>
                        <span className={progress === 100 ? 'text-emerald-400' : 'text-orange-400'} leading-none>{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner leading-none">
                        <div className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{width: `${progress}%`}}></div>
                    </div>
                </div>

                <div className="space-y-3 leading-none">
                    {(mission.contacts || []).map((c, i) => (
                        <a key={i} href={`tel:${c.phone}`} className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-3xl flex justify-between items-center active:bg-blue-600/30 transition-all leading-none text-black">
                            <div className="text-left leading-none">
                                <div className="font-black text-blue-100 uppercase text-xs leading-none mb-1 leading-none">{c.name}</div>
                                <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest leading-none leading-none">{c.role}</div>
                            </div>
                            <div className="bg-blue-600 p-3 rounded-full text-white shadow-lg leading-none"><Phone size={20}/></div>
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- COMPOSANT : ADMIN SCREEN ---
const AdminScreen = ({ onClose, userUid }) => {
    const [tab, setTab] = useState('team');
    const [isCreating, setIsCreating] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [fleet, setFleet] = useState([]);
    const [clients, setClients] = useState([]);
    const [form, setForm] = useState({ name: '', email: '', detail: '' });

    useEffect(() => {
        const unsubTeam = onSnapshot(query(collection(db, 'employees')), (s) => setEmployees(s.docs.map(d => ({id: d.id, ...d.data()}))));
        const unsubFleet = onSnapshot(query(collection(db, 'users', userUid, 'fleet')), (s) => setFleet(s.docs.map(d => ({id: d.id, ...d.data()}))));
        const unsubClients = onSnapshot(query(collection(db, 'users', userUid, 'clients')), (s) => setClients(s.docs.map(d => ({id: d.id, ...d.data()}))));
        return () => { unsubTeam(); unsubFleet(); unsubClients(); };
    }, [userUid]);

    const handleAdd = async (e) => {
        e.preventDefault();
        const collectionRef = tab === 'team' ? collection(db, 'employees') : collection(db, 'users', userUid, tab);
        await addDoc(collectionRef, { ...form, createdAt: serverTimestamp() });
        setIsCreating(false); setForm({ name: '', email: '', detail: '' });
    };

    const handleDelete = async (t, id) => {
        if(!confirm("Supprimer cet élément ?")) return;
        const docRef = t === 'team' ? doc(db, 'employees', id) : doc(db, 'users', userUid, t, id);
        await deleteDoc(docRef);
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen animate-in fade-in leading-none">
            <button onClick={onClose} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 font-black text-xs uppercase tracking-widest transition-colors leading-none"><ChevronLeft/> Missions</button>
            <div className="flex flex-col md:flex-row justify-between gap-6 mb-10 border-b border-slate-200 pb-8 text-left leading-none">
                <div><h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Administration</h1><p className="text-slate-500 text-sm font-medium mt-1 leading-none">Gestion globale du cockpit.</p></div>
                <div className="flex gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto w-fit h-fit leading-none">
                    {['team', 'fleet', 'clients'].map(t => (
                        <button key={t} onClick={() => {setTab(t); setIsCreating(false);}} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'} leading-none`}>{t === 'team' ? 'Équipe' : t === 'fleet' ? 'Flotte' : 'Clients'}</button>
                    ))}
                </div>
            </div>
            {isCreating ? (
                <form onSubmit={handleAdd} className="bg-white p-8 rounded-[40px] shadow-2xl border border-slate-200 mb-8 grid md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 text-left leading-none">
                    <input className="border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 bg-slate-50 focus:bg-white transition-all font-bold text-black placeholder:text-slate-400 leading-none" placeholder="Nom complet" required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                    <input className="border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 bg-slate-50 focus:bg-white transition-all font-bold text-black placeholder:text-slate-400 leading-none" placeholder={tab==='team' ? 'Email' : 'Détail (ID/IDN)'} required value={tab==='team'?form.email:form.detail} onChange={e=>tab==='team'?setForm({...form, email:e.target.value}):setForm({...form, detail:e.target.value})} />
                    <div className="flex gap-2 leading-none"><button className="flex-1 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl leading-none">Valider</button><button type="button" onClick={()=>setIsCreating(false)} className="bg-slate-100 p-4 rounded-2xl text-slate-500 leading-none"><X size={20}/></button></div>
                </form>
            ) : (
                <button onClick={()=>setIsCreating(true)} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 font-black uppercase text-xs tracking-widest mb-8 hover:bg-white hover:border-sky-300 transition-all leading-none">+ Ajouter à {tab}</button>
            )}
            <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm leading-none">
                <table className="w-full text-left leading-none">
                    <tbody className="divide-y divide-slate-100 text-black leading-none">
                        {(tab === 'team' ? employees : tab === 'fleet' ? fleet : clients).map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors leading-none">
                                <td className="p-6 leading-none"><div className="font-black uppercase text-sm leading-none">{item.name}</div><div className="text-xs text-slate-400 font-bold uppercase tracking-wide leading-none leading-none">{item.email || item.detail || "Sans précision"}</div></td>
                                <td className="p-6 text-right leading-none"><button onClick={() => handleDelete(tab, item.id)} className="text-slate-200 hover:text-red-500 active:scale-90 transition-all leading-none"><Trash2 size={20}/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- APPLICATION PRINCIPALE ---
export default function App() {
  const [user, setUser] = useState(null);
  const [missions, setMissions] = useState([]);
  const [currentMission, setCurrentMission] = useState(null);
  const [view, setView] = useState('list'); 
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [isFieldMode, setIsFieldMode] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);

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

  const handleDeleteMission = async (id) => {
      if (!confirm("Supprimer cette mission définitivement ?")) return;
      await deleteDoc(doc(db, 'users', user.uid, 'missions', id));
      setView('list');
      setCurrentMission(null);
  };

  const refreshWeather = async () => {
      if (!currentMission?.location) return;
      setWeatherLoading(true);
      try {
          const w = await fetchWeatherWithIA(currentMission.location);
          if (w) {
              await handleUpdate('meteoVent', w.wind);
              await handleUpdate('meteoTemp', w.temp);
              await handleUpdate('meteoKP', w.kp);
              await handleUpdate('meteoDesc', w.desc);
          }
      } catch (err) {
          console.error("Weather failed:", err);
      } finally {
          setWeatherLoading(false);
      }
  };

  const handleCreate = async () => {
    const m = { 
        ref: `ATH-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
        date: new Date().toISOString().split('T')[0], title: '', client: '', location: '', type: 'Inspection Technique', 
        category: 'Open', scenario: 'A3', status: 'En cours', debriefing: '', checklist: {}, contacts: [], logs: [], documents: [], 
        flightNotes: '', techNotes: '', meteoVent: '', meteoTemp: '', meteoKP: '', takeOffPoints: [],
        overnight: false, travel: false, kmStart: '', kmEnd: '', createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'users', user.uid, 'missions'), m);
    setCurrentMission({ id: docRef.id, ...m }); setView('edit'); setActiveTab('general');
  };

  const activeChecklistItems = currentMission ? [...BASE_CHECKLIST, ...(SPECIFIC_CHECKLISTS[currentMission.type] || [])] : [];
  const checkedCount = currentMission ? Object.values(currentMission.checklist || {}).filter(Boolean).length : 0;
  const safetyScore = Math.round((checkedCount / Math.max(activeChecklistItems.length, 1)) * 100);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-sky-500" /></div>;
  if (!user) return <LoginScreen />;
  if (isAdminView) return <AdminScreen onClose={()=>setIsAdminView(false)} userUid={user.uid} />;
  if (view === 'edit' && isFieldMode && currentMission) return <FieldModeView mission={currentMission} onExit={()=>setIsFieldMode(false)} onUpdate={handleUpdate} />;

  return (
    <div className="min-h-screen font-sans text-slate-800 bg-slate-50 pb-20 print:bg-white print:pb-0 text-left leading-none">
      <nav className="sticky top-0 z-50 shadow-xl border-b border-slate-700 px-4 md:px-8 py-4 flex justify-between items-center bg-slate-900 text-white print:hidden leading-none">
        <div className="flex items-center gap-5 leading-none">
          {view !== 'list' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all active:scale-90 leading-none"><ChevronLeft size={24} /></button>}
          <img src={LOGO_URL} alt="Logo" className="h-10 brightness-0 invert object-contain leading-none" onError={(e) => { e.target.style.display='none'; }} /> 
          <span className="font-black text-2xl tracking-tighter uppercase leading-none">Aerothau</span>
        </div>
        <div className="flex gap-2 leading-none">
          {view === 'list' ? (
            <>
              <button onClick={() => setView('calendar')} className={`p-2.5 rounded-xl border border-slate-700 ${view === 'calendar' ? 'bg-sky-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'} transition-all leading-none`}><CalendarIcon size={22}/></button>
              <button onClick={()=>setIsAdminView(true)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:bg-slate-700 hover:text-white transition-all shadow-md leading-none"><Shield size={22}/></button>
              <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl active:scale-95 transition-all leading-none"><Plus size={20}/> Mission</button>
            </>
          ) : view === 'edit' ? (
            <div className="flex gap-2 leading-none">
                <button onClick={() => handleDeleteMission(currentMission.id)} className="bg-red-500/10 text-red-500 px-4 py-2.5 rounded-2xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all active:scale-90 leading-none"><Trash2 size={20}/></button>
                <button onClick={() => window.print()} className="bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 border border-slate-700 active:scale-95 transition-all shadow-lg leading-none"><Printer size={18}/> Rapport</button>
                <button onClick={()=>setIsFieldMode(true)} className="bg-orange-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl active:scale-95 transition-all leading-none"><Maximize size={20}/> Cockpit</button>
                <button onClick={() => setView('list')} className="bg-emerald-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl active:scale-95 transition-all leading-none"><Save size={18}/> Finir</button>
            </div>
          ) : null}
          <button onClick={()=>signOut(auth)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:bg-red-900/40 transition-colors print:hidden leading-none"><LogOut size={22}/></button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8 print:p-0 print:max-w-none text-left leading-none">
        {view === 'list' && (
          <div className="animate-in fade-in duration-500 leading-none">
            <DashboardStats missions={missions} />
            <div className="flex justify-between items-center mb-8 leading-none">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none text-black">Opérations en cours</h2>
                <div className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-widest leading-none leading-none">Actif</div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 leading-none">
                {missions.map(m => {
                    const currentStatus = MISSION_STATUS.find(s => s.value === m.status) || MISSION_STATUS[0];
                    return (
                        <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} 
                            className={`bg-white p-8 rounded-[48px] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border-2 ${currentStatus.border} group relative overflow-hidden text-left leading-none`}>
                            <div className="flex justify-between mb-5 leading-none">
                                <span className="text-[10px] font-black tracking-widest bg-slate-50 text-slate-400 px-4 py-1.5 rounded-full border border-slate-100 uppercase leading-none">{m.ref}</span>
                                <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full text-white ${currentStatus.color} leading-none`}>{m.status}</span>
                            </div>
                            <h3 className="font-black text-2xl text-slate-900 mb-2 uppercase leading-tight group-hover:text-sky-600 transition-colors tracking-tighter text-black">{m.title || m.client || "Nouvelle Mission"}</h3>
                            <p className="text-xs text-slate-500 font-bold flex items-center gap-2 uppercase tracking-wide leading-none leading-none"><MapPin size={16} className="text-slate-300 leading-none"/>{m.location || "Non localisée"}</p>
                            {m.overnight && <span className="absolute top-10 -right-6 bg-indigo-500 text-white text-[8px] font-black px-8 py-1 rotate-45 uppercase shadow-sm leading-none leading-none">Découcher</span>}
                        </div>
                    );
                })}
            </div>
          </div>
        )}

        {view === 'calendar' && (
          <div className="bg-white p-10 rounded-[56px] shadow-xl border border-slate-200 animate-in zoom-in-95 print:hidden leading-none">
            <div className="flex justify-between items-center mb-10 text-left leading-none">
                <h2 className="text-3xl font-black uppercase tracking-tighter leading-none leading-none text-black">Planning Opérationnel</h2>
                <button onClick={() => setView('list')} className="text-sky-600 font-black text-xs uppercase flex items-center gap-2 hover:bg-sky-50 px-4 py-2 rounded-xl transition-all active:scale-95 leading-none leading-none"><ChevronLeft size={16}/> Retour Menu</button>
            </div>
            <div className="space-y-4 leading-none">
              {missions.length > 0 ? missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} className="flex items-center gap-8 p-6 hover:bg-slate-50 rounded-[40px] transition-all cursor-pointer border-2 border-transparent hover:border-slate-100 group text-left leading-none text-black">
                  <div className="bg-sky-100 text-sky-600 w-20 h-20 rounded-[28px] flex flex-col items-center justify-center font-black shadow-inner shrink-0 leading-none">
                    <span className="text-[10px] uppercase tracking-widest leading-none">{new Date(m.date).toLocaleDateString('fr-FR', {month:'short'})}</span>
                    <span className="text-2xl leading-none leading-none">{new Date(m.date).getDate()}</span>
                  </div>
                  <div className="flex-1 leading-none">
                    <h4 className="font-black text-xl text-slate-900 uppercase tracking-tighter group-hover:text-sky-600 transition-colors leading-none leading-none text-black">{m.title || m.client || "Mission sans titre"}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 flex items-center gap-1 leading-none leading-none"><MapPin size={12}/> {m.location || "Lieu non défini"}</p>
                  </div>
                  <ChevronRight size={28} className="text-slate-200 group-hover:text-sky-400 group-hover:translate-x-2 transition-all leading-none"/>
                </div>
              )) : <p className="text-center py-20 text-slate-400 uppercase font-black text-xs tracking-widest leading-none leading-none">Aucune mission planifiée</p>}
            </div>
          </div>
        )}

        {view === 'edit' && currentMission && (
            <div className="bg-white rounded-[56px] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in print:border-none print:shadow-none print:rounded-none leading-none">
                <div className="flex border-b border-slate-100 bg-slate-50 px-8 gap-8 sticky top-0 z-10 overflow-x-auto scrollbar-hide print:hidden leading-none">
                    {['general', 'technical', 'check', 'flight', 'sign'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`py-6 text-[10px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === t ? 'text-sky-600' : 'text-slate-400 hover:text-slate-900'} leading-none`}>
                            {t === 'general' ? 'Informations' : t === 'technical' ? 'Opérations' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                            {activeTab === t && <div className="absolute bottom-0 left-0 w-full h-1 bg-sky-600 rounded-full leading-none"></div>}
                        </button>
                    ))}
                </div>
                
                <div className="p-8 md:p-14 print:p-0 leading-none">
                    <div className="hidden print:block text-left leading-none">
                        <div className="flex justify-between items-start border-b-8 border-slate-900 pb-12 mb-12 leading-none text-black">
                            <div className="leading-none">
                                <h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-3 leading-none">Compte-Rendu Mission</h1>
                                <div className="flex gap-6 text-slate-500 font-black uppercase tracking-widest text-sm leading-none leading-none">
                                    <span>Référence : {currentMission.ref}</span>
                                    <span>Date d'opération : {new Date(currentMission.date).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <img src={LOGO_URL} className="h-24 object-contain leading-none" alt="Aerothau" />
                        </div>
                    </div>

                    {/* SECTION GENERALE */}
                    <div className={`${activeTab === 'general' ? 'block' : 'hidden print:block'} space-y-12 animate-in slide-in-from-bottom-5 print:space-y-8 text-left leading-none`}>
                        <div className="grid md:grid-cols-2 gap-12 items-start print:grid-cols-2 leading-none">
                            <div className="space-y-8 print:space-y-6 leading-none">
                                <div className="space-y-4 leading-none text-black">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900 leading-none">Mission & Client</label>
                                    <input className="w-full border-2 border-slate-100 p-6 rounded-[32px] bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-black text-3xl text-black transition-all shadow-inner print:border-none print:p-0 print:bg-white print:text-2xl leading-none" placeholder="Titre..." value={currentMission.title || ''} onChange={e => handleUpdate('title', e.target.value)} />
                                    <input className="w-full border-2 border-slate-100 p-5 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold text-slate-700 print:border-none print:p-0 print:text-xl leading-none" placeholder="Client" value={currentMission.client || ''} onChange={e => handleUpdate('client', e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-4 leading-none text-black">
                                    <div className="space-y-2 leading-none">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900 leading-none">Date</label>
                                        <input type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black print:border-none print:p-0 leading-none" value={currentMission.date || ''} onChange={e => handleUpdate('date', e.target.value)} />
                                    </div>
                                    <div className="space-y-2 leading-none text-black">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900 leading-none">Prestation</label>
                                        <select className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black print:appearance-none print:border-none print:p-0 leading-none" value={currentMission.type || ''} onChange={e => handleUpdate('type', e.target.value)}>
                                            {MISSION_TYPES.map(t => <option key={t} value={t} className="leading-none text-black">{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2 leading-none text-black">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900 leading-none">Lieu d'intervention</label>
                                    <input className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black print:border-none print:p-0 print:text-lg leading-none" placeholder="Adresse complète..." value={currentMission.location || ''} onChange={e => handleUpdate('location', e.target.value)} />
                                </div>

                                {/* SECTION POINTS DE DECOLLAGE GPS */}
                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:bg-white print:border-slate-300 print:shadow-none text-left leading-none text-black">
                                    <div className="flex items-center justify-between text-sky-600 leading-none">
                                        <div className="flex items-center gap-3 leading-none leading-none">
                                            <Navigation size={24} className="leading-none text-black"/>
                                            <h4 className="text-xs font-black uppercase tracking-widest leading-none text-black">Points de décollage (GPS)</h4>
                                        </div>
                                        <button onClick={()=>handleUpdate('takeOffPoints', [...(currentMission.takeOffPoints||[]), {name:'', coords:''}])} className="bg-sky-600 text-white p-2 rounded-xl hover:bg-sky-700 transition-all print:hidden shadow-lg leading-none"><Plus size={18}/></button>
                                    </div>
                                    <div className="space-y-4 leading-none">
                                        {(currentMission.takeOffPoints || []).map((point, i) => (
                                            <div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative group animate-in slide-in-from-right-2 print:bg-white print:border-slate-200 leading-none">
                                                <button onClick={()=>{const n=[...currentMission.takeOffPoints]; n.splice(i,1); handleUpdate('takeOffPoints',n)}} className="absolute top-4 right-4 text-red-300 hover:text-red-500 transition-all print:hidden leading-none leading-none text-black"><Trash2 size={16}/></button>
                                                <div className="grid grid-cols-1 gap-3 leading-none text-black">
                                                    <input className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-black text-black outline-none focus:border-sky-500 print:border-none print:p-0 print:text-base leading-none" placeholder="Nom du point (ex: Zone A)..." value={point.name} onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].name=e.target.value; handleUpdate('takeOffPoints',n)}} />
                                                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 print:border-none print:p-0 leading-none">
                                                        <MapPin size={14} className="text-slate-400 print:hidden leading-none"/>
                                                        <input className="flex-1 bg-transparent text-xs font-black text-sky-600 outline-none leading-none" placeholder="Coordonnées GPS (ex: 43.51, 3.42)..." value={point.coords} onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].coords=e.target.value; handleUpdate('takeOffPoints',n)}} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-6 print:grid-cols-2 leading-none text-black">
                                    <div className={`p-6 rounded-[32px] border-2 transition-all flex flex-col justify-between ${currentMission.overnight ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'} print:bg-white print:border-slate-400 leading-none`}>
                                        <div className="flex justify-between items-start mb-4 leading-none">
                                            <div className="text-indigo-600 font-black uppercase text-[10px] tracking-widest leading-none leading-none">Découcher</div>
                                            <button onClick={()=>handleUpdate('overnight', !currentMission.overnight)} className={`w-12 h-6 rounded-full transition-all relative print:hidden ${currentMission.overnight ? 'bg-indigo-500' : 'bg-slate-300'} leading-none`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${currentMission.overnight ? 'left-6.5' : 'left-0.5'} leading-none`}></div></button>
                                        </div>
                                        <div className="flex items-center gap-3 leading-none leading-none leading-none"><Moon className={`${currentMission.overnight ? 'text-indigo-600' : 'text-slate-300'} leading-none`} size={24}/><span className="font-bold text-slate-900 text-sm leading-none">{currentMission.overnight ? 'Grand Déplacement' : 'Base de retour'}</span></div>
                                    </div>
                                    <div className={`p-6 rounded-[32px] border-2 transition-all flex flex-col justify-between ${currentMission.travel ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'} print:bg-white print:border-slate-400 leading-none text-black`}>
                                        <div className="flex justify-between items-start mb-4 leading-none text-black">
                                            <div className="text-orange-600 font-black uppercase text-[10px] tracking-widest leading-none leading-none">Kilométrage</div>
                                            <button onClick={()=>handleUpdate('travel', !currentMission.travel)} className={`w-12 h-6 rounded-full transition-all relative print:hidden ${currentMission.travel ? 'bg-orange-500' : 'bg-slate-300'} leading-none`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${currentMission.travel ? 'left-6.5' : 'left-0.5'} leading-none`}></div></button>
                                        </div>
                                        <div className="flex items-center gap-3 leading-none leading-none leading-none text-black"><Car className={`${currentMission.travel ? 'text-orange-600' : 'text-slate-300'} leading-none`} size={24} />{currentMission.travel ? (<div className="flex gap-2 text-xs font-black text-black leading-none"><input className="w-12 bg-transparent outline-none border-b border-orange-200 text-center leading-none" value={currentMission.kmStart || ''} placeholder="D" onChange={e=>handleUpdate('kmStart', e.target.value)} /><span className="text-orange-300 leading-none">/</span><input className="w-12 bg-transparent outline-none border-b border-orange-200 text-center leading-none" value={currentMission.kmEnd || ''} placeholder="A" onChange={e=>handleUpdate('kmEnd', e.target.value)} /></div>) : <span className="font-bold text-slate-400 text-sm uppercase tracking-tighter leading-none">Sans</span>}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-8 leading-none">
                                <MapView location={currentMission.location} />
                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:bg-white print:border-slate-300 print:shadow-none text-left leading-none text-black">
                                    <div className="flex items-center justify-between text-indigo-600 leading-none">
                                        <div className="flex items-center gap-3 leading-none leading-none text-black">
                                          <Users size={24} className="leading-none text-black"/>
                                          <h4 className="text-xs font-black uppercase tracking-widest leading-none leading-none text-black">Interlocuteurs</h4>
                                        </div>
                                        <button onClick={()=>handleUpdate('contacts', [...(currentMission.contacts||[]), {name:'', phone:'', role:''}])} className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-all print:hidden shadow-lg leading-none leading-none"><UserPlus size={18}/></button>
                                    </div>
                                    <div className="space-y-4 leading-none">
                                        {(currentMission.contacts || []).map((contact, i) => (
                                            <div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative group animate-in slide-in-from-right-2 print:bg-white print:border-slate-200 leading-none">
                                                <button onClick={()=>{const n=[...currentMission.contacts]; n.splice(i,1); handleUpdate('contacts',n)}} className="absolute top-4 right-4 text-red-300 hover:text-red-500 transition-all print:hidden leading-none leading-none"><Trash2 size={16}/></button>
                                                <div className="grid grid-cols-2 gap-4 leading-none text-black leading-none"><input className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-black text-black outline-none focus:border-indigo-500 print:border-none print:p-0 print:text-base leading-none" placeholder="Nom..." value={contact.name} onChange={e=>{const n=[...currentMission.contacts]; n[i].name=e.target.value; handleUpdate('contacts',n)}} /><input className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-black outline-none focus:border-indigo-500 print:border-none print:p-0 print:text-slate-500 leading-none" placeholder="Rôle..." value={contact.role} onChange={e=>{const n=[...currentMission.contacts]; n[i].role=e.target.value; handleUpdate('contacts',n)}} /></div>
                                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 print:border-none print:p-0 leading-none text-black leading-none"><Phone size={14} className="text-slate-400 print:hidden leading-none"/><input className="flex-1 bg-transparent text-xs font-black text-indigo-600 outline-none print:text-indigo-800 leading-none" placeholder="Téléphone..." value={contact.phone} onChange={e=>{const n=[...currentMission.contacts]; n[i].phone=e.target.value; handleUpdate('contacts',n)}} /></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:hidden text-left leading-none text-black">
                                    <div className="flex items-center gap-3 text-sky-600 mb-2 leading-none leading-none text-black">
                                        <FolderOpen size={24} className="leading-none text-black"/>
                                        <h4 className="text-xs font-black uppercase tracking-widest leading-none leading-none text-black">Documents cloud</h4>
                                    </div>
                                    <div className="space-y-4 leading-none text-black text-left">
                                        {(currentMission.documents || []).map((docItem, i) => (
                                            <div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative group animate-in slide-in-from-right-2 leading-none">
                                                <div className="grid grid-cols-2 gap-3 leading-none leading-none"><select className="bg-white border border-slate-200 rounded-xl p-2 text-[10px] font-black text-slate-900 outline-none focus:border-sky-500 leading-none" value={docItem.type || ''} onChange={e=>{const n=[...currentMission.documents]; n[i].type=e.target.value; handleUpdate('documents',n)}}><option value="" className="leading-none text-black">-- Type --</option>{DOC_TYPES.map(t => <option key={t} value={t} className="leading-none text-black">{t}</option>)}</select><input className="bg-white border border-slate-200 rounded-xl p-2 text-[10px] font-bold text-slate-900 outline-none focus:border-sky-500 leading-none" placeholder="Nom..." value={docItem.name} onChange={e=>{const n=[...currentMission.documents]; n[i].name=e.target.value; handleUpdate('documents',n)}} /></div>
                                                <div className="flex gap-2 leading-none leading-none"><div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 leading-none leading-none"><LinkIcon size={14} className="text-slate-400 leading-none"/><input className="flex-1 bg-transparent text-[9px] font-medium text-sky-600 outline-none leading-none" placeholder="Lien..." value={docItem.url} onChange={e=>{const n=[...currentMission.documents]; n[i].url=e.target.value; handleUpdate('documents',n)}} /></div><a href={docItem.url} target="_blank" rel="noreferrer" className="bg-sky-100 p-2.5 rounded-xl text-sky-600 hover:bg-sky-600 hover:text-white transition-all leading-none leading-none text-black"><Eye size={18} className="leading-none"/></a><button onClick={()=>{const n=[...currentMission.documents]; n.splice(i,1); handleUpdate('documents',n)}} className="bg-red-50 p-2.5 rounded-xl text-red-400 hover:bg-red-500 hover:text-white transition-all leading-none leading-none leading-none text-black"><Trash2 size={18} className="leading-none"/></button></div>
                                            </div>
                                        ))}
                                        <button onClick={()=>handleUpdate('documents', [...(currentMission.documents||[]), {name:'', url:'https://', type:''}])} className="w-full py-5 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-black uppercase text-[10px] tracking-widest hover:border-sky-300 hover:text-sky-500 transition-all leading-none leading-none">+ Ajouter Dossier</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION TECHNIQUE / METEO */}
                    <div className={`${activeTab === 'technical' ? 'block' : 'hidden print:block'} space-y-10 animate-in fade-in duration-500 print:mt-16 print:pt-16 print:border-t-2 print:border-slate-100 text-left leading-none text-black`}>
                        <div className="flex flex-col md:flex-row gap-6 items-center mb-8 print:hidden leading-none leading-none text-black">
                            <div className="grid grid-cols-3 gap-6 flex-1 w-full leading-none leading-none text-black">
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 leading-none leading-none leading-none text-black"><Wind className="text-sky-500 leading-none" size={28}/><div className="flex-1 leading-none leading-none text-black"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none leading-none mb-1 leading-none text-black">Vent</p><input className="w-full bg-transparent font-black text-lg outline-none text-black leading-none leading-none" value={currentMission.meteoVent || ''} onChange={e=>handleUpdate('meteoVent', e.target.value)} /></div></div>
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 leading-none leading-none leading-none text-black"><Thermometer className="text-orange-500 leading-none" size={28}/><div className="flex-1 leading-none leading-none text-black"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none leading-none mb-1 leading-none text-black">Temp.</p><input className="w-full bg-transparent font-black text-lg outline-none text-black leading-none leading-none" value={currentMission.meteoTemp || ''} onChange={e=>handleUpdate('meteoTemp', e.target.value)} /></div></div>
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 leading-none leading-none leading-none text-black"><CloudSun className="text-emerald-500 leading-none" size={28}/><div className="flex-1 leading-none leading-none text-black"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none leading-none mb-1 leading-none text-black">KP</p><input className="w-full bg-transparent font-black text-lg outline-none text-black leading-none leading-none" value={currentMission.meteoKP || ''} onChange={e=>handleUpdate('meteoKP', e.target.value)} /></div></div>
                            </div>
                            <button onClick={refreshWeather} disabled={weatherLoading} className="bg-slate-900 text-white p-6 rounded-[32px] shadow-xl hover:bg-slate-800 active:scale-95 disabled:opacity-50 leading-none leading-none leading-none leading-none text-black">{weatherLoading ? <Loader2 size={24} className="animate-spin leading-none text-black"/> : <RefreshCw size={24} className="leading-none text-black"/>}</button>
                        </div>
                        <div className="hidden print:grid grid-cols-3 gap-10 mb-10 border-b pb-10 leading-none leading-none leading-none text-black">
                            <div className="leading-none text-black"><p className="text-[10px] font-black text-slate-400 uppercase mb-2 leading-none leading-none text-black">Vent</p><p className="text-2xl font-black leading-none leading-none leading-none text-black">{currentMission.meteoVent} km/h</p></div>
                            <div className="leading-none text-black"><p className="text-[10px] font-black text-slate-400 uppercase mb-2 leading-none leading-none text-black">Température</p><p className="text-2xl font-black leading-none leading-none leading-none text-black">{currentMission.meteoTemp} °C</p></div>
                            <div className="leading-none text-black"><p className="text-[10px] font-black text-slate-400 uppercase mb-2 leading-none leading-none text-black">Indice KP</p><p className="text-2xl font-black leading-none leading-none leading-none text-black">{currentMission.meteoKP}</p></div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-12 print:grid-cols-1 leading-none text-black">
                            <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-10 shadow-2xl print:bg-white print:text-black print:p-0 print:shadow-none print:border-none text-left leading-none leading-none text-black">
                                <div className="space-y-4 leading-none leading-none leading-none text-black"><div className="flex items-center gap-4 text-orange-400 mb-2 border-b border-slate-800 pb-4 print:border-slate-900 print:text-black leading-none leading-none leading-none leading-none leading-none text-black text-black"><Plane size={24} className="leading-none text-black"/><h4 className="font-black uppercase tracking-widest text-xs leading-none leading-none leading-none text-black">Consignes Vol / ATC</h4></div><textarea className="w-full bg-slate-800/50 border-2 border-slate-700 p-6 rounded-3xl outline-none focus:border-orange-500 h-40 text-sm font-medium leading-relaxed print:bg-white print:border-none print:p-0 print:h-auto print:text-base leading-none leading-none leading-none text-black" placeholder="NOTAM, zones..." value={currentMission.flightNotes || ''} onChange={e=>handleUpdate('flightNotes', e.target.value)}></textarea></div>
                                <div className="space-y-4 leading-none leading-none leading-none text-black"><div className="flex items-center gap-4 text-emerald-400 mb-2 border-b border-slate-800 pb-4 print:border-slate-900 print:text-black leading-none leading-none leading-none leading-none leading-none text-black text-black"><Wrench size={24} className="leading-none text-black"/><h4 className="font-black uppercase tracking-widest text-xs leading-none leading-none leading-none text-black">Notes Techniques</h4></div><textarea className="w-full bg-slate-800/50 border-2 border-slate-700 p-6 rounded-3xl outline-none focus:border-emerald-500 h-40 text-sm font-medium leading-relaxed print:bg-white print:border-none print:p-0 print:h-auto print:text-base leading-none leading-none leading-none text-black" placeholder="Capteurs..." value={currentMission.techNotes || ''} onChange={e=>handleUpdate('techNotes', e.target.value)}></textarea></div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION SECURITE */}
                    <div className={`${activeTab === 'check' ? 'block' : 'hidden print:block'} grid md:grid-cols-2 gap-12 animate-in slide-in-from-right-10 duration-500 print:mt-16 print:pt-16 print:border-t-2 print:border-slate-100 text-left leading-none text-black`}>
                        <div className="bg-slate-900 text-white p-12 rounded-[56px] relative overflow-hidden print:bg-white print:text-black print:p-0 print:shadow-none leading-none text-black">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-6 mb-8 print:border-slate-900 print:pb-2 print:mb-6 leading-none leading-none leading-none text-black">
                                <div className="text-emerald-400 font-black text-4xl tracking-tighter uppercase print:text-black print:text-3xl leading-none leading-none leading-none leading-none text-black">{SCENARIO_INFOS[currentMission.scenario]?.title}</div>
                                <select className="bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border border-slate-700 outline-none print:hidden leading-none leading-none leading-none leading-none text-black" value={currentMission.scenario || 'A3'} onChange={e => handleUpdate('scenario', e.target.value)}>
                                    <option value="A1" className="leading-none text-black">Open A1</option><option value="A2" className="leading-none text-black">Open A2</option><option value="A3" className="leading-none text-black">Open A3</option><option value="STS-01" className="leading-none text-black">STS-01</option><option value="STS-02" className="leading-none text-black">STS-02</option>
                                </select>
                            </div>
                            <p className="text-slate-400 text-sm mb-12 leading-relaxed font-medium print:text-slate-500 print:mb-6 leading-tight leading-none leading-none text-black">{SCENARIO_INFOS[currentMission.scenario]?.description}</p>
                            <div className="text-sm border-l-4 border-sky-500 pl-6 leading-none leading-none leading-none text-black"><strong className="block text-sky-400 text-[10px] uppercase font-black mb-1 print:text-black leading-none leading-none leading-none leading-none leading-none text-black text-black">Règle ZET</strong><span className="font-bold print:text-slate-700 leading-none leading-none leading-none leading-none text-black">{SCENARIO_INFOS[currentMission.scenario]?.zet}</span></div>
                        </div>
                        <div className="space-y-6 leading-none text-black leading-none">
                            <div className="flex justify-between items-end mb-4 px-2 print:mb-4 leading-none leading-none leading-none text-black">
                                <div className="leading-none text-black"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black leading-none leading-none leading-none mb-2 leading-none text-black">Checklist Sécurité</h4><span className={`text-3xl font-black ${safetyScore === 100 ? 'text-emerald-500' : 'text-orange-500'} print:text-xl leading-none leading-none leading-none text-black`}>{safetyScore}%</span></div>
                                <button onClick={() => { const all = {}; activeChecklistItems.forEach(i => all[i.k] = true); handleUpdate('checklist', all); }} className="bg-emerald-600 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-emerald-500 active:scale-95 print:hidden leading-none leading-none leading-none text-black text-black">Tout Valider</button>
                            </div>
                            <div className="space-y-3 print:space-y-2 leading-none leading-none leading-none text-black">
                                {activeChecklistItems.map(i => (
                                    <div key={i.k} onClick={() => handleUpdate('checklist', {...(currentMission.checklist||{}), [i.k]: !currentMission.checklist?.[i.k]})} className={`flex items-center gap-5 p-5 rounded-[32px] border-2 cursor-pointer transition-all active:scale-[0.98] ${currentMission.checklist?.[i.k] ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-100'} print:p-2 print:border-none print:bg-white leading-none leading-none leading-none text-black`}><div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 ${currentMission.checklist?.[i.k] ? 'bg-emerald-500 border-emerald-500 text-white shadow-md' : 'border-slate-300 text-transparent'} print:w-4 print:h-4 print:border-black leading-none leading-none leading-none text-black`}><Check size={18} strokeWidth={4} className="print:hidden leading-none text-black"/></div><span className={`font-black uppercase text-xs tracking-tight ${currentMission.checklist?.[i.k] ? 'text-emerald-900' : 'text-slate-400'} print:text-black print:text-[10px] leading-none leading-none leading-none text-black`}>{i.l}</span></div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* SECTION LOGBOOK */}
                    <div className={`${activeTab === 'flight' ? 'block' : 'hidden print:block'} animate-in fade-in duration-500 space-y-10 print:mt-16 print:pt-16 print:border-t-2 print:border-slate-100 text-left leading-none text-black`}>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-black leading-none leading-none text-black">Journal des Vols (Logbook)</h4>
                        <div className="bg-white border-2 border-slate-100 rounded-[48px] overflow-hidden shadow-sm print:border-slate-300 print:rounded-none print:shadow-none leading-none leading-none leading-none text-black">
                            <table className="w-full text-left leading-none leading-none leading-none text-black leading-none leading-none text-black"><thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 print:bg-white print:text-black print:border-black leading-none leading-none leading-none leading-none text-black"><tr><th className="p-7 leading-none text-black">#</th><th className="p-7 leading-none text-black">Heures Vol</th><th className="p-7 leading-none text-black">Batt.</th><th className="p-7 text-right leading-none text-black">Durée</th><th className="p-7 text-center print:hidden leading-none leading-none text-black">Action</th></tr></thead><tbody className="divide-y divide-slate-100 font-bold text-slate-700 print:divide-slate-200 text-black leading-none leading-none leading-none text-black">{(currentMission.logs || []).map((l, i) => (<tr key={l.id} className="hover:bg-slate-50 transition-colors print:hover:bg-white leading-none leading-none leading-none leading-none text-black text-black"><td className="p-7 text-slate-300 font-black print:text-black leading-none leading-none leading-none leading-none text-black text-black">{i+1}</td><td className="p-7 font-mono text-slate-500 print:text-slate-700 text-xs leading-none leading-none leading-none leading-none text-black text-black">{l.start || '--:--'} ➔ {l.end || '--:--'}</td><td className="p-7 text-sky-600 font-black print:text-black leading-none leading-none leading-none leading-none text-black text-black">{l.battery}%</td><td className="p-7 text-right font-black text-black text-lg tabular-nums leading-none leading-none leading-none leading-none text-black text-black">{formatDuration(calculateDuration(l.start, l.end))}</td><td className="p-7 text-center print:hidden leading-none leading-none leading-none leading-none text-black text-black"><button onClick={() => { const nl = [...currentMission.logs]; nl.splice(i, 1); handleUpdate('logs', nl); }} className="text-red-300 hover:text-red-500 active:scale-90 leading-none leading-none leading-none leading-none text-black text-black"><Trash2 size={18} className="leading-none text-black"/></button></td></tr>))}</tbody></table>
                        </div>
                        <button onClick={()=>handleUpdate('logs', [...(currentMission.logs||[]), {id:Date.now(), start:'12:00', end:'12:20', battery:'40', notes:'Saisie manuelle'}])} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 font-black uppercase text-xs hover:bg-white hover:border-sky-300 hover:text-sky-600 transition-all active:scale-[0.99] print:hidden leading-none leading-none leading-none text-black leading-none text-black">+ Saisie manuelle d'un vol</button>
                    </div>

                    {/* SECTION VALIDATION / SIGNATURES */}
                    <div className={`${activeTab === 'sign' ? 'block' : 'hidden print:block'} animate-in fade-in duration-500 space-y-12 print:mt-16 text-left leading-none text-black`}>
                        <div className="grid md:grid-cols-2 gap-8 print:grid-cols-1 leading-none text-black">
                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:border-slate-300 leading-none text-black">
                                <div className="flex items-center gap-3 text-indigo-600 leading-none leading-none leading-none text-black text-black"><MessageSquare size={24} className="leading-none text-black"/><h4 className="text-xs font-black uppercase tracking-widest leading-none leading-none leading-none text-black text-black">Débriefing Mission</h4></div>
                                <textarea className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl outline-none focus:border-indigo-500 h-40 text-sm font-medium leading-relaxed text-black print:bg-white print:border-none print:p-0 print:h-auto leading-none leading-none leading-none text-black text-black" placeholder="Observations, incidents, points à surveiller..." value={currentMission.debriefing || ''} onChange={e=>handleUpdate('debriefing', e.target.value)}></textarea>
                            </div>
                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:border-slate-300 flex flex-col justify-center leading-none text-black">
                                <div className="flex items-center gap-3 text-emerald-600 leading-none leading-none leading-none text-black text-black"><CheckCircle2 size={24} className="leading-none text-black"/><h4 className="text-xs font-black uppercase tracking-widest leading-none leading-none leading-none text-black text-black">Statut de la mission</h4></div>
                                <div className="grid grid-cols-2 gap-3 print:hidden leading-none leading-none leading-none text-black text-black">
                                    {MISSION_STATUS.map(s => (
                                        <button key={s.value} onClick={()=>handleUpdate('status', s.value)} className={`p-4 rounded-2xl font-black text-[10px] uppercase transition-all active:scale-95 border-2 ${currentMission.status === s.value ? `${s.color} text-white ${s.border}` : `bg-white text-slate-400 border-slate-100 hover:border-slate-200`} leading-none text-black`}>{s.value}</button>
                                    ))}
                                </div>
                                <div className="hidden print:block leading-none leading-none text-black text-black text-black"><p className="text-xl font-black text-black leading-none leading-none text-black text-black text-black">STATUT : {currentMission.status}</p></div>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-10 print:grid-cols-2 leading-none leading-none text-black text-black text-black">
                            <SignaturePad title="Visa Télépilote (Aerothau)" savedData={currentMission.signaturePilote} onSave={d => handleUpdate('signaturePilote', d)} />
                            <SignaturePad title="Visa Client / Représentant" savedData={currentMission.signatureClient} onSave={d => handleUpdate('signatureClient', d)} />
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL QR CODE */}
        {qrModal && (
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300 leading-none leading-none text-black text-black text-black" onClick={()=>setQrModal(false)}>
                <div className="bg-white p-12 rounded-[64px] max-w-sm w-full text-center shadow-2xl relative animate-in zoom-in-95 duration-300 leading-none leading-none text-black text-black text-black" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>setQrModal(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-950 active:scale-90 transition-all leading-none leading-none text-black text-black text-black text-black text-black leading-none"><X size={36} className="leading-none text-black"/></button>
                    <h3 className="text-3xl font-black mb-3 tracking-tighter uppercase leading-none leading-none text-slate-900 leading-none text-black">Validation Mobile</h3>
                    <p className="text-[10px] text-slate-400 mb-12 font-black uppercase tracking-widest px-6 text-center leading-tight leading-none leading-none text-black">Le client doit scanner ce code avec son mobile pour signer l'intervention.</p>
                    <div className="bg-white p-10 rounded-[48px] shadow-inner mb-12 border border-slate-100 flex items-center justify-center leading-none leading-none leading-none text-black text-black text-black text-black">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?mode=sign&uid=${user.uid}&mid=${currentMission.id}`)}`} className="w-full h-auto mix-blend-multiply leading-none leading-none text-black text-black text-black" alt="QR" />
                    </div>
                    <button onClick={()=>setQrModal(false)} className="w-full py-6 bg-slate-950 text-white rounded-[32px] font-black text-lg shadow-xl uppercase active:scale-95 transition-all leading-none leading-none text-black text-black text-black text-black text-black">Fermer</button>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}