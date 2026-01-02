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
  Shield, 
  Maximize, 
  BookOpen, 
  Play, 
  Square, 
  Phone, 
  Mail, 
  BarChart3, 
  WifiOff, 
  ExternalLink, 
  QrCode, 
  AlertOctagon, 
  Car, 
  Check, 
  Clock, 
  BatteryCharging, 
  Wrench, 
  Users 
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
        zet: "ZET: Éviter le survol. Aucune distance minimale légale hors rassemblements."
    },
    'A2': {
        title: "Open A2",
        description: "Vol à proximité des personnes.",
        height: "120m",
        requirements: "Drone classe C2 (<4kg) + BAPD.",
        zet: "ZET: Distance horizontale : 30m des tiers (ou 5m en mode basse vitesse)."
    },
    'A3': {
        title: "Open A3",
        description: "Vol loin des personnes et des zones habitées.",
        height: "120m",
        requirements: "Drone C3/C4. Distance > 150m des zones urbaines.",
        zet: "ZET: Zone de vol totalement libre de tiers."
    },
    'STS-01': {
        title: "Spécifique STS-01",
        description: "VLOS en zone peuplée.",
        height: "120m",
        requirements: "Drone C5. Déclaration préalable requise.",
        zet: "ZET: Zone contrôlée au sol requise. Rayon = Hauteur de vol (min 10m)."
    },
    'STS-02': {
        title: "Spécifique STS-02",
        description: "BVLOS hors zone peuplée.",
        height: "120m (ou selon protocole)",
        requirements: "Drone C6. Observateur requis si distance > 1km.",
        zet: "ZET: Zone tampon de 30m minimum autour de l'emprise de vol."
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
    const date1 = new Date(0, 0, 0, h1, m1);
    const date2 = new Date(0, 0, 0, h2, m2);
    let diff = date2 - date1;
    if (diff < 0) diff += 86400000;
    return diff / 60000;
  } catch(e) { return 0; }
};

const formatDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h > 0 ? h + 'h ' : ''}${m}m`;
};

const DashboardStats = ({ missions }) => {
  const totalMissions = missions.length;
  const totalMinutes = missions.reduce((acc, m) => {
    const flightTime = m.logs?.reduce((sum, l) => sum + (calculateDuration(l.start, l.end) || 0), 0) || 0;
    return acc + flightTime;
  }, 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Missions</p>
        <p className="text-2xl font-black text-slate-900">{totalMissions}</p>
      </div>
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Heures Vol</p>
        <p className="text-2xl font-black text-sky-600">{(totalMinutes / 60).toFixed(1)}h</p>
      </div>
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hidden md:block">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Statut</p>
        <p className="text-sm font-bold text-emerald-500 flex items-center gap-1"><Check size={14}/> Opérationnel</p>
      </div>
    </div>
  );
};

const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

// --- Composant Signature ---
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
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = BRAND.primary;
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      onSave(canvasRef.current.toDataURL());
    }
  };

  const clear = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setIsEmpty(true);
    onSave(null);
  };

  return (
    <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm transition-all">
      <div className="flex justify-between items-center mb-3 print:hidden">
        <label className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
          <PenTool size={14} className="text-sky-500" /> {title}
        </label>
        <button onClick={clear} className="text-xs text-red-500 hover:text-red-700 font-medium">Effacer</button>
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 overflow-hidden h-32 md:h-40 w-full touch-none group">
        {savedData ? (
           <img src={savedData} alt="Signature" className="w-full h-full object-contain pointer-events-none" />
        ) : (
          <div className="relative w-full h-full">
             <canvas
              ref={canvasRef}
              width={600} 
              height={300}
              className="w-full h-full cursor-crosshair block"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              style={{ width: '100%', height: '100%' }}
            />
            {isEmpty && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-sm">Signez ici</div>}
          </div>
        )}
      </div>
    </div>
  );
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

    const totalPossibleCheck = BASE_CHECKLIST.length + (SPECIFIC_CHECKLISTS[mission.type]?.length || 0);
    const checkedCount = Object.values(mission.checklist || {}).filter(Boolean).length;
    const progress = Math.round((checkedCount / (totalPossibleCheck || 1)) * 100);

    return (
        <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col p-4 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onExit} className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg"><ChevronLeft size={24}/></button>
                <div className="text-center">
                    <h2 className="text-emerald-400 font-black tracking-tighter text-xl uppercase">Cockpit Terrain</h2>
                    <p className="text-[10px] text-slate-500 font-mono">{mission.ref}</p>
                </div>
                <div className="w-12"></div>
            </div>

            <div className="flex-1 space-y-4 pb-20">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-2xl">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">Chronomètre de Vol</div>
                    <div className="text-6xl font-mono font-black mb-6 tabular-nums">{formatTimer(elapsed)}</div>
                    <button onClick={handleFlight} className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all ${isFlying ? 'bg-red-600 animate-pulse' : 'bg-emerald-600 shadow-emerald-900/20 shadow-lg'}`}>
                        {isFlying ? <><Square fill="currentColor"/> ATTERRIR</> : <><Play fill="currentColor"/> DÉCOLLER</>}
                    </button>
                </div>

                <div className="space-y-2">
                    <h3 className="text-slate-400 text-xs font-bold uppercase ml-1">Contacts Rapides</h3>
                    {(mission.contacts || []).map((c, i) => (
                        <a key={i} href={`tel:${c.phone}`} className="bg-blue-600/20 border border-blue-500/30 p-4 rounded-2xl flex justify-between items-center active:bg-blue-600/40">
                            <div>
                                <div className="font-bold">{c.name}</div>
                                <div className="text-xs text-blue-400">{c.role}</div>
                            </div>
                            <Phone className="text-blue-400" size={24}/>
                        </a>
                    ))}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex justify-between mb-2 text-xs font-bold">
                        <span className="text-slate-500">SÉCURITÉ PRÉ-VOL</span>
                        <span className={progress === 100 ? 'text-emerald-400' : 'text-orange-400'}>{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-4">
                        <div className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-emerald-400' : 'bg-orange-500'}`} style={{width: `${progress}%`}}></div>
                    </div>
                </div>
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
    const [form, setForm] = useState({ name: '', email: '', role: 'Pilote' });

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
        setIsCreating(false);
        setForm({ name: '', email: '', role: 'Pilote' });
    };

    const handleDelete = async (t, id) => {
        if(!confirm("Supprimer ?")) return;
        const docRef = t === 'team' ? doc(db, 'employees', id) : doc(db, 'users', userUid, t, id);
        await deleteDoc(docRef);
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen animate-in fade-in">
            <button onClick={onClose} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 font-bold"><ChevronLeft/> Missions</button>
            
            <div className="flex flex-col md:flex-row justify-between gap-6 mb-10 border-b border-slate-200 pb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800">ADMINISTRATION</h1>
                    <p className="text-slate-500">Gestion de la flotte et des accès.</p>
                </div>
                <div className="flex gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                    {['team', 'fleet', 'clients'].map(t => (
                        <button key={t} onClick={() => {setTab(t); setIsCreating(false);}} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
                            {t === 'team' ? 'Équipe' : t === 'fleet' ? 'Drones' : 'Clients'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-700 capitalize">{tab}</h2>
                <button onClick={() => setIsCreating(!isCreating)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                    {isCreating ? <X size={16}/> : <Plus size={16}/>} {isCreating ? 'Annuler' : 'Ajouter'}
                </button>
            </div>

            {isCreating && (
                <form onSubmit={handleAdd} className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 mb-8 grid md:grid-cols-3 gap-4 animate-in slide-in-from-top-4">
                    <input className="border-2 border-slate-100 p-3 rounded-xl outline-none focus:border-sky-500 bg-slate-50 focus:bg-white transition-all" placeholder="Désignation / Nom" required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                    {tab === 'team' && <input className="border-2 border-slate-100 p-3 rounded-xl outline-none focus:border-sky-500 bg-slate-50 focus:bg-white transition-all" placeholder="Email" required value={form.email} onChange={e=>setForm({...form, email:e.target.value})} />}
                    <button className="bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-all shadow-lg">Confirmer</button>
                </form>
            )}

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b">
                        <tr><th className="p-5">Élément</th><th className="p-5 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {(tab === 'team' ? employees : tab === 'fleet' ? fleet : clients).map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-5">
                                    <div className="font-bold text-slate-700">{item.name}</div>
                                    <div className="text-xs text-slate-400">{item.email || item.class || item.address}</div>
                                </td>
                                <td className="p-5 text-right">
                                    <button onClick={() => handleDelete(tab, item.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                                </td>
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
        e.preventDefault();
        setLoading(true); setErr('');
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (e) { setErr("Identifiants incorrects."); }
        finally { setLoading(false); }
    };

    return (
        <div className="h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white p-8 md:p-12 rounded-[40px] shadow-2xl w-full max-w-md text-center border-t-4 border-sky-500">
                <img src={LOGO_URL} className="h-16 mx-auto mb-6" alt="Aerothau" />
                <h2 className="text-2xl font-black mb-2 tracking-tighter text-slate-900">MISSION MANAGER</h2>
                <p className="text-slate-400 text-sm mb-8">Espace de Pilotage Sécurisé</p>
                <form onSubmit={login} className="space-y-4 text-left">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                        <input required type="email" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 transition-all text-slate-800" value={email} onChange={e=>setEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mot de passe</label>
                        <input required type="password" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-sky-500 transition-all text-slate-800" value={password} onChange={e=>setPassword(e.target.value)} />
                    </div>
                    {err && <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-xl text-center border border-red-100">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95">
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : "SE CONNECTER"}
                    </button>
                </form>
            </div>
        </div>
    );
};

// --- COMPOSANT : CLIENT SIGN INTERFACE ---
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

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-sky-500" /></div>;
    if (signed) return (
        <div className="h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6"><Check size={40}/></div>
            <h1 className="text-2xl font-bold">Signature Enregistrée</h1>
            <p className="text-slate-500">Merci ! Votre validation a été transmise à Aerothau.</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-8 border border-slate-100">
                <img src={LOGO_URL} className="h-10 mx-auto mb-6" alt="Aerothau" />
                <h1 className="text-center text-xl font-black mb-6 text-slate-800">Validation Mission</h1>
                <div className="bg-slate-100 p-4 rounded-2xl mb-6 border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Donneur d'ordre</p>
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
  const [currentMission, setCurrentMission] = useState(null);
  const [view, setView] = useState('list');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isFieldMode, setIsFieldMode] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const isClientSign = params.get('mode') === 'sign';

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user || isClientSign) return;
    const unsubMissions = onSnapshot(query(collection(db, 'users', user.uid, 'missions')), s => {
        const data = s.docs.map(d => ({id: d.id, ...d.data()}));
        setMissions(data.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => unsubMissions();
  }, [user, isClientSign]);

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
        checklist: {}, contacts: [], logs: [], missionInstructions: '', flightInstructions: '', techInstructions: '', travel: false,
        createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'users', user.uid, 'missions'), m);
    setCurrentMission({ id: docRef.id, ...m });
    setView('edit');
    setActiveTab('general');
  };

  const activeChecklistItems = currentMission ? [...BASE_CHECKLIST, ...(SPECIFIC_CHECKLISTS[currentMission.type] || [])] : [];
  const checkedItemsCount = currentMission ? Object.values(currentMission.checklist || {}).filter(Boolean).length : 0;
  const safetyScore = Math.round((checkedItemsCount / Math.max(activeChecklistItems.length, 1)) * 100);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-sky-500" /></div>;
  if (isClientSign) return <ClientSignInterface adminUid={params.get('uid')} missionId={params.get('mid')} />;
  if (!user) return <LoginScreen />;
  if (isAdminView) return <AdminScreen onClose={()=>setIsAdminView(false)} userUid={user.uid} />;
  if (view === 'edit' && isFieldMode && currentMission) return <FieldModeView mission={currentMission} onExit={()=>setIsFieldMode(false)} onUpdate={handleUpdate} />;

  return (
    <div className="min-h-screen font-sans text-slate-800 bg-slate-50">
      <nav className="sticky top-0 z-50 shadow-md border-b border-slate-700 px-4 md:px-6 py-4 flex justify-between items-center" style={{ backgroundColor: BRAND.primary }}>
        <div className="flex items-center gap-4 text-white">
          {view === 'edit' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all"><ChevronLeft size={24} /></button>}
          <img src={LOGO_URL} alt="Logo" className="h-8 brightness-0 invert" /> 
          <span className="font-black text-lg tracking-tighter hidden sm:block">AEROTHAU</span>
        </div>
        <div className="flex gap-2">
          {view === 'list' ? (
            <>
              <button onClick={()=>setIsAdminView(true)} className="p-2 bg-slate-700 text-white rounded-xl border border-slate-600 hover:bg-slate-600"><Shield size={20}/></button>
              <button onClick={handleCreate} className="bg-sky-600 hover:bg-sky-500 text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all"><Plus size={18}/> Nouveau</button>
            </>
          ) : (
            <>
              <button onClick={()=>setIsFieldMode(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-sm shadow-md active:scale-95"><Maximize size={18}/> Cockpit</button>
              <button onClick={()=>setView('list')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95"><Save size={18}/> Enregistrer</button>
            </>
          )}
          <button onClick={()=>signOut(auth)} className="p-2 bg-slate-700 text-slate-300 rounded-xl border border-slate-600 hover:bg-red-900/50"><LogOut size={20}/></button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {view === 'list' && (
          <div className="space-y-6">
            <DashboardStats missions={missions} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} className="bg-white p-6 rounded-[32px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer border border-slate-100 relative overflow-hidden group">
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${m.category === 'SPECIFIC' ? 'bg-orange-400' : 'bg-emerald-400'}`}></div>
                    <div className="flex justify-between mb-4"><span className="text-[10px] font-black tracking-widest bg-slate-50 text-slate-400 px-3 py-1 rounded-full border border-slate-100">{m.ref}</span></div>
                    <h3 className="font-bold text-lg text-slate-800 mb-1 group-hover:text-sky-600 transition-colors">{m.title || "Mission sans titre"}</h3>
                    <p className="text-sm text-slate-500 flex items-center gap-1"><MapPin size={12} className="opacity-50"/>{m.location || "Lieu non défini"}</p>
                    <div className="mt-6 flex flex-wrap gap-2"><span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded text-[10px] font-bold text-slate-600 uppercase tracking-widest">{m.type}</span></div>
                </div>
                ))}
                {missions.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 italic bg-white rounded-3xl border-2 border-dashed border-slate-200">Aucune mission enregistrée.</div>}
            </div>
          </div>
        )}

        {view === 'edit' && currentMission && (
            <div className="bg-white rounded-[40px] shadow-xl border border-slate-200 overflow-hidden animate-in fade-in">
                <div className="flex border-b border-slate-200 bg-slate-50 px-6 gap-6 sticky top-0 z-10 overflow-x-auto scrollbar-hide">
                    {['general', 'check', 'flight', 'sign'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`py-5 text-xs font-black uppercase tracking-widest transition-all ${activeTab === t ? 'text-sky-600 border-b-4 border-sky-600' : 'text-slate-400'}`}>
                            {t === 'general' ? 'Infos' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                        </button>
                    ))}
                </div>
                
                <div className="p-6 md:p-10">
                    {activeTab === 'general' && (
                        <div className="space-y-10 animate-in fade-in">
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TITRE DE LA MISSION</label>
                                    <input className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-bold text-lg text-slate-800 transition-all shadow-inner" value={currentMission.title || ''} onChange={e => handleUpdate('title', e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CLIENT</label>
                                    <input className="w-full border-2 border-slate-100 p-3 rounded-xl bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-bold text-slate-700 transition-all" value={currentMission.client || ''} onChange={e => handleUpdate('client', e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">LIEU D'INTERVENTION</label>
                                    <input className="w-full border-2 border-slate-100 p-3 rounded-xl bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-bold text-slate-700 transition-all" value={currentMission.location || ''} onChange={e => handleUpdate('location', e.target.value)} />
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-8">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Users size={16}/> CONTACTS SUR SITE</h4>
                                <div className="grid md:grid-cols-2 gap-4">
                                    {(currentMission.contacts || []).map((c, i) => (
                                        <div key={i} className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 relative group transition-all hover:border-sky-200 hover:shadow-md">
                                            <input className="bg-transparent font-bold outline-none text-slate-800 placeholder:text-slate-300" placeholder="Nom complet" value={c.name} onChange={e => {const n=[...currentMission.contacts]; n[i].name=e.target.value; handleUpdate('contacts',n)}} />
                                            <div className="flex gap-2">
                                                <input className="flex-1 bg-transparent text-sm outline-none text-sky-600 font-mono placeholder:text-sky-300" placeholder="Téléphone" value={c.phone} onChange={e => {const n=[...currentMission.contacts]; n[i].phone=e.target.value; handleUpdate('contacts',n)}} />
                                                <input className="bg-transparent text-[10px] outline-none text-slate-400 uppercase placeholder:text-slate-300" placeholder="Rôle (ex: ATC)" value={c.role} onChange={e => {const n=[...currentMission.contacts]; n[i].role=e.target.value; handleUpdate('contacts',n)}} />
                                            </div>
                                            <button onClick={()=>{const n=[...currentMission.contacts]; n.splice(i,1); handleUpdate('contacts',n)}} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={16}/></button>
                                        </div>
                                    ))}
                                    <button onClick={()=>handleUpdate('contacts', [...(currentMission.contacts||[]), {name:'', phone:'', role:''}])} className="border-2 border-dashed border-slate-200 p-8 rounded-3xl flex items-center justify-center gap-2 text-slate-400 hover:text-sky-500 hover:border-sky-300 transition-all font-bold">+ Ajouter Contact</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'check' && (
                        <div className="grid md:grid-cols-2 gap-10 animate-in slide-in-from-right-4">
                            <div>
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">FICHE SCÉNARIO & ZET</h4>
                                <div className="bg-slate-900 text-white p-8 rounded-[32px] shadow-2xl border border-slate-800 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10"><Shield size={80}/></div>
                                    <div className="text-emerald-400 font-black text-2xl mb-2">{SCENARIO_INFOS[currentMission.scenario]?.title}</div>
                                    <p className="text-slate-300 text-sm mb-8 leading-relaxed">{SCENARIO_INFOS[currentMission.scenario]?.description}</p>
                                    <div className="space-y-5">
                                        <div className="flex gap-4 items-start"><Maximize size={18} className="text-sky-400 shrink-0 mt-1"/> <div className="text-sm"><strong className="block text-sky-400 text-[10px] uppercase">Périmètre de sécurité (ZET)</strong>{SCENARIO_INFOS[currentMission.scenario]?.zet}</div></div>
                                        <div className="flex gap-4 items-start"><Plane size={18} className="text-sky-400 shrink-0 mt-1"/> <div className="text-sm"><strong className="block text-sky-400 text-[10px] uppercase">Matériel requis</strong>{SCENARIO_INFOS[currentMission.scenario]?.requirements}</div></div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-4">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">CHECKLIST PRÉ-VOL</h4>
                                    <span className={`text-2xl font-black ${safetyScore === 100 ? 'text-emerald-500' : 'text-orange-500'}`}>{safetyScore}%</span>
                                </div>
                                <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden mb-8 border border-slate-200 p-0.5">
                                    <div className={`h-full rounded-full transition-all duration-700 ${safetyScore === 100 ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]' : 'bg-orange-500'}`} style={{width: `${safetyScore}%`}}></div>
                                </div>
                                <div className="space-y-3">
                                    {activeChecklistItems.map(i => (
                                        <label key={i.k} className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2 ${currentMission.checklist?.[i.k] ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all ${currentMission.checklist?.[i.k] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-transparent'}`}><Check size={20} strokeWidth={4}/></div>
                                            <input type="checkbox" className="hidden" checked={currentMission.checklist?.[i.k] || false} onChange={() => handleUpdate('checklist', {...(currentMission.checklist||{}), [i.k]: !currentMission.checklist?.[i.k]})} />
                                            <span className={`font-bold ${currentMission.checklist?.[i.k] ? 'text-emerald-800' : 'text-slate-600'}`}>{i.l}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'flight' && (
                        <div className="animate-in fade-in space-y-6">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">LOGBOOK MISSION</h4>
                            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-widest border-b">
                                        <tr><th className="p-5">#</th><th className="p-5">Décollage</th><th className="p-5">Atterrissage</th><th className="p-5">Batterie</th><th className="p-5 text-right">Durée</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {(currentMission.logs || []).map((l, i) => (
                                            <tr key={l.id} className="hover:bg-slate-50">
                                                <td className="p-5 font-bold">{i+1}</td>
                                                <td className="p-5 font-mono text-slate-500">{l.start}</td>
                                                <td className="p-5 font-mono text-slate-500">{l.end}</td>
                                                <td className="p-5 text-sky-600 font-bold">{l.battery}%</td>
                                                <td className="p-5 text-right font-black text-slate-900">{formatDuration(calculateDuration(l.start, l.end))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button onClick={()=>handleUpdate('logs', [...(currentMission.logs||[]), {id:Date.now(), start:'12:00', end:'12:20', battery:'40', notes:''}])} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold hover:bg-white hover:border-sky-300 hover:text-sky-500 transition-all">+ Saisie manuelle d'un vol</button>
                        </div>
                    )}

                    {activeTab === 'sign' && (
                        <div className="animate-in fade-in space-y-8">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">VALIDATIONS ET SIGNATURES</h3>
                                <button onClick={() => setQrModal(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl flex items-center gap-2 text-sm font-bold shadow-lg hover:bg-slate-800 transition-all active:scale-95"><QrCode size={16}/> Signature Sans Contact</button>
                            </div>
                            <div className="grid md:grid-cols-2 gap-8">
                                <SignaturePad title="Visa Télépilote (Aerothau)" savedData={currentMission.signaturePilote} onSave={d => handleUpdate('signaturePilote', d)} />
                                <SignaturePad title="Visa Client / Représentant" savedData={currentMission.signatureClient} onSave={d => handleUpdate('signatureClient', d)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {qrModal && (
            <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[200] flex items-center justify-center p-6" onClick={()=>setQrModal(false)}>
                <div className="bg-white p-8 rounded-[50px] max-w-sm w-full text-center shadow-2xl relative animate-in zoom-in duration-300" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>setQrModal(false)} className="absolute top-6 right-6 text-slate-300 hover:text-slate-900"><X/></button>
                    <h3 className="text-2xl font-black mb-2 tracking-tighter">SIGNATURE DISTANCE</h3>
                    <p className="text-sm text-slate-500 mb-10 px-4">Le client signe directement sur son mobile en scannant ce code.</p>
                    <div className="bg-white p-6 rounded-[40px] shadow-inner mb-10 border border-slate-100">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?mode=sign&uid=${user.uid}&mid=${currentMission.id}`)}`} className="mx-auto" alt="QR Code Signature" />
                    </div>
                    <button onClick={()=>setQrModal(false)} className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black text-lg shadow-lg hover:shadow-sky-500/20 transition-all">TERMINER</button>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}