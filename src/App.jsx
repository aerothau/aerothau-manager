import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
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
  serverTimestamp
} from 'firebase/firestore';
import { 
  Plus, 
  Printer, 
  Trash2, 
  ChevronLeft, 
  MapPin, 
  Calendar as CalendarIcon,
  Plane, 
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
  AlertTriangle
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

// --- COMPOSANT LOGO DYNAMIQUE ---
const Logo = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 70" fill="none" className={className}>
    <path d="M20 55 L40 15 L60 55 M30 45 L50 45" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="75" y="50" fontFamily="Arial" fontSize="38" fontWeight="900" fill="currentColor" letterSpacing="-1">AEROTHAU</text>
  </svg>
);

// --- 2. IA WEATHER INTEGRATION ---
const apiKey = ""; 

const fetchWeatherWithIA = async (location) => {
  if (!location) return null;
  const systemPrompt = "Expert météo aéronautique. Récupère temp (°C), vent (km/h), KP. Réponds UNIQUEMENT en JSON : {\"temp\": \"valeur\", \"wind\": \"valeur\", \"kp\": \"valeur\", \"desc\": \"météo\"}.";
  const userQuery = `Météo pour : ${location}`;

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
    return null; 
  }
};

// --- 3. CONSTANTES MÉTIER ---
const SCENARIO_INFOS = {
    'A1': { title: "Open A1", description: "Survol personnes isolées possible.", zet: "Éviter le survol des tiers." },
    'A2': { title: "Open A2", description: "Vol proximité personnes.", zet: "30m des tiers (5m mode lent)." },
    'A3': { title: "Open A3", description: "Vol hors zones habitées.", zet: "> 150m zones urbaines." },
    'STS-01': { title: "STS-01", description: "VLOS zone peuplée.", zet: "Zone contrôlée au sol. R=H." },
    'STS-02': { title: "STS-02", description: "BVLOS hors zone peuplée.", zet: "Zone tampon 30m min." },
};

const MISSION_STATUS = [
    { value: 'En cours', color: 'bg-sky-500', border: 'border-sky-200' },
    { value: 'Validé', color: 'bg-emerald-500', border: 'border-emerald-200' },
    { value: 'Reporté', color: 'bg-amber-500', border: 'border-amber-200' },
    { value: 'Annulé', color: 'bg-red-500', border: 'border-red-200' }
];

const MISSION_TYPES = ['Inspection Technique', 'Photogrammétrie', 'Audiovisuel', 'Nettoyage', 'Lidars', 'Thermographie'];
const DOC_TYPES = ['Arrêté Préfectoral', 'Protocole ATC', 'RC Pro', 'DNC', 'Prévention', 'Autre'];
const BASE_CHECKLIST = [
    {k:'meteo',l:'Météo ok'}, 
    {k:'zet',l:'ZET Balisée'}, 
    {k:'auth',l:'Autorisations ok'}, 
    {k:'drone',l:'État drone'}, 
    {k:'batt',l:'Batteries pleines'}, 
    {k:'sd',l:'Carte SD'}
];
const SPECIFIC_CHECKLISTS = {
  'Lidars': [{k:'imu',l:'Chauffe IMU 3min'}, {k:'rtk',l:'Fix RTK stable'}],
  'Inspection Technique': [{k:'sensor_calib',l:'Calibration nacelle/capteur'}],
};

// --- 4. HELPERS ---
const calculateDuration = (start, end) => {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return 0;
  try {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (new Date(0, 0, 0, h2, m2).getTime() - new Date(0, 0, 0, h1, m1).getTime()) / 60000;
    return diff < 0 ? diff + 1440 : diff;
  } catch(e) { return 0; }
};

const formatDuration = (min) => `${Math.floor(min/60)}h ${Math.round(min%60)}m`;

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
            <div className="bg-white p-12 rounded-[48px] shadow-2xl w-full max-w-md text-center border-t-8 border-sky-500 animate-in zoom-in-95">
                <div className="h-24 flex items-center justify-center mb-6 text-slate-900">
                    <Logo className="h-full w-auto" />
                </div>
                <h2 className="text-3xl font-black mb-1 uppercase text-slate-900 tracking-tighter">Pilote Manager</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-12 tracking-widest text-center">Aerothau Operational Center</p>
                <form onSubmit={login} className="space-y-6 text-left">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Email</label>
                        <input required type="email" placeholder="Email" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 font-bold text-black" value={email} onChange={e=>setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Mot de passe</label>
                        <input required type="password" placeholder="••••••••" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 font-bold text-black" value={password} onChange={e=>setPassword(e.target.value)} />
                    </div>
                    {err && <div className="text-red-600 text-xs font-bold text-center bg-red-50 p-3 rounded-xl">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : "ACCÉDER AU COCKPIT"}
                    </button>
                </form>
            </div>
        </div>
    );
};

