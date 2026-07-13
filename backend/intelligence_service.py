import math
import time
import os
import requests
from datetime import datetime
import google.generativeai as genai
from database import get_db_connection
from traffic_service import analyze_route_traffic

_OVERPASS_CACHE = {}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi_1 = math.radians(lat1)
    phi_2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi_1) * math.cos(phi_2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def get_time_weight(created_at_str):
    if not created_at_str:
        return 0.5
    try:
        created_time = datetime.strptime(created_at_str, '%Y-%m-%d %H:%M:%S')
        days_old = (datetime.utcnow() - created_time).days
        if days_old <= 7: return 1.0
        elif days_old <= 30: return 0.7
        else: return 0.2
    except Exception:
        return 0.5

def get_base_points(incident_type):
    t = incident_type.strip().lower()
    if 'sexual assault' in t or 'rape' in t or 'kidnapping' in t: return 1000
    if 'harassment' in t or 'stalking' in t or 'molestation' in t: return 500
    if 'chain snatching' in t or 'robbery' in t: return 300
    if 'theft' in t: return 100
    if 'suspicious' in t: return 10
    if 'unsafe' in t or 'street light' in t or 'streetlight' in t: return 5
    return 2

def fetch_pois(lat, lon, radius=500):
    cache_key = f"{round(lat, 3)},{round(lon, 3)}"
    now = time.time()
    if cache_key in _OVERPASS_CACHE:
        if now - _OVERPASS_CACHE[cache_key]['timestamp'] < 3600:
            return _OVERPASS_CACHE[cache_key]['data']
            
    query = f"""
    [out:json][timeout:3];
    (
      node["shop"](around:{radius},{lat},{lon});
      node["amenity"~"restaurant|cafe|marketplace|mall"](around:{radius},{lat},{lon});
      node["office"](around:{radius},{lat},{lon});
      node["public_transport"](around:{radius},{lat},{lon});
      node["highway"="bus_stop"](around:{radius},{lat},{lon});
      node["railway"~"station|tram_stop"](around:{radius},{lat},{lon});
    );
    out tags;
    """
    try:
        response = requests.post("http://overpass-api.de/api/interpreter", data={'data': query}, timeout=3)
        if response.status_code == 200:
            data = response.json()
            commercial = 0
            pt = 0
            for el in data.get('elements', []):
                tags = el.get('tags', {})
                if 'shop' in tags or 'office' in tags or tags.get('amenity') in ['restaurant', 'cafe', 'marketplace', 'mall']:
                    commercial += 1
                if 'public_transport' in tags or tags.get('highway') == 'bus_stop' or 'railway' in tags:
                    pt += 1
            result = {'commercial': commercial, 'pt': pt}
            _OVERPASS_CACHE[cache_key] = {'timestamp': now, 'data': result}
            return result
    except Exception as e:
        print(f"Overpass failed: {e}")
        
    return {'commercial': 0, 'pt': 0}

def get_visibility_score():
    hour = datetime.now().hour
    if 6 <= hour <= 18: return "Good"
    elif 18 < hour <= 20: return "Moderate"
    else: return "Low"

def get_time_of_day_score():
    hour = datetime.now().hour
    if 7 <= hour <= 10 or 17 <= hour <= 20:
        return {"category": "Peak Hours", "score": 100}
    elif 11 <= hour <= 16:
        return {"category": "Office Hours", "score": 60}
    elif 21 <= hour <= 23:
        return {"category": "Evening", "score": 40}
    else:
        return {"category": "Late Night", "score": 10}

def generate_ai_explanation(route_data, all_routes, radius):
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        return fallback_explanation(route_data)
        
    try:
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Summarize other routes for comparison
        alternatives = ""
        for r in all_routes:
            if r['id'] != route_data['id']:
                alternatives += f"- Route {r['id']}: Distance {r.get('distance_meters')}m, Time {r.get('duration_seconds')}s, Incidents {r.get('community_reports', {}).get('Total', 0)}, Traffic: {r.get('traffic_data', {}).get('status', 'Unknown')}\n"
        
        prompt = f"""
You are the AI explanation engine for SafeHer's routing system. The routing engine has already selected the recommended route based on deterministic scoring. 
Your ONLY job is to explain WHY this route is recommended in a natural, human-friendly way.
Do NOT invent facts. Only explain the calculated results provided below.
CRITICAL INSTRUCTIONS:
1. NEVER output contradictory explanations. If the route's Safety Score is low (e.g. 0/100) or it contains serious incidents (Harassment, Assault), you MUST state this fact honestly. DO NOT say "avoids severe incidents" if incidents > 0. 
2. If this route is recommended despite having incidents, it is because alternative routes are either worse or it offers significantly lower congestion/distance. You must mention this trade-off explicitly.
3. The explanation must reference traffic, distance, community incidents, severity, and final score.

Provide a concise summary. 
Example 1: "Route A is recommended because it avoids severe community incidents despite taking 5 additional minutes. User safety has been prioritized."
Example 2: "Route B is recommended due to significantly lower congestion, but please exercise caution as there is 1 harassment report within {radius} metres."

Recommended Route Data:
Safety Score (Higher is safer): {100 - route_data.get('risk_score', 0)}/100
Final AI Score (Lower is better): {route_data.get('ranking_score', 0)}
Distance: {route_data.get('distance_meters', 0)} meters
Travel Time: {route_data.get('duration_seconds', 0)} seconds
Traffic: {route_data.get('traffic_data', {}).get('status', 'Unknown')}
Community Reports within {radius}m: {route_data.get('community_reports', {})}
Crowd Density: {route_data.get('crowd_intelligence_score', 0)}/100

Alternative Routes:
{alternatives}
        """
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Gemini AI failed: {e}")
        return fallback_explanation(route_data)

def fallback_explanation(route_data):
    return f"This route optimally balances traffic conditions ({route_data.get('traffic_data', {}).get('status')}) and community safety, prioritizing avoidance of severe incidents."

def analyze_routes_with_reports(routes, radius=500):
    try:
        conn = get_db_connection()
        conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
        cursor = conn.cursor()
        cursor.execute("SELECT id, incident_type, description, latitude, longitude, created_at FROM incident")
        reports = cursor.fetchall()
        conn.close()
    except Exception as e:
        print(f"Error fetching reports: {e}")
        reports = []
    
    analyzed_routes = []
    
    for route_idx, route in enumerate(routes):
        path = route.get('path', [])
        
        report_counts = {
            "Total": 0, "Harassment": 0, "Theft": 0, "Broken Street Lights": 0,
            "Unsafe Roads": 0, "Suspicious Activity": 0, "Other": 0
        }
        matched_incidents = []
        raw_risk_score = 0.0
        
        for report in reports:
            rid = report.get('id')
            rtype = report.get('incident_type', '')
            rlat = report.get('latitude')
            rlon = report.get('longitude')
            rdate = report.get('created_at')
            
            min_dist = float('inf')
            for point in path:
                dist = haversine(rlat, rlon, point[0], point[1])
                if dist < min_dist:
                    min_dist = dist
                    
            if min_dist <= radius:
                report_counts["Total"] += 1
                matched_key = "Other"
                for key in ["Harassment", "Theft", "Broken Street Lights", "Unsafe Roads", "Suspicious Activity"]:
                    if key.lower() in rtype.lower() or rtype.lower() in key.lower():
                        matched_key = key
                        break
                if "Broken Street Light" in rtype: matched_key = "Broken Street Lights"
                if "Unsafe Road" in rtype: matched_key = "Unsafe Roads"
                report_counts[matched_key] += 1
                
                weight = get_time_weight(rdate)
                pts = get_base_points(rtype)
                raw_risk_score += (pts * weight)
                
                matched_incidents.append({
                    'id': rid,
                    'type': rtype,
                    'description': report.get('description'),
                    'latitude': rlat,
                    'longitude': rlon,
                    'date': rdate,
                    'severity_pts': pts,
                    'distance_to_route': int(min_dist)
                })
                
        community_risk = min(int(round(raw_risk_score)), 100)
        
        # 1. Traffic Analysis
        traffic_data = analyze_route_traffic(path)
        congestion_score = 100 - traffic_data['score'] # High congestion = high score
        
        # 2. POI Analysis (Commercial & Public Transport)
        num_samples = min(3, max(1, len(path)))
        step = max(1, len(path) // num_samples)
        samples = [path[i] for i in range(0, len(path), step)][:num_samples]
        
        total_comm = 0
        total_pt = 0
        for pt in samples:
            pois = fetch_pois(pt[0], pt[1])
            total_comm += pois['commercial']
            total_pt += pois['pt']
            
        avg_comm = total_comm / max(1, len(samples))
        avg_pt = total_pt / max(1, len(samples))
        
        comm_score = min(100, int((avg_comm / 50.0) * 100))
        pt_score = min(100, int((avg_pt / 20.0) * 100))
        
        # 3. Time of Day
        time_data = get_time_of_day_score()
        time_score = time_data['score']
        
        # 4. Crowd Intelligence Score
        crowd_intel_score = (congestion_score * 0.60) + (community_risk * 0.15) + (comm_score * 0.10) + (pt_score * 0.10) + (time_score * 0.05)
        crowd_intel_score = int(round(crowd_intel_score))
        
        route['community_reports'] = report_counts
        route['matched_incidents'] = matched_incidents
        route['risk_score'] = community_risk
        route['raw_risk_score'] = raw_risk_score
        route['traffic_data'] = traffic_data
        route['commercial_activity'] = f"{int(avg_comm)} locations nearby"
        route['public_transport'] = f"{int(avg_pt)} stations/stops nearby"
        route['visibility'] = get_visibility_score()
        route['crowd_intelligence_score'] = crowd_intel_score
        
        # Smart Decision Engine Logic: Balance safety with practicality
        # We want the lowest ranking score. 
        # Duration is penalized heavily, but extreme risk can override it.
        # Severe incidents have huge base points (e.g. 500-1000), making them easily outweigh minutes of travel time.
        route['ranking_score'] = route.get('duration_seconds', 0) + raw_risk_score + (congestion_score * 15)
        
        analyzed_routes.append(route)
        
    # Sort by ranking score
    analyzed_routes.sort(key=lambda x: x['ranking_score'])
    
    for i, route in enumerate(analyzed_routes):
        route['is_recommended'] = (i == 0)
        if route['is_recommended']:
            route['ai_explanation'] = generate_ai_explanation(route, analyzed_routes, radius)
            route['explanation'] = route['ai_explanation']
        else:
            route['ai_explanation'] = ""
            route['explanation'] = "Alternative route."
            
    return analyzed_routes
