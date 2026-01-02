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
  Unlock
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
  const systemPrompt = "Tu es un expert météo aéronautique. Récupère via Google Search : temp (°C), vent (km/h), KP. Réponds en JSON : {\"temp\": \"valeur\", \"wind\": \"valeur\", \"kp\": \"valeur\"}.";
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
  } catch (err) { return null; }
};

// --- 3. CONSTANTES MÉTIER ---
const SCENARIO_INFOS = {
    'A1': { title: "Open A1", description: "Survol de personnes isolées possible.", zet: "ZET : Éviter le survol." },
    'A2': { title: "Open A2", description: "Vol proximité personnes.", zet: "ZET : 30m des tiers (5m en mode lent)." },
    'A3': { title: "Open A3", description: "Vol hors zones habitées.", zet: "ZET : > 150m zones urbaines." },
    'STS-01': { title: "Spécifique STS-01", description: "VLOS zone peuplée.", zet: "Zone contrôlée au sol. R = H." },
    'STS-02': { title: "Spécifique STS-02", description: "BVLOS hors zone peuplée.", zet: "Zone tampon 30m min." },
};

const MISSION_STATUS = [
    { value: 'En cours', color: 'bg-sky-500', border: 'border-sky-200' },
    { value: 'Validé', color: 'bg-emerald-500', border: 'border-emerald-200' },
    { value: 'Reporté', color: 'bg-amber-500', border: 'border-amber-200' },
    { value: 'Annulé', color: 'bg-red-500', border: 'border-red-200' }
];

const MISSION_TYPES = ['Inspection Technique', 'Photogrammétrie', 'Audiovisuel', 'Nettoyage', 'Lidars', 'Thermographie'];
const DOC_TYPES = ['Arrêté Préfectoral', 'Protocole ATC', 'Assurance RC', 'DNC Pilote', 'Plan de prévention', 'Autre'];

const BASE_CHECKLIST = [
  {k:'meteo',l:'Météo ok'}, {k:'zet',l:'ZET Balisée'}, {k:'auth',l:'Autorisations ok'}, 
  {k:'drone',l:'État drone'}, {k:'batt',l:'Batteries pleines'}, {k:'sd',l:'Carte SD'}
];
const SPECIFIC_CHECKLISTS = {
  'Lidars': [{k:'imu',l:'Chauffe IMU 3min'}, {k:'rtk',l:'Fix RTK stable'}],
  'Photogrammétrie': [{k:'overlap',l:'Recouvrement réglé'}],
};

// --- 4. HELPERS ---
const calculateDuration = (start, end) => {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return 0;
  try {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let d1 = new Date(0, 0, 0, h1, m1);
    let d2 = new Date(0, 0, 0, h2, m2);
    let diff = (d2.getTime() - d1.getTime()) / 60000;
    return diff < 0 ? diff + 1440 : diff;
  } catch(e) { return 0; }
};

const formatDuration = (min) => `${Math.floor(min/60)}h ${Math.round(min%60)}m`;

// --- 5. COMPOSANTS INTERNES ---

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
            <div className="bg-white p-12 rounded-[48px] shadow-2xl w-full max-w-md text-center border-t-8 border-sky-500 animate-in zoom-in-95">
                <h2 className="text-3xl font-black mb-1 uppercase text-slate-900 tracking-tighter">Pilote Manager</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-10 tracking-widest text-center">Aerothau Center</p>
                <form onSubmit={login} className="space-y-6 text-left">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Email</label>
                        <input required type="email" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 font-bold text-black" value={email} onChange={e=>setEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Mot de passe</label>
                        <input required type="password" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 font-bold text-black" value={password} onChange={e=>setPassword(e.target.value)} />
                    </div>
                    {err && <div className="text-red-600 text-xs font-bold text-center bg-red-50 p-3 rounded-xl">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-black transition-all">
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : "ACCÉDER AU COCKPIT"}
                    </button>
                </form>
            </div>
        </div>
    );
}

