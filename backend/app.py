import os
import io
import json
import zipfile
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, send_file
from werkzeug.utils import secure_filename
from flask_cors import CORS
import sqlite3
from database import init_db, get_db_connection
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

CORS(app)

# Initialize the database on startup
init_db()

def row_to_dict(row):
    return dict(row)

@app.route('/incidents', methods=['GET'])
def get_incidents():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM incident ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        
        incidents = [row_to_dict(row) for row in rows]
        # Convert boolean
        for incident in incidents:
            incident['anonymous'] = bool(incident['anonymous'])
            
        return jsonify(incidents), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/incidents', methods=['POST'])
def create_incident():
    data = request.json
    try:
        incident_type = data.get('incident_type')
        description = data.get('description')
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        severity = data.get('severity')
        image = data.get('image', None)
        anonymous = 1 if data.get('anonymous', False) else 0
        reporter_name = data.get('reporter_name', 'Anonymous')
        
        # Extended Address Fields
        road = data.get('road', '')
        area = data.get('area', '')
        city = data.get('city', '')
        state = data.get('state', '')
        street = data.get('street', '')
        locality = data.get('locality', '')
        neighbourhood = data.get('neighbourhood', '')
        suburb = data.get('suburb', '')
        landmark = data.get('landmark', '')
        postal_code = data.get('postal_code', '')
        country = data.get('country', '')
        
        if not all([incident_type, description, latitude, longitude, severity]):
            return jsonify({"error": "Missing required fields"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO incident (
                incident_type, description, latitude, longitude, severity, image, anonymous, reporter_name, 
                road, area, city, state, street, locality, neighbourhood, suburb, landmark, postal_code, country
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            incident_type, description, latitude, longitude, severity, image, anonymous, reporter_name,
            road, area, city, state, street, locality, neighbourhood, suburb, landmark, postal_code, country
        ))
        
        incident_id = cursor.lastrowid
        
        # Automatically create linked Evidence Case
        vault_title = f"{incident_type} Report"
        vault_address = [landmark, street, area, city, postal_code]
        vault_address = ", ".join([p for p in vault_address if p])
        if not vault_address:
            vault_address = f"Lat: {latitude}, Lon: {longitude}"
            
        # Map severity to priority
        priority_map = {'Low': 'Low', 'Medium': 'Medium', 'High': 'High', 'Critical': 'Critical'}
        vault_priority = priority_map.get(severity, 'Medium')
        
        cursor.execute('''
            INSERT INTO vault_cases (title, incident_type, priority, description, latitude, longitude, address, linked_report_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (vault_title, incident_type, vault_priority, description, latitude, longitude, vault_address, incident_id))
        
        vault_case_id = cursor.lastrowid
        
        cursor.execute('''
            INSERT INTO vault_timeline (case_id, event_description)
            VALUES (?, ?)
        ''', (vault_case_id, f"Case Auto-created from Community Report #{incident_id}"))

        conn.commit()
        
        cursor.execute("SELECT * FROM incident WHERE id = ?", (incident_id,))
        new_incident = cursor.fetchone()
        
        conn.close()
        
        result = row_to_dict(new_incident)
        result['anonymous'] = bool(result['anonymous'])
        
        return jsonify(result), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/incidents/<int:id>/verify', methods=['POST'])
def verify_incident(id):
    data = request.json
    action = data.get('action') # 'verify' or 'disagree'
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, verified_count, disagree_count FROM incident WHERE id = ?", (id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Incident not found"}), 404
            
        if action == 'verify':
            cursor.execute("UPDATE incident SET verified_count = verified_count + 1 WHERE id = ?", (id,))
        elif action == 'disagree':
            cursor.execute("UPDATE incident SET disagree_count = disagree_count + 1 WHERE id = ?", (id,))
        else:
            conn.close()
            return jsonify({"error": "Invalid action"}), 400
            
        conn.commit()
        
        cursor.execute("SELECT * FROM incident WHERE id = ?", (id,))
        updated = cursor.fetchone()
        conn.close()
        
        result = row_to_dict(updated)
        result['anonymous'] = bool(result['anonymous'])
        
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/incidents/<int:id>', methods=['DELETE'])
def delete_incident(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM incident WHERE id = ?", (id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"error": "Incident not found"}), 404
            
        cursor.execute("DELETE FROM incident WHERE id = ?", (id,))
        conn.commit()
        conn.close()
        
        return jsonify({"message": "Incident deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================
# MODULE 4: EMERGENCY EVIDENCE VAULT APIs
# ==========================================================

@app.route('/vault/cases', methods=['GET'])
def get_vault_cases():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get cases with evidence count and type breakdown
        cursor.execute('''
            SELECT c.*, 
                   (SELECT COUNT(*) FROM vault_evidence e WHERE e.case_id = c.id) as evidence_count,
                   (SELECT COUNT(*) FROM vault_evidence e WHERE e.case_id = c.id AND e.file_type = 'image') as image_count,
                   (SELECT COUNT(*) FROM vault_evidence e WHERE e.case_id = c.id AND e.file_type = 'video') as video_count,
                   (SELECT COUNT(*) FROM vault_evidence e WHERE e.case_id = c.id AND e.file_type = 'audio') as audio_count,
                   (SELECT COUNT(*) FROM vault_evidence e WHERE e.case_id = c.id AND e.file_type IN ('document', 'pdf')) as doc_count
            FROM vault_cases c
            ORDER BY c.created_at DESC
        ''')
        cases = [row_to_dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(cases), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/vault/stats', methods=['GET'])
def get_vault_stats():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT file_type, file_path FROM vault_evidence")
        evidence = cursor.fetchall()
        conn.close()
        
        stats = {
            'images': 0,
            'videos': 0,
            'audio': 0,
            'docs': 0,
            'storage_bytes': 0
        }
        
        for ev in evidence:
            t = ev['file_type']
            if t == 'image': stats['images'] += 1
            elif t == 'video': stats['videos'] += 1
            elif t == 'audio': stats['audio'] += 1
            elif t in ('document', 'pdf'): stats['docs'] += 1
            
            path = ev['file_path']
            if os.path.exists(path):
                stats['storage_bytes'] += os.path.getsize(path)
                
        # Format storage
        mb = stats['storage_bytes'] / (1024 * 1024)
        stats['storage'] = f"{mb:.1f} MB"
        
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/vault/cases', methods=['POST'])
def create_vault_case():
    data = request.json
    try:
        title = data.get('title')
        incident_type = data.get('incident_type')
        priority = data.get('priority')
        description = data.get('description', '')
        notes = data.get('notes', '')
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        address = data.get('address', '')
        linked_report_id = data.get('linked_report_id', None)
        
        if not title or not incident_type or not priority:
            return jsonify({"error": "Missing required fields"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO vault_cases (title, incident_type, priority, description, notes, latitude, longitude, address, linked_report_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (title, incident_type, priority, description, notes, latitude, longitude, address, linked_report_id))
        
        case_id = cursor.lastrowid
        
        cursor.execute('''
            INSERT INTO vault_timeline (case_id, event_description)
            VALUES (?, ?)
        ''', (case_id, "Case Created"))
        
        conn.commit()
        
        cursor.execute("SELECT * FROM vault_cases WHERE id = ?", (case_id,))
        new_case = row_to_dict(cursor.fetchone())
        new_case['evidence_count'] = 0
        
        conn.close()
        return jsonify(new_case), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/vault/cases/<int:id>', methods=['GET'])
def get_vault_case(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM vault_cases WHERE id = ?", (id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Case not found"}), 404
            
        case = row_to_dict(row)
        
        cursor.execute("SELECT * FROM vault_evidence WHERE case_id = ? ORDER BY upload_timestamp DESC", (id,))
        case['evidence'] = [row_to_dict(r) for r in cursor.fetchall()]
        
        cursor.execute("SELECT * FROM vault_timeline WHERE case_id = ? ORDER BY timestamp ASC", (id,))
        case['timeline'] = [row_to_dict(r) for r in cursor.fetchall()]
        
        conn.close()
        return jsonify(case), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/vault/cases/<int:id>', methods=['PUT'])
def update_vault_case(id):
    data = request.json
    try:
        status = data.get('status')
        title = data.get('title')
        incident_type = data.get('incident_type')
        priority = data.get('priority')
        description = data.get('description')
        notes = data.get('notes')

        conn = get_db_connection()
        cursor = conn.cursor()
        
        if title and incident_type:
            # Full update
            cursor.execute('''
                UPDATE vault_cases 
                SET title = ?, incident_type = ?, priority = ?, description = ?, notes = ?, status = ? 
                WHERE id = ?
            ''', (title, incident_type, priority, description, notes, status, id))
            event_desc = "Case Details Edited"
        else:
            # Status only update
            cursor.execute("UPDATE vault_cases SET status = ? WHERE id = ?", (status, id))
            event_desc = f"Case Status changed to {status}"
        
        cursor.execute('''
            INSERT INTO vault_timeline (case_id, event_description)
            VALUES (?, ?)
        ''', (id, event_desc))
        
        conn.commit()
        
        cursor.execute("SELECT * FROM vault_cases WHERE id = ?", (id,))
        updated = row_to_dict(cursor.fetchone())
        conn.close()
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/vault/cases/<int:id>', methods=['DELETE'])
def delete_vault_case(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT file_path FROM vault_evidence WHERE case_id = ?", (id,))
        evidence_files = cursor.fetchall()
        
        for ev in evidence_files:
            file_path = ev['file_path']
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    print(f"Error removing file {file_path}: {e}")
                    
        cursor.execute("DELETE FROM vault_cases WHERE id = ?", (id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Case and evidence deleted"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/vault/cases/<int:id>/evidence', methods=['POST'])
def upload_evidence(id):
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    files = request.files.getlist('file')
    file_sizes = request.form.getlist('fileSizes')
    latitude = request.form.get('latitude') or None
    longitude = request.form.get('longitude') or None
    address = request.form.get('address') or None

    if not files or files[0].filename == '':
        return jsonify({"error": "No selected file"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    uploaded_evidence = []
    
    try:
        for i, file in enumerate(files):
            filename = secure_filename(file.filename)
            # Create a unique filename to avoid overwriting
            unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            
            file.save(file_path)
            
            # Determine type
            file_type = 'document'
            mime = file.mimetype
            if mime.startswith('image/'): file_type = 'image'
            elif mime.startswith('video/'): file_type = 'video'
            elif mime.startswith('audio/'): file_type = 'audio'
            elif mime == 'application/pdf': file_type = 'pdf'
            
            size = file_sizes[i] if i < len(file_sizes) else 0
            
            cursor.execute('''
                INSERT INTO vault_evidence (case_id, file_name, file_type, file_path, file_size, latitude, longitude, address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (id, filename, file_type, file_path, size, latitude, longitude, address))
            
            ev_id = cursor.lastrowid
            
            cursor.execute('''
                INSERT INTO vault_timeline (case_id, event_description)
                VALUES (?, ?)
            ''', (id, f"{file_type.title()} uploaded"))
            
            cursor.execute("SELECT * FROM vault_evidence WHERE id = ?", (ev_id,))
            uploaded_evidence.append(row_to_dict(cursor.fetchone()))
            
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500
        
    conn.close()
    return jsonify({"message": "Files uploaded", "evidence": uploaded_evidence}), 201

@app.route('/vault/cases/<int:id>/evidence/<int:ev_id>', methods=['DELETE'])
def delete_evidence(id, ev_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT file_name, file_path FROM vault_evidence WHERE id = ? AND case_id = ?", (ev_id, id))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return jsonify({"error": "Evidence not found"}), 404
            
        file_path = row['file_path']
        file_name = row['file_name']
        
        if os.path.exists(file_path):
            os.remove(file_path)
            
        cursor.execute("DELETE FROM vault_evidence WHERE id = ?", (ev_id,))
        
        cursor.execute('''
            INSERT INTO vault_timeline (case_id, event_description)
            VALUES (?, ?)
        ''', (id, f"Deleted evidence: {file_name}"))
        
        conn.commit()
        conn.close()
        return jsonify({"message": "Evidence deleted"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/vault/cases/<int:id>/export', methods=['GET'])
def export_case(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM vault_cases WHERE id = ?", (id,))
        case_row = cursor.fetchone()
        if not case_row:
            conn.close()
            return jsonify({"error": "Case not found"}), 404
            
        case = row_to_dict(case_row)
        
        cursor.execute("SELECT * FROM vault_evidence WHERE case_id = ?", (id,))
        evidence = [row_to_dict(r) for r in cursor.fetchall()]
        
        cursor.execute("SELECT * FROM vault_timeline WHERE case_id = ? ORDER BY timestamp ASC", (id,))
        timeline = [row_to_dict(r) for r in cursor.fetchall()]
        conn.close()
        
        memory_file = io.BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add metadata JSON
            export_data = {
                "metadata": case,
                "timeline": timeline,
                "evidence_list": evidence
            }
            zf.writestr('case_metadata.json', json.dumps(export_data, indent=4))
            
            # Add text summary
            summary = f"CASE EXPORT: {case['title']}\n"
            summary += f"Status: {case['status']}\nPriority: {case['priority']}\n"
            summary += f"Location: {case['latitude']}, {case['longitude']} ({case['address']})\n"
            summary += f"Description: {case['description']}\n\nTimeline:\n"
            for t in timeline:
                summary += f"[{t['timestamp']}] {t['event_description']}\n"
            zf.writestr('case_summary.txt', summary)
            
            # Add files
            for ev in evidence:
                if os.path.exists(ev['file_path']):
                    # Prepend unique id to avoid filename collisions inside zip if names are same
                    zf.write(ev['file_path'], f"evidence/{ev['id']}_{ev['file_name']}")
                    
        memory_file.seek(0)
        
        return send_file(
            memory_file,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"Case_{id}_Export.zip"
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

from routing_service import get_routes
from traffic_service import get_traffic_status
from intelligence_service import analyze_routes_with_reports

@app.route('/api/intelligence/analyze-routes', methods=['POST'])
def analyze_routes():
    data = request.json
    try:
        start_coords = data.get('start_coords')
        end_coords = data.get('end_coords')
        mode = data.get('mode', 'walking')
        radius = data.get('radius', 500)
        
        if not start_coords or not end_coords:
            return jsonify({"error": "Missing coordinates"}), 400
            
        # 1. Generate Routes
        routes = get_routes(start_coords, end_coords, mode)
        
        # 2. Analyze Traffic
        traffic_status = get_traffic_status(start_coords, end_coords)
        
        # 3. Analyze Community Reports Intersection
        analyzed_routes = analyze_routes_with_reports(routes, radius=radius)
        
        # Inject traffic status into summary
        for r in analyzed_routes:
            r['traffic_status'] = traffic_status
            
        return jsonify({
            "routes": analyzed_routes,
            "overall_traffic": traffic_status
        }), 200
        
    except Exception as e:
        print(f"Analysis Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
