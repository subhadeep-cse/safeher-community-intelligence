import os
import requests

def get_routes(start_coords, end_coords, mode="walking"):
    # mode mapping: 'walking', 'cab', 'public_transport'
    ors_profile = 'foot-walking'
    if mode == 'cab':
        ors_profile = 'driving-car'
    
    ors_key = os.environ.get("OPENROUTESERVICE_API_KEY")
    
    try:
        if not ors_key:
            raise Exception("ORS Key missing, falling back")
            
        headers = {
            'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
            'Authorization': ors_key,
            'Content-Type': 'application/json; charset=utf-8'
        }
        
        # Coordinates must be [lon, lat]
        body = {
            "coordinates": [[start_coords[1], start_coords[0]], [end_coords[1], end_coords[0]]],
            "alternative_routes": {"target_count": 3, "weight_factor": 1.4}
        }
        
        url = f"https://api.openrouteservice.org/v2/directions/{ors_profile}/geojson"
        response = requests.post(url, json=body, headers=headers, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            routes = []
            for idx, feature in enumerate(data.get('features', [])):
                props = feature.get('properties', {})
                summary = props.get('summary', {})
                
                # convert [lon, lat] to [lat, lon] for Leaflet
                coords = feature.get('geometry', {}).get('coordinates', [])
                path = [[c[1], c[0]] for c in coords]
                
                routes.append({
                    "id": f"ors_route_{idx}",
                    "distance_meters": summary.get('distance', 0),
                    "duration_seconds": summary.get('duration', 0),
                    "path": path,
                    "provider": "OpenRouteService"
                })
            
            if routes:
                return routes
                
        raise Exception(f"ORS Failed with status {response.status_code}")
        
    except Exception as e:
        print(f"ORS Routing failed: {e}. Falling back to TomTom.")
        return get_tomtom_routes(start_coords, end_coords, mode)


def get_tomtom_routes(start_coords, end_coords, mode="walking"):
    tomtom_key = os.environ.get("TOMTOM_API_KEY")
    if not tomtom_key:
        print("Warning: TomTom API key missing. Returning straight line fallback.")
        return [{
            "id": "fallback_route",
            "distance_meters": 0,
            "duration_seconds": 0,
            "path": [start_coords, end_coords],
            "provider": "Fallback (No API Key)"
        }]
        
    tt_mode = 'pedestrian'
    if mode == 'cab':
        tt_mode = 'car'
        
    try:
        url = f"https://api.tomtom.com/routing/1/calculateRoute/{start_coords[0]},{start_coords[1]}:{end_coords[0]},{end_coords[1]}/json"
        params = {
            "key": tomtom_key,
            "travelMode": tt_mode,
            "maxAlternatives": 2
        }
        
        response = requests.get(url, params=params, timeout=5)
        if response.status_code == 200:
            data = response.json()
            routes = []
            for idx, route in enumerate(data.get('routes', [])):
                summary = route.get('summary', {})
                legs = route.get('legs', [])
                path = []
                for leg in legs:
                    for pt in leg.get('points', []):
                        path.append([pt['latitude'], pt['longitude']])
                        
                routes.append({
                    "id": f"tt_route_{idx}",
                    "distance_meters": summary.get('lengthInMeters', 0),
                    "duration_seconds": summary.get('travelTimeInSeconds', 0),
                    "path": path,
                    "provider": "TomTom"
                })
            return routes
    except Exception as e:
        print(f"TomTom Routing failed: {e}")
        
    return [{
        "id": "ultimate_fallback",
        "distance_meters": 0,
        "duration_seconds": 0,
        "path": [start_coords, end_coords],
        "provider": "Fallback (Failure)"
    }]
