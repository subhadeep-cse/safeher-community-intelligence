import math
from database import get_db_connection

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi_1 = math.radians(lat1)
    phi_2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi_1) * math.cos(phi_2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def analyze_routes_with_reports(routes):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT incident_type, latitude, longitude FROM incident WHERE status = 'Active'")
        reports = cursor.fetchall()
        conn.close()
    except Exception as e:
        print(f"Error fetching reports: {e}")
        reports = []
    
    analyzed_routes = []
    
    for route in routes:
        path = route.get('path', [])
        
        report_counts = {
            "Total": 0,
            "Harassment": 0,
            "Theft": 0,
            "Broken Street Lights": 0,
            "Unsafe Roads": 0,
            "Suspicious Activity": 0,
            "Other": 0
        }
        
        for report in reports:
            rtype = report['incident_type']
            rlat = report['latitude']
            rlon = report['longitude']
            
            is_near = False
            # Check distance to points on the path (simplified point-to-point)
            # Sample every Nth point for performance if path is huge, but usually fine
            for point in path:
                dist = haversine(rlat, rlon, point[0], point[1])
                if dist <= 150:  # 150 meters radius
                    is_near = True
                    break
                    
            if is_near:
                report_counts["Total"] += 1
                if rtype in report_counts:
                    report_counts[rtype] += 1
                else:
                    report_counts["Other"] += 1
                    
        route['community_reports'] = report_counts
        analyzed_routes.append(route)
        
    return analyzed_routes
