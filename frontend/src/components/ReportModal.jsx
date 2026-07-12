import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Camera, UserX, User, Search as SearchIcon, Map as MapIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { reverseGeocode, searchLocation } from '../services/api';

const incidentTypes = ['Harassment', 'Theft', 'Broken Street Light', 'Medical Emergency', 'Accident', 'Suspicious Activity', 'Other'];
const severities = ['Low', 'Medium', 'High', 'Critical'];

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

function MapClickLogger({ setPos }) {
  useMapEvents({
    click(e) {
      setPos([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function MapCenterer({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) {
      map.flyTo(pos, 16, { animate: true });
    }
  }, [pos, map]);
  return null;
}

const ReportModal = ({ onClose, onSubmit, mode = 'community' }) => {
  const [formData, setFormData] = useState({
    incident_type: '', description: '', severity: '',
    latitude: '', longitude: '', image: '',
    anonymous: false, reporter_name: '',
    road: '', area: '', city: '', state: '',
    street: '', locality: '', neighbourhood: '', suburb: '',
    landmark: '', postal_code: '', country: ''
  });
  
  const [mapPos, setMapPos] = useState(null); 
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (mapPos) {
      setFormData(prev => ({ ...prev, latitude: mapPos[0], longitude: mapPos[1] }));
      const doGeocode = async () => {
        setIsGeocoding(true);
        const addr = await reverseGeocode(mapPos[0], mapPos[1]);
        setFormData(prev => ({ ...prev, ...addr }));
        setIsGeocoding(false);
      };
      doGeocode();
    }
  }, [mapPos]);

  // Debounced Intelligent Search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchLocation(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 500); // 500ms debounce
    
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  const handleGPSLocation = () => {
    setLoadingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapPos([position.coords.latitude, position.coords.longitude]);
          setLoadingLocation(false);
        },
        (err) => {
          console.error(err);
          alert("Error fetching location.");
          setLoadingLocation(false);
        }
      );
    } else {
      setLoadingLocation(false);
    }
  };

  const handleSelectSearchResult = (res) => {
    setMapPos([res.lat, res.lon]);
    setSearchResults([]);
    setSearchQuery(''); // clear query after selection so dropdown hides
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFormData({ ...formData, image: reader.result });
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.incident_type) return setError('Incident type is required.');
    if (!formData.description) return setError('Description is required.');
    if (!formData.severity) return setError(mode === 'vault' ? 'Priority is required.' : 'Severity is required.');
    if (!formData.latitude || !formData.longitude) return setError('Location is required.');
    if (mode === 'community' && !formData.anonymous && !formData.reporter_name) return setError('Enter your name or choose Anonymous.');

    onSubmit(formData);
  };

  // Construct best possible address array for display
  const displayAddress = () => {
    if (isGeocoding) return "Resolving exact address elements...";
    if (!formData.latitude) return "No location selected";
    
    const parts = [
      formData.landmark,
      formData.street || formData.road,
      formData.neighbourhood || formData.locality,
      formData.suburb,
      formData.city,
      formData.postal_code
    ].filter(Boolean);

    // Dedup adjacent identical elements 
    const uniqueParts = parts.filter((item, pos, arr) => pos === 0 || item !== arr[pos - 1]);
    
    return uniqueParts.length > 0 ? uniqueParts.join(', ') : `${formData.latitude.toFixed(4)}, ${formData.longitude.toFixed(4)}`;
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '900px', padding: '30px', position: 'relative', maxHeight: '90vh', overflowY: 'auto', display: 'flex', gap: '30px' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', zIndex: 10 }}>
          <X size={24} />
        </button>
        
        {/* Left Side: Form */}
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: '20px', color: 'var(--color-primary)' }}>{mode === 'vault' ? 'Create Private Case' : 'Report Incident'}</h2>
          {error && <div style={{ background: 'rgba(244,63,94,0.2)', border: '1px solid var(--color-danger)', color: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            {mode === 'community' && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    <User size={16} /> Reporter Name
                  </label>
                  <input 
                    type="text" 
                    className="glass-panel"
                    style={{ width: '100%', padding: '10px', color: formData.anonymous ? 'var(--text-muted)' : 'var(--text-primary)', background: formData.anonymous ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.05)', border: 'none', outline: 'none' }}
                    value={formData.reporter_name}
                    onChange={(e) => setFormData({...formData, reporter_name: e.target.value})}
                    disabled={formData.anonymous}
                    placeholder={formData.anonymous ? 'Anonymous' : 'Enter your name'}
                  />
                </div>
                <div style={{ marginTop: '22px' }}>
                  <label className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 15px', cursor: 'pointer', background: formData.anonymous ? 'rgba(255,107,74,0.2)' : 'rgba(255,255,255,0.05)', color: formData.anonymous ? 'var(--color-primary)' : 'var(--text-secondary)', borderRadius: '8px' }}>
                    <input type="checkbox" checked={formData.anonymous} onChange={(e) => setFormData({...formData, anonymous: e.target.checked, reporter_name: e.target.checked ? '' : formData.reporter_name})} style={{ display: 'none' }} />
                    <UserX size={18} /> Anonymous
                  </label>
                </div>
              </div>
            )}

            {mode === 'vault' && (
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)' }}>Case Title</label>
                <input 
                  type="text" 
                  required
                  className="glass-panel"
                  style={{ width: '100%', padding: '10px', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.05)', border: 'none', outline: 'none' }}
                  value={formData.title || ''}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="Enter case title"
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)' }}>Incident Type</label>
                <select 
                  className="glass-panel" 
                  style={{ width: '100%', padding: '10px', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.05)' }}
                  value={formData.incident_type}
                  onChange={(e) => setFormData({...formData, incident_type: e.target.value})}
                >
                  <option value="" style={{ color: '#000' }}>Select an option...</option>
                  {incidentTypes.map(t => <option key={t} value={t} style={{ color: '#000' }}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)' }}>{mode === 'vault' ? 'Priority' : 'Severity'}</label>
                <select 
                  className="glass-panel" 
                  style={{ width: '100%', padding: '10px', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.05)' }}
                  value={formData.severity}
                  onChange={(e) => setFormData({...formData, severity: e.target.value})}
                >
                  <option value="" style={{ color: '#000' }}>Select {mode === 'vault' ? 'priority' : 'severity'}...</option>
                  {severities.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)' }}>Description</label>
              <textarea 
                className="glass-panel"
                style={{ width: '100%', padding: '10px', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.05)', minHeight: '80px', border: 'none', outline: 'none' }}
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Describe the incident..."
              />
            </div>

            {mode === 'vault' ? (
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)' }}>Notes (Optional)</label>
                <textarea 
                  className="glass-panel"
                  style={{ width: '100%', padding: '10px', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.05)', minHeight: '60px', border: 'none', outline: 'none' }}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Additional notes..."
                />
              </div>
            ) : (
              <div>
                <label className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                  <Camera size={18} /> {formData.image ? 'Image Selected' : 'Optional Image Upload'}
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={onClose} className="glass-panel" style={{ flex: 1, padding: '12px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)' }}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1, padding: '12px' }}>
                {mode === 'vault' ? 'Create Case' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Map & Autocomplete Location Picking */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ position: 'relative' }}>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '10px 15px', borderRadius: '12px' }}>
              <SearchIcon size={18} color="var(--color-primary)" style={{ marginRight: '10px' }} />
              <input 
                type="text" 
                placeholder="Search Hospital, Landmark, Road..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '100%', outline: 'none', fontSize: '15px' }}
              />
              {isSearching && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>...</span>}
            </div>
            
            {searchResults.length > 0 && (
              <div className="glass-panel animate-fade-in" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, maxHeight: '250px', overflowY: 'auto', marginTop: '8px', background: 'var(--bg-main)', border: '1px solid var(--border-glass)' }}>
                {searchResults.map((res, i) => (
                  <div 
                    key={i} 
                    onClick={() => handleSelectSearchResult(res)}
                    style={{ padding: '12px 15px', borderBottom: '1px solid var(--border-glass)', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '10px' }}
                  >
                    <MapPin size={16} color="var(--color-primary)" style={{ marginTop: '3px' }} />
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '14px' }}>{res.name || 'Unknown Location'}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {[res.area, res.city].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>OR</span>
            <button type="button" onClick={handleGPSLocation} className="glass-panel" style={{ flex: 1, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--color-safe)' }}>
              <MapIcon size={16} /> {loadingLocation ? 'Fetching GPS...' : 'Use Current GPS'}
            </button>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '12px', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '60px' }}>
            <MapPin size={16} color="var(--color-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ lineHeight: '1.4' }}>{displayAddress()}</div>
          </div>

          <div style={{ flex: 1, minHeight: '250px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
            <MapContainer center={[22.5726, 88.3639]} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
              <MapClickLogger setPos={setMapPos} />
              {mapPos && (
                <>
                  <MapCenterer pos={mapPos} />
                  <Marker position={mapPos} icon={markerIcon} />
                </>
              )}
            </MapContainer>
          </div>
          <small style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Select a suggestion or tap on the map</small>

        </div>
      </div>
    </div>
  );
};

export default ReportModal;
