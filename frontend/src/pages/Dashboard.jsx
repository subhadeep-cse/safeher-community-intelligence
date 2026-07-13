import React, { useState, useMemo, useEffect } from 'react';
import MapComponent from '../components/MapComponent';
import ReportCard from '../components/ReportCard';
import SkeletonCard from '../components/SkeletonCard';
import { ShieldAlert, CheckCircle, AlertTriangle, MapPin, Search, X } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../services/api';

const FILTERS = ['All', 'Harassment', 'Theft', 'Broken Street Light', 'Medical Emergency', 'Accident', 'Suspicious Activity', 'Other'];

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const calculateRiskAssessment = (incidents, searchedLocation) => {
  if (!incidents || incidents.length === 0 || !searchedLocation) {
    return {
      score: 0,
      level: 'SAFE',
      color: 'var(--color-safe)',
      reasons: ['No incidents within 2 kilometres.']
    };
  }

  let totalScore = 0;
  
  let highPriorityIncidents300m7d = 0;
  let highPriorityIncidents500m = 0;
  let allIncidents1km = 0;
  let hasIncidentsWithin2km = false;

  let maxIncident = null;
  let maxIncidentScore = -1;
  let maxIncidentDistance = 0;
  let maxIncidentDays = 0;

  incidents.forEach(inc => {
    let incidentScore = 0;
    
    const type = inc.incident_type?.toLowerCase() || '';
    const isHighPriority = type.includes('harassment') || type.includes('assault') || type.includes('stalking') || type.includes('kidnap');
    
    if (type.includes('kidnap')) incidentScore += 80;
    else if (type.includes('assault') || type.includes('stalking')) incidentScore += 60;
    else if (type.includes('harassment')) incidentScore += 50;
    else if (type.includes('suspicious')) incidentScore += 35;
    else if (type.includes('theft')) incidentScore += 25;
    else if (type.includes('medical')) incidentScore += 20;
    else if (type.includes('accident')) incidentScore += 15;
    else if (type.includes('light')) incidentScore += 10;
    else incidentScore += 15; 

    const distKm = getDistance(searchedLocation.lat, searchedLocation.lon, inc.latitude, inc.longitude);
    const distM = distKm * 1000;
    
    if (distM <= 250) incidentScore += 35;
    else if (distM <= 500) incidentScore += 25;
    else if (distM <= 1000) incidentScore += 15;
    else if (distM <= 2000) incidentScore += 8;
    else incidentScore += 0;

    if (distM <= 2000) hasIncidentsWithin2km = true;
    if (distM <= 1000) allIncidents1km++;

    const time = new Date(inc.timestamp || inc.created_at);
    let diffDays = 30; 
    if (!isNaN(time.getTime())) {
      diffDays = (new Date() - time) / (1000 * 60 * 60 * 24);
    }
    
    if (diffDays <= 1) incidentScore += 25;
    else if (diffDays <= 7) incidentScore += 18;
    else if (diffDays <= 30) incidentScore += 10;
    else incidentScore += 3;

    if (inc.verified_count > 0) incidentScore += 10;
    
    if (isHighPriority) {
      if (distM <= 500) highPriorityIncidents500m++;
      if (distM <= 300 && diffDays <= 7) highPriorityIncidents300m7d++;
    }

    if (incidentScore > maxIncidentScore) {
      maxIncidentScore = incidentScore;
      maxIncident = inc;
      maxIncidentDistance = distM;
      maxIncidentDays = diffDays;
    }
  });

  if (!hasIncidentsWithin2km) {
    return {
      score: 0,
      level: 'SAFE',
      color: 'var(--color-safe)',
      reasons: ['No incidents within 2 kilometres.']
    };
  }

  totalScore = maxIncidentScore + (incidents.length > 1 ? (incidents.length - 1) * 5 : 0);

  if (highPriorityIncidents500m >= 2 && totalScore < 66) {
    totalScore = 66; 
  }
  else if (highPriorityIncidents300m7d >= 1 && totalScore < 41) {
    totalScore = 41; 
  }
  else if (allIncidents1km >= 3 && totalScore < 41) {
    totalScore = 41;
  }

  totalScore = Math.min(100, Math.round(totalScore));

  let level, color;
  if (totalScore <= 20) { level = 'SAFE'; color = 'var(--color-safe)'; }
  else if (totalScore <= 40) { level = 'LOW RISK'; color = '#84cc16'; }
  else if (totalScore <= 65) { level = 'MEDIUM RISK'; color = 'var(--color-warning)'; }
  else { level = 'HIGH RISK'; color = 'var(--color-danger)'; }

  const reasons = [];
  
  if (incidents.length > 1) {
    reasons.push(`${incidents.length} nearby incidents.`);
  }

  if (highPriorityIncidents500m >= 2) {
    reasons.push(`${highPriorityIncidents500m} harassment/assault reports within 500 metres.`);
  } else if (maxIncident) {
    const type = maxIncident.incident_type;
    const isHighPriority = type.toLowerCase().includes('harassment') || type.toLowerCase().includes('assault') || type.toLowerCase().includes('stalking') || type.toLowerCase().includes('kidnap');
    
    let distStr = maxIncidentDistance < 1000 ? `${Math.round(maxIncidentDistance)} metres` : `${(maxIncidentDistance/1000).toFixed(1)} km`;
    reasons.push(`${type} reported ${distStr} away.`);
    
    if (maxIncidentDays <= 1) {
      reasons.push(`Report submitted today.`);
    } else {
      reasons.push(`Report submitted ${Math.round(maxIncidentDays)} day${Math.round(maxIncidentDays) > 1 ? 's' : ''} ago.`);
    }

    if (isHighPriority) {
      reasons.push(`High-priority women's safety incident.`);
    }
  }

  if (maxIncidentDistance <= 300 && totalScore >= 41) {
    reasons.push(`Close proximity increases risk.`);
  }

  const uniqueReasons = [...new Set(reasons)].slice(0, 4);
  if (uniqueReasons.length === 0) {
    uniqueReasons.push('No significant risk factors detected.');
  }

  return { score: totalScore, level, color, reasons: uniqueReasons };
};


