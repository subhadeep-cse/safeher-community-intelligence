import os
import requests
import time

_TRAFFIC_CACHE = {}
CACHE_TTL = 300 # 5 minutes

def get_traffic_flow(lat, lon):
    # Cache based on coordinate rounded to 3 decimal places (approx 111 meters)
    cache_key = f"{round(lat, 3)},{round(lon, 3)}"
    now = time.time()
    
    if cache_key in _TRAFFIC_CACHE:
        if now - _TRAFFIC_CACHE[cache_key]['timestamp'] < CACHE_TTL:
            return _TRAFFIC_CACHE[cache_key]['data']
            
    tomtom_key = os.environ.get("TOMTOM_API_KEY")
    if not tomtom_key:
        return None
        
    try:
        url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={lat},{lon}&key={tomtom_key}"
        response = requests.get(url, timeout=2)
        if response.status_code == 200:
            data = response.json()
            flow = data.get('flowSegmentData', {})
            _TRAFFIC_CACHE[cache_key] = {
                'timestamp': now,
                'data': flow
            }
            return flow
    except Exception as e:
        print(f"Traffic flow check failed for {lat},{lon}: {e}")
        
    return None

def analyze_route_traffic(route_path):
    if not route_path:
        return {"score": 50, "status": "Unknown", "color": "blue", "details": {}, "segments": []}
        
    num_samples = min(5, len(route_path))
    
    total_current_speed = 0
    total_free_speed = 0
    valid_samples = 0
    
    segments = []
    chunk_size = max(1, len(route_path) // num_samples)
    
    for i in range(num_samples):
        start_idx = i * chunk_size
        # Make sure the end_idx extends a bit to connect segments (overlap by 1 point if possible)
        end_idx = start_idx + chunk_size + 1 if i < num_samples - 1 else len(route_path)
        chunk_path = route_path[start_idx:end_idx]
        if not chunk_path: continue
        
        mid_idx = start_idx + len(chunk_path) // 2
        if mid_idx >= len(route_path): mid_idx = len(route_path) - 1
        pt = route_path[mid_idx]
        
        flow = get_traffic_flow(pt[0], pt[1])
        seg_color = "green" # default
        if flow:
            total_current_speed += flow.get('currentSpeed', 0)
            total_free_speed += flow.get('freeFlowSpeed', 0)
            valid_samples += 1
            ratio = flow.get('currentSpeed', 1) / max(1, flow.get('freeFlowSpeed', 1))
            if ratio < 0.4: seg_color = "red"
            elif ratio < 0.6: seg_color = "orange"
            elif ratio < 0.8: seg_color = "yellow"
            
        seg_data = {
            "path": chunk_path,
            "color": seg_color,
            "flow_data": None
        }
        
        if flow:
            seg_data["flow_data"] = {
                "currentSpeed": flow.get('currentSpeed'),
                "freeFlowSpeed": flow.get('freeFlowSpeed'),
                "confidence": flow.get('confidence', 1.0),
                "timestamp": time.time()
            }
            
        segments.append(seg_data)
            
    if valid_samples == 0:
        return {"score": 50, "status": "Clear Traffic (Estimated)", "color": "green", "details": {"congestion_ratio": 1.0}, "segments": segments}
        
    avg_current = total_current_speed / valid_samples
    avg_free = total_free_speed / valid_samples
    
    congestion_ratio = avg_current / max(1, avg_free)
    # Higher score = better traffic (less crowded)
    score = min(100, int(congestion_ratio * 100))
    
    if score >= 80:
        status = "Free Flow"
        traffic_color = "green"
    elif score >= 60:
        status = "Moderate Traffic"
        traffic_color = "yellow"
    elif score >= 40:
        status = "Heavy Traffic"
        traffic_color = "orange"
    else:
        status = "Severe Congestion"
        traffic_color = "red"
        
    return {
        "score": score,
        "status": status,
        "color": traffic_color,
        "segments": segments,
        "details": {
            "avg_current_speed": round(avg_current, 1),
            "avg_free_flow_speed": round(avg_free, 1),
            "congestion_ratio": round(congestion_ratio, 2)
        }
    }

def get_traffic_status(start_coords, end_coords):
    # Keep this for overall general status if needed
    mid_lat = (start_coords[0] + end_coords[0]) / 2.0
    mid_lon = (start_coords[1] + end_coords[1]) / 2.0
    flow = get_traffic_flow(mid_lat, mid_lon)
    if flow:
        curr = flow.get('currentSpeed', 1)
        free = flow.get('freeFlowSpeed', 1)
        ratio = curr / max(1, free)
        if ratio < 0.4:
            return "Severe Congestion (Red)"
        elif ratio < 0.6:
            return "Heavy Traffic (Orange)"
        elif ratio < 0.8:
            return "Moderate Traffic (Yellow)"
        return "Free Flow (Green)"
    return "Traffic data unavailable"
