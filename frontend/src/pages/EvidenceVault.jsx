import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { 
  fetchVaultCases, 
  createVaultCase, 
  getVaultCase, 
  updateVaultCase, 
  deleteVaultCase, 
  uploadEvidence, 
  deleteEvidence, 
  getExportUrl, 
  getUploadUrl,
  reverseGeocode,
  fetchVaultStats,
  fetchIncidents
} from '../services/api';
import { 
  Archive, Plus, Search, FolderOpen, FolderClosed, Trash2, MapPin, 
  Clock, CheckCircle, AlertTriangle, UploadCloud, FileText, Image as ImageIcon, 
  Video, FileAudio, Download, ArrowLeft, Eye, Edit2, Maximize, Minimize, Activity,
  ChevronLeft, ChevronRight, X
} from 'lucide-react';
import ReportModal from '../components/ReportModal';
import MapComponent from '../components/MapComponent';
import { useNavigate } from 'react-router-dom';

// Components
const StatCard = ({ title, value, icon, color }) => (
  <div className="glass-panel animate-fade-in" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
    <div style={{ background: `rgba(${color}, 0.1)`, padding: '15px', borderRadius: '12px', display: 'flex' }}>
      {icon}
    </div>
    <div>
      <h2 style={{ margin: 0, fontSize: '28px', color: 'var(--text-primary)' }}>{value}</h2>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>{title}</p>
    </div>
  </div>
);

