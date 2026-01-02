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
  AlertTriangle, 
  Wind,
  FileText,
  Search,
  CheckCircle,
  PenTool,
  Locate,
  X,
  Link as LinkIcon,
  Eye,
  Paperclip,
  Save,
  Loader2,
  LogOut,
  Lock,
  Mail,
  Shield,
  UserPlus,
  Tag,
  Menu,
  CloudRain,
  Clock,
  BatteryCharging,
  Wrench,
  ChevronRight,
  ChevronLeft as ChevronLeftIcon,
  BarChart3,
  WifiOff,
  ExternalLink,
  QrCode,
  AlertOctagon,
  Car,
  Check,
  Phone,
  Info,
  Maximize,
  BookOpen,
  Play,
  Square,
  History
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

const LOGO_URL = "/logo.png"; 

// --- THEME COLORS ---
const BRAND = {
  primary: '#0f172a',    
  textLight: '#f8fafc',
  accent: '#0ea5e9',     
  bg: '#f1f5f9',         
  surface: '#ffffff',
};

// --- SCENARIOS & RÈGLEMENTATION ---
const SCENARIO_INFOS = {
    'A1': {
        title: "Open A1",
        description: "Survol de personnes isolées possible (pas de rassemblement).",
        height: "120m",
        requirements: "Drone C0 (<250g) ou C1 (<900g).",
        zet: "Éviter le survol. Aucune distance minimale légale hors rassemblements."
    },
    'A2': {
        title: "Open A2",
        description: "Vol à proximité des personnes.",
        height: "120m",
        requirements: "Drone classe C2 (<4kg) + BAPD.",
        zet: "Distance horizontale : 30m des tiers (ou 5m en mode basse vitesse)."
    },
    'A3': {
        title: "Open A3",
        description: "Vol loin des personnes et des zones habitées.",
        height: "120m",
        requirements: "Drone C3/C4. Distance > 150m des zones urbaines.",
        zet: "Zone de vol totalement libre de tiers."
    },
    'STS-01': {
        title: "Spécifique STS-01",
        description: "VLOS en zone peuplée.",
        height: "120m",
        requirements: "Drone C5. Déclaration préalable requise.",
        zet: "Zone contrôlée au sol requise. Rayon ZET = Hauteur de vol (min 10m)."
    },
    'STS-02': {
        title: "Spécifique STS-02",
        description: "BVLOS hors zone peuplée.",
        height: "120m (ou selon protocole)",
        requirements: "Drone C6. Observateur requis si distance > 1km.",
        zet: "Zone tampon de 30m minimum autour de l'emprise de vol."
    },
};

const BASE_CHECKLIST = [
  {k:'meteo',l:'Météo / Vent / KP'}, 
  {k:'zet',l:'Balisage ZET effectué'}, 
  {k:'auth',l:'Autorisations & Protocoles'}, 
  {k:'notam',l:'Zones R-P-D & NOTAM'}, 
  {k:'drone_state',l:'État mécanique / Hélices'}, 
  {k:'batteries',l:'Batteries pleines'}, 
  {k:'sd_card',l:'Carte SD ok'}, 
  {k:'rtn',l:'Point de retour (RTH)'}
];

const SPECIFIC_CHECKLISTS = {
  'Relevé Lidars': [{k:'imu_warmup',l:'Chauffe IMU (3 min)'}, {k:'gnss_fix',l:'Fix RTK stable'}],
  'Inspection Technique': [{k:'sensor_calib',l:'Calibration nacelle/capteur'}, {k:'obs_check',l:'Distance de sécurité obstacle'}],
  'Photogrammétrie': [{k:'overlap',l:'Taux recouvrement réglé'}, {k:'gcp',l:'Cibles de calage posées'}],
  'Nettoyage (AirFlyClean)': [{k:'hose',l:'Tuyau raccordé/pression'}, {k:'area_sec',l:'Protection projections tiers'}],
};

// --- Helpers ---
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