function SignaturePad({ title, onSave, savedData, isLocked }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (savedData) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = savedData;
    }

    if (isLocked) return;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
    };

    const start = (e) => { isDrawing.current = true; const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.lineCap = "round"; };
    const move = (e) => { if (!isDrawing.current) return; if(e.cancelable) e.preventDefault(); const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke(); };
    const stop = () => { if (isDrawing.current) { isDrawing.current = false; onSave(canvas.toDataURL()); } };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    canvas.addEventListener('touchstart', (e) => { if(e.cancelable) e.preventDefault(); start(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { if(e.cancelable) e.preventDefault(); move(e); }, { passive: false });
    canvas.addEventListener('touchend', stop);

    return () => {
      canvas.removeEventListener('mousedown', start); canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop); canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move); canvas.removeEventListener('touchend', stop);
    };
  }, [savedData, onSave, isLocked]);

  return (
    <div className="border border-slate-200 rounded-[32px] p-6 bg-white text-left leading-none">
      <div className="flex justify-between items-center mb-3">
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{title}</label>
        {!isLocked && <button onClick={() => onSave(null)} className="text-[10px] text-red-500 font-black uppercase leading-none">Effacer</button>}
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-[24px] bg-slate-50 h-32 w-full overflow-hidden print:bg-white print:border-slate-300">
        <canvas ref={canvasRef} width={600} height={300} className="w-full h-full" />
        {!savedData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase">Signer ici</div>}
      </div>
    </div>
  );
}

function DashboardStats({ missions }) {
  const stats = useMemo(() => {
    let totalMin = 0;
    missions.forEach(m => {
        (m.logs || []).forEach(l => { totalMin += calculateDuration(l.start, l.end); });
    });
    const totalKm = missions.reduce((acc, m) => acc + (Math.max(0, (parseFloat(m.kmEnd) || 0) - (parseFloat(m.kmStart) || 0))), 0);
    return { count: missions.length, hours: (totalMin / 60).toFixed(1), km: totalKm, nights: missions.filter(m => m.overnight).length };
  }, [missions]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:hidden text-left leading-none">
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-sky-100 p-3 rounded-2xl text-sky-600"><Plane size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Missions</p><p className="text-2xl font-black text-slate-900 leading-none">{stats.count}</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600"><Clock size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1 text-black">Vols</p><p className="text-2xl font-black text-emerald-600 leading-none">{stats.hours}h</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-orange-100 p-3 rounded-2xl text-orange-600"><Car size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1 text-black">Km</p><p className="text-2xl font-black text-orange-600 leading-none">{stats.km}</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><Moon size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1 text-black">Nuits</p><p className="text-2xl font-black text-indigo-600 leading-none">{stats.nights}</p></div>
      </div>
    </div>
  );
}

