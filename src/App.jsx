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
  const systemPrompt = "Tu es un expert météo aéronautique. Récupère via Google Search : temp (°C), vent (km/h), KP. Réponds uniquement en JSON : {\"temp\": \"valeur\", \"wind\": \"valeur\", \"kp\": \"valeur\"}.";
  const userQuery = `Météo actuelle : ${location}`;

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
    const d1 = new Date(0, 0, 0, h1, m1);
    const d2 = new Date(0, 0, 0, h2, m2);
    let diff = (d2.getTime() - d1.getTime()) / 60000;
    return diff < 0 ? diff + 1440 : diff;
  } catch(e) { return 0; }
};

const formatDuration = (min) => `${Math.floor(min/60)}h ${Math.round(min%60)}m`;

// --- 5. COMPOSANTS ---

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
                <h2 className="text-3xl font-black mb-1 uppercase text-slate-900 tracking-tighter">Aerothau Cockpit</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase mb-10 tracking-widest">Opérations Pilotes</p>
                <form onSubmit={login} className="space-y-6 text-left">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Email</label>
                        <input required type="email" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 font-bold text-black" value={email} onChange={e=>setEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Mot de passe</label>
                        <input required type="password" placeholder="••••••••" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 font-bold text-black" value={password} onChange={e=>setPassword(e.target.value)} />
                    </div>
                    {err && <div className="text-red-600 text-xs font-bold text-center bg-red-50 p-3 rounded-xl">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-black transition-all">
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : "ACCÉDER AU COCKPIT"}
                    </button>
                </form>
            </div>
        </div>
    );
};

const SignaturePad = ({ title, onSave, savedData, isLocked }) => {
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
      return { 
        x: (clientX - rect.left) * (canvas.width / rect.width), 
        y: (clientY - rect.top) * (canvas.height / rect.height) 
      };
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
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', stop);
    };
  }, [savedData, onSave, isLocked]);

  return (
    <div className="border border-slate-200 rounded-[32px] p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{title}</label>
        {!isLocked && <button onClick={() => onSave(null)} className="text-[10px] text-red-500 font-black uppercase">Effacer</button>}
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 h-32 w-full touch-none overflow-hidden print:bg-white print:border-slate-300">
        <canvas ref={canvasRef} width={600} height={300} className={`w-full h-full ${isLocked ? '' : 'cursor-crosshair'}`} />
        {!savedData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase">Dessinez ici</div>}
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 print:hidden">
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-sky-100 p-3 rounded-2xl text-sky-600"><Plane size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Missions</p><p className="text-2xl font-black text-slate-900">{stats.count}</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600"><Clock size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Heures Vol</p><p className="text-2xl font-black text-emerald-600">{stats.hours}h</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-orange-100 p-3 rounded-2xl text-orange-600"><Car size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Km</p><p className="text-2xl font-black text-orange-600">{stats.km}</p></div>
      </div>
      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 text-black">
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><Moon size={24}/></div>
        <div><p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Découchers</p><p className="text-2xl font-black text-indigo-600">{stats.nights}</p></div>
      </div>
    </div>
  );
};

