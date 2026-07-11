from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from database import init_db, get_db_connection

app = Flask(__name__)
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
        
        conn.commit()
        incident_id = cursor.lastrowid
        
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
