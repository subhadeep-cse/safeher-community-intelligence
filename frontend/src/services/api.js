import axios from 'axios';

const API_URL = 'http://localhost:5000';

export const fetchIncidents = async () => {
  const response = await axios.get(`${API_URL}/incidents`);
  return response.data;
};

export const createIncident = async (incidentData) => {
  const response = await axios.post(`${API_URL}/incidents`, incidentData);
  return response.data;
};

export const deleteIncident = async (id) => {
  const response = await axios.delete(`${API_URL}/incidents/${id}`);
  return response.data;
};

export const verifyIncident = async (id, action) => {
  const response = await axios.post(`${API_URL}/incidents/${id}/verify`, { action });
  return response.data;
};

// OpenStreetMap Nominatim for Reverse Geocoding - Extracting granular fields
export const reverseGeocode = async (lat, lon) => {
  try {
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
    if (response.data && response.data.address) {
      const addr = response.data.address;
      
      const road = addr.road || addr.pedestrian || addr.street || '';
      const street = road; // Alias for granular storage
      const locality = addr.locality || addr.village || addr.hamlet || '';
      const neighbourhood = addr.neighbourhood || addr.residential || addr.quarter || '';
      const suburb = addr.suburb || addr.city_district || '';
      const landmark = addr.amenity || addr.building || addr.shop || addr.tourism || addr.historic || addr.leisure || addr.office || '';
      const city = addr.city || addr.town || addr.municipality || addr.county || '';
      const state = addr.state || addr.region || '';
      const postal_code = addr.postcode || '';
      const country = addr.country || '';
      const area = neighbourhood || suburb || locality || city; // For fallback backward compatibility
      
      return {
        road,
        street,
        locality,
        neighbourhood,
        suburb,
        landmark,
        city,
        state,
        postal_code,
        country,
        area
      };
    }
  } catch (error) {
    console.error("Geocoding failed:", error);
  }
  return { road: '', area: '', city: '', state: '', street: '', locality: '', neighbourhood: '', suburb: '', landmark: '', postal_code: '', country: '' };
};

// Photon API (OSM) for Intelligent Fuzzy Autocomplete Search
export const searchLocation = async (query) => {
  try {
    // Photon provides great partial matching and typo tolerance built on ElasticSearch
    const response = await axios.get(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`);
    
    if (response.data && response.data.features) {
      return response.data.features.map(f => {
        const props = f.properties;
        const lon = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        
        // Build a display string "Name, Area, City"
        const name = props.name || props.street || '';
        const area = props.district || props.locality || props.neighbourhood || '';
        const city = props.city || props.county || props.state || '';
        
        return {
          lat,
          lon,
          name,
          area,
          city,
          country: props.country || '',
          postcode: props.postcode || ''
        };
      });
    }
    return [];
  } catch (error) {
    console.error("Location search failed:", error);
    return [];
  }
};
