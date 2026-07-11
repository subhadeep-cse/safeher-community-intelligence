import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
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

const MapComponent = ({ incidents, centerOn, searchedLocation, searchRadius }) => {
  const defaultCenter = incidents.length > 0 
    ? [incidents[0].latitude, incidents[0].longitude] 
    : [28.6139, 77.2090]; 

  return (
    <div style={{ height: '500px', width: '100%', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--glass-shadow)' }}>
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
        
        {incidents.map((inc) => (
          <Marker 
            key={inc.id} 
            position={[inc.latitude, inc.longitude]}
            icon={getMarkerIcon(getColorForType(inc.incident_type))}
          >
            <Popup>
              <div style={{ color: '#333' }}>
                <h4 style={{ margin: '0 0 5px 0', color: 'var(--color-primary)' }}>{inc.incident_type}</h4>
                <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}>{inc.description}</p>
                <div style={{ display: 'flex', gap: '10px', fontSize: '12px', marginTop: '10px' }}>
                  <span style={{ fontWeight: 'bold' }}>Severity: {inc.severity}</span>
                  <span>Verified: {inc.verified_count}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
