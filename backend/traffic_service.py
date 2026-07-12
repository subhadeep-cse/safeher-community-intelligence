import os
import requests

def get_traffic_status(start_coords, end_coords):
    tomtom_key = os.environ.get("TOMTOM_API_KEY")
    if not tomtom_key:
        return "Live traffic data is currently unavailable. Route analysis is based on available community information."
        
    try:
        min_lat = min(start_coords[0], end_coords[0]) - 0.01
        max_lat = max(start_coords[0], end_coords[0]) + 0.01
        min_lon = min(start_coords[1], end_coords[1]) - 0.01
        max_lon = max(start_coords[1], end_coords[1]) + 0.01
        
        url = f"https://api.tomtom.com/traffic/services/4/incidentDetails/s3/{min_lat},{min_lon},{max_lat},{max_lon}/11/-1/json"
        params = {"key": tomtom_key}
        
        response = requests.get(url, params=params, timeout=5)
        if response.status_code == 200:
            data = response.json()
            incidents = data.get('tm', {}).get('poi', [])
            if len(incidents) > 5:
                return "Heavy Traffic / Multiple Incidents"
            elif len(incidents) > 0:
                return "Moderate Traffic / Minor Incidents"
            else:
                return "Clear Traffic"
                
        return "Live traffic data is currently unavailable. Route analysis is based on available community information."
    except Exception as e:
        print(f"Traffic check failed: {e}")
        return "Live traffic data is currently unavailable. Route analysis is based on available community information."
