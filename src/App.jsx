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

// --- GEMINI API FOR WEATHER ---
const apiKey = ""; // La clé est fournie par l'environnement

const fetchWeatherWithIA = async (location) => {
  if (!location) return null;
  
  const systemPrompt = "Tu es un expert météo aéronautique. Donne la météo actuelle pour le lieu spécifié. Répond UNIQUEMENT avec un objet JSON strict : {\"temp\": \"nombre\", \"wind\": \"nombre\", \"kp\": \"nombre\", \"desc\": \"courte description\"}. Les nombres sont sans unités.";
  const userQuery = `Donne moi la météo actuelle à : ${location}`;

  const fetchWithRetry = async (delay = 1000, retries = 5) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userQuery }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ "google_search": {} }]
        })
      });
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      // Nettoyage JSON pour être sûr
      const cleanJson = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      if (retries > 0) {
        await new Promise(res => setTimeout(res, delay));
        return fetchWithRetry(delay * 2, retries - 1);
      }
      throw error;
    }
  };

  return fetchWithRetry();
};

// --- CONSTANTES ---
const SCENARIO_INFOS = {
    'A1': { title: "Open A1", description: "Survol de personnes isolées possible (pas de rassemblement).", zet: "ZET: Éviter le survol. Pas de distance minimale." },
    'A2': { title: "Open A2", description: "Vol proximité personnes.", zet: "ZET: 30m des tiers (5m si lent)." },
    'A3': { title: "Open A3", description: "Vol hors zones habitées.", zet: "ZET: > 150m zones urbaines. Aucun tiers." },
    'STS-01': { title: "Spécifique STS-01", description: "VLOS zone peuplée.", zet: "Zone contrôlée au sol. Rayon = Hauteur." },
    'STS-02': { title: "Spécifique STS-02", description: "BVLOS hors zone peuplée.", zet: "Zone tampon 30m min autour emprise." },
};

const MISSION_TYPES = ['Inspection Technique', 'Photogrammétrie', 'Audiovisuel', 'Nettoyage (AirFlyClean)', 'Relevé Lidars', 'Thermographie'];
const DOC_TYPES = ['Arrêté Préfectoral', 'Protocole ATC', 'Assurance RC', 'DNC Pilote', 'Plan de prévention', 'Autre'];
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

// --- HELPERS ---
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

// --- COMPOSANTS UI ---