// --- COMPOSANT PRINCIPAL : APP ---
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
    const canUpdateAlways = ['status', 'debriefing', 'signaturePilote', 'signatureClient'].includes(f);
    if (isLocked && !canUpdateAlways) return;
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-sky-500" /></div>;
  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-screen font-sans bg-slate-50 pb-20 text-left text-black">
      <nav className="sticky top-0 z-50 shadow-xl border-b border-slate-700 px-4 md:px-8 py-4 flex justify-between items-center bg-slate-900 text-white print:hidden">
        <div className="flex items-center gap-5">
          {view !== 'list' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all"><ChevronLeft size={24} /></button>}
          <span className="font-black text-2xl tracking-tighter uppercase">Aerothau</span>
        </div>
        <div className="flex gap-2">
          {view === 'list' ? (
            <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all leading-none"><Plus size={20}/> Mission</button>
          ) : (
            <div className="flex gap-2">
                <button onClick={() => setIsLocked(!isLocked)} className={`p-2.5 rounded-2xl shadow-lg active:scale-90 leading-none ${isLocked ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>{isLocked ? <Lock size={20}/> : <Unlock size={20}/>}</button>
                {!isLocked && <button onClick={async () => { if(confirm("Supprimer?")) { await deleteDoc(doc(db, 'users', user.uid, 'missions', currentMission.id)); setView('list'); } }} className="bg-red-500 text-white p-2.5 rounded-2xl shadow-lg"><Trash2 size={20}/></button>}
                <button onClick={() => window.print()} className="bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 border border-slate-700 shadow-lg"><Printer size={18}/> Rapport</button>
                <button onClick={() => setView('list')} className="bg-sky-600 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-xl">Enregistrer</button>
            </div>
          )}
          <button onClick={()=>signOut(auth)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl hover:bg-red-900/40"><LogOut size={22}/></button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {view === 'list' && (
          <div className="animate-in fade-in">
            <DashboardStats missions={missions} />
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-8">Journal des Opérations</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 text-black">
                {missions.map(m => {
                    const s = MISSION_STATUS.find(x => x.value === m.status) || MISSION_STATUS[0];
                    return (
                        <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit'); setIsLocked(true);}} 
                            className={`bg-white p-8 rounded-[48px] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border-2 ${s.border} relative overflow-hidden text-left`}>
                            <div className="flex justify-between mb-5 leading-none"><span className="text-[10px] font-black text-slate-400 uppercase">{m.ref}</span><span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full text-white ${s.color}`}>{m.status}</span></div>
                            <h3 className="font-black text-2xl text-slate-900 mb-2 uppercase leading-tight">{m.title || m.client || "Mission sans titre"}</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase"><MapPin size={16} className="inline mr-1"/>{m.location || "Lieu non défini"}</p>
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
                    <div className={`${activeTab === 'general' ? 'block' : 'hidden print:block'} space-y-12 animate-in slide-in-from-bottom-5 text-left`}>
                        <div className="grid md:grid-cols-2 gap-12 text-black">
                            <div className="space-y-8">
                                <div className="space-y-4"><label className="text-[10px] font-black text-slate-400 uppercase leading-none">Mission & Client</label><input disabled={isLocked} className="w-full border-2 border-slate-100 p-6 rounded-[32px] bg-slate-50 focus:bg-white outline-none font-black text-3xl text-black" value={currentMission.title || ''} onChange={e=>handleUpdate('title', e.target.value)} /><input disabled={isLocked} className="w-full border-2 border-slate-100 p-5 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold text-slate-700" placeholder="Client" value={currentMission.client || ''} onChange={e=>handleUpdate('client', e.target.value)} /></div>
                                <div className="grid grid-cols-2 gap-4"><div className="space-y-2 text-black"><label className="text-[10px] font-black text-slate-400 uppercase text-black leading-none">Date</label><input disabled={isLocked} type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black leading-none" value={currentMission.date || ''} onChange={e=>handleUpdate('date', e.target.value)} /></div><div className="space-y-2 text-black"><label className="text-[10px] font-black text-slate-400 uppercase text-black leading-none">Prestation</label><select disabled={isLocked} className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black" value={currentMission.type || ''} onChange={e=>handleUpdate('type', e.target.value)}>{MISSION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div></div>
                                <div className="space-y-2 text-black leading-none text-left"><label className="text-[10px] font-black text-slate-400 uppercase text-black leading-none">Lieu</label><input disabled={isLocked} className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 outline-none font-bold text-black leading-none" value={currentMission.location || ''} onChange={e=>handleUpdate('location', e.target.value)} /></div>
                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 text-black">
                                    <div className="flex items-center justify-between text-sky-600"><div className="flex items-center gap-3 text-black leading-none text-black"><Navigation size={24}/><h4 className="text-xs font-black uppercase text-black">Décollage GPS</h4></div>{!isLocked && <button onClick={()=>handleUpdate('takeOffPoints', [...(currentMission.takeOffPoints||[]), {name:'', coords:''}])} className="bg-sky-600 text-white p-2 rounded-xl text-black leading-none"><Plus size={18}/></button>}</div>
                                    <div className="space-y-4 text-black">{(currentMission.takeOffPoints || []).map((point, i) => (<div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative text-black text-left leading-none">{!isLocked && <button onClick={()=>{const n=[...currentMission.takeOffPoints]; n.splice(i,1); handleUpdate('takeOffPoints',n)}} className="absolute top-4 right-4 text-red-300"><Trash2 size={16}/></button>}<input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-black text-black outline-none w-full" value={point.name} placeholder="Désignation point..." onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].name=e.target.value; handleUpdate('takeOffPoints',n)}} /><input disabled={isLocked} className="w-full bg-transparent text-xs font-black text-sky-600 outline-none mt-2" value={point.coords} placeholder="Coordonnées GPS..." onChange={e=>{const n=[...currentMission.takeOffPoints]; n[i].coords=e.target.value; handleUpdate('takeOffPoints',n)}} /></div>))}</div>
                                </div>
                            </div>
                            <div className="space-y-8 text-black text-left">
                                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-black"><div className="flex items-center justify-between text-indigo-600 leading-none"><div className="flex items-center gap-3 text-black"><Users size={24}/><h4 className="text-xs font-black uppercase text-black">Interlocuteurs</h4></div>{!isLocked && <button onClick={()=>handleUpdate('contacts', [...(currentMission.contacts||[]), {name:'', phone:'', role:''}])} className="bg-indigo-600 text-white p-2 rounded-xl leading-none"><UserPlus size={18}/></button>}</div><div className="space-y-4">{(currentMission.contacts || []).map((contact, i) => (<div key={i} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl space-y-3 relative text-black leading-none">{!isLocked && <button onClick={()=>{const n=[...currentMission.contacts]; n.splice(i,1); handleUpdate('contacts',n)}} className="absolute top-4 right-4 text-red-300"><Trash2 size={16}/></button>}<div className="grid grid-cols-2 gap-4 text-black leading-none"><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-black text-black outline-none" value={contact.name} onChange={e=>{const n=[...currentMission.contacts]; n[i].name=e.target.value; handleUpdate('contacts',n)}} /><input disabled={isLocked} className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-black outline-none" value={contact.role} onChange={e=>{const n=[...currentMission.contacts]; n[i].role=e.target.value; handleUpdate('contacts',n)}} /></div><div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-black leading-none"><Phone size={14} className="text-slate-400"/><input disabled={isLocked} className="flex-1 bg-transparent text-xs font-black text-indigo-600 outline-none" value={contact.phone} onChange={e=>{const n=[...currentMission.contacts]; n[i].phone=e.target.value; handleUpdate('contacts',n)}} /></div></div>))}</div></div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION TECHNIQUE / METEO */}
                    <div className={`${activeTab === 'technical' ? 'block' : 'hidden print:block'} space-y-10 animate-in fade-in duration-500 text-left`}>
                        <div className="flex flex-col md:flex-row gap-6 items-center mb-8 print:hidden leading-none text-black">
                            <div className="grid grid-cols-3 gap-6 flex-1 w-full text-black">
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 text-black"><Wind className="text-sky-500" size={28}/><div className="flex-1 text-black"><p className="text-[9px] font-black text-slate-400 uppercase text-black mb-1">Vent</p><input disabled={isLocked} className="w-full bg-transparent font-black text-lg outline-none text-black" value={currentMission.meteoVent || ''} onChange={e=>handleUpdate('meteoVent', e.target.value)} /></div></div>
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 text-black"><Thermometer className="text-orange-500" size={28}/><div className="flex-1 text-black"><p className="text-[9px] font-black text-slate-400 uppercase text-black mb-1">Temp.</p><input disabled={isLocked} className="w-full bg-transparent font-black text-lg outline-none text-black" value={currentMission.meteoTemp || ''} onChange={e=>handleUpdate('meteoTemp', e.target.value)} /></div></div>
                                <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[32px] flex items-center gap-4 text-black"><CloudSun className="text-emerald-500" size={28}/><div className="flex-1 text-black text-black"><p className="text-[9px] font-black text-slate-400 uppercase text-black mb-1">KP</p><input disabled={isLocked} className="w-full bg-transparent font-black text-lg outline-none text-black" value={currentMission.meteoKP || ''} onChange={e=>handleUpdate('meteoKP', e.target.value)} /></div></div>
                            </div>
                            {!isLocked && <button onClick={refreshWeather} disabled={weatherLoading} className="bg-slate-900 text-white p-6 rounded-[32px] shadow-xl hover:bg-slate-800 disabled:opacity-50">{weatherLoading ? <Loader2 size={24} className="animate-spin"/> : <RefreshCw size={24}/>}</button>}
                        </div>
                        <div className="grid md:grid-cols-2 gap-12 text-black leading-none">
                            <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-10 shadow-2xl print:bg-white print:text-black print:p-0">
                                <div className="space-y-4 text-left"><div className="flex items-center gap-4 text-orange-400 border-b border-slate-800 pb-4 print:border-slate-900"><Plane size={24}/><h4 className="font-black uppercase tracking-widest text-xs">ATC / VOL</h4></div><textarea disabled={isLocked} className="w-full bg-slate-800/50 border-2 border-slate-700 p-6 rounded-3xl outline-none h-40 text-sm leading-relaxed text-black print:bg-white print:border-none print:p-0" value={currentMission.flightNotes || ''} onChange={e=>handleUpdate('flightNotes', e.target.value)}></textarea></div>
                                <div className="space-y-4 text-left"><div className="flex items-center gap-4 text-emerald-400 border-b border-slate-800 pb-4 print:border-slate-900"><Wrench size={24}/><h4 className="font-black uppercase tracking-widest text-xs">TECHNIQUE</h4></div><textarea disabled={isLocked} className="w-full bg-slate-800/50 border-2 border-slate-700 p-6 rounded-3xl outline-none h-40 text-sm leading-relaxed text-black print:bg-white print:border-none print:p-0" value={currentMission.techNotes || ''} onChange={e=>handleUpdate('techNotes', e.target.value)}></textarea></div>
                            </div>
                        </div>
                    </div>

                    <div className={`${activeTab === 'sign' ? 'block' : 'hidden print:block'} animate-in fade-in duration-500 space-y-12 print:mt-16 text-left text-black text-left`}>
                        <div className="grid md:grid-cols-2 gap-8 text-black text-left">
                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6"><div className="flex items-center gap-3 text-indigo-600 leading-none"><MessageSquare size={24}/><h4 className="text-xs font-black uppercase text-black">Débriefing Mission</h4></div><textarea className="w-full bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl outline-none h-40 text-sm font-medium leading-relaxed text-black" value={currentMission.debriefing || ''} onChange={e=>handleUpdate('debriefing', e.target.value)}></textarea></div>
                            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-center leading-none text-black"><div className="flex items-center gap-3 text-emerald-600 mb-6 text-black"><CheckCircle2 size={24}/><h4 className="text-xs font-black uppercase text-black">Statut</h4></div><div className="grid grid-cols-2 gap-3 print:hidden">{MISSION_STATUS.map(s => (<button key={s.value} onClick={()=>handleUpdate('status', s.value)} className={`p-4 rounded-2xl font-black text-[10px] uppercase border-2 ${currentMission.status === s.value ? `${s.color} text-white` : `bg-white text-slate-400`}`}>{s.value}</button>))}</div></div>
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