export default function EvidenceVault() {
  const [cases, setCases] = useState([]);
  const [communityReports, setCommunityReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCase, setActiveCase] = useState(null);
  const [mediaStats, setMediaStats] = useState({ images: 0, videos: 0, audio: 0, docs: 0, storage: '0.0 MB' });
  const navigate = useNavigate();
  
  // Dashboard Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterIncidentType, setFilterIncidentType] = useState('All');
  const [filterMediaType, setFilterMediaType] = useState('All');
  const [filterDateRange, setFilterDateRange] = useState('All Time');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState({ title: '', incident_type: 'Harassment', priority: 'High', description: '', notes: '' });

  // UI States
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const loadCases = async () => {
    try {
      setLoading(true);
      const [data, statsData, reportsData] = await Promise.all([
        fetchVaultCases(),
        fetchVaultStats(),
        fetchIncidents()
      ]);
      setCases(data);
      setMediaStats(statsData);
      setCommunityReports(reportsData);
    } catch (error) {
      toast.error('Failed to load cases or stats');
    } finally {
      setLoading(false);
    }
  };

  const loadStatsOnly = async () => {
    try {
      const statsData = await fetchVaultStats();
      setMediaStats(statsData);
    } catch (error) {
      console.error('Failed to load stats', error);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  const handleCreateCase = async (formData) => {
    const loadingToast = toast.loading('Creating private case...');
    
    try {
      const payload = {
        title: formData.title,
        incident_type: formData.incident_type,
        priority: formData.severity, // ReportModal uses severity for vault's priority
        description: formData.description,
        notes: formData.notes,
        latitude: formData.latitude,
        longitude: formData.longitude,
        address: [formData.landmark, formData.street, formData.area, formData.city, formData.postal_code].filter(Boolean).join(', ') || `Lat: ${formData.latitude}, Lon: ${formData.longitude}`
      };

      const newCase = await createVaultCase(payload);
      setCases([newCase, ...cases]);
      setIsCreateModalOpen(false);
      toast.success('Case created successfully', { id: loadingToast });
    } catch (error) {
      toast.error('Failed to create case', { id: loadingToast });
    }
  };

  const handleEditCase = async (e) => {
    e.preventDefault();
    const loadingToast = toast.loading('Updating case...');
    try {
      await updateVaultCase(activeCase.id, formData);
      const updatedCase = await getVaultCase(activeCase.id);
      setActiveCase(updatedCase);
      setCases(cases.map(c => c.id === activeCase.id ? { ...c, ...formData } : c));
      loadStatsOnly();
      setIsEditModalOpen(false);
      toast.success('Case updated', { id: loadingToast });
    } catch (error) {
      toast.error('Failed to update case', { id: loadingToast });
    }
  };

  const handleOpenCase = async (id) => {
    try {
      const data = await getVaultCase(id);
      setActiveCase(data);
    } catch (error) {
      toast.error('Failed to load case details');
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await updateVaultCase(id, status);
      setActiveCase({ ...activeCase, status });
      setCases(cases.map(c => c.id === id ? { ...c, status } : c));
      toast.success(`Case marked as ${status}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteCase = async (id) => {
    if (!window.confirm('Are you sure you want to delete this case and all its evidence?')) return;
    try {
      await deleteVaultCase(id);
      setCases(cases.filter(c => c.id !== id));
      setActiveCase(null);
      loadStatsOnly();
      toast.success('Case deleted');
    } catch (error) {
      toast.error('Failed to delete case');
    }
  };

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return;
    
    const loadingToast = toast.loading('Uploading evidence...');
    try {
      const result = await uploadEvidence(activeCase.id, files);
      const updatedCase = await getVaultCase(activeCase.id);
      setActiveCase(updatedCase);
      setCases(cases.map(c => c.id === activeCase.id ? { ...c, evidence_count: c.evidence_count + files.length } : c));
      loadStatsOnly();
      toast.success(result.message, { id: loadingToast });
    } catch (error) {
      toast.error('Upload failed', { id: loadingToast });
    }
  };

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const handleDeleteEvidence = async (evId) => {
    if (!window.confirm('Delete this evidence?')) return;
    try {
      await deleteEvidence(activeCase.id, evId);
      const updatedCase = await getVaultCase(activeCase.id);
      setActiveCase(updatedCase);
      setCases(cases.map(c => c.id === activeCase.id ? { ...c, evidence_count: Math.max(0, c.evidence_count - 1) } : c));
      loadStatsOnly();
      toast.success('Evidence deleted');
    } catch (error) {
      toast.error('Failed to delete evidence');
    }
  };

  // Dashboard View
  if (!activeCase) {
    const filteredCases = cases.filter(c => {
      // 1. Search Query
      const searchStr = searchQuery.toLowerCase();
      const matchSearch = c.title.toLowerCase().includes(searchStr) || 
                          c.incident_type.toLowerCase().includes(searchStr) ||
                          (c.description && c.description.toLowerCase().includes(searchStr)) ||
                          (c.address && c.address.toLowerCase().includes(searchStr)) ||
                          (c.status.toLowerCase().includes(searchStr)) ||
                          (c.priority.toLowerCase().includes(searchStr));
      
      // 2. Status & Priority
      const matchStatus = filterStatus === 'All' || c.status === filterStatus;
      const matchPriority = filterPriority === 'All' || c.priority === filterPriority;
      const matchIncidentType = filterIncidentType === 'All' || c.incident_type === filterIncidentType;
      
      // 3. Media Type Filters
      let matchMedia = true;
      if (filterMediaType === 'Has Images') matchMedia = c.image_count > 0;
      else if (filterMediaType === 'Has Videos') matchMedia = c.video_count > 0;
      else if (filterMediaType === 'Has Audio') matchMedia = c.audio_count > 0;
      else if (filterMediaType === 'Has Documents') matchMedia = c.doc_count > 0;

      // 4. Date Range Filters
      let matchDate = true;
      const caseDate = new Date(c.created_at).getTime();
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      
      if (filterDateRange === 'Last 24 Hours') matchDate = (now - caseDate) <= dayMs;
      else if (filterDateRange === 'Last 7 Days') matchDate = (now - caseDate) <= dayMs * 7;
      else if (filterDateRange === 'Last 30 Days') matchDate = (now - caseDate) <= dayMs * 30;

      return matchSearch && matchStatus && matchPriority && matchIncidentType && matchMedia && matchDate;
    });

    const openCount = cases.filter(c => c.status === 'Active').length;
    const closedCount = cases.filter(c => c.status === 'Closed').length;
    const archivedCount = cases.filter(c => c.status === 'Archived').length;
    const stats = mediaStats;

    return (
      <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-primary)' }}>
            <Archive size={28} /> Emergency Evidence Vault
          </h2>
          <button onClick={() => { setFormData({ title: '', incident_type: 'Harassment', priority: 'High', description: '', notes: '' }); setIsCreateModalOpen(true); }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Plus size={18} /> Create New Case
          </button>
        </div>

        {/* Global Statistics */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <StatCard title="Total Cases" value={cases.length} icon={<FolderOpen size={28} color="var(--color-primary)" />} color="255, 107, 74" />
          <StatCard title="Open Cases" value={openCount} icon={<AlertTriangle size={28} color="var(--color-warning)" />} color="251, 191, 36" />
          <StatCard title="Closed Cases" value={closedCount} icon={<CheckCircle size={28} color="var(--color-safe)" />} color="45, 212, 191" />
          <StatCard title="Archived Cases" value={archivedCount} icon={<FolderClosed size={28} color="var(--text-muted)" />} color="156, 163, 175" />
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '30px' }}>
          <div className="glass-panel" style={{ padding: '15px', textAlign: 'center' }}>
            <ImageIcon size={20} color="var(--color-primary)" style={{ marginBottom: '5px' }}/>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.images}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Images</div>
          </div>
          <div className="glass-panel" style={{ padding: '15px', textAlign: 'center' }}>
            <Video size={20} color="var(--color-warning)" style={{ marginBottom: '5px' }}/>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.videos}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Videos</div>
          </div>
          <div className="glass-panel" style={{ padding: '15px', textAlign: 'center' }}>
            <FileAudio size={20} color="var(--color-safe)" style={{ marginBottom: '5px' }}/>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.audio}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Audio</div>
          </div>
          <div className="glass-panel" style={{ padding: '15px', textAlign: 'center' }}>
            <FileText size={20} color="#a855f7" style={{ marginBottom: '5px' }}/>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.docs}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Documents</div>
          </div>
          <div className="glass-panel" style={{ padding: '15px', textAlign: 'center' }}>
            <Activity size={20} color="#3b82f6" style={{ marginBottom: '5px' }}/>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.storage}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Storage Used</div>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-panel)', padding: '8px 15px', borderRadius: '8px', flex: '1 1 100%', minWidth: '250px' }}>
            <Search size={18} color="var(--text-muted)" style={{ marginRight: '10px' }} />
            <input 
              type="text" 
              placeholder="Advanced Search: Title, Type, Area, Description, Status, Priority..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '100%', outline: 'none' }}
            />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--text-primary)', padding: '8px 15px', borderRadius: '8px', outline: 'none', flex: 1 }}>
            <option value="All">All Statuses</option>
            <option value="Active">Open Cases</option>
            <option value="Closed">Closed Cases</option>
            <option value="Archived">Archived Cases</option>
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--text-primary)', padding: '8px 15px', borderRadius: '8px', outline: 'none', flex: 1 }}>
            <option value="All">All Priorities</option>
            <option value="Critical">Critical Priority</option>
            <option value="High">High Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="Low">Low Priority</option>
          </select>
          <select value={filterIncidentType} onChange={(e) => setFilterIncidentType(e.target.value)} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--text-primary)', padding: '8px 15px', borderRadius: '8px', outline: 'none', flex: 1 }}>
            <option value="All">All Incident Types</option>
            <option value="Harassment">Harassment</option>
            <option value="Theft">Theft</option>
            <option value="Assault">Assault</option>
            <option value="Accident">Accident</option>
            <option value="Other">Other</option>
          </select>
          <select value={filterMediaType} onChange={(e) => setFilterMediaType(e.target.value)} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--text-primary)', padding: '8px 15px', borderRadius: '8px', outline: 'none', flex: 1 }}>
            <option value="All">All Evidence Types</option>
            <option value="Has Images">Has Images</option>
            <option value="Has Videos">Has Videos</option>
            <option value="Has Audio">Has Audio</option>
            <option value="Has Documents">Has Documents</option>
          </select>
          <select value={filterDateRange} onChange={(e) => setFilterDateRange(e.target.value)} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--text-primary)', padding: '8px 15px', borderRadius: '8px', outline: 'none', flex: 1 }}>
            <option value="All Time">All Time</option>
            <option value="Last 24 Hours">Last 24 Hours</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
          </select>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {loading ? (
            <p>Loading cases...</p>
          ) : filteredCases.length === 0 ? (
            <p>No cases found.</p>
          ) : (
            filteredCases.map(c => (
              <div key={c.id} className="glass-panel" style={{ padding: '20px', cursor: 'pointer', transition: 'transform 0.2s' }} onClick={() => handleOpenCase(c.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '12px', background: c.status === 'Active' ? 'rgba(255,107,74,0.1)' : 'rgba(255,255,255,0.05)', color: c.status === 'Active' ? 'var(--color-primary)' : 'var(--text-secondary)' }}>
                    {c.status}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 10px 0' }}>{c.title}</h3>
                <p style={{ margin: '0 0 15px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>{c.incident_type} • Priority: {c.priority}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><FolderOpen size={14} /> {c.evidence_count} files</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MapPin size={14} /> GPS captured</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* CREATE MODAL */}
        {isCreateModalOpen && (
          <ReportModal 
            mode="vault" 
            onClose={() => setIsCreateModalOpen(false)} 
            onSubmit={handleCreateCase} 
          />
        )}
      </div>
    );
  }

  // CASE DETAILS VIEW
  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      <button onClick={() => setActiveCase(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '20px' }}>
        <ArrowLeft size={16} /> Back to Vault
      </button>

      <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: '0 0 10px 0' }}>{activeCase.title}</h2>
          <div style={{ display: 'flex', gap: '15px', fontSize: '14px', color: 'var(--text-secondary)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span><AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> {activeCase.incident_type}</span>
            <span>Priority: <strong style={{ color: activeCase.priority === 'Critical' ? 'var(--color-danger)' : 'white' }}>{activeCase.priority}</strong></span>
            <span>Status: <strong style={{ color: activeCase.status === 'Active' ? 'var(--color-primary)' : 'var(--color-safe)' }}>{activeCase.status}</strong></span>
            <span><Clock size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> {new Date(activeCase.created_at).toLocaleString()}</span>
            
            {activeCase.linked_report_id && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 12px', background: 'rgba(255,107,74,0.1)', borderRadius: '20px', color: 'var(--color-primary)', border: '1px solid var(--border-glass)' }}>
                Linked to Community Report #{activeCase.linked_report_id}
                <button 
                  onClick={() => navigate(`/reports`)}
                  style={{ background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '12px', padding: '2px 8px', fontSize: '12px', cursor: 'pointer', marginLeft: '5px' }}
                >
                  Open Original
                </button>
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => { setFormData({ title: activeCase.title, incident_type: activeCase.incident_type, priority: activeCase.priority, description: activeCase.description, notes: activeCase.notes }); setIsEditModalOpen(true); }} className="glass-panel" style={{ padding: '8px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}><Edit2 size={16}/> Edit</button>
          
          {activeCase.status === 'Active' && <button onClick={() => handleUpdateStatus(activeCase.id, 'Closed')} className="glass-panel" style={{ padding: '8px 15px', cursor: 'pointer', border: '1px solid var(--color-safe)' }}>Close Case</button>}
          {activeCase.status === 'Closed' && <button onClick={() => handleUpdateStatus(activeCase.id, 'Active')} className="glass-panel" style={{ padding: '8px 15px', cursor: 'pointer' }}>Reopen Case</button>}
          {activeCase.status !== 'Archived' && <button onClick={() => handleUpdateStatus(activeCase.id, 'Archived')} className="glass-panel" style={{ padding: '8px 15px', cursor: 'pointer' }}>Archive</button>}
          
          <a href={getExportUrl(activeCase.id)} className="btn-primary" style={{ textDecoration: 'none', padding: '8px 15px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Download size={16} /> Export
          </a>
          <button onClick={() => handleDeleteCase(activeCase.id)} style={{ background: 'transparent', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '300px 1fr', gap: '20px' }}>
        
        {/* SIDEBAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>Details</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{activeCase.description}</p>
            {activeCase.notes && (
              <>
                <h4 style={{ margin: '15px 0 5px 0' }}>Notes</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{activeCase.notes}</p>
              </>
            )}
          </div>

          <div className={`glass-panel ${isMapFullscreen ? 'fullscreen-map' : ''}`} style={isMapFullscreen ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, padding: '20px', background: 'var(--bg-app)' } : { padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              Location Map
              <button onClick={() => setIsMapFullscreen(!isMapFullscreen)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                {isMapFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </h3>
            <div style={{ height: isMapFullscreen ? 'calc(100% - 60px)' : '300px', borderRadius: '8px', overflow: 'hidden', marginBottom: '10px' }}>
              <MapComponent 
                incidents={communityReports}
                centerOn={[activeCase.latitude, activeCase.longitude]}
                activeVaultCase={activeCase}
              />
            </div>
            {!isMapFullscreen && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}><MapPin size={12}/> {activeCase.address}</p>}
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>Timeline</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {activeCase.timeline.map((event, i) => (
                <div key={event.id} style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-primary)' }}></div>
                    {i !== activeCase.timeline.length - 1 && <div style={{ width: '2px', flex: 1, background: 'var(--border-glass)', margin: '5px 0' }}></div>}
                  </div>
                  <div style={{ flex: 1, paddingBottom: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{event.event_description}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(event.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* MAIN EVIDENCE AREA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div 
            className="glass-panel" 
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            style={{ 
              padding: '20px', 
              borderStyle: 'dashed', 
              borderWidth: '2px', 
              borderColor: isDragging ? 'var(--color-primary)' : 'var(--border-glass)', 
              background: isDragging ? 'rgba(255,107,74,0.1)' : 'var(--bg-panel)',
              textAlign: 'center',
              transition: 'all 0.3s'
            }}
          >
            <UploadCloud size={48} color="var(--color-primary)" style={{ marginBottom: '10px' }} />
            <h3 style={{ margin: '0 0 10px 0' }}>Upload Evidence</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '15px' }}>Drag and drop images, videos, audio, or PDFs here, or click to browse.</p>
            <input 
              type="file" 
              id="file-upload"
              multiple 
              style={{ display: 'none' }} 
              onChange={(e) => handleUpload(e.target.files)}
            />
            <label htmlFor="file-upload" className="btn-primary" style={{ cursor: 'pointer', display: 'inline-block', padding: '8px 20px', borderRadius: '20px' }}>
              Browse Files
            </label>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 20px 0', display: 'flex', justifyContent: 'space-between' }}>
              Evidence Gallery
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{activeCase.evidence.length} files</span>
            </h3>

            {activeCase.evidence.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No evidence uploaded yet.
              </div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                {activeCase.evidence.map(ev => {
                  const uniqueFilename = ev.file_path.split(/[\/\\]/).pop();
                  const fetchUrl = getUploadUrl(uniqueFilename);
                  const isImage = ev.file_type === 'image';
                  
                  // Find index if image
                  const allImages = activeCase.evidence.filter(e => e.file_type === 'image');
                  const imageIndex = isImage ? allImages.findIndex(e => e.id === ev.id) : -1;

                  return (
                    <div key={ev.id} className="glass-panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                      <button onClick={() => handleDeleteEvidence(ev.id)} style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', padding: '5px', cursor: 'pointer', zIndex: 10 }}>
                        <Trash2 size={14} />
                      </button>
                      
                      <div style={{ height: '140px', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {isImage && (
                          <img 
                            src={fetchUrl} 
                            alt={ev.file_name} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} 
                            onClick={() => setLightboxIndex(imageIndex)}
                          />
                        )}
                        {ev.file_type === 'video' && (
                          <video src={fetchUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                        {ev.file_type === 'audio' && (
                          <div style={{ padding: '20px', width: '100%', textAlign: 'center' }}>
                            <FileAudio size={40} color="var(--color-primary)" style={{ marginBottom: '10px' }}/>
                            <audio src={fetchUrl} controls style={{ width: '100%', height: '30px' }} />
                          </div>
                        )}
                        {ev.file_type === 'pdf' && (
                          <div style={{ textAlign: 'center' }}>
                            <FileText size={40} color="var(--text-muted)" />
                          </div>
                        )}
                        {ev.file_type === 'document' && (
                          <div style={{ textAlign: 'center' }}>
                            <FileText size={40} color="var(--text-muted)" />
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '5px' }} title={ev.file_name}>
                          {ev.file_name}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(ev.upload_timestamp).toLocaleDateString()}</span>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <a href={fetchUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)' }} title="Preview"><Eye size={16} /></a>
                            <a href={fetchUrl} download={ev.file_name} style={{ color: 'var(--color-primary)' }} title="Download"><Download size={16} /></a>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* LIGHTBOX */}
      {lightboxIndex !== null && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000 }}>
          <button onClick={() => setLightboxIndex(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
            <X size={32} />
          </button>
          
          <button 
            onClick={() => setLightboxIndex((lightboxIndex - 1 + activeCase.evidence.filter(e => e.file_type === 'image').length) % activeCase.evidence.filter(e => e.file_type === 'image').length)} 
            style={{ position: 'absolute', left: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', padding: '15px', borderRadius: '50%' }}
          >
            <ChevronLeft size={32} />
          </button>
          
          <img 
            src={getUploadUrl(activeCase.evidence.filter(e => e.file_type === 'image')[lightboxIndex].file_path.split(/[\/\\]/).pop())} 
            alt="Evidence" 
            style={{ maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain' }} 
          />

          <button 
            onClick={() => setLightboxIndex((lightboxIndex + 1) % activeCase.evidence.filter(e => e.file_type === 'image').length)} 
            style={{ position: 'absolute', right: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', padding: '15px', borderRadius: '50%' }}
          >
            <ChevronRight size={32} />
          </button>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '30px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, color: 'var(--color-primary)' }}>Edit Case</h2>
            <form onSubmit={handleEditCase}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Case Title</label>
                <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} type="text" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-panel)', color: 'white' }} />
              </div>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Incident Type</label>
                  <select value={formData.incident_type} onChange={e => setFormData({...formData, incident_type: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-panel)', color: 'white' }}>
                    <option>Harassment</option><option>Assault</option><option>Stalking</option><option>Theft</option><option>Accident</option><option>Other</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Priority</label>
                  <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-panel)', color: 'white' }}>
                    <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Description</label>
                <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-panel)', color: 'white' }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Optional Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-panel)', color: 'white' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setIsEditModalOpen(false)} style={{ padding: '10px 20px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="btn-primary">Update Case</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