const DashboardStats = ({ missions }) => {
  const totalMissions = missions.length;
  const totalMinutes = missions.reduce((acc, m) => acc + (m.logs?.reduce((sum, l) => sum + calculateDuration(l.start, l.end), 0) || 0), 0);
  const totalKm = missions.reduce((acc, m) => {
    const start = parseFloat(m.kmStart) || 0;
    const end = parseFloat(m.kmEnd) || 0;
    return acc + Math.max(0, end - start);
  }, 0);
  const totalOvernights = missions.filter(m => m.overnight).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:hidden">
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="bg-sky-100 p-3 rounded-2xl text-sky-600"><Plane size={24}/></div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Missions</p>
          <p className="text-2xl font-black text-slate-900 leading-none">{totalMissions}</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600"><Clock size={24}/></div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Vol</p>
          <p className="text-2xl font-black text-emerald-600 leading-none">{(totalMinutes/60).toFixed(1)}h</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="bg-orange-100 p-3 rounded-2xl text-orange-600"><Car size={24}/></div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Km</p>
          <p className="text-2xl font-black text-orange-600 leading-none">{totalKm}</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><Moon size={24}/></div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Découchers</p>
          <p className="text-2xl font-black text-indigo-600 leading-none">{totalOvernights}</p>
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
      <p className="text-[10px] font-black uppercase tracking-widest px-6 text-center">Adresse requise pour la carte</p>
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
    onSave(null); setIsEmpty(true);
  };

  return (
    <div className="border border-slate-200 rounded-[32px] p-6 bg-white shadow-sm print:border-slate-300 print:shadow-none">
      <div className="flex justify-between items-center mb-3">
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{title}</label>
        <button onClick={clear} className="text-[10px] text-red-500 font-black print:hidden uppercase">Effacer</button>
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-[24px] bg-slate-50 h-32 md:h-40 w-full touch-none overflow-hidden print:bg-white print:border-slate-300">
        {savedData ? <img src={savedData} className="w-full h-full object-contain" alt="Signature" /> : (
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
        <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col p-4 overflow-y-auto animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onExit} className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg active:scale-90"><ChevronLeft size={24}/></button>
                <div className="text-center">
                    <h2 className="text-emerald-400 font-black tracking-tighter text-xl uppercase">Cockpit Terrain</h2>
                    <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-widest">{mission.ref}</p>
                </div>
                <div className="w-12"></div>
            </div>

            <div className="flex-1 space-y-6 pb-20 max-w-lg mx-auto w-full">
                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 text-center shadow-2xl">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Temps de Vol</div>
                    <div className="text-7xl font-mono font-black mb-10 tabular-nums text-white tracking-tighter">{formatTimer(elapsed)}</div>
                    <button onClick={handleFlight} className={`w-full py-6 rounded-[28px] font-black text-xl flex items-center justify-center gap-3 transition-all active:scale-95 ${isFlying ? 'bg-red-600 animate-pulse' : 'bg-emerald-600 shadow-emerald-900/40 shadow-xl'}`}>
                        {isFlying ? <Square fill="currentColor" size={24}/> : <Play fill="currentColor" size={24}/>}
                        {isFlying ? 'ATTERRIR' : 'DÉCOLLER'}
                    </button>
                </div>

                <div className="space-y-3">
                    {(mission.contacts || []).map((c, i) => (
                        <a key={i} href={`tel:${c.phone}`} className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-3xl flex justify-between items-center active:bg-blue-600/30 transition-all">
                            <div>
                                <div className="font-black text-blue-100 uppercase text-xs tracking-tight">{c.name}</div>
                                <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{c.role}</div>
                            </div>
                            <div className="bg-blue-600 p-3 rounded-full text-white shadow-lg"><Phone size={20}/></div>
                        </a>
                    ))}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6">
                    <div className="flex justify-between mb-2 text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">Checklist Sécurité</span>
                        <span className={progress === 100 ? 'text-emerald-400' : 'text-orange-400'}>{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                        <div className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{width: `${progress}%`}}></div>
                    </div>
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
        <div className="max-w-6xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen animate-in fade-in">
            <button onClick={onClose} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 font-black text-xs uppercase tracking-widest transition-colors"><ChevronLeft/> Missions</button>
            <div className="flex flex-col md:flex-row justify-between gap-6 mb-10 border-b border-slate-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Administration</h1>
                    <p className="text-slate-500 text-sm font-medium mt-1">Gestion globale du cockpit.</p>
                </div>
                <div className="flex gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto w-fit h-fit">
                    {['team', 'fleet', 'clients'].map(t => (
                        <button key={t} onClick={() => {setTab(t); setIsCreating(false);}} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'}`}>
                            {t === 'team' ? 'Équipe' : t === 'fleet' ? 'Flotte' : 'Clients'}
                        </button>
                    ))}
                </div>
            </div>
            {isCreating ? (
                <form onSubmit={handleAdd} className="bg-white p-8 rounded-[40px] shadow-2xl border border-slate-200 mb-8 grid md:grid-cols-3 gap-6 animate-in slide-in-from-top-4">
                    <input className="border-2 border-slate-200 p-4 rounded-2xl outline-none focus:border-sky-500 bg-slate-50 focus:bg-white transition-all font-bold text-slate-900 placeholder:text-slate-400" placeholder="Nom complet" required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                    <input className="border-2 border-slate-200 p-4 rounded-2xl outline-none focus:border-sky-500 bg-slate-50 focus:bg-white transition-all font-bold text-slate-900 placeholder:text-slate-400" placeholder={tab==='team' ? 'Email' : 'Détail (ID/IDN)'} required value={tab==='team'?form.email:form.detail} onChange={e=>tab==='team'?setForm({...form, email:e.target.value}):setForm({...form, detail:e.target.value})} />
                    <div className="flex gap-2">
                        <button className="flex-1 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Valider</button>
                        <button type="button" onClick={()=>setIsCreating(false)} className="bg-slate-100 p-4 rounded-2xl text-slate-500"><X size={20}/></button>
                    </div>
                </form>
            ) : (
                <button onClick={()=>setIsCreating(true)} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 font-black uppercase text-xs tracking-widest mb-8 hover:bg-white hover:border-sky-300 transition-all">+ Ajouter à {tab}</button>
            )}
            <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-100">
                        {(tab === 'team' ? employees : tab === 'fleet' ? fleet : clients).map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-6">
                                    <div className="font-black text-slate-800 uppercase text-sm">{item.name}</div>
                                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wide">{item.email || item.detail || "Sans précision"}</div>
                                </td>
                                <td className="p-6 text-right"><button onClick={() => handleDelete(tab, item.id)} className="text-slate-200 hover:text-red-500 active:scale-90 transition-all"><Trash2 size={20}/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- COMPOSANT : LOGIN ---
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
                <h2 className="text-4xl font-black mb-1 uppercase tracking-tighter leading-none">Pilote Manager</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-12 tracking-widest text-center">Aerothau Operational Center</p>
                <form onSubmit={login} className="space-y-6 text-left">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                        <input required type="email" placeholder="Saisir email..." className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-[24px] outline-none focus:border-sky-500 focus:bg-white transition-all font-bold text-slate-900 placeholder:text-slate-400" value={email} onChange={e=>setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mot de passe</label>
                        <input required type="password" placeholder="••••••••" className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-[24px] outline-none focus:border-sky-500 focus:bg-white transition-all font-bold text-slate-900 placeholder:text-slate-400" value={password} onChange={e=>setPassword(e.target.value)} />
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

// --- APP COMPONENT ---
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
        category: 'Open', scenario: 'A3', checklist: {}, contacts: [], logs: [], documents: [], 
        flightNotes: '', techNotes: '', meteoVent: '', meteoTemp: '', meteoKP: '', 
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
    <div className="min-h-screen font-sans text-slate-800 bg-slate-50 pb-20 print:bg-white print:pb-0">
      <nav className="sticky top-0 z-50 shadow-xl border-b border-slate-700 px-4 md:px-8 py-4 flex justify-between items-center bg-slate-900 text-white print:hidden">
        <div className="flex items-center gap-5">
          {view !== 'list' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all active:scale-90"><ChevronLeft size={24} /></button>}
          <img src={LOGO_URL} alt="Logo" className="h-10 brightness-0 invert object-contain" onError={(e) => { e.target.style.display='none'; }} /> 
          <span className="font-black text-2xl tracking-tighter uppercase leading-none">Aerothau</span>
        </div>
        <div className="flex gap-2">
          {view === 'list' ? (
            <>
              <button onClick={() => setView('calendar')} className="p-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-white transition-all"><CalendarIcon size={22}/></button>
              <button onClick={()=>setIsAdminView(true)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:bg-slate-700 hover:text-white transition-all"><Shield size={22}/></button>
              <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl active:scale-95 transition-all"><Plus size={20}/> Mission</button>
            </>
          ) : view === 'edit' ? (
            <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 border border-slate-700 active:scale-95 transition-all shadow-lg"><Printer size={18}/> Rapport</button>
                <button onClick={()=>setIsFieldMode(true)} className="bg-orange-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl active:scale-95 transition-all"><Maximize size={20}/> Cockpit</button>
            </div>
          ) : null}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8 print:p-0">
        {view === 'list' && (
          <div className="animate-in fade-in duration-500">
            <DashboardStats missions={missions} />
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Opérations en cours</h2>
                <div className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-widest">Connecté</div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} className="bg-white p-8 rounded-[48px] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border border-slate-100 group relative overflow-hidden">
                    <div className="flex justify-between mb-5">
                      <span className="text-[10px] font-black tracking-widest bg-slate-50 text-slate-400 px-4 py-1.5 rounded-full border border-slate-100 uppercase">{m.ref}</span>
                      <span className="text-[9px] font-black uppercase text-sky-600 px-3 py-1 bg-sky-50 rounded-full">{m.scenario}</span>
                    </div>
                    <h3 className="font-black text-2xl text-slate-900 mb-2 uppercase leading-tight group-hover:text-sky-600 transition-colors tracking-tighter leading-none">{m.title || m.client || "Nouvelle Mission"}</h3>
                    <p className="text-xs text-slate-500 font-bold flex items-center gap-2 uppercase tracking-wide"><MapPin size={16} className="text-slate-300"/>{m.location || "Non localisée"}</p>
                    {m.overnight && <span className="absolute top-10 -right-6 bg-indigo-500 text-white text-[8px] font-black px-8 py-1 rotate-45 uppercase shadow-sm">Découcher</span>}
                </div>
                ))}
            </div>
          </div>
        )}

        {view === 'calendar' && (
          <div className="bg-white p-10 rounded-[56px] shadow-xl border border-slate-200 animate-in zoom-in-95 print:hidden">
            <div className="flex justify-between items-center mb-10">
                <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">Planning Opérationnel</h2>
                <button onClick={() => setView('list')} className="text-sky-600 font-black text-xs uppercase flex items-center gap-2 hover:bg-sky-50 px-4 py-2 rounded-xl transition-all active:scale-95"><ChevronLeft size={16}/> Retour Menu</button>
            </div>
            <div className="space-y-4">
              {missions.length > 0 ? missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} className="flex items-center gap-8 p-6 hover:bg-slate-50 rounded-[40px] transition-all cursor-pointer border-2 border-transparent hover:border-slate-100 group">
                  <div className="bg-sky-100 text-sky-600 w-20 h-20 rounded-[28px] flex flex-col items-center justify-center font-black shadow-inner">
                    <span className="text-[10px] uppercase tracking-widest">{new Date(m.date).toLocaleDateString('fr-FR', {month:'short'})}</span>
                    <span className="text-2xl leading-none">{new Date(m.date).getDate()}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-xl text-slate-900 uppercase tracking-tighter group-hover:text-sky-600 transition-colors leading-tight leading-none">{m.title || m.client || "Mission sans titre"}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 flex items-center gap-1 leading-none"><MapPin size={12}/> {m.location || "Lieu non défini"}</p>
                  </div>
                  <ChevronRight size={28} className="text-slate-200 group-hover:text-sky-400 group-hover:translate-x-2 transition-all"/>
                </div>
              )) : <p className="text-center py-20 text-slate-400 uppercase font-black text-xs tracking-widest">Aucune mission planifiée</p>}
            </div>
          </div>
        )}

        {view === 'edit' && currentMission && (
            <div className="bg-white rounded-[56px] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in print:border-none print:shadow-none print:rounded-none">
                <div className="flex border-b border-slate-100 bg-slate-50 px-8 gap-8 sticky top-0 z-10 overflow-x-auto scrollbar-hide print:hidden">
                    {['general', 'technical', 'check', 'flight', 'sign'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`py-6 text-[10px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === t ? 'text-sky-600' : 'text-slate-400 hover:text-slate-900'}`}>
                            {t === 'general' ? 'Informations' : t === 'technical' ? 'Opérations' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                            {activeTab === t && <div className="absolute bottom-0 left-0 w-full h-1 bg-sky-600 rounded-full"></div>}
                        </button>
                    ))}
                </div>
                
                <div className="p-8 md:p-14 print:p-0">
                    <div className="hidden print:block">
                        <div className="flex justify-between items-start border-b-8 border-slate-900 pb-12 mb-12">
                            <div>
                                <h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-3">Compte-Rendu Mission</h1>
                                <div className="flex gap-6 text-slate-500 font-black uppercase tracking-widest text-sm">
                                    <span>Référence : {currentMission.ref}</span>
                                    <span>Date d'opération : {new Date(currentMission.date).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <img src={LOGO_URL} className="h-24 object-contain" alt="Aerothau" />
                        </div>
                    </div>

                    {(activeTab === 'general' || window.matchMedia('print').matches) && (
                        <div className="space-y-12 animate-in slide-in-from-bottom-5">
                            <div className="grid md:grid-cols-2 gap-12 items-start print:grid-cols-2">
                                <div className="space-y-8">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900">Mission & Client</label>
                                        <input className="w-full border-2 border-slate-100 p-6 rounded-[32px] bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-black text-3xl text-slate-900 transition-all shadow-inner print:border-none print:p-0 print:bg-white print:text-2xl" placeholder="Titre..." value={currentMission.title || ''} onChange={e => handleUpdate('title', e.target.value)} />
                                        <input className="w-full border-2 border-slate-100 p-5 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold text-slate-700 print:border-none print:p-0" placeholder="Nom du client" value={currentMission.client || ''} onChange={e => handleUpdate('client', e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900">Date</label>
                                            <input type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold print:border-none print:p-0" value={currentMission.date || ''} onChange={e => handleUpdate('date', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900">Prestation</label>
                                            <select className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold print:appearance-none print:border-none print:p-0" value={currentMission.type || ''} onChange={e => handleUpdate('type', e.target.value)}>
                                                {MISSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900">Lieu d'intervention</label>
                                        <input className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold print:border-none print:p-0 print:text-lg" placeholder="Adresse complète..." value={currentMission.location || ''} onChange={e => handleUpdate('location', e.target.value)} />
                                    </div>
                                    
                                    {/* LOGISTIQUE */}
                                    <div className="grid grid-cols-2 gap-6 print:grid-cols-2">
                                        <div className={`p-6 rounded-[32px] border-2 transition-all flex flex-col justify-between ${currentMission.overnight ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'} print:bg-white print:border-slate-400`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="text-indigo-600 font-black uppercase text-[10px] tracking-widest">Découcher</div>
                                                <button onClick={()=>handleUpdate('overnight', !currentMission.overnight)} className={`w-12 h-6 rounded-full transition-all relative print:hidden ${currentMission.overnight ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${currentMission.overnight ? 'left-6.5' : 'left-0.5'}`}></div>
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Moon className={currentMission.overnight ? 'text-indigo-600' : 'text-slate-300'} size={24}/>
                                                <span className="font-bold text-slate-900 text-sm">{currentMission.overnight ? 'Grand Déplacement' : 'Base de retour'}</span>
                                            </div>
                                        </div>

                                        <div className={`p-6 rounded-[32px] border-2 transition-all flex flex-col justify-between ${currentMission.travel ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'} print:bg-white print:border-slate-400`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="text-orange-600 font-black uppercase text-[10px] tracking-widest">Kilométrage</div>
                                                <button onClick={()=>handleUpdate('travel', !currentMission.travel)} className={`w-12 h-6 rounded-full transition-all relative print:hidden ${currentMission.travel ? 'bg-orange-500' : 'bg-slate-300'}`}>
                                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${currentMission.travel ? 'left-6.5' : 'left-0.5'}`}></div>
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Car className={currentMission.travel ? 'text-orange-600' : 'text-slate-300'} size={24}/>
                                                {currentMission.travel ? (
                                                    <div className="flex gap-2 text-xs font-black text-slate-900">
                                                        <input className="w-12 bg-transparent outline-none border-b border-orange-200 text-center" value={currentMission.kmStart || ''} placeholder="Départ" onChange={e=>handleUpdate('kmStart', e.target.value)} />
                                                        <span className="text-orange-300">/</span>
                                                        <input className="w-12 bg-transparent outline-none border-b border-orange-200 text-center" value={currentMission.kmEnd || ''} placeholder="Arrivée" onChange={e=>handleUpdate('kmEnd', e.target.value)} />
                                                    </div>
                                                ) : <span className="font-bold text-slate-400 text-sm uppercase tracking-tighter">Non suivi</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-8">
                                    <MapView location={currentMission.location} />
                                    {/* SECTION CONTACTS */}
                                    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:bg-white print:border-slate-300 print:shadow-none">
                                        <div className="flex items-center justify-between text-indigo-600">
                                            <div className="flex items-center gap-3">
                                              <Users size={24}/>
                                              <h4 className="text-xs font-black uppercase tracking-widest">Interlocuteurs</h4>
                                            </div>
                                            <button onClick={()=>handleUpdate('contacts', [...(currentMission.contacts||[]), {name:'', phone:'', role:''}])} className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-all print:hidden"><UserPlus size={18}/></button>
                                        </div>
                                        <div className="space-y-4">
                                            {(currentMission.contacts || []).map((contact, i) => (
                                                <div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative group animate-in slide-in-from-right-2 print:bg-white print:border-slate-200">
                                                    <button onClick={()=>{const n=[...currentMission.contacts]; n.splice(i,1); handleUpdate('contacts',n)}} className="absolute top-4 right-4 text-red-300 hover:text-red-500 transition-all print:hidden"><Trash2 size={16}/></button>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <input className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-black text-slate-900 outline-none focus:border-indigo-500 print:border-none print:p-0" placeholder="Nom..." value={contact.name} onChange={e=>{const n=[...currentMission.contacts]; n[i].name=e.target.value; handleUpdate('contacts',n)}} />
                                                        <input className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 print:border-none print:p-0" placeholder="Rôle..." value={contact.role} onChange={e=>{const n=[...currentMission.contacts]; n[i].role=e.target.value; handleUpdate('contacts',n)}} />
                                                    </div>
                                                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 print:border-none print:p-0">
                                                        <Phone size={14} className="text-slate-400 print:hidden"/>
                                                        <input className="flex-1 bg-transparent text-xs font-black text-indigo-600 outline-none" placeholder="Téléphone..." value={contact.phone} onChange={e=>{const n=[...currentMission.contacts]; n[i].phone=e.target.value; handleUpdate('contacts',n)}} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {/* SECTION DOCUMENTS */}
                                    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:hidden">
                                        <div className="flex items-center gap-3 text-sky-600">
                                            <FolderOpen size={24}/>
                                            <h4 className="text-xs font-black uppercase tracking-widest">Documents cloud</h4>
                                        </div>
                                        <div className="space-y-4">
                                            {(currentMission.documents || []).map((docItem, i) => (
                                                <div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative animate-in slide-in-from-right-2">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <select className="bg-white border border-slate-200 rounded-xl p-2 text-[10px] font-black text-slate-900 outline-none focus:border-sky-500" value={docItem.type || ''} onChange={e=>{const n=[...currentMission.documents]; n[i].type=e.target.value; handleUpdate('documents',n)}}>
                                                            <option value="">-- Type --</option>
                                                            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                        <input className="bg-white border border-slate-200 rounded-xl p-2 text-[10px] font-bold text-slate-900 outline-none focus:border-sky-500" placeholder="Nom..." value={docItem.name} onChange={e=>{const n=[...currentMission.documents]; n[i].name=e.target.value; handleUpdate('documents',n)}} />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                                            <LinkIcon size={14} className="text-slate-400"/>
                                                            <input className="flex-1 bg-transparent text-[9px] font-medium text-sky-600 outline-none" placeholder="Lien..." value={docItem.url} onChange={e=>{const n=[...currentMission.documents]; n[i].url=e.target.value; handleUpdate('documents',n)}} />
                                                        </div>
                                                        <a href={docItem.url} target="_blank" rel="noreferrer" className="bg-sky-100 p-2.5 rounded-xl text-sky-600 hover:bg-sky-600 hover:text-white transition-all"><Eye size={18}/></a>
                                                        <button onClick={()=>{const n=[...currentMission.documents]; n.splice(i,1); handleUpdate('documents',n)}} className="bg-red-50 p-2.5 rounded-xl text-red-400 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={18}/></button>
                                                    </div>
                                                </div>
                                            ))}
                                            <button onClick={()=>handleUpdate('documents', [...(currentMission.documents||[]), {name:'', url:'https://', type:''}])} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-black uppercase text-[10px] tracking-widest hover:border-sky-500 transition-all">+ Ajouter Doc</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {(activeTab === 'technical' || window.matchMedia('print').matches) && (
                        <div className="space-y-10 animate-in fade-in duration-500 print:mt-16 print:pt-16 print:border-t-2 print:border-slate-100">
                            {/* METEO SECTION */}
                            <div className="flex flex-col md:flex-row gap-6 items-center mb-8">
                                <div className="grid grid-cols-3 gap-6 flex-1 w-full print:grid-cols-3">
                                    <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 print:border-none print:bg-white print:p-0">
                                        <Wind className="text-sky-500" size={28}/>
                                        <div className="flex-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vent (km/h)</p>
                                            <input className="w-full bg-transparent font-black text-lg outline-none text-slate-900" value={currentMission.meteoVent || ''} onChange={e=>handleUpdate('meteoVent', e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 print:border-none print:bg-white print:p-0">
                                        <Thermometer className="text-orange-500" size={28}/>
                                        <div className="flex-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Temp. (°C)</p>
                                            <input className="w-full bg-transparent font-black text-lg outline-none text-slate-900" value={currentMission.meteoTemp || ''} onChange={e=>handleUpdate('meteoTemp', e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 print:border-none print:bg-white print:p-0">
                                        <CloudSun className="text-emerald-500" size={28}/>
                                        <div className="flex-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Indice KP</p>
                                            <input className="w-full bg-transparent font-black text-lg outline-none text-slate-900" value={currentMission.meteoKP || ''} onChange={e=>handleUpdate('meteoKP', e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                                <button onClick={refreshWeather} disabled={weatherLoading} className="bg-slate-900 text-white p-6 rounded-[32px] shadow-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 print:hidden">
                                    {weatherLoading ? <Loader2 size={24} className="animate-spin"/> : <RefreshCw size={24}/>}
                                </button>
                            </div>
                            <div className="grid md:grid-cols-2 gap-12 print:grid-cols-1">
                                <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-10 shadow-2xl print:bg-white print:text-slate-900 print:p-0 print:shadow-none print:border-none">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 text-orange-400 mb-2 border-b border-slate-800 pb-4 print:border-slate-900 print:text-slate-900">
                                            <Plane size={24}/><h4 className="font-black uppercase tracking-widest text-xs">Consignes Vol / ATC</h4>
                                        </div>
                                        <textarea className="w-full bg-slate-800/50 border-2 border-slate-700 p-6 rounded-3xl outline-none focus:border-orange-500 h-40 text-sm font-medium leading-relaxed print:bg-white print:border-none print:p-0 print:h-auto print:text-base" placeholder="Protocoles radio, NOTAM, zones P-R-D..." value={currentMission.flightNotes || ''} onChange={e=>handleUpdate('flightNotes', e.target.value)}></textarea>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 text-emerald-400 mb-2 border-b border-slate-800 pb-4 print:border-slate-900 print:text-slate-900">
                                            <Wrench size={24}/><h4 className="font-black uppercase tracking-widest text-xs">Objectifs Techniques</h4>
                                        </div>
                                        <textarea className="w-full bg-slate-800/50 border-2 border-slate-700 p-6 rounded-3xl outline-none focus:border-emerald-500 h-40 text-sm font-medium leading-relaxed print:bg-white print:border-none print:p-0 print:h-auto print:text-base" placeholder="Précision RTK, chevauchement, capteurs..." value={currentMission.techNotes || ''} onChange={e=>handleUpdate('techNotes', e.target.value)}></textarea>
                                    </div>
                                </div>
                                <div className="bg-blue-50 p-10 rounded-[48px] border-2 border-blue-100 print:bg-white print:border-slate-300 print:p-8">
                                    <h4 className="font-black text-blue-600 text-[10px] uppercase tracking-widest mb-6 print:text-slate-900">Préparation Opérationnelle</h4>
                                    <ul className="space-y-5 text-xs text-blue-900 font-bold uppercase tracking-tight print:text-slate-700 print:text-[10px]">
                                        <li className="flex items-start gap-4"><Check size={20} className="text-blue-500 shrink-0 print:text-slate-900"/> Consultation Geoportail indispensable.</li>
                                        <li className="flex items-start gap-4"><Check size={20} className="text-blue-500 shrink-0 print:text-slate-900"/> Déclaration AlphaTango active.</li>
                                        <li className="flex items-start gap-4"><Check size={20} className="text-blue-500 shrink-0 print:text-slate-900"/> Balisage ZET requis en zone peuplée.</li>
                                        <li className="flex items-start gap-4"><Check size={20} className="text-blue-500 shrink-0 print:text-slate-900"/> ERP (Plan Urgence) connu de l'équipe.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {(activeTab === 'check' || window.matchMedia('print').matches) && (
                        <div className="grid md:grid-cols-2 gap-12 animate-in slide-in-from-right-10 duration-500 print:mt-16 print:pt-16 print:border-t-2 print:border-slate-100">
                            <div className="bg-slate-900 text-white p-12 rounded-[56px] relative overflow-hidden print:bg-white print:text-slate-900 print:p-0 print:shadow-none">
                                <div className="flex justify-between items-center border-b border-slate-800 pb-6 mb-8 print:border-slate-900 print:pb-2 print:mb-6">
                                    <div className="text-emerald-400 font-black text-4xl tracking-tighter uppercase print:text-slate-900 print:text-3xl">{SCENARIO_INFOS[currentMission.scenario]?.title}</div>
                                    <select className="bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border border-slate-700 outline-none print:hidden" value={currentMission.scenario || 'A3'} onChange={e => handleUpdate('scenario', e.target.value)}>
                                        <option value="A1">Open A1</option>
                                        <option value="A2">Open A2</option>
                                        <option value="A3">Open A3</option>
                                        <option value="STS-01">STS-01</option>
                                        <option value="STS-02">STS-02</option>
                                    </select>
                                </div>
                                <p className="text-slate-400 text-sm mb-12 leading-relaxed font-medium print:text-slate-500 print:mb-6">{SCENARIO_INFOS[currentMission.scenario]?.description}</p>
                                <div className="text-sm border-l-4 border-sky-500 pl-6"><strong className="block text-sky-400 text-[10px] uppercase font-black mb-1 print:text-slate-900">Règle ZET</strong><span className="font-bold print:text-slate-700">{SCENARIO_INFOS[currentMission.scenario]?.zet}</span></div>
                            </div>
                            <div className="space-y-6">
                                <div className="flex justify-between items-end mb-4 px-2 print:mb-4">
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-slate-900">Vérifications de Sécurité</h4>
                                        <span className={`text-3xl font-black ${safetyScore === 100 ? 'text-emerald-500' : 'text-orange-500'} print:text-xl leading-none`}>{safetyScore}%</span>
                                    </div>
                                    <button onClick={() => { const all = {}; activeChecklistItems.forEach(i => all[i.k] = true); handleUpdate('checklist', all); }} className="bg-emerald-600 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-emerald-500 transition-all active:scale-95 print:hidden">Tout Valider</button>
                                </div>
                                <div className="space-y-3 print:space-y-2">
                                    {activeChecklistItems.map(i => (
                                        <div key={i.k} onClick={() => handleUpdate('checklist', {...(currentMission.checklist||{}), [i.k]: !currentMission.checklist?.[i.k]})} className={`flex items-center gap-5 p-5 rounded-[32px] border-2 cursor-pointer transition-all ${currentMission.checklist?.[i.k] ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-100'} print:p-2 print:border-none print:bg-white`}>
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 ${currentMission.checklist?.[i.k] ? 'bg-emerald-500 border-emerald-500 text-white shadow-md' : 'border-slate-300 text-transparent'} print:w-4 print:h-4 print:border-slate-900`}>
                                                <Check size={18} strokeWidth={4} className="print:hidden"/>
                                            </div>
                                            <span className={`font-black uppercase text-xs tracking-tight ${currentMission.checklist?.[i.k] ? 'text-emerald-900' : 'text-slate-400'} print:text-slate-900 print:text-[10px]`}>{i.l}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {(activeTab === 'flight' || window.matchMedia('print').matches) && (
                        <div className="animate-in fade-in duration-500 space-y-10 print:mt-16 print:pt-16 print:border-t-2 print:border-slate-100">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 print:text-slate-900">Journal des Vols (Logbook)</h4>
                            <div className="bg-white border-2 border-slate-100 rounded-[48px] overflow-hidden shadow-sm print:border-slate-300 print:rounded-none print:shadow-none">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 print:bg-white print:text-slate-900 print:border-slate-900">
                                        <tr><th className="p-7">#</th><th className="p-7">Horaires Vol</th><th className="p-7">Batt.</th><th className="p-7 text-right">Durée</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700 print:divide-slate-200">
                                        {(currentMission.logs || []).map((l, i) => (
                                            <tr key={l.id} className="hover:bg-slate-50 transition-colors print:hover:bg-white">
                                                <td className="p-7 text-slate-300 font-black print:text-slate-900">{i+1}</td>
                                                <td className="p-7 font-mono text-slate-500 print:text-slate-700 text-xs">{l.start || '--:--'} ➔ {l.end || '--:--'}</td>
                                                <td className="p-7 text-sky-600 font-black print:text-slate-900">{l.battery}%</td>
                                                <td className="p-7 text-right font-black text-slate-900 text-lg tabular-nums">{formatDuration(calculateDuration(l.start, l.end))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {(activeTab === 'sign' || window.matchMedia('print').matches) && (
                        <div className="animate-in fade-in duration-500 space-y-12 print:mt-16">
                            <div className="grid md:grid-cols-2 gap-10 print:grid-cols-2">
                                <SignaturePad title="Visa Télépilote (Aerothau)" savedData={currentMission.signaturePilote} onSave={d => handleUpdate('signaturePilote', d)} />
                                <SignaturePad title="Visa Client / Représentant" savedData={currentMission.signatureClient} onSave={d => handleUpdate('signatureClient', d)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {qrModal && (
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300" onClick={()=>setQrModal(false)}>
                <div className="bg-white p-12 rounded-[64px] max-w-sm w-full text-center shadow-2xl relative animate-in zoom-in-95 duration-300" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>setQrModal(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-950 transition-colors active:scale-90"><X size={36}/></button>
                    <h3 className="text-3xl font-black mb-3 tracking-tighter uppercase leading-none">Validation Mobile</h3>
                    <p className="text-[10px] text-slate-400 mb-12 font-black uppercase tracking-widest px-6 text-center">Le client doit scanner ce code avec son mobile pour signer.</p>
                    <div className="bg-white p-10 rounded-[48px] shadow-inner mb-12 border border-slate-100 flex items-center justify-center">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?mode=sign&uid=${user.uid}&mid=${currentMission.id}`)}`} className="w-full h-auto mix-blend-multiply" alt="QR Code Signature" />
                    </div>
                    <button onClick={()=>setQrModal(false)} className="w-full py-6 bg-slate-950 text-white rounded-[32px] font-black text-lg shadow-xl uppercase tracking-widest active:scale-95 transition-all">Fermer</button>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}