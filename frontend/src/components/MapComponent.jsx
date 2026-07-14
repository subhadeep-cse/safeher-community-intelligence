import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Circle, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const getMarkerIcon = (color) => {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};

const getColorForType = (type) => {
  switch(type) {
    case 'Harassment': return 'red';
    case 'Theft': return 'orange';
    case 'Broken Street Light': return 'yellow';
    case 'Medical Emergency': return 'blue';
    case 'Accident': return 'black';
    case 'Suspicious Activity': return 'violet';
    default: return 'grey';
  }
};

// Component to handle auto-panning
const MapController = ({ centerPos }) => {
  const map = useMap();
  useEffect(() => {
    if (centerPos) {
      map.flyTo(centerPos, 15, { animate: true, duration: 1.5 });
    }
  }, [centerPos, map]);
  return null;
};

const MapComponent = ({ incidents = [], centerOn, searchedLocation, searchRadius, activeVaultCase, routes = [], selectedRouteIndex = 0, setSelectedRouteIndex, getRouteColor, showLegend = !!getRouteColor, showTraffic = false }) => {
  const [selectedTrafficSegment, setSelectedTrafficSegment] = useState(null);
  
  const defaultCenter = centerOn || (incidents.length > 0 
    ? [incidents[0].latitude, incidents[0].longitude] 
    : [22.5726, 88.3639]); // Default to Kolkata

  return (
    <div style={{ height: '500px', width: '100%', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--glass-shadow)', position: 'relative' }}>
      <MapContainer center={defaultCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <MapController centerPos={centerOn} />
        
        {searchedLocation && (
          <>
            <Marker
              position={[searchedLocation.lat, searchedLocation.lon]}
              icon={getMarkerIcon('blue')}
              zIndexOffset={1000}
            >
              <Popup>
                <div style={{ color: '#333' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: 'var(--color-primary)' }}>Searched Location</h4>
                  <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}>{searchedLocation.name}</p>
                </div>
              </Popup>
            </Marker>
            {searchRadius && (
              <Circle
                center={[searchedLocation.lat, searchedLocation.lon]}
                radius={searchRadius * 1000}
                pathOptions={{ color: '#ff6b4a', fillColor: '#ff6b4a', fillOpacity: 0.1, weight: 2 }}
              />
            )}
          </>
        )}
        
        {incidents.map((inc) => {
          const affectedRoutes = [];
          let distFromSelected = "N/A";
          
          routes.forEach((r, idx) => {
            const match = r.matched_incidents?.find(mi => mi.id === inc.id);
            if (match) {
               affectedRoutes.push(String.fromCharCode(65 + idx));
               if (idx === selectedRouteIndex) {
                 distFromSelected = `${match.distance_to_route}m`;
               }
            }
          });

          return (
            <Marker 
              key={inc.id} 
              position={[inc.latitude, inc.longitude]}
              icon={getMarkerIcon(getColorForType(inc.incident_type))}
              opacity={0.8}
            >
              <Popup>
                <div style={{ color: '#333' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: 'var(--color-primary)' }}>{inc.incident_type}</h4>
                  <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}><strong>Description:</strong> {inc.description}</p>
                  <p style={{ margin: '0 0 5px 0', fontSize: '12px' }}><strong>Severity:</strong> {inc.severity}</p>
                  <p style={{ margin: '0 0 5px 0', fontSize: '12px' }}><strong>Date:</strong> {new Date(inc.created_at || Date.now()).toLocaleString()}</p>
                  <p style={{ margin: '0 0 5px 0', fontSize: '12px' }}><strong>Coordinates:</strong> {inc.latitude.toFixed(5)}, {inc.longitude.toFixed(5)}</p>
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
                    <p style={{ margin: '0 0 5px 0', fontSize: '12px' }}><strong>Distance from Selected Route:</strong> {distFromSelected}</p>
                    <p style={{ margin: 0, fontSize: '12px' }}><strong>Affects:</strong> {affectedRoutes.length > 0 ? `Routes ${affectedRoutes.join(', ')}` : 'None'}</p>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {activeVaultCase && (
          <Marker
            position={[activeVaultCase.latitude, activeVaultCase.longitude]}
            icon={getMarkerIcon('gold')}
            zIndexOffset={2000}
          >
            <Popup>
              <div style={{ color: '#333' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#ffd700' }}>{activeVaultCase.title}</h4>
                <p style={{ margin: '0 0 5px 0', fontSize: '13px', fontWeight: 'bold' }}>Active Evidence Case</p>
                <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}>{activeVaultCase.address}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {showTraffic && routes.length > 0 && routes[0].path?.length > 0 && (
          <>
            <Marker 
              position={routes[0].path[0]} 
              icon={getMarkerIcon('green')}
              zIndexOffset={3000}
            >
              <Popup>
                <div style={{ color: '#333' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#28a745' }}>Source</h4>
                  <p style={{ margin: '0', fontSize: '13px' }}>Route Starting Point</p>
                </div>
              </Popup>
            </Marker>
            
            <Marker 
              position={routes[0].path[routes[0].path.length - 1]} 
              icon={getMarkerIcon('red')}
              zIndexOffset={3000}
            >
              <Popup>
                <div style={{ color: '#333' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#dc3545' }}>Destination</h4>
                  <p style={{ margin: '0', fontSize: '13px' }}>Route Endpoint</p>
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {routes.map((route, index) => {
          const isSelected = index === selectedRouteIndex;
          const routeColor = getRouteColor ? getRouteColor(index) : '#007bff';
          
          return (
            <React.Fragment key={route.id || index}>
              {/* Base Route Line */}
              <Polyline 
                positions={route.path} 
                pathOptions={{ 
                  color: routeColor, 
                  weight: isSelected ? 8 : 4, 
                  opacity: isSelected ? 1.0 : 0.4,
                  lineCap: 'round',
                  lineJoin: 'round'
                }} 
                eventHandlers={{
                  click: () => setSelectedRouteIndex && setSelectedRouteIndex(index)
                }}
              >
                <Popup>
                  <div style={{ color: '#333' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: routeColor }}>
                      Route Option {String.fromCharCode(65 + index)}
                    </h4>
                    <p style={{ margin: 0, fontSize: '13px' }}>Click to select this route.</p>
                  </div>
                </Popup>
              </Polyline>
              
              {/* Traffic Layer - rendered on top of base layer */}
              {showTraffic && route.traffic_data?.segments?.map((seg, sIdx) => {
                const getTrafficColorHex = (c) => {
                  if (c === 'green') return '#28a745';
                  if (c === 'yellow') return '#ffc107';
                  if (c === 'orange') return '#fd7e14';
                  if (c === 'red') return '#dc3545';
                  return 'transparent';
                };
                const getTrafficStatusText = (c) => {
                  if (c === 'green') return 'Free Flow';
                  if (c === 'yellow') return 'Moderate';
                  if (c === 'orange') return 'Heavy';
                  if (c === 'red') return 'Severe Congestion';
                  return 'Unknown';
                };
                
                const tColor = getTrafficColorHex(seg.color);
                const isThisTrafficSelected = selectedTrafficSegment?.routeIndex === index && selectedTrafficSegment?.segmentIndex === sIdx;
                
                return (
                  <Polyline 
                    key={`traffic-${index}-${sIdx}`}
                    positions={seg.path} 
                    pathOptions={{ 
                      color: tColor, 
                      weight: isThisTrafficSelected ? 8 : (isSelected ? 4 : 2), 
                      opacity: isThisTrafficSelected ? 1.0 : (isSelected ? 0.9 : 0.3),
                    }}
                    eventHandlers={{
                      click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        setSelectedTrafficSegment({ routeIndex: index, segmentIndex: sIdx });
                        if (setSelectedRouteIndex) setSelectedRouteIndex(index);
                      }
                    }}
                  >
                    <Tooltip sticky>
                      <div style={{ textAlign: 'center' }}>
                        <strong>{getTrafficStatusText(seg.color)}</strong><br/>
                        TomTom Live Data<br/>
                        <em>Click for Details</em>
                      </div>
                    </Tooltip>
                    {seg.flow_data && (
                      <Popup>
                        <div style={{ color: '#333' }}>
                          <h4 style={{ margin: '0 0 5px 0', color: tColor }}>Traffic Status: {getTrafficStatusText(seg.color)}</h4>
                          <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}><strong>Current Speed:</strong> {seg.flow_data.currentSpeed} km/h</p>
                          <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}><strong>Free Flow Speed:</strong> {seg.flow_data.freeFlowSpeed} km/h</p>
                          <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}>
                            <strong>Congestion Level:</strong> {Math.max(0, Math.round((1 - (seg.flow_data.currentSpeed / Math.max(1, seg.flow_data.freeFlowSpeed))) * 100))}%
                          </p>
                          {seg.flow_data.freeFlowSpeed > seg.flow_data.currentSpeed && (
                             <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}>
                               <strong>Traffic Delay:</strong> Yes
                             </p>
                          )}
                          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
                            <p style={{ margin: '0 0 3px 0', fontSize: '11px', color: '#666' }}><strong>Traffic Source:</strong> TomTom Traffic Flow API (Live)</p>
                            <p style={{ margin: 0, fontSize: '11px', color: '#666' }}><strong>Last Updated:</strong> {new Date(seg.flow_data.timestamp * 1000).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      </Popup>
                    )}
                  </Polyline>
                );
              })}
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* MAP LEGEND OVERLAY */}
      {showLegend && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          background: 'rgba(20, 20, 25, 0.9)',
          padding: '15px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 1000,
          fontSize: '11px',
          color: '#fff',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          backdropFilter: 'blur(10px)'
        }}>
          {showTraffic && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Routes</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'12px',height:'3px',background:'#007bff'}}></span> Route A</div>
                <div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'12px',height:'3px',background:'#ff8c00'}}></span> Route B</div>
                <div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'12px',height:'3px',background:'#8a2be2'}}></span> Route C</div>
              </div>
              
              <div style={{ fontWeight: 'bold', marginBottom: '8px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '8px' }}>Traffic</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'10px',height:'10px',background:'#28a745',borderRadius:'50%'}}></span> Free Flow</div>
                <div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'10px',height:'10px',background:'#ffc107',borderRadius:'50%'}}></span> Moderate</div>
                <div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'10px',height:'10px',background:'#fd7e14',borderRadius:'50%'}}></span> Heavy</div>
                <div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{width:'10px',height:'10px',background:'#dc3545',borderRadius:'50%'}}></span> Severe</div>
              </div>
            </>
          )}
          
          <div style={{ fontWeight: 'bold', marginBottom: '8px', borderTop: showTraffic ? '1px solid rgba(255,255,255,0.2)' : 'none', paddingTop: showTraffic ? '8px' : '0' }}>Incidents</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{color:'red'}}>Harassment</div>
            <div style={{color:'orange'}}>Theft</div>
            <div style={{color:'yellow'}}>Street Light</div>
            <div style={{color:'violet'}}>Suspicious</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