const DashboardStats = ({ missions }) => {
  const stats = useMemo(() => {
    let totalMin = 0;
    missions.forEach(m => {
        (m.logs || []).forEach(l => { totalMin += calculateDuration(l.start, l.end); });
    });
    const totalKm = missions.reduce((acc, m) => acc + (Math.max(0, (parseFloat(m.kmEnd) || 0) - (parseFloat(m.kmStart) || 0))), 0);
    return { count: missions.length, hours: (totalMin / 60).toFixed(1), km: totalKm, nights: missions.filter(m => m.overnight).length };
  }, [missions]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:hidden text-left">
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-sky-100 p-3 rounded-2xl text-sky-600"><Plane size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Missions</p><p className="text-2xl font-black">{stats.count}</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600"><Clock size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Heures Vol</p><p className="text-2xl font-black">{stats.hours}h</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-orange-100 p-3 rounded-2xl text-orange-600"><Car size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Km</p><p className="text-2xl font-black">{stats.km}</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><Moon size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Nuits</p><p className="text-2xl font-black">{stats.nights}</p></div>
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
    <div className="h-48 bg-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 print:hidden text-center">
      <MapIcon size={32} className="mb-2 opacity-20 mx-auto"/>
      <p className="text-[10px] font-black uppercase">Localisation requise</p>
    </div>
  );

  return (
    <div className="h-64 rounded-[32px] overflow-hidden border-4 border-white shadow-xl bg-slate-200 relative animate-in fade-in print:h-48 print:shadow-none print:border-slate-300">
      <iframe title="Map" width="100%" height="100%" frameBorder="0" src={mapUrl} allowFullScreen></iframe>
    </div>
  );
};

