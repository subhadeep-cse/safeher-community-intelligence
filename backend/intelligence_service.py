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
Do NOT invent facts. Only use the structured data provided below to perform a GENUINE COMPARISON between all available routes.

CRITICAL EXPLANATION RULES (STRICTLY FOLLOW THESE):
1. Explain Trade-offs: The explanation must explain TRADE-OFFS. Do not simply repeat numbers. Compare the winning route against the alternatives across multiple factors (Safety, Traffic, Distance, Time). E.g. "Route A is recommended because it achieves the highest Safety Score (90/100). While Routes B and C offer slightly smoother traffic conditions, they also have lower safety scores. Therefore Route A provides the best overall balance."
2. Higher Safety but Worse Traffic: If one route has higher safety but worse traffic, explain BOTH. E.g. "The increase in traffic on Route A is relatively small compared to the safety advantage, making it the best overall choice."
3. Better Traffic but Longer: If one route has better traffic but is longer, explain BOTH. E.g. "Route C offers better traffic flow but requires an additional 7 minutes of travel and a longer distance. Since it provides no additional safety benefit, Route A remains the preferred route."
4. Identical Safety Scores: If two or more routes have identical Safety Scores, NEVER say "Ranked lower due to Safety Score". Instead, explain the actual deciding factor (e.g. "Both routes provide the same safety level. Route A is recommended because it requires less travel time and a shorter travel distance.").
5. Identical Traffic: If traffic is identical between routes, do NOT mention traffic as the deciding factor. Explain whichever factor actually determined the recommendation.
6. Nearly Identical Routes: If every route is almost identical, say so. E.g. "All available routes provide similar levels of safety and traffic conditions. Route A is recommended because it offers the shortest overall journey while maintaining the same level of safety."
7. Provide the output as a valid JSON object where keys are the EXACT Route IDs provided below (e.g. "{analyzed_routes[0]['id']}") and values are the full explanation strings. Do not include markdown formatting like ```json in the output.

Example Output format:
{{
  "{analyzed_routes[0]['id']}": "Route A is recommended because it achieves the highest Safety Score (90/100). While the alternative routes offer slightly smoother traffic conditions, they also have lower safety scores and therefore expose the traveller to greater overall risk. The increase in traffic on this route is relatively small compared to the safety advantage, making it the best overall choice.",
  "tt_route_1": "Although this route offers better traffic flow and a slightly faster driving experience, its Safety Score is lower than the recommended route due to higher overall risk factors. Since the improvement in traffic is not significant enough to justify the reduction in safety, it is ranked below the recommended route."
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

def fallback_explanation(route_data, all_routes):
    is_rec = route_data['is_recommended']
    rec_route = all_routes[0]
    
    score = route_data.get('safety_score_breakdown', {}).get('final_safety_score', 0)
    rec_score = rec_route.get('safety_score_breakdown', {}).get('final_safety_score', 0)
    
    traffic_score = route_data.get('traffic_data', {}).get('score', 0)
    rec_traffic_score = rec_route.get('traffic_data', {}).get('score', 0)
    
    time_mins = math.ceil(route_data.get('duration_seconds', 0) / 60)
    rec_time_mins = math.ceil(rec_route.get('duration_seconds', 0) / 60)
    time_diff = time_mins - rec_time_mins
    
    dist = route_data.get('distance_meters', 0)
    rec_dist = rec_route.get('distance_meters', 0)
    dist_diff = dist - rec_dist

    all_scores = [r.get('safety_score_breakdown', {}).get('final_safety_score', 0) for r in all_routes]
    all_same_safety = len(set(all_scores)) == 1 and len(all_routes) > 1
    max_score = max(all_scores)

    if is_rec:
        if len(all_routes) == 1:
            return "This is the only available route for your destination."
            
        if all_same_safety:
            return "All available routes provide similar levels of safety. This route is recommended because it offers the most efficient journey, requiring the shortest overall travel distance and time."
        
        alts_better_traffic = any(r.get('traffic_data', {}).get('score', 0) > traffic_score for r in all_routes if not r['is_recommended'])
        
        if score == max_score:
            if alts_better_traffic:
                return f"This route is recommended because it provides the highest Safety Score ({score}/100). While alternative routes may offer slightly lighter traffic conditions, the reduction in travel congestion does not compensate for their lower safety scores. Therefore, this route provides the best overall balance."
            else:
                return f"This route is recommended because it provides the highest Safety Score ({score}/100) along with optimal traffic conditions, making it the safest and most efficient choice."
        else:
            return f"This route is recommended because it provides an excellent balance. While another route has a marginally higher Safety Score, it requires significantly more travel time. This route ({score}/100) offers the best combination of safety and practicality."
            
    else:
        if score < rec_score:
            if traffic_score > rec_traffic_score:
                return f"Although this route offers better traffic flow, its Safety Score ({score}/100) is lower than the recommended route due to higher overall risk factors. The improvement in traffic is not significant enough to justify the reduction in safety."
            else:
                return f"This route is ranked lower because it has a lower Safety Score ({score}/100) and offers no improvement in traffic or travel efficiency compared to the recommended route."
        
        elif score == rec_score:
            if traffic_score > rec_traffic_score:
                return f"This route offers better traffic flow but requires an additional {time_diff} minutes of travel and a longer distance. Since it provides no additional safety benefit over the recommended route, it is not preferred."
            else:
                if dist_diff > 0:
                    return f"This route provides the same safety level as the recommended route but is {dist_diff} metres longer without offering any measurable improvement in traffic. Therefore it is ranked lower."
                elif time_diff > 0:
                    return f"This route provides the same safety level as the recommended route but takes {time_diff} minutes longer. Therefore it is ranked lower."
                else:
                    return "This route is nearly identical to the recommended route in safety and traffic, but was ranked slightly lower in internal efficiency calculations."
                    
        else:
            return f"Although this route offers a slightly higher Safety Score ({score}/100), it requires an additional {time_diff} minutes and {dist_diff} metres of travel. The marginal safety benefit does not justify the significant drop in travel efficiency, so it is ranked below the recommended route."

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
            # Exclude first and last 5% of points (if enough points exist) 
            # to ensure unique middle sections determine route differences.
            trim_idx = max(1, len(path) // 20)
            search_path = path[trim_idx:-trim_idx] if len(path) > 20 else path
            
            for point in search_path:
                dist = haversine(rlat, rlon, point[0], point[1])
                if dist < min_dist:
                    min_dist = dist
                    
            weight = get_time_weight(rdate)
            pts = get_base_points(rtype, current_hour)
            
            # Continuous Risk Math - Applied to ALL incidents
            decay_factor = 200.0 / (min_dist + 200.0)
            raw_risk_score += (pts * weight * decay_factor)
            
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
                
        import math
        
        # Base safety score starts at 95.
        base_score = 95.0
        
        # 1. Incident Penalty: Asymptotically map raw_risk_score to a penalty between 0 and 70
        incident_penalty = 70.0 * (1.0 - math.exp(-raw_risk_score / 1500.0))
        
        # 2. Traffic Analysis
        traffic_data = analyze_route_traffic(path)
        congestion_score = 100 - traffic_data['score'] 
        
        # Road Activity (influences safety independently of traffic)
        road_activity_str = get_road_activity(traffic_data['score'], current_hour)
        if "Busy" in road_activity_str:
            activity_modifier = 2.0
        elif "Isolated" in road_activity_str:
            activity_modifier = -8.0
        elif "Relatively Quiet" in road_activity_str:
            activity_modifier = -3.0
        else:
            activity_modifier = 0.0
        
        # 3. POI Analysis (Commercial & Public Transport)
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
        
        # 4. Time of Day
        time_data = get_time_of_day_score()
        time_score = time_data['score']
        
        # Dynamic Time Modifier: Depends on hour, activity, and incidents.
        time_modifier = 0.0
        if current_hour >= 21 or current_hour < 6:
            time_modifier -= 5.0
            if "Isolated" in road_activity_str:
                time_modifier -= 3.0
            if incident_penalty > 10.0:
                time_modifier -= 4.0
            if "Busy" in road_activity_str and incident_penalty < 5.0:
                time_modifier = 0.0 
        elif 6 <= current_hour < 12: 
            time_modifier += 2.0
        
        # Calculate Final Continuous Safety Score (Traffic removed, replaced with Activity)
        final_safety_score = base_score - incident_penalty + activity_modifier + time_modifier
        final_safety_score = max(20.0, min(95.0, final_safety_score))
        
        route['safety_score_breakdown'] = {
            "base_score": 95,
            "incident_penalty": -int(round(incident_penalty)),
            "activity_modifier": int(round(activity_modifier)),
            "time_modifier": int(round(time_modifier)),
            "final_safety_score": int(round(final_safety_score))
        }
        
        community_risk = 100 - int(round(final_safety_score))
        
        if final_safety_score >= 80:
            risk_category = "Safe"
        elif final_safety_score >= 60:
            risk_category = "Moderate Risk"
        elif final_safety_score >= 40:
            risk_category = "Elevated Risk"
        else:
            risk_category = "High Risk"
        
        crowd_intel_score = (congestion_score * 0.60) + (community_risk * 0.15) + (comm_score * 0.10) + (pt_score * 0.10) + (time_score * 0.05)
        crowd_intel_score = int(round(crowd_intel_score))
        
        route['current_time'] = local_time_str
        route['road_activity'] = road_activity_str
        route['nearest_incidents'] = nearest_incidents
        route['risk_category'] = risk_category
        
        route['community_reports'] = report_counts
        route['matched_incidents'] = matched_incidents
        route['risk_score'] = community_risk
        route['raw_risk_score'] = raw_risk_score
        route['traffic_data'] = traffic_data
        route['commercial_activity'] = f"{int(avg_comm)} locations nearby"
        route['public_transport'] = f"{int(avg_pt)} stations/stops nearby"
        route['visibility'] = get_visibility_score()
        route['crowd_intelligence_score'] = crowd_intel_score
        
        time_score_penalty = route.get('duration_seconds', 0)
        distance_score_penalty = route.get('distance_meters', 0) / 10.0
        traffic_score_penalty = congestion_score * 10
        
        safety_drop = 95.0 - final_safety_score
        safety_score_penalty = (safety_drop * 20) + (time_score_penalty * (safety_drop / 100.0))
        
        route['ranking_score'] = time_score_penalty + distance_score_penalty + traffic_score_penalty + safety_score_penalty
        
        analyzed_routes.append(route)
        
    analyzed_routes.sort(key=lambda x: x['ranking_score'])
    
    for i, route in enumerate(analyzed_routes):
        route['is_recommended'] = (i == 0)

    gemini_explanations = generate_ai_explanation(analyzed_routes, radius)
    
    for route in analyzed_routes:
        if route['id'] in gemini_explanations:
            route['explanation'] = gemini_explanations[route['id']]
        else:
            route['explanation'] = fallback_explanation(route, analyzed_routes)
            
    return analyzed_routes