// --- COMPOSANT : FIELD MODE (Terrain Cockpit) ---
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
            const newLog = { id: Date.now(), start: startStr, end: endStr, battery, notes: 'Vol Terrain' };
            onUpdate('logs', [...(mission.logs || []), newLog]);
        }
    };

    const progress = Math.round(((Object.values(mission.checklist || {}).filter(Boolean).length) / (BASE_CHECKLIST.length + (SPECIFIC_CHECKLISTS[mission.type]?.length || 0))) * 100);

    return (
        <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col p-4">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onExit} className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg"><ChevronLeft size={24}/></button>
                <div className="text-center">
                    <h2 className="text-emerald-400 font-black tracking-tighter text-xl">COCKPIT TERRAIN</h2>
                    <p className="text-[10px] text-slate-500 font-mono">{mission.ref}</p>
                </div>
                <div className="w-12"></div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pb-20">
                {/* Chrono */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-2xl">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">Chronomètre de Vol</div>
                    <div className="text-6xl font-mono font-black mb-6 tabular-nums">{Math.floor(elapsed / 60).toString().padStart(2,'0')}:{ (elapsed % 60).toString().padStart(2,'0')}</div>
                    <button onClick={handleFlight} className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all ${isFlying ? 'bg-red-600 animate-pulse' : 'bg-emerald-600 shadow-emerald-900/20 shadow-lg'}`}>
                        {isFlying ? <><Square fill="currentColor"/> ATTERRIR</> : <><Play fill="currentColor"/> DÉCOLLER</>}
                    </button>
                </div>

                {/* Contacts Rapides */}
                <div className="grid grid-cols-1 gap-2">
                    {(mission.contacts || []).map((c, i) => (
                        <a key={i} href={`tel:${c.phone}`} className="bg-blue-600/20 border border-blue-500/30 p-4 rounded-2xl flex justify-between items-center">
                            <div>
                                <div className="font-bold">{c.name}</div>
                                <div className="text-xs text-blue-400">{c.role}</div>
                            </div>
                            <Phone className="text-blue-400" size={24}/>
                        </a>
                    ))}
                </div>

                {/* Checklist Rapide */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500">SÉCURITÉ</span>
                        <span className={`text-xs font-bold ${progress === 100 ? 'text-emerald-400' : 'text-orange-400'}`}>{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-4">
                        <div className={`h-full transition-all ${progress === 100 ? 'bg-emerald-400' : 'bg-orange-500'}`} style={{width: `${progress}%`}}></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                         {BASE_CHECKLIST.slice(0, 4).map(i => (
                             <button key={i.k} onClick={() => onUpdate('checklist', {...mission.checklist, [i.k]: !mission.checklist?.[i.k]})} className={`p-3 rounded-xl border text-[10px] font-bold transition-all ${mission.checklist?.[i.k] ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                 {i.l}
                             </button>
                         ))}
                    </div>
                </div>

                {/* Consignes */}
                {(mission.flightInstructions || mission.techInstructions) && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm">
                        <h3 className="text-xs font-bold text-orange-400 uppercase mb-3">Consignes</h3>
                        <div className="space-y-2">
                            {mission.flightInstructions && <p className="border-l-2 border-orange-500 pl-3 text-slate-300">{mission.flightInstructions}</p>}
                            {mission.techInstructions && <p className="border-l-2 border-emerald-500 pl-3 text-slate-300">{mission.techInstructions}</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- COMPOSANT : ADMIN SCREEN (Design Lisible) ---
const AdminScreen = ({ onClose, userUid }) => {
    const [tab, setTab] = useState('team');
    const [isCreating, setIsCreating] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [fleet, setFleet] = useState([]);
    const [clients, setClients] = useState([]);

    const [form, setForm] = useState({ name: '', email: '', role: 'Pilote', password: '' });

    useEffect(() => {
        const unsubTeam = onSnapshot(query(collection(db, 'employees')), (s) => setEmployees(s.docs.map(d => ({id: d.id, ...d.data()}))));
        const unsubFleet = onSnapshot(query(collection(db, 'users', userUid, 'fleet')), (s) => setFleet(s.docs.map(d => ({id: d.id, ...d.data()}))));
        const unsubClients = onSnapshot(query(collection(db, 'users', userUid, 'clients')), (s) => setClients(s.docs.map(d => ({id: d.id, ...d.data()}))));
        return () => { unsubTeam(); unsubFleet(); unsubClients(); };
    }, [userUid]);

    const handleAddEmployee = async (e) => {
        e.preventDefault();
        await addDoc(collection(db, 'employees'), { name: form.name, email: form.email, role: form.role, active: true });
        setIsCreating(false);
        setForm({ name: '', email: '', role: 'Pilote', password: '' });
    };

    const handleDelete = async (col, id) => {
        if(!confirm("Supprimer ?")) return;
        if(col === 'team') await deleteDoc(doc(db, 'employees', id));
        else await deleteDoc(doc(db, 'users', userUid, col, id));
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
            <button onClick={onClose} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 font-bold"><ChevronLeft/> Missions</button>
            
            <div className="flex flex-col md:flex-row justify-between gap-6 mb-10 border-b border-slate-200 pb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800">ADMINISTRATION</h1>
                    <p className="text-slate-500">Gestion des pilotes, drones et clients.</p>
                </div>
                <div className="flex gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                    {['team', 'fleet', 'clients'].map(t => (
                        <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
                            {t === 'team' ? 'Équipe' : t === 'fleet' ? 'Drones' : 'Clients'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-700 capitalize">{tab}</h2>
                <button onClick={() => setIsCreating(!isCreating)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                    {isCreating ? <X size={16}/> : <Plus size={16}/>} {isCreating ? 'Annuler' : 'Nouveau'}
                </button>
            </div>

            {isCreating && (
                <form onSubmit={handleAddEmployee} className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 mb-8 animate-in fade-in slide-in-from-top-4">
                    <div className="grid md:grid-cols-3 gap-4">
                        <input className="border p-3 rounded-xl text-slate-800 focus:ring-2 ring-sky-500 outline-none" placeholder="Nom" required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                        <input className="border p-3 rounded-xl text-slate-800 focus:ring-2 ring-sky-500 outline-none" placeholder="Email" required value={form.email} onChange={e=>setForm({...form, email:e.target.value})} />
                        <select className="border p-3 rounded-xl text-slate-800 focus:ring-2 ring-sky-500 outline-none" value={form.role} onChange={e=>setForm({...form, role:e.target.value})}>
                            <option>Pilote</option><option>Admin</option><option>Observateur</option>
                        </select>
                    </div>
                    <button className="mt-4 bg-sky-600 text-white px-6 py-2 rounded-xl font-bold">Enregistrer</button>
                </form>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-100/50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                        <tr><th className="p-5">Nom / Désignation</th><th className="p-5">Détails</th><th className="p-5 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {(tab === 'team' ? employees : tab === 'fleet' ? fleet : clients).map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-5 font-bold text-slate-700">{item.name}</td>
                                <td className="p-5 text-sm text-slate-500">{item.email || item.class || item.address}</td>
                                <td className="p-5 text-right">
                                    <button onClick={() => handleDelete(tab, item.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                                </td>
                            </tr>
                        ))}
                        {(tab === 'team' ? employees : tab === 'fleet' ? fleet : clients).length === 0 && (
                            <tr><td colSpan="3" className="p-10 text-center text-slate-400 italic">Aucune donnée disponible.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- COMPOSANT : SIGNATURE PAD CLIENT ---
const ClientSignInterface = ({ adminUid, missionId }) => {
    const [mission, setMission] = useState(null);
    const [signed, setSigned] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMission = async () => {
            await signInAnonymously(auth);
            const docSnap = await getDoc(doc(db, 'users', adminUid, 'missions', missionId));
            if (docSnap.exists()) setMission(docSnap.data());
            setLoading(false);
        };
        fetchMission();
    }, [adminUid, missionId]);

    const saveSign = async (data) => {
        await updateDoc(doc(db, 'users', adminUid, 'missions', missionId), { signatureClient: data });
        setSigned(true);
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-sky-500" /></div>;
    if (signed) return <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center"><div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4"><Check size={40}/></div><h1 className="text-2xl font-bold">Signature Enregistrée</h1><p>Merci ! Vous pouvez fermer cette fenêtre.</p></div>;

    return (
        <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 border border-slate-100">
                <img src={LOGO_URL} className="h-12 mx-auto mb-6" alt="Aerothau" />
                <h1 className="text-center text-xl font-bold mb-6">Validation de Mission</h1>
                <div className="bg-slate-50 p-4 rounded-2xl mb-6 border border-slate-200">
                    <p className="text-xs text-slate-400 font-bold uppercase mb-1">Client</p>
                    <p className="font-bold text-slate-700">{mission?.client}</p>
                </div>
                <SignaturePad title="Signature Client" onSave={saveSign} savedData={null} />
            </div>
        </div>
    );
};

// --- COMPOSANT PRINCIPAL : APP ---
export default function App() {
  const [user, setUser] = useState(null);
  const [missions, setMissions] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentMission, setCurrentMission] = useState(null);
  const [view, setView] = useState('list');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isFieldMode, setIsFieldMode] = useState(false);
  const [qrModal, setQrModal] = useState(false);

  // Détection du mode signature via URL
  const params = new URLSearchParams(window.location.search);
  const signMode = params.get('mode') === 'sign';

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user || signMode) return;
    const unsubMissions = onSnapshot(query(collection(db, 'users', user.uid, 'missions')), s => setMissions(s.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubFleet = onSnapshot(query(collection(db, 'users', user.uid, 'fleet')), s => setFleet(s.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubClients = onSnapshot(query(collection(db, 'users', user.uid, 'clients')), s => setClients(s.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubMissions(); unsubFleet(); unsubClients(); };
  }, [user, signMode]);

  const handleUpdate = async (f, v) => {
    if (!currentMission) return;
    const updated = { ...currentMission, [f]: v };
    setCurrentMission(updated);
    setIsSaving(true);
    await updateDoc(doc(db, 'users', user.uid, 'missions', currentMission.id), { [f]: v });
    setTimeout(() => setIsSaving(false), 500);
  };

  const handleCreate = async () => {
    const m = { 
        ref: `ATH-${new Date().getFullYear()}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`,
        date: new Date().toISOString().split('T')[0],
        client: '', location: '', type: 'Inspection Technique', category: 'Open', scenario: 'A3',
        checklist: {}, contacts: [], logs: [], documents: [], missionInstructions: '', flightInstructions: '', techInstructions: '', travel: false,
        createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'users', user.uid, 'missions'), m);
    setCurrentMission({ id: docRef.id, ...m });
    setView('edit');
    setActiveTab('general');
  };

  const generateEmail = () => {
    const subject = `Compte-rendu Mission AEROTHAU - ${currentMission.ref}`;
    const contacts = (currentMission.contacts || []).map(c => `${c.name} (${c.role}): ${c.phone}`).join('\n');
    const body = `Bonjour,\n\nVoici le rapport de mission du ${new Date(currentMission.date).toLocaleDateString()}.\n\nRéférence : ${currentMission.ref}\nClient : ${currentMission.client}\nLieu : ${currentMission.location}\n\nContacts :\n${contacts}\n\nTemps de vol total : ${formatDuration(currentMission.logs?.reduce((a,b)=>a+calculateDuration(b.start,b.end),0) || 0)}\n\nCordialement,\nL'équipe Aerothau`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (signMode) return <ClientSignInterface adminUid={params.get('uid')} missionId={params.get('mid')} />;
  if (!user) return <LoginScreen />;
  if (view === 'admin') return <AdminScreen onClose={()=>setView('list')} userUid={user.uid} />;
  if (view === 'edit' && isFieldMode) return <FieldModeView mission={currentMission} onExit={()=>setIsFieldMode(false)} onUpdate={handleUpdate} />;

  return (
    <div className="min-h-screen font-sans text-slate-800" style={{ backgroundColor: BRAND.bg }}>
      
      {/* NAV BAR */}
      <nav className="sticky top-0 z-50 shadow-md border-b border-slate-700 px-4 md:px-6 py-4 flex justify-between items-center print:hidden" style={{ backgroundColor: BRAND.primary }}>
        <div className="flex items-center gap-4">
          {view === 'edit' && <button onClick={() => setView('list')} className="text-white hover:bg-slate-700 p-2 rounded-xl transition-all"><ChevronLeft size={24} /></button>}
          <div className="flex items-center gap-3">
             <img src={LOGO_URL} alt="Logo" className="h-8 brightness-0 invert" /> 
             <span className="font-extrabold text-lg text-white tracking-tight">AEROTHAU</span>
          </div>
          {isSaving && <div className="hidden md:flex items-center gap-2 text-xs font-bold text-sky-400 bg-slate-800 px-3 py-1 rounded-full animate-pulse border border-slate-700"><Loader2 size={12} className="animate-spin" /> Sauvegarde...</div>}
        </div>
        <div className="flex gap-2">
          {view === 'list' ? (
            <>
              <button onClick={() => setView('admin')} className="p-2 bg-slate-700 text-white rounded-xl border border-slate-600"><Shield size={20}/></button>
              <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-5 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg active:scale-95 transition-all"><Plus size={18}/> Nouveau</button>
              <button onClick={()=>signOut(auth)} className="p-2 bg-slate-700 text-slate-300 rounded-xl border border-slate-600"><LogOut size={20}/></button>
            </>
          ) : (
            <>
              <button onClick={() => setIsFieldMode(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg active:scale-95 transition-all text-sm"><Maximize size={18}/> Cockpit</button>
              <button onClick={() => window.print()} className="hidden md:block bg-slate-700 hover:bg-slate-600 text-white p-2.5 rounded-xl border border-slate-600 transition-all"><Printer size={20}/></button>
              <button onClick={() => setView('list')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg active:scale-95 transition-all"><Save size={18}/> Enregistrer</button>
            </>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-6 print:p-0">
        
        {/* LISTE MISSIONS */}
        {view === 'list' && (
          <div className="space-y-6 animate-in fade-in">
            <DashboardStats missions={missions} />
            <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit'); setActiveTab('general');}} className="bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer border border-slate-100 group relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${m.category === 'SPECIFIC' ? 'bg-orange-400' : 'bg-emerald-400'}`}></div>
                  <div className="flex justify-between items-start mb-4"><span className="text-[10px] font-bold tracking-wider bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-mono">{m.ref}</span><span className="text-xs text-slate-400 font-medium flex items-center gap-1"><CalendarIcon size={12}/> {new Date(m.date).toLocaleDateString()}</span></div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1 truncate">{m.title || m.client || 'Mission sans titre'}</h3>
                  <p className="text-sm text-slate-500 mb-4 truncate"><MapPin size={14} className="inline mr-1 opacity-50"/> {m.location || 'Lieu non défini'}</p>
                  <div className="flex flex-wrap gap-2 mt-auto"><span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded text-[10px] font-bold text-slate-600 uppercase tracking-wide">{m.type}</span></div>
                </div>
              ))}
              {missions.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 italic">Aucune mission. Cliquez sur "Nouveau" pour commencer.</div>}
            </div>
          </div>
        )}

        {/* EDITION MISSION */}
        {view === 'edit' && currentMission && (
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden print:border-none print:shadow-none">
            
            {/* TABS HEADER */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-4 md:px-8 gap-6 print:hidden sticky top-0 z-10 overflow-x-auto">
              {['general', 'check', 'flight', 'sign'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} className={`py-5 text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === t ? 'text-sky-600 border-b-4 border-sky-600' : 'text-slate-400 hover:text-slate-600'}`}>
                  {t === 'general' ? 'Infos' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                </button>
              ))}
            </div>

            <div className="p-6 md:p-10 print:p-0">
                {/* CONTENU ONGLET GENERAL */}
                <div className={activeTab === 'general' ? 'block animate-in fade-in' : 'hidden print:block'}>
                    <div className="grid md:grid-cols-2 gap-8 mb-10">
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Titre de la Mission</label>
                            <input className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-bold text-lg text-slate-800 transition-all" value={currentMission.title || ''} onChange={e => handleUpdate('title', e.target.value)} placeholder="Inspection Toiture..." />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</label>
                            <input className="w-full border-2 border-slate-100 p-3 rounded-xl bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-bold" value={currentMission.client} onChange={e => handleUpdate('client', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                            <input type="date" className="w-full border-2 border-slate-100 p-3 rounded-xl bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-bold" value={currentMission.date} onChange={e => handleUpdate('date', e.target.value)} />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">Lieu <span>GPS <Locate size={10} className="inline"/></span></label>
                            <input className="w-full border-2 border-slate-100 p-3 rounded-xl bg-slate-50 focus:bg-white focus:border-sky-500 outline-none" value={currentMission.location} onChange={e => handleUpdate('location', e.target.value)} />
                        </div>
                    </div>

                    {/* CONTACTS LIST */}
                    <div className="border-t border-slate-100 pt-8 mb-10">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Users size={16}/> Contacts Spécifiques</h4>
                        <div className="grid md:grid-cols-2 gap-4">
                            {(currentMission.contacts || []).map((c, i) => (
                                <div key={i} className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 relative group">
                                    <input className="bg-transparent font-bold outline-none text-slate-800" placeholder="Nom du contact" value={c.name} onChange={e => {const n=[...currentMission.contacts]; n[i].name=e.target.value; handleUpdate('contacts',n)}} />
                                    <div className="flex gap-2">
                                        <input className="flex-1 bg-transparent text-sm outline-none text-sky-600 font-mono" placeholder="Téléphone" value={c.phone} onChange={e => {const n=[...currentMission.contacts]; n[i].phone=e.target.value; handleUpdate('contacts',n)}} />
                                        <input className="bg-transparent text-xs outline-none text-slate-400 uppercase" placeholder="Rôle" value={c.role} onChange={e => {const n=[...currentMission.contacts]; n[i].role=e.target.value; handleUpdate('contacts',n)}} />
                                    </div>
                                    <button onClick={()=>{const n=[...currentMission.contacts]; n.splice(i,1); handleUpdate('contacts',n)}} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X size={16}/></button>
                                </div>
                            ))}
                            <button onClick={()=>handleUpdate('contacts', [...(currentMission.contacts||[]), {name:'', phone:'', role:''}])} className="border-2 border-dashed border-slate-200 p-6 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:border-sky-300 hover:text-sky-500 transition-all font-bold">
                                <Plus size={20}/> Ajouter un contact
                            </button>
                        </div>
                    </div>
                </div>

                {/* SÉCURITÉ & PROGRESS BAR */}
                <div className={activeTab === 'check' ? 'block animate-in slide-in-from-right-4' : 'hidden'}>
                    <div className="grid md:grid-cols-2 gap-10">
                        <div>
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Fiche Réglementaire</h4>
                            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800">
                                <div className="text-emerald-400 font-black text-2xl mb-2">{SCENARIO_INFOS[currentMission.scenario]?.title}</div>
                                <p className="text-slate-300 text-sm mb-6">{SCENARIO_INFOS[currentMission.scenario]?.description}</p>
                                <div className="space-y-3">
                                    <div className="flex gap-3 text-sm"><Maximize size={16} className="text-sky-500 shrink-0"/> <span><strong>Distance Tiers :</strong> {SCENARIO_INFOS[currentMission.scenario]?.zet}</span></div>
                                    <div className="flex gap-3 text-sm"><Plane size={16} className="text-sky-500 shrink-0"/> <span><strong>Classe Drone :</strong> {SCENARIO_INFOS[currentMission.scenario]?.requirements}</span></div>
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-end mb-4">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Liste de Contrôle</h4>
                                <span className={`text-2xl font-black ${safetyScore === 100 ? 'text-emerald-500' : 'text-orange-500'}`}>{safetyScore}%</span>
                            </div>
                            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden mb-8 border border-slate-200">
                                <div className={`h-full transition-all duration-700 ${safetyScore === 100 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-orange-500'}`} style={{width: `${safetyScore}%`}}></div>
                            </div>
                            <div className="space-y-3">
                                {activeChecklistItems.map(i => (
                                    <label key={i.k} className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2 ${currentMission.checklist?.[i.k] ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${currentMission.checklist?.[i.k] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent'}`}><Check size={16}/></div>
                                        <input type="checkbox" className="hidden" checked={currentMission.checklist?.[i.k] || false} onChange={() => handleUpdate('checklist', {...currentMission.checklist, [i.k]: !currentMission.checklist?.[i.k]})} />
                                        <span className={`font-bold ${currentMission.checklist?.[i.k] ? 'text-emerald-800' : 'text-slate-600'}`}>{i.l}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* LOGS & SIGNATURES... */}
                <div className={activeTab === 'flight' ? 'block animate-in' : 'hidden'}>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden mb-6">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black"><tr><th className="p-4">#</th><th className="p-4">Décollage</th><th className="p-4">Atterrissage</th><th className="p-4">Batterie</th><th className="p-4 text-right">Durée</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                                {(currentMission.logs || []).map((l, i) => (
                                    <tr key={l.id} className="hover:bg-slate-50">
                                        <td className="p-4 font-bold">{i+1}</td>
                                        <td className="p-4 font-mono">{l.start}</td>
                                        <td className="p-4 font-mono">{l.end}</td>
                                        <td className="p-4 text-sky-600 font-bold">{l.battery}%</td>
                                        <td className="p-4 text-right font-black">{formatDuration(calculateDuration(l.start, l.end))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={activeTab === 'sign' ? 'block animate-in' : 'hidden'}>
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Validation Finale</h3>
                        <div className="flex gap-2">
                             <button onClick={() => setQrModal(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold"><QrCode size={14}/> Sign. Distance</button>
                             <button onClick={generateEmail} className="bg-sky-100 text-sky-700 px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold"><Mail size={14}/> Rapport Mail</button>
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-8">
                        <SignaturePad title="Visa Télépilote (Aerothau)" savedData={currentMission.signaturePilote} onSave={d => handleUpdate('signaturePilote', d)} />
                        <SignaturePad title="Visa Client" savedData={currentMission.signatureClient} onSave={d => handleUpdate('signatureClient', d)} />
                    </div>
                </div>
            </div>
            
            {/* QR MODAL */}
            {qrModal && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
                    <div className="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl relative animate-in zoom-in duration-300">
                        <button onClick={()=>setQrModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900"><X/></button>
                        <h3 className="text-xl font-black mb-2">Signature à distance</h3>
                        <p className="text-sm text-slate-500 mb-6">Le client peut scanner ce code sur son téléphone pour signer sans contact.</p>
                        <div className="bg-slate-100 p-4 rounded-3xl mb-6">
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?mode=sign&uid=${user.uid}&mid=${currentMission.id}`)}`} className="mx-auto mix-blend-multiply" alt="QR" />
                        </div>
                        <div className="text-[10px] text-slate-400 break-all font-mono mb-6 bg-slate-50 p-2 rounded">{window.location.origin}?mode=sign&uid={user.uid}&mid={currentMission.id}</div>
                        <button onClick={()=>setQrModal(false)} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg">Fermer</button>
                    </div>
                </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// --- COMPOSANT : LOGIN ---
function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    const login = async (e) => {
        e.preventDefault();
        setLoading(true); setErr('');
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (e) { setErr("Identifiants incorrects."); }
        finally { setLoading(false); }
    };

    return (
        <div className="h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white p-8 md:p-12 rounded-[40px] shadow-2xl w-full max-w-md relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-sky-500"></div>
                <div className="text-center mb-10">
                    <img src={LOGO_URL} className="h-20 mx-auto mb-4" alt="Aerothau" />
                    <h2 className="text-2xl font-black text-slate-900 tracking-tighter">MISSION MANAGER</h2>
                    <p className="text-slate-400 text-sm font-medium">Connectez-vous à votre espace pilote</p>
                </div>
                <form onSubmit={login} className="space-y-5">
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email</label><input required type="email" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-sky-500 outline-none transition-all" value={email} onChange={e=>setEmail(e.target.value)} /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Mot de passe</label><input required type="password" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-sky-500 outline-none transition-all" value={password} onChange={e=>setPassword(e.target.value)} /></div>
                    {err && <div className="text-red-500 text-xs font-bold text-center bg-red-50 p-3 rounded-xl">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-5 rounded-2xl shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all flex justify-center">
                        {loading ? <Loader2 className="animate-spin" /> : "SE CONNECTER"}
                    </button>
                </form>
                <p className="mt-10 text-center text-slate-300 text-[10px] font-bold uppercase tracking-widest">© 2026 Aerothau SAS - Sécurisé</p>
            </div>
        </div>
    );
}