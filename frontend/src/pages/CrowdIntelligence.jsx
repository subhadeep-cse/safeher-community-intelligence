import React, { useState } from 'react';
import { Search, Navigation, AlertCircle, Info, Navigation2, Activity } from 'lucide-react';
import axios from 'axios';
import MapComponent from '../components/MapComponent';
import { API_URL } from '../services/api';

const CrowdIntelligence = ({ incidents }) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState('walking'); // walking, cab, public_transport
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [trafficStatus, setTrafficStatus] = useState('');
  const [error, setError] = useState(null);
  const [mapCenter, setMapCenter] = useState([28.6139, 77.2090]); // Default to Delhi, or some valid center

  const geocode = async (address) => {
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      if (res.data && res.data.length > 0) {
        return [parseFloat(res.data[0].lat), parseFloat(res.data[0].lon)];
      }
      return null;
    } catch (e) {
      console.error("Geocoding failed", e);
      return null;
    }
  };

  const handleSearch = async () => {
    if (!origin || !destination) {
      setError("Please enter both origin and destination.");
      return;
    }
    
    setLoading(true);
    setError(null);
    setRoutes([]);
    setTrafficStatus('');

    const startCoords = await geocode(origin);
    const endCoords = await geocode(destination);

    if (!startCoords || !endCoords) {
      setError("Could not find coordinates for the given addresses.");
      setLoading(false);
      return;
    }

    setMapCenter(startCoords);

    try {
      const response = await axios.post(`${API_URL}/api/intelligence/analyze-routes`, {
        start_coords: startCoords,
        end_coords: endCoords,
        mode: mode
      });

      setRoutes(response.data.routes || []);
      setTrafficStatus(response.data.overall_traffic || '');
    } catch (err) {
      console.error(err);
      setError("Failed to analyze routes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getRouteColor = (index) => {
    const colors = ['#007bff', '#ff8c00', '#8a2be2', '#28a745'];
    return colors[index % colors.length];
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h2 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity color="var(--color-primary)" />
          Crowd Intelligence Routing
        </h2>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Origin</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="E.g. Connaught Place, Delhi" 
              value={origin} 
              onChange={e => setOrigin(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Destination</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="E.g. India Gate, Delhi" 
              value={destination} 
              onChange={e => setDestination(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Travel Mode</label>
            <select className="input-field" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="walking">Walking</option>
              <option value="cab">Cab / Driving</option>
              <option value="public_transport">Public Transport</option>
            </select>
          </div>
          <button 
            className="btn-primary glow-effect" 
            style={{ padding: '12px 24px', height: '42px', display: 'flex', alignItems: 'center', gap: '8px', cursor: loading ? 'not-allowed' : 'pointer' }}
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? 'Analyzing...' : <><Search size={18} /> Analyze Routes</>}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(255,0,0,0.1)', color: '#ff6b4a', borderRadius: '8px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}
        
        {trafficStatus && trafficStatus.includes('unavailable') && (
          <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(255,165,0,0.1)', color: 'orange', borderRadius: '8px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Info size={18} /> {trafficStatus}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px' }}>
        
        {/* MAP AREA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <MapComponent 
            incidents={incidents} 
            centerOn={mapCenter} 
            routes={routes} 
          />
        </div>

        {/* ROUTE SUMMARIES */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', maxHeight: '500px', paddingRight: '5px' }}>
          <h3 style={{ margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--border-glass)' }}>Route Options</h3>
          
          {routes.length === 0 && !loading && (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', marginTop: '20px' }}>
              Search for a route to see analysis.
            </p>
          )}

          {loading && (
             <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
               <div className="spinner"></div>
             </div>
          )}

          {routes.map((route, index) => (
            <div key={route.id} className="glass-panel" style={{ padding: '15px', borderLeft: `4px solid ${getRouteColor(index)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: getRouteColor(index), display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Navigation2 size={16} /> Route Option {String.fromCharCode(65 + index)}
                </h4>
                <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                  {route.provider}
                </span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '15px', color: 'var(--text-secondary)' }}>
                <div><strong>Distance:</strong> {(route.distance_meters / 1000).toFixed(1)} km</div>
                <div><strong>Time:</strong> {Math.round(route.duration_seconds / 60)} mins</div>
              </div>

              <div style={{ fontSize: '13px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Community Intelligence</div>
                
                {route.community_reports && route.community_reports.Total === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>No community reports nearby.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ color: route.community_reports.Harassment > 0 ? '#ff4d4d' : 'var(--text-muted)' }}>
                      Harassment: {route.community_reports.Harassment || 0}
                    </div>
                    <div style={{ color: route.community_reports.Theft > 0 ? '#ff9933' : 'var(--text-muted)' }}>
                      Theft: {route.community_reports.Theft || 0}
                    </div>
                    <div style={{ color: route.community_reports["Unsafe Roads"] > 0 ? '#ffcc00' : 'var(--text-muted)' }}>
                      Unsafe Roads: {route.community_reports["Unsafe Roads"] || 0}
                    </div>
                    <div style={{ color: route.community_reports["Broken Street Lights"] > 0 ? '#ffff66' : 'var(--text-muted)' }}>
                      Dark/Broken Lights: {route.community_reports["Broken Street Lights"] || 0}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default CrowdIntelligence;
