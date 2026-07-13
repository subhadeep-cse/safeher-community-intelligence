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

def get_base_points(incident_type, hour):
    t = incident_type.strip().lower()
    
    pts = 2
    is_severe = False
    is_dynamic = False
    
    if 'sexual assault' in t or 'rape' in t or 'kidnapping' in t or 'attempted assault' in t:
        pts = 1000
        is_severe = True
    elif 'harassment' in t or 'stalking' in t or 'molestation' in t:
        pts = 500
        is_severe = True
    elif 'chain snatching' in t or 'robbery' in t:
        pts = 300
        is_severe = True
    elif 'theft' in t:
        pts = 100
    elif 'suspicious' in t:
        pts = 10
        is_dynamic = True
    elif 'unsafe' in t or 'street light' in t or 'streetlight' in t or 'dark road' in t or 'isolated' in t:
        pts = 5
        is_dynamic = True

    if 6 <= hour < 12:
        if 'street light' in t or 'streetlight' in t or 'dark' in t:
            pts = 1  
    elif 17 <= hour < 21:
        if 'isolated' in t or 'unsafe' in t:
            pts *= 2 
    elif hour >= 21 or hour < 6:
        if is_severe:
            pts *= 3
        if is_dynamic:
            pts *= 4

    return pts

def get_road_activity(traffic_score, hour):
    if 6 <= hour < 21: 
        if traffic_score < 60: return "Busy / High Activity"
        elif traffic_score < 80: return "Moderate Activity"
        else: return "Relatively Quiet"
    else: 
        if traffic_score < 70: return "Moderate Activity"
        else: return "Isolated / Very Quiet"

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

def generate_ai_explanation(analyzed_routes, radius):
    gemini_key = os.environ.get("GEMINI_API_KEY")
    explanations = {}
    if not gemini_key:
        return explanations
        
    try:
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"""
You are the AI explanation engine for SafeHer's routing system. The routing engine has already selected Route {analyzed_routes[0]['id']} as the recommended route based on a deterministic scoring algorithm.
Your ONLY job is to explain WHY the recommended route was chosen and WHY the alternative routes were rejected, in a natural, human-friendly way.
Do NOT invent facts. Only use the structured data provided below.

CRITICAL INSTRUCTIONS:
1. Explain WHY the recommended route won. If it is recommended despite incidents, explain the trade-off (e.g. alternative routes had worse incidents).
2. Explain WHY the alternative routes were rejected.
3. Explain how current traffic and current time of day influenced the decision.
4. Mention whether severe incidents outweighed traffic or travel time savings.
5. Provide the output as a valid JSON object where keys are Route IDs (e.g. "A", "B") and values are the explanation strings. Do not include markdown formatting like ```json in the output, just raw JSON.

Example Output format:
{{
  "A": "Route A is recommended because it avoids severe community incidents despite taking 5 additional minutes. Current time is 9:40 PM and traffic indicates it is relatively quiet, so prioritizing safety is essential. Route B was rejected because it passes within 180m of a reported harassment.",
  "B": "Route B is rejected due to a nearby harassment report, which is heavily penalized at night.",
  "C": "Route C is rejected because it takes 15 minutes longer with no significant safety improvements."
}}

Structured Data:
"""
        for r in analyzed_routes:
            prompt += f"""
Route {r['id']} (Recommended: {r['is_recommended']}):
- Final Backend Score: {r['ranking_score']} (Lower is better)
- Safety Score: {100 - r.get('risk_score', 0)}/100
- Distance: {r.get('distance_meters', 0)} meters
- Travel Time: {math.ceil(r.get('duration_seconds', 0) / 60)} minutes
- Local Time: {r.get('current_time')}
- Traffic Condition: {r.get('traffic_data', {{}}).get('status')}
- Approximate Road Activity: {r.get('road_activity')}
- Nearest Harassment: {r.get('nearest_incidents', {{}}).get('Harassment')}m
- Nearest Theft: {r.get('nearest_incidents', {{}}).get('Theft')}m
- Nearest Unsafe Road: {r.get('nearest_incidents', {{}}).get('Unsafe Roads')}m
- Nearest Dark Road: {r.get('nearest_incidents', {{}}).get('Dark Roads')}m
- Nearest Street Light: {r.get('nearest_incidents', {{}}).get('Broken Street Lights')}m
- Total Incidents: {r.get('community_reports', {{}}).get('Total', 0)}
"""
        import json
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith('```json'):
            text = text[7:-3].strip()
        elif text.startswith('```'):
            text = text[3:-3].strip()
            
        explanations = json.loads(text)
        return explanations
    except Exception as e:
        print(f"Gemini AI failed: {e}")
        return explanations

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
        
        current_hour = datetime.now().hour
        local_time_str = datetime.now().strftime("%I:%M %p")
        
        nearest_incidents = {
            "Harassment": float('inf'),
            "Theft": float('inf'),
            "Unsafe Roads": float('inf'),
            "Dark Roads": float('inf'),
            "Broken Street Lights": float('inf'),
            "Suspicious Activity": float('inf')
        }
        
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
                pts = get_base_points(rtype, current_hour)
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
                
            n_key = None
            if 'harassment' in rtype.lower() or 'stalking' in rtype.lower() or 'molestation' in rtype.lower(): n_key = "Harassment"
            elif 'theft' in rtype.lower() or 'robbery' in rtype.lower() or 'snatching' in rtype.lower(): n_key = "Theft"
            elif 'unsafe' in rtype.lower() or 'isolated' in rtype.lower(): n_key = "Unsafe Roads"
            elif 'dark' in rtype.lower(): n_key = "Dark Roads"
            elif 'street light' in rtype.lower() or 'streetlight' in rtype.lower(): n_key = "Broken Street Lights"
            elif 'suspicious' in rtype.lower(): n_key = "Suspicious Activity"
            
            if n_key:
                nearest_incidents[n_key] = min(nearest_incidents[n_key], int(min_dist))
                
        for k, v in nearest_incidents.items():
            if v == float('inf'): nearest_incidents[k] = -1
                
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
        
        route['current_time'] = local_time_str
        route['road_activity'] = get_road_activity(traffic_data['score'], current_hour)
        route['nearest_incidents'] = nearest_incidents
        
        route['community_reports'] = report_counts
        route['matched_incidents'] = matched_incidents
        route['risk_score'] = community_risk
        route['raw_risk_score'] = raw_risk_score
        route['traffic_data'] = traffic_data
        route['commercial_activity'] = f"{int(avg_comm)} locations nearby"
        route['public_transport'] = f"{int(avg_pt)} stations/stops nearby"
        route['visibility'] = get_visibility_score()
        route['crowd_intelligence_score'] = crowd_intel_score
        
        route['ranking_score'] = route.get('duration_seconds', 0) + raw_risk_score + (congestion_score * 15)
        
        analyzed_routes.append(route)
        
    analyzed_routes.sort(key=lambda x: x['ranking_score'])
    
    for i, route in enumerate(analyzed_routes):
        route['is_recommended'] = (i == 0)

    gemini_explanations = generate_ai_explanation(analyzed_routes, radius)
    
    for route in analyzed_routes:
        if route['id'] in gemini_explanations:
            route['explanation'] = gemini_explanations[route['id']]
        else:
            if route['is_recommended']:
                route['explanation'] = fallback_explanation(route)
            else:
                route['explanation'] = "Alternative route."
            
    return analyzed_routes