function FieldModeView({ mission, onExit, onUpdate }) {
    const [isFlying, setIsFlying] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [startTime, setStartTime] = useState(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (isFlying) { timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000); }
        else { clearInterval(timerRef.current); }
        return () => clearInterval(timerRef.current);
    }, [isFlying, startTime]);

    const handleFlight = () => {
        if (!isFlying) { setStartTime(Date.now()); setIsFlying(true); setElapsed(0); }
        else {
            setIsFlying(false);
            const s = new Date(startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const e = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const b = prompt("Batterie restante (%) ?") || "0";
            onUpdate('logs', [...(mission.logs || []), { id: Date.now(), start: s, end: e, battery: b }]);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col p-4 overflow-y-auto">
            <div className="flex justify-between items-center mb-6 leading-none">
                <button onClick={onExit} className="bg-slate-800 p-3 rounded-xl"><ChevronLeft size={24}/></button>
                <h2 className="text-emerald-400 font-black text-xl uppercase">COCKPIT</h2>
                <div className="bg-slate-800 p-3 rounded-xl"><BatteryCharging size={24} className={isFlying ? "text-emerald-400 animate-pulse" : "text-slate-500"} /></div>
            </div>
            <div className="flex-1 space-y-6 pb-20 max-w-lg mx-auto w-full">
                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-8 text-center shadow-2xl">
                    <div className="text-7xl font-mono font-black mb-8 tabular-nums">{elapsed > 0 ? (Math.floor(elapsed/60)).toString().padStart(2,'0') + ':' + (elapsed%60).toString().padStart(2,'0') : '00:00'}</div>
                    <button onClick={handleFlight} className={`w-full py-6 rounded-3xl font-black text-xl active:scale-95 ${isFlying ? 'bg-red-600 animate-pulse' : 'bg-emerald-600'}`}>
                        {isFlying ? 'ATTERRIR' : 'DÉCOLLER'}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-left">
                        <div className="flex items-center gap-2 mb-2 text-sky-400"><Wind size={18}/> <h3 className="text-[10px] font-black uppercase">Météo</h3></div>
                        <p className="text-xs font-bold">{mission.meteoVent || '--'} km/h | {mission.meteoTemp || '--'}°C</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-left">
                        <div className="flex items-center gap-2 mb-2 text-emerald-400"><Shield size={18}/> <h3 className="text-[10px] font-black uppercase">Scénario</h3></div>
                        <p className="text-xs font-bold uppercase">{mission.scenario || 'A3'}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- MAIN APP ---
export default function App() {
  const [user, setUser] = useState(null);
  const [missions, setMissions] = useState([]);
  const [currentMission, setCurrentMission] = useState(null);
  const [view, setView] = useState('list'); 
  const [activeTab, setActiveTab] = useState('general');
  const [isLocked, setIsLocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isFieldMode, setIsFieldMode] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);

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
    const canAlwaysUpdate = ['status', 'debriefing', 'signaturePilote', 'signatureClient'].includes(f);
    if (isLocked && !canAlwaysUpdate) return;
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
    setCurrentMission({ id: docRef.id, ...m }); setView('edit'); setIsLocked(false);
  };

  const refreshWeather = async () => {
      if (!currentMission?.location || isLocked) return;
      setWeatherLoading(true);
      try {
          const w = await fetchWeatherWithIA(currentMission.location);
          if (w) { await handleUpdate('meteoVent', w.wind); await handleUpdate('meteoTemp', w.temp); await handleUpdate('meteoKP', w.kp); }
      } catch (err) {} finally { setWeatherLoading(false); }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-sky-500" /></div>;
  if (!user) return <LoginScreen />;
  if (view === 'edit' && isFieldMode && currentMission) return <FieldModeView mission={currentMission} onExit={()=>setIsFieldMode(false)} onUpdate={handleUpdate} />;

  return (
    <div className="min-h-screen font-sans bg-slate-50 pb-20 text-left text-black leading-none">
      <nav className="sticky top-0 z-50 shadow-xl border-b border-slate-700 px-4 md:px-8 py-4 flex justify-between items-center bg-slate-900 text-white print:hidden">
        <div className="flex items-center gap-5 leading-none">
          {view !== 'list' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all"><ChevronLeft size={24} /></button>}
          <span className="font-black text-2xl tracking-tighter uppercase leading-none">Aerothau</span>
        </div>
        <div className="flex gap-2">
          {view === 'list' ? (
            <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all leading-none"><Plus size={20}/> Mission</button>
          ) : (
            <div className="flex gap-2 leading-none">
                <button onClick={() => setIsLocked(!isLocked)} className={`p-2.5 rounded-2xl shadow-lg active:scale-90 leading-none ${isLocked ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>{isLocked ? <Lock size={20}/> : <Unlock size={20}/>}</button>
                {!isLocked && <button onClick={async () => { if(confirm("Supprimer?")) { await deleteDoc(doc(db, 'users', user.uid, 'missions', currentMission.id)); setView('list'); } }} className="bg-red-500 text-white p-2.5 rounded-2xl shadow-lg"><Trash2 size={20}/></button>}
                <button onClick={() => window.print()} className="bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 border border-slate-700 leading-none shadow-lg"><Printer size={18}/> Rapport</button>
                <button onClick={()=>setIsFieldMode(true)} className="bg-orange-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase leading-none shadow-xl"><Maximize size={20}/> Cockpit</button>
                <button onClick={() => setView('list')} className="bg-sky-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase leading-none shadow-xl">Finir</button>
            </div>
          )}
          <button onClick={()=>signOut(auth)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl leading-none"><LogOut size={22}/></button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {view === 'list' && (
          <div className="animate-in fade-in">
            <DashboardStats missions={missions} />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {missions.map(m => {
                    const s = MISSION_STATUS.find(x => x.value === m.status) || MISSION_STATUS[0];
                    return (
                        <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit'); setIsLocked(true);}} 
                            className={`bg-white p-8 rounded-[48px] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border-2 ${s.border} group relative overflow-hidden text-left leading-none`}>
                            <div className="flex justify-between mb-5 leading-none"><span className="text-[10px] font-black text-slate-400">{m.ref}</span><span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full text-white ${s.color}`}>{m.status}</span></div>
                            <h3 className="font-black text-2xl text-slate-900 mb-2 uppercase leading-tight">{m.title || m.client || "Nouvelle Mission"}</h3>
                            <p className="text-xs text-slate-400 font-bold flex items-center gap-2 uppercase leading-none"><MapPin size={16}/>{m.location || "Non localisée"}</p>
                        </div>
                    );
                })}
            </div>
          </div>
        )}

        {view === 'edit' && currentMission && (
            <div className="bg-white rounded-[56px] shadow-2xl border border-slate-200 overflow-hidden text-black text-left">
                <div className="flex border-b border-slate-100 bg-slate-50 px-8 gap-8 sticky top-0 z-10 overflow-x-auto print:hidden">
                    {['general', 'technical', 'check', 'flight', 'sign'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`py-6 text-[10px] font-black uppercase tracking-widest relative ${activeTab === t ? 'text-sky-600' : 'text-slate-400'}`}>
                            {t === 'general' ? 'Informations' : t === 'technical' ? 'Opérations' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                            {activeTab === t && <div className="absolute bottom-0 left-0 w-full h-1 bg-sky-600 rounded-full"></div>}
                        </button>
                    ))}
                </div>
                
                <div className="p-8 md:p-14 print:p-0">
                    {/* SECTION GENERALE */}
                    <div className={`${activeTab === 'general' ? 'block' : 'hidden print:block'} space-y-12 animate-in slide-in-from-bottom-5 text-left leading-none`}>
                        <div className="grid md:grid-cols-2 gap-12 text-black">
                            <div className="space-y-8">
                                <div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase leading-none">Mission & Client</label><input disabled={isLocked} className="w-full border-2 border-slate-100 p-6 rounded-[32px] bg-slate-50 focus:bg-white outline-none font-black text-3xl text-black" value={currentMission.title || ''} onChange={e=>handleUpdate('title', e.target.value)} /><input disabled={isLocked} className="w-full border-2 border-slate-100 p-5 rounded-2xl bg-slate-50 outline-none font-bold text-slate-700" placeholder="Nom du client" value={currentMission.client || ''} onChange={e=>handleUpdate('client', e.target.value)} /></div>
                                <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase text-black leading-none">Date</label><input disabled={isLocked} type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black" value={currentMission.date || ''} onChange={e=>handleUpdate('date', e.target.value)} /></div><div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase text-black leading-none">Prestation</label><select disabled={isLocked} className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black" value={currentMission.type || ''} onChange={e=>handleUpdate('type', e.target.value)}>{MISSION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div></div>
                                <div className="space-y-2 text-black"><label className="text-[10px] font-black text-slate-400 uppercase text-black leading-none text-left">Points GPS Décollage</label><div className="space-y-3">{!isLocked && <button onClick={()=>handleUpdate('takeOffPoints', [...(currentMission.takeOffPoints||[]), {name:'', coords:''}])} className="text-sky-600 text-[10px] font-black uppercase flex items-center gap-2"><Plus size={14}/> Ajouter un point</button>}{(currentMission.takeOffPoints || []).map((p, i) => (<div key={i} className="flex gap-2 items-center"><input disabled={isLocked} className="flex-1 bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs font-bold text-black" value={p.name} placeholder="Nom" onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].name=e.target.value; handleUpdate('takeOffPoints',n)}} /><input disabled={isLocked} className="flex-1 bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs font-bold text-sky-600" value={p.coords} placeholder="GPS" onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].coords=e.target.value; handleUpdate('takeOffPoints',n)}} />{!isLocked && <button onClick={()=>{const n=[...currentMission.takeOffPoints]; n.splice(i,1); handleUpdate('takeOffPoints',n)}} className="text-red-400 p-2"><X size={16}/></button>}</div>))}</div></div>
                            </div>
                            <div className="space-y-8"><MapView location={currentMission.location} /><div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-black"><div className="flex items-center justify-between mb-6 text-indigo-600 leading-none"><div className="flex items-center gap-3"><Users size={24}/><h4 className="text-xs font-black uppercase text-black leading-none">Interlocuteurs</h4></div>{!isLocked && <button onClick={()=>handleUpdate('contacts', [...(currentMission.contacts||[]), {name:'', phone:'', role:''}])} className="bg-indigo-600 text-white p-2 rounded-xl leading-none"><UserPlus size={18}/></button>}</div><div className="space-y-4">{(currentMission.contacts || []).map((c, i) => (<div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl relative text-black leading-none">{!isLocked && <button onClick={()=>{const n=[...currentMission.contacts]; n.splice(i,1); handleUpdate('contacts',n)}} className="absolute top-4 right-4 text-red-300"><Trash2 size={16}/></button>}<div className="grid grid-cols-2 gap-4 text-black"><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-black text-black outline-none" value={c.name} onChange={e=>{const n=[...currentMission.contacts]; n[i].name=e.target.value; handleUpdate('contacts',n)}} /><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-black outline-none" value={c.role} onChange={e=>{const n=[...currentMission.contacts]; n[i].role=e.target.value; handleUpdate('contacts',n)}} /></div><div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-black leading-none"><Phone size={14}/><input disabled={isLocked} className="flex-1 bg-transparent text-xs font-black text-indigo-600 outline-none text-black" value={c.phone} onChange={e=>{const n=[...currentMission.contacts]; n[i].phone=e.target.value; handleUpdate('contacts',n)}} /></div></div>))}</div></div></div>
                        </div>
                    </div>

                    {/* SECTION LOGBOOK */}
                    <div className={`${activeTab === 'flight' ? 'block' : 'hidden print:block'} animate-in fade-in space-y-10 text-left`}>
                        <div className="bg-white border-2 border-slate-100 rounded-[48px] overflow-hidden shadow-sm leading-none text-black">
                            <table className="w-full text-left leading-none text-black"><thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase border-b border-slate-100 leading-none text-black"><tr><th className="p-7 text-black">#</th><th className="p-7 text-black">Heures Vol</th><th className="p-7 text-black">Batt.</th><th className="p-7 text-right text-black">Durée</th><th className="p-7 text-center print:hidden text-black">Action</th></tr></thead><tbody className="divide-y divide-slate-100 text-black leading-none">{(currentMission.logs || []).map((l, i) => (<tr key={l.id} className="hover:bg-slate-50 transition-colors text-black leading-none"><td className="p-7 text-slate-300 font-black leading-none">{i+1}</td><td className="p-7 font-mono text-slate-700 text-xs leading-none">{l.start || '--:--'} ➔ {l.end || '--:--'}</td><td className="p-7 text-sky-600 font-black leading-none">{l.battery}%</td><td className="p-7 text-right font-black text-lg tabular-nums leading-none">{formatDuration(calculateDuration(l.start, l.end))}</td><td className="p-7 text-center print:hidden leading-none">{!isLocked && <button onClick={()=>{const nl=[...currentMission.logs]; nl.splice(i,1); handleUpdate('logs',nl)}} className="text-red-300 hover:text-red-500"><Trash2 size={18}/></button>}</td></tr>))}</tbody></table>
                        </div>
                        {!isLocked && <button onClick={()=>handleUpdate('logs', [...(currentMission.logs||[]), {id:Date.now(), start:'12:00', end:'12:20', battery:'40'}])} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 font-black uppercase text-xs hover:bg-white transition-all">+ Saisie manuelle</button>}
                    </div>

                    {/* SECTION VALIDATION */}
                    <div className={`${activeTab === 'sign' ? 'block' : 'hidden print:block'} animate-in fade-in space-y-12 text-left`}>
                        <div className="grid md:grid-cols-2 gap-8 text-black leading-none">
                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6"><div className="flex items-center gap-3 text-indigo-600"><MessageSquare size={24}/><h4 className="text-xs font-black uppercase text-black">Débriefing Mission</h4></div><textarea className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl outline-none h-40 text-sm font-medium leading-relaxed text-black" value={currentMission.debriefing || ''} onChange={e=>handleUpdate('debriefing', e.target.value)}></textarea></div>
                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-center leading-none text-black"><div className="flex items-center gap-3 text-emerald-600 mb-6"><CheckCircle2 size={24}/><h4 className="text-xs font-black uppercase text-black">Statut</h4></div><div className="grid grid-cols-2 gap-3 print:hidden">{MISSION_STATUS.map(s => (<button key={s.value} onClick={()=>handleUpdate('status', s.value)} className={`p-4 rounded-2xl font-black text-[10px] uppercase border-2 ${currentMission.status === s.value ? `${s.color} text-white` : `bg-white text-slate-400`}`}>{s.value}</button>))}</div></div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-10">
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