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

// --- THEME COLORS ---
const BRAND = {
  primary: '#0f172a',    
  accent: '#0ea5e9',     
};

// --- SCENARIOS & RÈGLEMENTATION ---
const SCENARIO_INFOS = {
    'A1': { title: "Open A1", description: "Survol de personnes isolées possible.", zet: "ZET: Éviter le survol. Pas de distance minimale." },
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

// --- HELPERS ---
const calculateDuration = (start, end) => {
  if (!start || !end) return 0;
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  const d1 = new Date(0, 0, 0, h1, m1);
  const d2 = new Date(0, 0, 0, h2, m2);
  let diff = d2 - d1;
  if (diff < 0) diff += 86400000;
  return diff / 60000;
};

// --- COMPONENTS ---

const MapView = ({ location }) => {
  const mapUrl = useMemo(() => {
    if (!location) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed&t=k`;
  }, [location]);

  if (!location) return (
    <div className="h-48 bg-slate-100 rounded-3xl flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200">
      <MapIcon size={32} className="mb-2 opacity-20"/>
      <p className="text-[10px] font-black uppercase tracking-widest">Saisissez un lieu pour voir la carte</p>
    </div>
  );

  return (
    <div className="h-64 rounded-3xl overflow-hidden border-4 border-white shadow-xl bg-slate-200 relative">
      <iframe title="Map" width="100%" height="100%" frameBorder="0" src={mapUrl} allowFullScreen></iframe>
      <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-md text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">Vue Satellite</div>
    </div>
  );
};

const DashboardStats = ({ missions }) => {
  const totalMissions = missions.length;
  const totalMinutes = missions.reduce((acc, m) => acc + (m.logs?.reduce((sum, l) => sum + calculateDuration(l.start, l.end), 0) || 0), 0);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Missions</p>
        <p className="text-2xl font-black text-slate-900">{totalMissions}</p>
      </div>
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Vol</p>
        <p className="text-2xl font-black text-sky-600">{(totalMinutes/60).toFixed(1)}h</p>
      </div>
    </div>
  );
};

const SignaturePad = ({ title, onSave, savedData }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!savedData);

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

  return (
    <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <label className="text-[10px] font-black uppercase text-slate-400">{title}</label>
        <button onClick={() => { canvasRef.current.getContext('2d').clearRect(0,0,600,300); onSave(null); setIsEmpty(true); }} className="text-[10px] text-red-500 font-black">EFFACER</button>
      </div>
      <div className="relative border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 h-32 w-full touch-none overflow-hidden">
        {savedData ? <img src={savedData} className="w-full h-full object-contain" alt="sign" /> : (
          <canvas ref={canvasRef} width={600} height={300} className="w-full h-full" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => {setIsDrawing(false); onSave(canvasRef.current.toDataURL());}} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={() => {setIsDrawing(false); onSave(canvasRef.current.toDataURL());}} />
        )}
        {isEmpty && !savedData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest">Signer ici</div>}
      </div>
    </div>
  );
};

// --- LOGIN ---
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
            <div className="bg-white p-10 rounded-[48px] shadow-2xl w-full max-w-md text-center border-t-8 border-sky-500">
                <img src={LOGO_URL} className="h-16 mx-auto mb-6 object-contain" alt="Logo" />
                <h2 className="text-3xl font-black mb-1 tracking-tighter uppercase">Pilote Manager</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-10">Aerothau Operational Center</p>
                <form onSubmit={login} className="space-y-4 text-left">
                    <input required type="email" placeholder="EMAIL" className="w-full bg-slate-50 border-2 p-4 rounded-2xl outline-none font-bold" value={email} onChange={e=>setEmail(e.target.value)} />
                    <input required type="password" placeholder="MOT DE PASSE" className="w-full bg-slate-50 border-2 p-4 rounded-2xl outline-none font-bold" value={password} onChange={e=>setPassword(e.target.value)} />
                    {err && <div className="text-red-500 text-[10px] font-black text-center">{err}</div>}
                    <button disabled={loading} className="w-full bg-slate-900 text-white font-black py-5 rounded-3xl shadow-xl uppercase tracking-widest text-sm active:scale-95 transition-all">
                        {loading ? <Loader2 className="animate-spin mx-auto" /> : "ACCÉDER AU COCKPIT"}
                    </button>
                </form>
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [qrModal, setQrModal] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, 'users', user.uid, 'missions')), s => {
        const data = s.docs.map(d => ({id: d.id, ...d.data()}));
        setMissions(data.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
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
        flightNotes: '', techNotes: '', createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'users', user.uid, 'missions'), m);
    setCurrentMission({ id: docRef.id, ...m }); setView('edit'); setActiveTab('general');
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-sky-500" /></div>;
  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-screen font-sans text-slate-800 bg-slate-50 pb-20">
      <nav className="sticky top-0 z-50 shadow-xl border-b border-slate-700 px-4 md:px-8 py-4 flex justify-between items-center bg-slate-900 text-white">
        <div className="flex items-center gap-4">
          {view === 'edit' && <button onClick={() => setView('list')} className="hover:bg-slate-700 p-2 rounded-xl transition-all"><ChevronLeft size={24} /></button>}
          <img src={LOGO_URL} alt="Logo" className="h-8 brightness-0 invert object-contain" onError={(e) => { e.target.style.display='none'; }} /> 
          <span className="font-black text-xl tracking-tighter">AEROTHAU</span>
        </div>
        <div className="flex gap-2">
          {view === 'list' && (
            <>
              <button onClick={() => setView('calendar')} className={`p-2.5 rounded-xl border border-slate-700 transition-all ${view === 'calendar' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}><CalendarIcon size={20}/></button>
              <button onClick={() => setView('list')} className={`p-2.5 rounded-xl border border-slate-700 transition-all ${view === 'list' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}><LayoutGrid size={20}/></button>
              <button onClick={handleCreate} className="bg-sky-600 text-white px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg active:scale-95 transition-all"><Plus size={18}/> Mission</button>
            </>
          )}
          <button onClick={()=>signOut(auth)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:bg-red-900/40"><LogOut size={20}/></button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {view === 'list' && (
          <div className="animate-in fade-in duration-500">
            <DashboardStats missions={missions} />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} className="bg-white p-7 rounded-[40px] shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer border border-slate-100 relative group overflow-hidden">
                    <div className="flex justify-between mb-4"><span className="text-[10px] font-black tracking-widest bg-slate-50 text-slate-400 px-3 py-1 rounded-full">{m.ref}</span></div>
                    <h3 className="font-black text-xl text-slate-900 mb-1 group-hover:text-sky-600 transition-colors">{m.title || m.client || "Nouvelle Mission"}</h3>
                    <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><MapPin size={14} className="text-slate-300"/>{m.location || "Non localisée"}</p>
                    <div className="mt-6 flex flex-wrap gap-2">
                        <span className="bg-slate-100 px-2 py-1 rounded text-[9px] font-black uppercase text-slate-500">{m.type}</span>
                        <span className="bg-sky-50 px-2 py-1 rounded text-[9px] font-black uppercase text-sky-600">{m.scenario}</span>
                    </div>
                </div>
                ))}
            </div>
          </div>
        )}

        {view === 'calendar' && (
          <div className="bg-white p-8 rounded-[48px] shadow-xl border border-slate-200 animate-in zoom-in-95">
            <h2 className="text-2xl font-black mb-8 uppercase tracking-tighter">Planning des Missions</h2>
            <div className="space-y-4">
              {missions.length > 0 ? missions.map(m => (
                <div key={m.id} onClick={() => {setCurrentMission(m); setView('edit');}} className="flex items-center gap-6 p-5 hover:bg-slate-50 rounded-3xl transition-all cursor-pointer border border-transparent hover:border-slate-100">
                  <div className="bg-sky-100 text-sky-600 w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black">
                    <span className="text-[10px] uppercase">{new Date(m.date).toLocaleDateString('fr-FR', {month:'short'})}</span>
                    <span className="text-xl">{new Date(m.date).getDate()}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-lg text-slate-900 uppercase tracking-tighter">{m.title || m.client || "Mission sans titre"}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={12}/> {m.location}</p>
                  </div>
                  <ChevronRight size={20} className="text-slate-300"/>
                </div>
              )) : <p className="text-center py-20 text-slate-400 uppercase font-black text-xs tracking-widest">Aucune mission planifiée</p>}
            </div>
          </div>
        )}

        {view === 'edit' && currentMission && (
            <div className="bg-white rounded-[48px] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in">
                <div className="flex border-b border-slate-100 bg-slate-50 px-6 gap-6 sticky top-0 z-10 overflow-x-auto scrollbar-hide">
                    {['general', 'technical', 'check', 'flight', 'sign'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`py-6 text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === t ? 'text-sky-600' : 'text-slate-400'}`}>
                            {t === 'general' ? 'Informations' : t === 'technical' ? 'Opérations' : t === 'check' ? 'Sécurité' : t === 'flight' ? 'Logs' : 'Validation'}
                            {activeTab === t && <div className="absolute bottom-0 left-0 w-full h-1 bg-sky-600 rounded-full"></div>}
                        </button>
                    ))}
                </div>
                
                <div className="p-6 md:p-12">
                    {activeTab === 'general' && (
                        <div className="space-y-10">
                            <div className="grid md:grid-cols-2 gap-8 items-start">
                                <div className="space-y-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Titre & Donneur d'ordre</label>
                                        <input className="w-full border-2 border-slate-100 p-5 rounded-3xl bg-slate-50 focus:bg-white focus:border-sky-500 outline-none font-black text-2xl text-slate-900 transition-all shadow-inner" placeholder="Nom de la mission..." value={currentMission.title || ''} onChange={e => handleUpdate('title', e.target.value)} />
                                        <input className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold text-slate-700 mt-2" placeholder="Client" value={currentMission.client || ''} onChange={e => handleUpdate('client', e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date d'opération</label>
                                            <input type="date" className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold" value={currentMission.date || ''} onChange={e => handleUpdate('date', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type de Prestation</label>
                                            <select className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold" value={currentMission.type || ''} onChange={e => handleUpdate('type', e.target.value)}>
                                                {MISSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Localisation de l'emprise</label>
                                        <input className="w-full border-2 border-slate-100 p-4 rounded-2xl bg-slate-50 focus:bg-white outline-none font-bold" placeholder="Adresse complète..." value={currentMission.location || ''} onChange={e => handleUpdate('location', e.target.value)} />
                                    </div>
                                </div>
                                <MapView location={currentMission.location} />
                            </div>

                            <div className="border-t border-slate-100 pt-10">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><LinkIcon size={18}/> Documents & Liens Drive</h4>
                                <div className="grid md:grid-cols-2 gap-4">
                                    {(currentMission.documents || []).map((doc, i) => (
                                        <div key={i} className="flex items-center gap-3 p-4 bg-sky-50 rounded-2xl border border-sky-100 relative group">
                                            <div className="bg-sky-600 p-2 rounded-lg text-white"><FileText size={16}/></div>
                                            <div className="flex-1 overflow-hidden">
                                                <input className="bg-transparent font-bold text-sky-900 w-full outline-none" value={doc.name} onChange={e=>{const n=[...currentMission.documents]; n[i].name=e.target.value; handleUpdate('documents',n)}} />
                                                <input className="bg-transparent text-[8px] text-sky-400 w-full outline-none" value={doc.url} onChange={e=>{const n=[...currentMission.documents]; n[i].url=e.target.value; handleUpdate('documents',n)}} />
                                            </div>
                                            <a href={doc.url} target="_blank" rel="noreferrer" className="text-sky-600 opacity-50 hover:opacity-100"><ExternalLink size={16}/></a>
                                            <button onClick={()=>{const n=[...currentMission.documents]; n.splice(i,1); handleUpdate('documents',n)}} className="text-red-400 opacity-0 group-hover:opacity-100 ml-2 transition-all"><Trash2 size={16}/></button>
                                        </div>
                                    ))}
                                    <button onClick={()=>handleUpdate('documents', [...(currentMission.documents||[]), {name:'Nouveau document', url:'https://'}])} className="border-2 border-dashed border-slate-200 p-6 rounded-3xl flex items-center justify-center gap-3 text-slate-400 hover:text-sky-500 transition-all font-black text-[10px] uppercase tracking-widest">+ Lier un fichier</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'technical' && (
                        <div className="space-y-8 animate-in fade-in">
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="bg-slate-900 p-8 rounded-[40px] text-white space-y-6">
                                    <div className="flex items-center gap-3 text-orange-400 mb-4"><Plane size={24}/><h4 className="font-black uppercase tracking-widest text-xs">Consignes de Vol / ATC</h4></div>
                                    <textarea className="w-full bg-slate-800 border-2 border-slate-700 p-4 rounded-2xl outline-none focus:border-orange-500 h-40 text-sm font-medium" placeholder="Ex: Protocoles CTR, fréquences radio, hauteurs max, zones d'exclusion..." value={currentMission.flightNotes || ''} onChange={e=>handleUpdate('flightNotes', e.target.value)}></textarea>
                                    <div className="flex items-center gap-3 text-emerald-400 mt-8 mb-4"><Wrench size={24}/><h4 className="font-black uppercase tracking-widest text-xs">Objectifs Techniques</h4></div>
                                    <textarea className="w-full bg-slate-800 border-2 border-slate-700 p-4 rounded-2xl outline-none focus:border-emerald-500 h-40 text-sm font-medium" placeholder="Ex: Type de capteur, format de fichier, précision RTK, chevauchement..." value={currentMission.techNotes || ''} onChange={e=>handleUpdate('techNotes', e.target.value)}></textarea>
                                </div>
                                <div className="space-y-6">
                                    <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                                        <div className="flex items-center gap-2 text-blue-600 mb-4"><Info size={20}/> <h4 className="font-black text-[10px] uppercase">Aide Mémoire</h4></div>
                                        <ul className="space-y-3 text-xs text-blue-900 font-medium">
                                            <li className="flex items-center gap-2"><Check size={14} className="text-blue-500"/> Vérifier les NOTAM avant départ</li>
                                            <li className="flex items-center gap-2"><Check size={14} className="text-blue-500"/> Déclaration AlphaTango active</li>
                                            <li className="flex items-center gap-2"><Check size={14} className="text-blue-500"/> Balisage ZET requis en zone peuplée</li>
                                        </ul>
                                    </div>
                                    <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                                        <div className="flex items-center gap-2 text-amber-600 mb-4"><AlertCircle size={20}/> <h4 className="font-black text-[10px] uppercase">Rappel SORA/PDRA</h4></div>
                                        <p className="text-xs text-amber-900 font-medium leading-relaxed">Assurez-vous que l'ERP (Plan de Réponse à l'Urgence) est connu de l'équipe et que les moyens d'alerte sont fonctionnels.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'check' && (
                        <div className="grid md:grid-cols-2 gap-10 animate-in slide-in-from-right-4">
                            <div className="bg-slate-900 text-white p-10 rounded-[48px] shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-10"><Shield size={100}/></div>
                                <div className="text-emerald-400 font-black text-3xl mb-2">{SCENARIO_INFOS[currentMission.scenario]?.title}</div>
                                <p className="text-slate-400 text-sm mb-10 leading-relaxed font-medium">{SCENARIO_INFOS[currentMission.scenario]?.description}</p>
                                <div className="space-y-6">
                                    <div className="flex gap-5 items-start">
                                        <div className="bg-slate-800 p-3 rounded-2xl text-sky-400 shadow-inner"><Maximize size={20}/></div>
                                        <div className="text-sm"><strong className="block text-sky-400 text-[10px] uppercase font-black mb-1">Périmètre de sécurité (ZET)</strong>{SCENARIO_INFOS[currentMission.scenario]?.zet}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Checklist Sécurité</h4>
                                {BASE_CHECKLIST.map(i => (
                                    <label key={i.k} className={`flex items-center gap-5 p-5 rounded-3xl cursor-pointer transition-all border-2 ${currentMission.checklist?.[i.k] ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}>
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all ${currentMission.checklist?.[i.k] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-transparent'}`}><Check size={20} strokeWidth={4}/></div>
                                        <input type="checkbox" className="hidden" checked={currentMission.checklist?.[i.k] || false} onChange={() => handleUpdate('checklist', {...(currentMission.checklist||{}), [i.k]: !currentMission.checklist?.[i.k]})} />
                                        <span className={`font-black text-sm ${currentMission.checklist?.[i.k] ? 'text-emerald-900' : 'text-slate-600'}`}>{i.l}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'flight' && (
                        <div className="animate-in fade-in space-y-8">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Compte-rendu des vols</h4>
                            <div className="bg-white border-2 border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                                        <tr><th className="p-6">#</th><th className="p-6">Décollage</th><th className="p-6">Atterrissage</th><th className="p-6">Batterie</th><th className="p-6 text-right">Durée</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                                        {(currentMission.logs || []).map((l, i) => (
                                            <tr key={l.id} className="hover:bg-slate-50">
                                                <td className="p-6 text-slate-400">{i+1}</td>
                                                <td className="p-6 font-mono text-slate-500">{l.start}</td>
                                                <td className="p-6 font-mono text-slate-500">{l.end}</td>
                                                <td className="p-6 text-sky-600 uppercase text-xs">{l.battery}%</td>
                                                <td className="p-6 text-right font-black text-slate-900">{formatDuration(calculateDuration(l.start, l.end))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button onClick={()=>handleUpdate('logs', [...(currentMission.logs||[]), {id:Date.now(), start:'12:00', end:'12:20', battery:'40', notes:''}])} className="w-full py-5 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-black uppercase text-xs hover:bg-slate-50 transition-all">+ Saisie manuelle</button>
                        </div>
                    )}

                    {activeTab === 'sign' && (
                        <div className="animate-in fade-in space-y-8">
                            <div className="flex justify-between items-center bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <div>
                                    <h3 className="font-black text-slate-900 uppercase tracking-tighter">Signature à distance</h3>
                                    <p className="text-xs text-slate-500 font-medium">Le client signe sur son mobile via le QR Code.</p>
                                </div>
                                <button onClick={() => setQrModal(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all"><QrCode size={20}/> Générer QR</button>
                            </div>
                            <div className="grid md:grid-cols-2 gap-10">
                                <SignaturePad title="Visa Télépilote Aerothau" savedData={currentMission.signaturePilote} onSave={d => handleUpdate('signaturePilote', d)} />
                                <SignaturePad title="Visa Client / Représentant" savedData={currentMission.signatureClient} onSave={d => handleUpdate('signatureClient', d)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {qrModal && (
            <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[200] flex items-center justify-center p-6" onClick={()=>setQrModal(false)}>
                <div className="bg-white p-10 rounded-[60px] max-w-sm w-full text-center shadow-2xl relative animate-in zoom-in-95 duration-300" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>setQrModal(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 transition-colors"><X size={32}/></button>
                    <h3 className="text-3xl font-black mb-10 tracking-tighter uppercase leading-none">Scannez pour valider</h3>
                    <div className="bg-white p-6 rounded-[48px] shadow-inner mb-10 border border-slate-100 flex items-center justify-center">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?mode=sign&uid=${user.uid}&mid=${currentMission.id}`)}`} className="w-full h-auto" alt="QR Code Signature" />
                    </div>
                    <button onClick={()=>setQrModal(false)} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-lg shadow-lg uppercase tracking-widest">Fermer</button>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}