const SignaturePad = ({ title, onSave, savedData, isLocked }) => {
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

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { 
        x: (clientX - rect.left) * (canvas.width / rect.width), 
        y: (clientY - rect.top) * (canvas.height / rect.height) 
      };
    };

    const start = (e) => {
      if(e.cancelable) e.preventDefault(); 
      isDrawing.current = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0f172a";
      ctx.lineCap = "round";
      setIsEmpty(false);
    };

    const move = (e) => {
      if (!isDrawing.current) return;
      if (e.cancelable) e.preventDefault();
      const { x, y } = getPos(e);
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
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
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
    <div className="border border-slate-200 rounded-[32px] p-6 bg-white shadow-sm text-left">
      <div className="flex justify-between items-center mb-3">
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{title}</label>
        {!isLocked && <button onClick={clear} className="text-[10px] text-red-500 font-black uppercase">Effacer</button>}
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 h-32 w-full touch-none overflow-hidden print:bg-white print:border-slate-300">
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          className={`w-full h-full ${isLocked ? 'cursor-default' : 'cursor-crosshair'}`}
        />
        {isEmpty && !savedData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest">Signer ici</div>}
      </div>
    </div>
  );
};

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
        } else { clearInterval(timerRef.current); }
        return () => clearInterval(timerRef.current);
    }, [isFlying, startTime]);

    const formatTimerStr = (sec) => {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleFlight = () => {
        if (!isFlying) {
            setStartTime(Date.now()); setIsFlying(true); setElapsed(0);
        } else {
            setIsFlying(false);
            const s = new Date(startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const e = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const b = prompt("Batterie restante (%) ?") || "0";
            onUpdate('logs', [...(mission.logs || []), { id: Date.now(), start: s, end: e, battery: b, notes: 'Vol Terrain' }]);
        }
    };

    const progress = Math.round((Object.values(mission.checklist || {}).filter(Boolean).length / 6) * 100);

    return (
        <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col p-4 overflow-y-auto leading-none text-left">
            <div className="flex justify-between items-center mb-6 leading-none">
                <button onClick={onExit} className="bg-slate-800 p-3 rounded-xl active:scale-90 leading-none"><ChevronLeft size={24}/></button>
                <div className="text-center leading-none text-white"><h2 className="text-emerald-400 font-black text-xl uppercase leading-none">COCKPIT TERRAIN</h2><p className="text-[9px] text-slate-500 font-mono mt-1 uppercase tracking-widest leading-none">{mission.ref}</p></div>
                <div className="bg-slate-800 p-3 rounded-xl leading-none text-slate-300"><BatteryCharging size={24} className={isFlying ? "text-emerald-400 animate-pulse" : "text-slate-500"} /></div>
            </div>
            <div className="flex-1 space-y-6 pb-20 max-w-lg mx-auto w-full">
                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 text-center shadow-2xl leading-none">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Temps de Vol</div>
                    <div className="text-7xl font-mono font-black mb-8 tabular-nums">{formatTimerStr(elapsed)}</div>
                    <button onClick={handleFlight} className={`w-full py-6 rounded-3xl font-black text-xl active:scale-95 transition-all leading-none ${isFlying ? 'bg-red-600 animate-pulse' : 'bg-emerald-600 shadow-xl'}`}>
                        {isFlying ? 'ATTERRIR' : 'DÉCOLLER'}
                    </button>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-left leading-none">
                    <div className="flex justify-between mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Checklist Sécurité</span><span>{progress}%</span></div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-700" style={{width: `${progress}%`}}></div></div>
                </div>
                <div className="space-y-3 leading-none text-white text-left">
                    {(mission.contacts || []).map((c, i) => (
                        <a key={i} href={`tel:${c.phone}`} className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-3xl flex justify-between items-center active:bg-blue-600/30 transition-all leading-none">
                            <div className="text-left leading-none text-white">
                                <div className="font-black uppercase text-xs leading-none mb-1 text-left">{c.name}</div>
                                <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest leading-none text-left">{c.role}</div>
                            </div>
                            <div className="bg-blue-600 p-3 rounded-full text-white shadow-lg leading-none text-left"><Phone size={20}/></div>
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
};

const AdminScreen = ({ onClose, userUid }) => {
    const [tab, setTab] = useState('team');
    const [data, setData] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [form, setForm] = useState({ name: '', detail: '' });

    useEffect(() => {
        const path = tab === 'team' ? collection(db, 'employees') : collection(db, 'users', userUid, tab);
        const unsub = onSnapshot(query(path), s => setData(s.docs.map(d => ({id: d.id, ...d.data()}))));
        return () => unsub();
    }, [tab, userUid]);

    const handleAdd = async (e) => {
        e.preventDefault();
        const ref = tab === 'team' ? collection(db, 'employees') : collection(db, 'users', userUid, tab);
        await addDoc(ref, { ...form, createdAt: serverTimestamp() });
        setIsCreating(false); setForm({ name: '', detail: '' });
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen text-black text-left leading-none">
            <button onClick={onClose} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 font-black text-xs uppercase tracking-widest leading-none text-left"><ChevronLeft size={16}/> Missions</button>
            <div className="flex flex-col md:flex-row justify-between gap-6 mb-10 border-b border-slate-200 pb-8 text-left leading-none">
                <div><h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Administration</h1></div>
                <div className="flex gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 h-fit leading-none">
                    {['team', 'fleet', 'clients'].map(t => (
                        <button key={t} onClick={() => {setTab(t); setIsCreating(false);}} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400'}`}>{t === 'team' ? 'Équipe' : t === 'fleet' ? 'Flotte' : 'Clients'}</button>
                    ))}
                </div>
            </div>
            {isCreating ? (
                <form onSubmit={handleAdd} className="bg-white p-8 rounded-[40px] shadow-2xl border border-slate-200 mb-8 grid md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 text-left leading-none">
                    <input className="border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 font-bold text-black" placeholder="Nom" required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                    <input className="border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 font-bold text-black" placeholder="Détail" required value={form.detail} onChange={e=>setForm({...form, detail:e.target.value})} />
                    <div className="flex gap-2 leading-none text-black"><button className="flex-1 bg-sky-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl leading-none text-white">Valider</button><button onClick={()=>setIsCreating(false)} className="bg-slate-100 p-4 rounded-2xl text-slate-500 leading-none"><X size={20}/></button></div>
                </form>
            ) : (
                <button onClick={()=>setIsCreating(true)} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 font-black uppercase text-xs mb-8 hover:bg-white hover:border-sky-300 transition-all leading-none">+ Ajouter {tab}</button>
            )}
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden text-left leading-none text-black">
                <table className="w-full text-left leading-none text-black">
                    <tbody className="divide-y divide-slate-100 leading-none">
                        {data.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors leading-none"><td className="p-6 leading-none"><div className="font-black uppercase text-sm text-black leading-none">{item.name}</div><div className="text-xs text-slate-400 font-bold uppercase leading-none">{item.detail}</div></td><td className="p-6 text-right leading-none"><button onClick={async () => { if(confirm("Supprimer?")) await deleteDoc(doc(db, tab==='team'?'employees':'users', tab==='team'?item.id:userUid, tab==='team'?'':tab, item.id)); }} className="text-slate-200 hover:text-red-500 active:scale-90 transition-all leading-none"><Trash2 size={20}/></button></td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- APP ---
export default function App() {
  const [user, setUser] = useState(null);
  const [missions, setMissions] = useState([]);
  const [currentMission, setCurrentMission] = useState(null);
  const [view, setView] = useState('list'); 
  const [activeTab, setActiveTab] = useState('general');
  const [isLocked, setIsLocked] = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);
  const [loading, setLoading] = useState(true);
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
    const alwaysUpdate = ['status', 'debriefing', 'signaturePilote', 'signatureClient'].includes(f);
    if (isLocked && !alwaysUpdate) return;
    const updated = { ...currentMission, [f]: v };
    setCurrentMission(updated);
    await updateDoc(doc(db, 'users', user.uid, 'missions', currentMission.id), { [f]: v });
  };

  const handleCreate = async () => {
    const m = { 
        ref: `ATH-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
        date: new Date().toISOString().split('T')[0], title: '', client: '', location: '', type: 'Inspection Technique', 
        category: 'Open', scenario: 'A3', status: 'En cours', debriefing: '', checklist: {}, contacts: [], logs: [], documents: [], 
        takeOffPoints: [], flightNotes: '', techNotes: '', meteoVent: '', meteoTemp: '', meteoKP: '', overnight: false, travel: false, createdAt: serverTimestamp()
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 leading-none text-black text-left"><Loader2 className="animate-spin text-sky-500 leading-none text-black" /></div>;
  if (!user) return <LoginScreen />;
  if (isAdminView) return <AdminScreen onClose={()=>setIsAdminView(false)} userUid={user.uid} />;
  if (view === 'edit' && isFieldMode && currentMission) return <FieldModeView mission={currentMission} onExit={()=>setIsFieldMode(false)} onUpdate={handleUpdate} />;

  const activeChecklistItems = currentMission ? [...BASE_CHECKLIST, ...(SPECIFIC_CHECKLISTS[currentMission.type] || [])] : [];
  const safetyScore = currentMission ? Math.round((Object.values(currentMission.checklist || {}).filter(Boolean).length / Math.max(activeChecklistItems.length, 1)) * 100) : 0;

  return (
    <div className="min-h-screen font-sans bg-slate-50 pb-20 text-left text-black leading-none">
      <nav className="sticky top-0 z-50 shadow-xl border-b border-slate-700 px-4 md:px-8 py-4 flex justify-between items-center bg-slate-900 text-white print:hidden leading-none text-left">
        <div className="flex items-center gap-5 leading-none text-white">
          {view !== 'list' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all leading-none text-white"><ChevronLeft size={24}/></button>}
          <Logo className="h-8 w-auto text-white"/>
        </div>
        <div className="flex gap-2 text-black leading-none">
          {view === 'list' ? (
            <>
                <button onClick={()=>setIsAdminView(true)} className="p-2.5 bg-slate-800 rounded-xl leading-none text-white"><Shield size={22}/></button>
                <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-xl leading-none text-white"><Plus size={18} className="inline mr-2"/> Mission</button>
            </>
          ) : (
            <div className="flex gap-2 leading-none text-black text-left">
                <button onClick={() => setIsLocked(!isLocked)} className={`p-2.5 rounded-2xl shadow-lg active:scale-90 leading-none ${isLocked ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>{isLocked ? <Lock size={20}/> : <Unlock size={20}/>}</button>
                {!isLocked && <button onClick={async () => { if(confirm("Supprimer?")) { await deleteDoc(doc(db, 'users', user.uid, 'missions', currentMission.id)); setView('list'); } }} className="bg-red-500 text-white p-2.5 rounded-2xl shadow-lg active:scale-90 leading-none text-white"><Trash2 size={20}/></button>}
                <button onClick={() => window.print()} className="bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 border border-slate-700 leading-none shadow-lg text-white"><Printer size={18}/> Rapport</button>
                <button onClick={()=>setIsFieldMode(true)} className="bg-orange-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl active:scale-95 leading-none text-white"><Maximize size={20}/> Cockpit</button>
                <button onClick={() => setView('list')} className="bg-sky-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-xl leading-none text-white">Finir</button>
            </div>
          )}
          <button onClick={()=>signOut(auth)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl leading-none text-white text-left"><LogOut size={22} className="text-white"/></button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8 print:p-0 leading-none text-black text-left">
        {view === 'list' && (
          <div className="animate-in fade-in leading-none text-black text-left">
            <DashboardStats missions={missions} />
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-8 leading-none text-black text-left">Opérations</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 leading-none text-black text-left">
                {missions.map(m => {
                    const s = MISSION_STATUS.find(x => x.value === m.status) || MISSION_STATUS[0];
                    return (
                        <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit'); setIsLocked(true);}} 
                            className={`bg-white p-8 rounded-[48px] shadow-sm hover:shadow-2xl transition-all cursor-pointer border-2 ${s.border} group relative overflow-hidden text-left leading-none text-black`}>
                            <div className="flex justify-between mb-5 leading-none text-black text-left leading-none"><span className="text-[10px] font-black tracking-widest bg-slate-50 text-slate-400 px-4 py-1.5 rounded-full border border-slate-100 uppercase leading-none text-black text-left">{m.ref}</span><span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full text-white ${s.color} leading-none text-white text-left`}>{m.status}</span></div>
                            <h3 className="font-black text-2xl text-slate-900 mb-2 uppercase tracking-tighter leading-tight text-black text-left">{m.title || m.client || "Nouvelle Mission"}</h3>
                            <p className="text-xs text-slate-500 font-bold flex items-center gap-2 uppercase tracking-wide leading-none text-black text-left text-black"><MapPin size={16} className="text-slate-300"/>{m.location || "Non localisée"}</p>
                        </div>
                    );
                })}
            </div>
          </div>
        )}

        {view === 'edit' && currentMission && (
            <div className="bg-white rounded-[56px] shadow-2xl border border-slate-200 overflow-hidden text-black text-left leading-none">
                <div className="flex border-b border-slate-100 bg-slate-50 px-8 gap-8 sticky top-0 z-10 overflow-x-auto scrollbar-hide print:hidden leading-none text-black text-left">
                    {['general', 'technical', 'check', 'flight', 'sign'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`py-6 text-[10px] font-black uppercase tracking-widest relative ${activeTab === t ? 'text-sky-600' : 'text-slate-400 hover:text-slate-900'} leading-none text-black text-left`}>
                            {t === 'general' ? 'Informations' : t === 'technical' ? 'Opérations' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                            {activeTab === t && <div className="absolute bottom-0 left-0 w-full h-1 bg-sky-600 rounded-full leading-none"></div>}
                        </button>
                    ))}
                </div>
                
                <div className="p-8 md:p-14 print:p-0 leading-none text-black text-left text-black text-left">
                    <div className="hidden print:flex justify-between items-start border-b-8 border-slate-900 pb-12 mb-12 text-black leading-none text-black text-left">
                        <div><h1 className="text-6xl font-black uppercase tracking-tighter text-black leading-none mb-3">Compte-Rendu Mission</h1><div className="flex gap-6 text-slate-500 font-black uppercase tracking-widest text-sm leading-none text-black text-left"><span>Référence : {currentMission.ref}</span><span>Date : {new Date(currentMission.date).toLocaleDateString()}</span></div></div>
                        <Logo className="h-24 w-auto text-black"/>
                    </div>

                    {activeTab === 'general' && (
                        <div className="space-y-12 animate-in slide-in-from-bottom-5 print:space-y-8 text-left leading-none text-black text-left">
                            <div className="grid md:grid-cols-2 gap-12 items-start print:grid-cols-2 leading-none text-black text-left">
                                <div className="space-y-8 print:space-y-6 leading-none text-black text-left text-black">
                                    <div className="space-y-4 leading-none text-black text-left">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900 leading-none text-black text-left">Mission & Client</label>
                                        <input disabled={isLocked} className="w-full border-2 border-slate-100 p-6 rounded-[32px] bg-slate-50 focus:bg-white outline-none font-black text-3xl text-black leading-none text-black text-left" value={currentMission.title || ''} onChange={e=>handleUpdate('title', e.target.value)} />
                                        <input disabled={isLocked} className="w-full border-2 border-slate-100 p-5 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold text-slate-700 leading-none text-black text-left" placeholder="Client" value={currentMission.client || ''} onChange={e=>handleUpdate('client', e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-black text-left">
                                        <div className="space-y-2 text-black leading-none text-left"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 print:text-slate-900 leading-none text-black">Date</label><input disabled={isLocked} type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black leading-none" value={currentMission.date || ''} onChange={e=>handleUpdate('date', e.target.value)} /></div>
                                        <div className="space-y-2 text-black leading-none text-left"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 print:text-slate-900 leading-none text-black">Prestation</label><select disabled={isLocked} className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black leading-none" value={currentMission.type || ''} onChange={e=>handleUpdate('type', e.target.value)}>{MISSION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                                    </div>
                                    <div className="space-y-2 text-black leading-none text-left"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 print:text-slate-900 leading-none text-black">Lieu</label><input disabled={isLocked} className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black print:border-none print:p-0 print:text-lg leading-none text-black text-left" value={currentMission.location || ''} onChange={e=>handleUpdate('location', e.target.value)} /></div>
                                    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 text-black leading-none text-black text-left">
                                        <div className="flex items-center justify-between text-sky-600 leading-none text-black text-left"><div className="flex items-center gap-3 text-black leading-none text-black text-left"><Navigation size={24}/><h4 className="text-xs font-black uppercase text-black leading-none text-black">Points Décollage GPS</h4></div>{!isLocked && <button onClick={()=>handleUpdate('takeOffPoints', [...(currentMission.takeOffPoints||[]), {name:'', coords:''}])} className="bg-sky-600 text-white p-2 rounded-xl leading-none text-black"><Plus size={18} className="text-white"/></button>}</div>
                                        <div className="space-y-4 text-black text-left leading-none">{(currentMission.takeOffPoints || []).map((point, i) => (<div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative text-black text-left leading-none text-black text-left">{!isLocked && <button onClick={()=>{const n=[...currentMission.takeOffPoints]; n.splice(i,1); handleUpdate('takeOffPoints',n)}} className="absolute top-4 right-4 text-red-300 leading-none text-black text-left"><Trash2 size={16} className="text-red-400"/></button>}<input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-black text-black outline-none w-full leading-none text-black text-left" value={point.name} placeholder="Nom" onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].name=e.target.value; handleUpdate('takeOffPoints',n)}} /><input disabled={isLocked} className="w-full bg-transparent text-xs font-black text-sky-600 outline-none mt-2 leading-none text-black text-left" value={point.coords} placeholder="GPS" onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].coords=e.target.value; handleUpdate('takeOffPoints',n)}} /></div>))}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6 leading-none text-black text-left">
                                        <div className={`p-6 rounded-[32px] border-2 transition-all flex flex-col justify-between ${currentMission.overnight ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'} print:bg-white print:border-slate-400 leading-none text-black`}>
                                            <div className="flex justify-between items-start mb-4 leading-none text-black text-left"><div className="text-indigo-600 font-black uppercase text-[10px] tracking-widest leading-none text-black">Découcher</div>{!isLocked && <button onClick={()=>handleUpdate('overnight', !currentMission.overnight)} className={`w-12 h-6 rounded-full relative ${currentMission.overnight ? 'bg-indigo-500' : 'bg-slate-300'} leading-none text-black`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${currentMission.overnight ? 'left-6.5' : 'left-0.5'} leading-none text-black`}></div></button>}</div>
                                            <div className="flex items-center gap-3 text-black leading-none leading-none text-black text-left"><Moon className={currentMission.overnight ? 'text-indigo-600' : 'text-slate-300'} size={24}/><span className="font-bold text-slate-900 text-sm leading-none text-black">{currentMission.overnight ? 'Grand Déplacement' : 'Base de retour'}</span></div>
                                        </div>
                                        <div className={`p-6 rounded-[32px] border-2 transition-all flex flex-col justify-between ${currentMission.travel ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'} print:bg-white print:border-slate-400 leading-none text-black text-left`}>
                                            <div className="flex justify-between items-start mb-4 leading-none text-black text-left"><div className="text-orange-600 font-black uppercase text-[10px] tracking-widest leading-none text-black">Kilométrage</div>{!isLocked && <button onClick={()=>handleUpdate('travel', !currentMission.travel)} className={`w-12 h-6 rounded-full relative ${currentMission.travel ? 'bg-orange-500' : 'bg-slate-300'} leading-none text-black`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${currentMission.travel ? 'left-6.5' : 'left-0.5'} leading-none text-black`}></div></button>}</div>
                                            <div className="flex items-center gap-3 text-black leading-none text-black text-left"><Car className={currentMission.travel ? 'text-orange-600' : 'text-slate-300'} size={24} />{currentMission.travel ? (<div className="flex gap-2 text-xs font-black text-black leading-none text-black"><input disabled={isLocked} className="w-12 bg-transparent outline-none border-b border-orange-200 text-center leading-none text-black" value={currentMission.kmStart || ''} placeholder="D" onChange={e=>handleUpdate('kmStart', e.target.value)} /><span className="text-orange-300 leading-none text-black">/</span><input disabled={isLocked} className="w-12 bg-transparent outline-none border-b border-orange-200 text-center leading-none text-black" value={currentMission.kmEnd || ''} placeholder="A" onChange={e=>handleUpdate('kmEnd', e.target.value)} /></div>) : <span className="font-bold text-slate-400 text-sm uppercase leading-none text-black">Sans</span>}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-8 text-black text-left leading-none">
                                    <MapView location={currentMission.location} />
                                    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-black leading-none text-black text-left"><div className="flex items-center justify-between mb-6 text-indigo-600 leading-none text-black text-left"><div className="flex items-center gap-3 text-black leading-none text-black text-left"><Users size={24}/><h4 className="text-xs font-black uppercase text-black leading-none text-black text-left">Interlocuteurs</h4></div>{!isLocked && <button onClick={()=>handleUpdate('contacts', [...(currentMission.contacts||[]), {name:'', phone:'', role:''}])} className="bg-indigo-600 text-white p-2 rounded-xl leading-none text-black text-left"><UserPlus size={18} className="text-white"/></button>}</div><div className="space-y-4">{(currentMission.contacts || []).map((contact, i) => (<div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative text-black leading-none text-black text-left">{!isLocked && <button onClick={()=>{const n=[...currentMission.contacts]; n.splice(i,1); handleUpdate('contacts',n)}} className="absolute top-4 right-4 text-red-300 text-black leading-none text-black text-left"><Trash2 size={16} className="text-red-400 leading-none"/></button>}<div className="grid grid-cols-2 gap-4 text-black leading-none text-black text-left"><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-black text-black outline-none leading-none text-black text-left" value={contact.name} onChange={e=>{const n=[...currentMission.contacts]; n[i].name=e.target.value; handleUpdate('contacts',n)}} /><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-black outline-none leading-none text-black text-left" value={contact.role} onChange={e=>{const n=[...currentMission.contacts]; n[i].role=e.target.value; handleUpdate('contacts',n)}} /></div><div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-black leading-none text-black text-left"><Phone size={14}/><input disabled={isLocked} className="flex-1 bg-transparent text-xs font-black text-indigo-600 outline-none text-black leading-none text-black text-left" value={contact.phone} onChange={e=>{const n=[...currentMission.contacts]; n[i].phone=e.target.value; handleUpdate('contacts',n)}} /></div></div>))}</div></div>
                                    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-black text-left leading-none text-black text-left">
                                        <div className="flex items-center gap-3 text-sky-600 mb-6 text-black leading-none text-left"><FolderOpen size={24}/><h4 className="text-xs font-black uppercase text-black leading-none text-black text-left">Documents</h4></div>
                                        <div className="space-y-4 text-black text-left leading-none text-black text-left">
                                            {(currentMission.documents || []).map((docItem, i) => (
                                                <div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative text-black leading-none text-black text-left">
                                                    {!isLocked && <button onClick={()=>{const n=[...currentMission.documents]; n.splice(i,1); handleUpdate('documents',n)}} className="absolute top-4 right-4 text-red-300 text-black leading-none text-black text-left"><Trash2 size={16} className="text-red-400"/></button>}
                                                    <div className="grid grid-cols-2 gap-3 text-black leading-none text-black text-left"><select disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-[10px] font-black text-slate-900 outline-none leading-none text-black text-left" value={docItem.type || ''} onChange={e=>{const n=[...currentMission.documents]; n[i].type=e.target.value; handleUpdate('documents',n)}}><option value="">-- Type --</option>{DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-[10px] font-bold text-slate-900 outline-none leading-none text-black text-left" placeholder="Nom" value={docItem.name} onChange={e=>{const n=[...currentMission.documents]; n[i].name=e.target.value; handleUpdate('documents',n)}} /></div>
                                                    <div className="flex gap-2 text-black leading-none text-black text-left"><div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-black leading-none text-black text-left"><LinkIcon size={14} className="text-slate-400 text-left"/><input disabled={isLocked} className="flex-1 bg-transparent text-[9px] font-medium text-sky-600 outline-none leading-none text-black text-left" placeholder="Lien" value={docItem.url} onChange={e=>{const n=[...currentMission.documents]; n[i].url=e.target.value; handleUpdate('documents',n)}} /></div><a href={docItem.url} target="_blank" rel="noreferrer" className="bg-sky-100 p-2.5 rounded-xl text-sky-600 leading-none text-black text-left"><Eye size={18}/></a></div>
                                                </div>
                                            ))}
                                            {!isLocked && <button onClick={()=>handleUpdate('documents', [...(currentMission.documents||[]), {name:'', url:'https://', type:''}])} className="w-full py-5 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-black uppercase text-[10px] tracking-widest leading-none text-black text-left">+ Ajouter Document</button>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'technical' && (
                        <div className="space-y-10 animate-in fade-in duration-500 text-left text-black leading-none text-black text-left">
                            <div className="flex flex-col md:flex-row gap-6 items-center mb-8 print:hidden leading-none text-black text-left">
                                <div className="grid grid-cols-3 gap-6 flex-1 w-full text-black text-left">
                                    <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 text-black text-left"><Wind className="text-sky-500" size={28}/><div className="flex-1 text-black text-left"><p className="text-[9px] font-black text-slate-400 uppercase text-black text-left mb-1">Vent</p><input disabled={isLocked} className="w-full bg-transparent font-black text-lg outline-none text-black text-left" value={currentMission.meteoVent || ''} onChange={e=>handleUpdate('meteoVent', e.target.value)} /></div></div>
                                    <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 text-black text-left"><Thermometer className="text-orange-500" size={28}/><div className="flex-1 text-black text-left"><p className="text-[9px] font-black text-slate-400 uppercase text-black text-left mb-1">Temp.</p><input disabled={isLocked} className="w-full bg-transparent font-black text-lg outline-none text-black text-left" value={currentMission.meteoTemp || ''} onChange={e=>handleUpdate('meteoTemp', e.target.value)} /></div></div>
                                    <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 text-black text-left"><CloudSun className="text-emerald-500" size={28}/><div className="flex-1 text-black text-left"><p className="text-[9px] font-black text-slate-400 uppercase text-black text-left mb-1">KP</p><input disabled={isLocked} className="w-full bg-transparent font-black text-lg outline-none text-black text-left" value={currentMission.meteoKP || ''} onChange={e=>handleUpdate('meteoKP', e.target.value)} /></div></div>
                                </div>
                                {!isLocked && <button onClick={refreshWeather} disabled={weatherLoading} className="bg-slate-900 text-white p-6 rounded-[32px] shadow-xl hover:bg-slate-800 active:scale-95 leading-none text-black text-left">{weatherLoading ? <Loader2 size={24} className="animate-spin text-white text-left"/> : <RefreshCw size={24} className="text-white text-left"/>}</button>}
                            </div>
                            <div className="grid md:grid-cols-2 gap-12 text-black leading-none text-left">
                                <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-10 shadow-2xl print:bg-white print:text-black print:p-0 text-left">
                                    <div className="space-y-4 text-left"><div className="flex items-center gap-4 text-orange-400 border-b border-slate-800 pb-4 print:border-slate-900 text-left"><Plane size={24} className="text-orange-400"/><h4 className="font-black uppercase tracking-widest text-xs text-orange-400">ATC / VOL</h4></div><textarea disabled={isLocked} className="w-full bg-slate-800/50 border-2 border-slate-700 p-6 rounded-3xl outline-none h-40 text-sm leading-relaxed text-black text-white" value={currentMission.flightNotes || ''} onChange={e=>handleUpdate('flightNotes', e.target.value)}></textarea></div>
                                    <div className="space-y-4 text-left"><div className="flex items-center gap-4 text-emerald-400 border-b border-slate-800 pb-4 print:border-slate-900 text-left"><Wrench size={24} className="text-emerald-400"/><h4 className="font-black uppercase tracking-widest text-xs text-emerald-400">TECHNIQUE</h4></div><textarea disabled={isLocked} className="w-full bg-slate-800/50 border-2 border-slate-700 p-6 rounded-3xl outline-none h-40 text-sm leading-relaxed text-black text-white" value={currentMission.techNotes || ''} onChange={e=>handleUpdate('techNotes', e.target.value)}></textarea></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'check' && (
                        <div className="grid md:grid-cols-2 gap-12 animate-in slide-in-from-right-10 duration-500 text-left text-black text-left">
                            <div className="bg-slate-900 text-white p-12 rounded-[56px] relative overflow-hidden print:bg-white print:text-black print:p-0 text-left">
                                <div className="flex justify-between items-center border-b border-slate-800 pb-6 mb-8 print:border-slate-900 text-left text-white text-left"><div className="text-emerald-400 font-black text-4xl tracking-tighter uppercase print:text-black text-left">{SCENARIO_INFOS[currentMission.scenario]?.title}</div><select disabled={isLocked} className="bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase border border-slate-700 outline-none print:hidden text-white" value={currentMission.scenario || 'A3'} onChange={e => handleUpdate('scenario', e.target.value)}>{Object.keys(SCENARIO_INFOS).map(k=><option key={k} value={k}>{k}</option>)}</select></div>
                                <p className="text-slate-400 text-sm mb-12 leading-relaxed print:text-slate-500 text-left">{currentMission.scenario === 'A3' ? "Vol hors zones habitées. > 150m des tiers." : SCENARIO_INFOS[currentMission.scenario]?.title}</p>
                                <div className="text-sm border-l-4 border-sky-500 pl-6 text-left"><strong className="block text-sky-400 text-[10px] uppercase font-black mb-1 print:text-black text-left">Règle ZET</strong><span className="font-bold print:text-slate-700 text-left">{SCENARIO_INFOS[currentMission.scenario]?.zet}</span></div>
                            </div>
                            <div className="space-y-6 text-black text-left">
                                <div className="flex justify-between items-end mb-4 px-2 text-left"><div><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black text-left">Sécurité</h4><span className={`text-3xl font-black ${safetyScore === 100 ? 'text-emerald-500' : 'text-orange-500'} text-left`}>{safetyScore}%</span></div>{!isLocked && <button onClick={() => { const all = {}; BASE_CHECKLIST.forEach(i => all[i.k] = true); handleUpdate('checklist', all); }} className="bg-emerald-600 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-lg text-left">Tout Valider</button>}</div>
                                <div className="space-y-3 text-left">{BASE_CHECKLIST.map(i => (<div key={i.k} onClick={() => !isLocked && handleUpdate('checklist', {...(currentMission.checklist||{}), [i.k]: !currentMission.checklist?.[i.k]})} className={`flex items-center gap-5 p-5 rounded-[32px] border-2 cursor-pointer transition-all ${currentMission.checklist?.[i.k] ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'} print:bg-white text-left`}><div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 ${currentMission.checklist?.[i.k] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'} text-left`}><Check size={18} strokeWidth={4}/></div><span className={`font-black uppercase text-xs ${currentMission.checklist?.[i.k] ? 'text-emerald-900' : 'text-slate-400'} text-left`}>{i.l}</span></div>))}</div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'flight' && (
                        <div className="animate-in fade-in duration-500 space-y-10 text-left text-black text-left">
                            <div className="bg-white border-2 border-slate-100 rounded-[48px] overflow-hidden shadow-sm leading-none text-black text-left"><table className="w-full text-left text-black text-left"><thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase border-b border-slate-100 text-black text-left"><tr><th className="p-7 text-left">#</th><th className="p-7 text-left">Horaires</th><th className="p-7 text-left">Batt.</th><th className="p-7 text-right">Durée</th>{!isLocked && <th className="p-7 text-center">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100 text-black text-left">{(currentMission.logs || []).map((l, i) => (<tr key={l.id} className="hover:bg-slate-50 transition-colors text-black text-left"><td className="p-7 text-slate-300 font-black text-left">{i+1}</td><td className="p-7 font-mono text-xs text-left">{l.start || '--:--'} ➔ {l.end || '--:--'}</td><td className="p-7 text-sky-600 font-black text-left">{l.battery}%</td><td className="p-7 text-right font-black text-lg tabular-nums text-left">{formatDuration(calculateDuration(l.start, l.end))}</td>{!isLocked && <td className="p-7 text-center text-left"><button onClick={()=>{const nl=[...currentMission.logs]; nl.splice(i,1); handleUpdate('logs',nl)}} className="text-red-300 hover:text-red-500 text-left"><Trash2 size={18}/></button></td>}</tr>))}</tbody></table></div>
                            {!isLocked && <button onClick={()=>handleUpdate('logs', [...(currentMission.logs||[]), {id:Date.now(), start:'12:00', end:'12:20', battery:'40'}])} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 font-black uppercase text-xs hover:bg-white text-left">+ Saisie manuelle</button>}
                        </div>
                    )}

                    {activeTab === 'sign' && (
                        <div className="animate-in fade-in duration-500 space-y-12 text-left text-black text-left">
                            <div className="grid md:grid-cols-2 gap-8 text-black text-left">
                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 text-black text-left"><div className="flex items-center gap-3 text-indigo-600 text-left"><MessageSquare size={24}/><h4 className="text-xs font-black uppercase text-black text-left">Débriefing Mission</h4></div><textarea className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl outline-none h-40 text-sm font-medium leading-relaxed text-black text-left" placeholder="Observations..." value={currentMission.debriefing || ''} onChange={e=>handleUpdate('debriefing', e.target.value)}></textarea></div>
                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-center text-black text-left leading-none"><div className="flex items-center gap-3 text-emerald-600 mb-6 text-left"><CheckCircle2 size={24}/><h4 className="text-xs font-black uppercase text-black text-left">Statut</h4></div><div className="grid grid-cols-2 gap-3 print:hidden text-left">{MISSION_STATUS.map(s => (<button key={s.value} onClick={()=>handleUpdate('status', s.value)} className={`p-4 rounded-2xl font-black text-[10px] uppercase border-2 ${currentMission.status === s.value ? `${s.color} text-white` : `bg-white text-slate-400 border-slate-100 hover:border-slate-200`} text-left`}>{s.value}</button>))}</div></div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-10 text-left">
                                <SignaturePad isLocked={false} title="Visa Télépilote (Aerothau)" savedData={currentMission.signaturePilote} onSave={d => handleUpdate('signaturePilote', d)} />
                                <SignaturePad isLocked={false} title="Visa Client" savedData={currentMission.signatureClient} onSave={d => handleUpdate('signatureClient', d)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* MODAL QR CODE */}
        {qrModal && (
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300 text-left" onClick={()=>setQrModal(false)}>
                <div className="bg-white p-12 rounded-[64px] max-w-sm w-full text-center shadow-2xl relative text-left" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>setQrModal(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-950 transition-colors active:scale-90 text-left"><X size={36}/></button>
                    <h3 className="text-3xl font-black mb-3 tracking-tighter uppercase leading-none text-left">Validation Client</h3>
                    <p className="text-[10px] text-slate-400 mb-12 font-black uppercase tracking-widest px-6 text-left">Signature sécurisée sans contact.</p>
                    <div className="bg-white p-10 rounded-[48px] shadow-inner mb-12 border border-slate-100 flex items-center justify-center text-left">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?mode=sign&uid=${user.uid}&mid=${currentMission.id}`)}`} className="w-full h-auto mix-blend-multiply text-left" alt="QR Code Signature" />
                    </div>
                    <button onClick={()=>setQrModal(false)} className="w-full py-6 bg-slate-950 text-white rounded-[32px] font-black text-lg shadow-xl uppercase tracking-widest active:scale-95 transition-all text-left">Fermer</button>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}