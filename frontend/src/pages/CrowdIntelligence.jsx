import React, { useState } from 'react';
import { Search, Navigation, AlertCircle, Info, Navigation2, Activity } from 'lucide-react';
import axios from 'axios';
import MapComponent from '../components/MapComponent';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { API_URL } from '../services/api';

const CrowdIntelligence = ({ incidents }) => {
  const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);
  const [mode, setMode] = useState('walking'); // walking, cab, public_transport
  const [radius, setRadius] = useState(500); // 100, 250, 500, 750, 1000
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [trafficStatus, setTrafficStatus] = useState('');
  const [error, setError] = useState(null);
  const [mapCenter, setMapCenter] = useState([28.6139, 77.2090]); // Default to Delhi, or some valid center

  const handleSearch = async () => {
    if (!startCoords || !endCoords) {
      setError("Please select both origin and destination from the dropdown suggestions.");
      return;
    }
    
    setLoading(true);
    setError(null);
    setRoutes([]);
    setTrafficStatus('');

    setMapCenter(startCoords);

    try {
      const response = await axios.post(`${API_URL}/api/intelligence/analyze-routes`, {
        start_coords: startCoords,
        end_coords: endCoords,
        mode: mode,
        radius: radius
      });

      setRoutes(response.data.routes || []);
      setSelectedRouteIndex(0);
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
            <LocationAutocomplete 
              placeholder="E.g. Connaught Place, Delhi" 
              onSelect={(res) => setStartCoords([res.lat, res.lon])}
              className="input-field"
              style={{ padding: '0', display: 'flex', alignItems: 'center' }}
              customInputStyle={{ padding: '10px', fontSize: '14px' }}
              showIcon={false}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Destination</label>
            <LocationAutocomplete 
              placeholder="E.g. India Gate, Delhi" 
              onSelect={(res) => setEndCoords([res.lat, res.lon])}
              className="input-field"
              style={{ padding: '0', display: 'flex', alignItems: 'center' }}
              customInputStyle={{ padding: '10px', fontSize: '14px' }}
              showIcon={false}
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
          <div style={{ flex: '1 1 120px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Risk Radius</label>
            <select className="input-field" value={radius} onChange={e => setRadius(Number(e.target.value))}>
              <option value={100}>100m</option>
              <option value={250}>250m</option>
              <option value={500}>500m</option>
              <option value={750}>750m</option>
              <option value={1000}>1000m</option>
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
            selectedRouteIndex={selectedRouteIndex}
            setSelectedRouteIndex={setSelectedRouteIndex}
            getRouteColor={getRouteColor}
          />
        </div>

        {/* ROUTE SUMMARIES */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', maxHeight: '500px', paddingRight: '5px', marginTop: '32px' }}>
          <h3 style={{ margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--border-glass)' }}>Selected Route Details</h3>
          
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

          {routes.map((route, index) => {
            const getRiskColor = (score) => {
              if (score < 20) return '#28a745';
              if (score < 50) return '#ffc107';
              return '#dc3545';
            };
            const riskLevel = route.risk_score < 20 ? 'Low' : (route.risk_score < 50 ? 'Moderate' : 'High');
            const routeColor = getRouteColor(index);
            const isSelected = index === selectedRouteIndex;
            
            return (
              <div 
                key={route.id} 
                className="glass-panel" 
                onClick={() => setSelectedRouteIndex(index)}
                style={{ 
                  padding: '15px', 
                  borderLeft: `4px solid ${routeColor}`, 
                  border: isSelected ? `2px solid ${routeColor}` : route.is_recommended ? `1px solid ${routeColor}` : '1px solid transparent',
                  cursor: 'pointer',
                  opacity: isSelected ? 1 : 0.7,
                  transition: 'all 0.3s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <h4 style={{ margin: 0, color: routeColor, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Navigation2 size={16} /> Route Option {String.fromCharCode(65 + index)}
                    </h4>
                    {route.is_recommended && (
                      <span style={{ display: 'inline-block', marginTop: '5px', fontSize: '10px', background: routeColor, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        ⭐ RECOMMENDED
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px', display: 'block', marginBottom: '4px' }}>
                      {route.provider}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: getRiskColor(route.risk_score) }}>
                      {riskLevel} Risk ({route.risk_score})
                    </span>
                  </div>
                </div>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '10px', 
                  fontSize: '13px', 
                  marginBottom: '15px', 
                  color: 'var(--text-secondary)',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '10px',
                  borderRadius: '8px'
                }}>
                  <div><strong>Safety Score:</strong> {100 - (route.risk_score || 0)}/100</div>
                  <div><strong>Traffic Score:</strong> {route.traffic_data?.score || 0}/100</div>
                  <div><strong>Distance:</strong> {(route.distance_meters / 1000).toFixed(1)} km</div>
                  <div><strong>Travel Time:</strong> {Math.round(route.duration_seconds / 60)} mins</div>
                  <div><strong>Total Incidents:</strong> {route.community_reports?.Total || 0}</div>
                  <div><strong>Nearby Incidents:</strong> {route.matched_incidents?.length || 0}</div>
                  <div><strong>Harassment:</strong> {route.community_reports?.Harassment || 0}</div>
                  <div><strong>Theft:</strong> {route.community_reports?.Theft || 0}</div>
                  <div><strong>Unsafe Roads:</strong> {route.community_reports?.["Unsafe Roads"] || 0}</div>
                  <div><strong>Dark Roads:</strong> {route.community_reports?.["Broken Street Lights"] || 0}</div>
                  <div><strong>Final AI Score:</strong> {Math.round(route.ranking_score || 0)}</div>
                  <div><strong>Recommendation:</strong> {route.is_recommended ? 'Yes' : 'Alternative'}</div>
                </div>

                <div style={{ fontSize: '13px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
                  <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Explainable AI Reasoning:</div>
                  <div style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>"{route.explanation}"</div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default CrowdIntelligence;