const Dashboard = ({ incidents, loading, error, onIncidentUpdated, mapCenter }) => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [localMapCenter, setLocalMapCenter] = useState(null);
  
  const [searchedLocation, setSearchedLocation] = useState(null);
  const [searchRadius, setSearchRadius] = useState(2);
  const [isSearching, setIsSearching] = useState(false);

  const [alertData, setAlertData] = useState(null);
  const [showAlert, setShowAlert] = useState(false);

  const [testRoutes, setTestRoutes] = useState([]);
  const [isGeneratingRoutes, setIsGeneratingRoutes] = useState(false);

  const handleGenerateTestRoutes = async (incident) => {
    setIsGeneratingRoutes(true);
    setTestRoutes([]);
    try {
      const lat = incident.latitude;
      const lon = incident.longitude;
      
      const routePairs = [
        // West <-> East
        { start: [lat, lon - 0.022], end: [lat, lon + 0.022] },
        // North <-> South
        { start: [lat + 0.02, lon], end: [lat - 0.02, lon] },
        // NorthWest <-> SouthEast
        { start: [lat + 0.015, lon - 0.018], end: [lat - 0.015, lon + 0.018] },
        // NorthEast <-> SouthWest
        { start: [lat + 0.015, lon + 0.018], end: [lat - 0.015, lon - 0.018] }
      ];

      const promises = routePairs.map(pair => 
        axios.post(`${API_URL}/api/intelligence/analyze-routes`, {
          start_coords: pair.start,
          end_coords: pair.end,
          mode: 'driving-car'
        })
      );

      const responses = await Promise.all(promises);
      const allRoutes = responses.flatMap(res => res.data.routes || []);
      
      setTestRoutes(allRoutes);
      setLocalMapCenter([lat, lon]);
    } catch (err) {
      console.error("Failed to generate test routes", err);
      alert("Error generating test routes");
    } finally {
      setIsGeneratingRoutes(false);
    }
  };

  useEffect(() => {
    if (mapCenter) {
      setLocalMapCenter(mapCenter);
    }
  }, [mapCenter]);

  useEffect(() => {
    if (loading || incidents.length === 0 || sessionStorage.getItem('radiusAlertDismissed')) return;

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const userLat = pos.coords.latitude;
        const userLon = pos.coords.longitude;
        
        let nearest = null;
        let minDistance = 1.0; 
        
        incidents.forEach(inc => {
          const dist = getDistance(userLat, userLon, inc.latitude, inc.longitude);
          if (dist < minDistance) {
            minDistance = dist;
            nearest = inc;
          }
        });

        if (nearest) {
          setAlertData({ incident: nearest, distance: Math.round(minDistance * 1000) });
          setShowAlert(true);
        }
      });
    }
  }, [loading, incidents]);

  const handleDismissAlert = () => {
    setShowAlert(false);
    sessionStorage.setItem('radiusAlertDismissed', 'true');
  };

  const handleViewAlertOnMap = () => {
    setLocalMapCenter([alertData.incident.latitude, alertData.incident.longitude]);
    handleDismissAlert();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const firstResult = data[0];
        const newLoc = {
          lat: parseFloat(firstResult.lat),
          lon: parseFloat(firstResult.lon),
          name: firstResult.display_name.split(',')[0]
        };
        setSearchedLocation(newLoc);
        setLocalMapCenter([newLoc.lat, newLoc.lon]);
      } else {
        alert('Location not found. Please try another query.');
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      alert('Error searching for location.');
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchedLocation(null);
    if (mapCenter) {
      setLocalMapCenter(mapCenter);
    }
  };

  const filteredIncidents = useMemo(() => {
    let result = incidents;

    if (activeFilter !== 'All') {
      result = result.filter(inc => inc.incident_type === activeFilter);
    }

    if (searchedLocation && searchRadius) {
      result = result.filter(inc => {
        const dist = getDistance(searchedLocation.lat, searchedLocation.lon, inc.latitude, inc.longitude);
        return dist <= searchRadius;
      });
    }

    return result;
  }, [incidents, activeFilter, searchedLocation, searchRadius]);

  const riskAssessment = useMemo(() => {
    return calculateRiskAssessment(filteredIncidents, searchedLocation);
  }, [filteredIncidents, searchedLocation]);

  const totalReports = filteredIncidents.length;
  const verifiedReports = filteredIncidents.filter(i => i.verified_count > 0).length;
  const activeAlerts = filteredIncidents.filter(i => i.status === 'Active').length;
  const highRiskAreas = filteredIncidents.filter(i => i.severity === 'Critical' || i.severity === 'High').length;

  const StatCard = ({ title, value, icon, color }) => (
    <div className="glass-panel animate-fade-in" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
      <div style={{ background: `rgba(${color}, 0.1)`, padding: '15px', borderRadius: '12px', display: 'flex' }}>
        {icon}
      </div>
      <div>
        <h2 style={{ margin: 0, fontSize: '28px', color: 'var(--text-primary)' }}>
          {loading ? <div className="skeleton" style={{ width: '40px', height: '30px', borderRadius: '4px' }}></div> : value}
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>{title}</p>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '50px', color: 'var(--color-danger)' }}>
        <AlertTriangle size={48} style={{ margin: '0 auto 15px' }} />
        <h3>{error}</h3>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      
      {showAlert && alertData && (
        <div className="glass-panel glow-effect animate-fade-in" style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, width: '350px', padding: '20px', border: '1px solid var(--color-warning)', background: 'rgba(251, 191, 36, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} /> Community Alert
            </h3>
            <button onClick={handleDismissAlert} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
          </div>
          <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.4' }}>
            A <strong>{alertData.incident.incident_type}</strong> incident was reported 
            <span style={{ color: 'var(--color-safe)', fontWeight: 'bold' }}> {alertData.distance} metres away</span> 
            {alertData.incident.road ? ` near ${alertData.incident.road}.` : '.'}
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleViewAlertOnMap} className="glass-panel" style={{ flex: 1, padding: '8px', cursor: 'pointer', border: '1px solid var(--color-warning)', color: 'var(--color-warning)' }}>
              View on Map
            </button>
            <button onClick={handleDismissAlert} className="glass-panel" style={{ flex: 1, padding: '8px', cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <StatCard title="Total Reports" value={totalReports} icon={<ShieldAlert size={28} color="var(--color-primary)" />} color="255, 107, 74" />
        <StatCard title="Verified Reports" value={verifiedReports} icon={<CheckCircle size={28} color="var(--color-safe)" />} color="45, 212, 191" />
        <StatCard title="Active Alerts" value={activeAlerts} icon={<AlertTriangle size={28} color="var(--color-warning)" />} color="251, 191, 36" />
        <StatCard title="High Risk Areas" value={highRiskAreas} icon={<MapPin size={28} color="var(--color-danger)" />} color="244, 63, 94" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 400px', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '5px 15px', borderRadius: '20px', flex: 1, minWidth: '250px' }}>
              <Search size={18} color="var(--text-muted)" style={{ marginRight: '10px' }} />
              <input 
                type="text" 
                placeholder="Search location (Road, Area, Landmark...)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '100%', padding: '8px 0', outline: 'none' }}
              />
              <button 
                onClick={handleSearch}
                disabled={isSearching}
                style={{
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: '16px',
                  cursor: isSearching ? 'wait' : 'pointer',
                  fontWeight: 'bold',
                  opacity: isSearching ? 0.7 : 1
                }}
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            {searchedLocation && (
              <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '5px 15px', borderRadius: '20px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginRight: '10px' }}>Radius:</span>
                <select 
                  value={searchRadius} 
                  onChange={(e) => setSearchRadius(Number(e.target.value))}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value={0.5}>500 m</option>
                  <option value={1}>1 km</option>
                  <option value={2}>2 km</option>
                  <option value={5}>5 km</option>
                </select>
                <button 
                  onClick={clearSearch}
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', marginLeft: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Clear Search"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {FILTERS.map(f => (
              <button 
                key={f}
                onClick={() => setActiveFilter(f)}
                className="glass-panel"
                style={{ 
                  padding: '8px 16px', 
                  borderRadius: '20px', 
                  border: activeFilter === f ? '1px solid var(--color-primary)' : '1px solid var(--border-glass)',
                  background: activeFilter === f ? 'rgba(255,107,74,0.1)' : 'var(--bg-panel)',
                  color: activeFilter === f ? 'var(--color-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {loading ? (
             <div className="skeleton" style={{ height: '500px', width: '100%', borderRadius: '16px' }}></div>
          ) : (
            <>
              {searchedLocation && (
                <div className="glass-panel animate-fade-in" style={{ padding: '20px', marginBottom: '10px', borderLeft: '4px solid var(--color-primary)' }}>
                  <h3 style={{ margin: '0 0 15px 0', color: 'var(--color-primary)' }}>
                    Community Safety Around <br/>
                    <span style={{ color: 'var(--text-primary)' }}>{searchedLocation.name}</span>
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                    <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Nearby Incidents</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{filteredIncidents.length}</div>
                    </div>
                    
                    <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Nearest Incident</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                        {(() => {
                          if (filteredIncidents.length === 0) return 'N/A';
                          let minDist = Infinity;
                          filteredIncidents.forEach(inc => {
                            const dist = getDistance(searchedLocation.lat, searchedLocation.lon, inc.latitude, inc.longitude);
                            if (dist < minDist) minDist = dist;
                          });
                          return minDist < 1 ? `${Math.round(minDist * 1000)} m` : `${minDist.toFixed(1)} km`;
                        })()}
                      </div>
                    </div>
                    
                    <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Safety Level</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: riskAssessment.color }}>
                        {riskAssessment.level}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '15px', padding: '10px 15px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: `3px solid ${riskAssessment.color}` }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-secondary)' }}>Reason:</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {riskAssessment.reasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '13px' }}>
                    {['Harassment', 'Theft', 'Broken Street Light', 'Medical Emergency', 'Accident', 'Suspicious Activity'].map(type => {
                      const count = filteredIncidents.filter(i => i.incident_type === type).length;
                      if (count === 0) return null;
                      return (
                        <span key={type} style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '12px' }}>
                          {type}: <strong>{count}</strong>
                        </span>
                      );
                    })}
                  </div>
                  
                  {filteredIncidents.length > 0 && (
                    <div style={{ marginTop: '15px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Last Report:{' '}
                      {(() => {
                        const sorted = [...filteredIncidents].sort((a, b) => new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0));
                        if (!sorted[0].timestamp && !sorted[0].created_at) return 'Recently';
                        
                        const time = new Date(sorted[0].timestamp || sorted[0].created_at);
                        if (isNaN(time.getTime())) return 'Recently';

                        const diffMins = Math.round((new Date() - time) / 60000);
                        if (diffMins < 60) return `${diffMins} minutes ago`;
                        if (diffMins < 1440) return `${Math.round(diffMins/60)} hours ago`;
                        return `${Math.round(diffMins/1440)} days ago`;
                      })()}
                    </div>
                  )}
                </div>
              )}
              <MapComponent 
                incidents={filteredIncidents} 
                centerOn={localMapCenter} 
                searchedLocation={searchedLocation}
                searchRadius={searchRadius}
                routes={testRoutes}
              />
            </>
          )}
        </div>

        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '800px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--color-primary)', display: 'flex', justifyContent: 'space-between' }}>
            Community Reports
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '10px' }}>
              {loading ? '-' : filteredIncidents.length}
            </span>
          </h3>
          
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '5px' }}>
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : filteredIncidents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 15px', opacity: 0.5 }} />
                <p>No reports found matching your criteria.</p>
              </div>
            ) : (
              filteredIncidents.map(inc => <ReportCard key={inc.id} incident={inc} onUpdate={onIncidentUpdated} onGenerateTestRoutes={handleGenerateTestRoutes} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
