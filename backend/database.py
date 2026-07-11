import sqlite3
import os
from datetime import datetime

DB_FILE = "safeher.db"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS incident (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_type TEXT NOT NULL,
            description TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            severity TEXT NOT NULL,
            image TEXT,
            verified_count INTEGER DEFAULT 0,
            anonymous BOOLEAN NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'Active',
            reporter_name TEXT DEFAULT 'Anonymous',
            road TEXT,
            area TEXT,
            city TEXT,
            state TEXT,
            disagree_count INTEGER DEFAULT 0,
            street TEXT,
            locality TEXT,
            neighbourhood TEXT,
            suburb TEXT,
            landmark TEXT,
            postal_code TEXT,
            country TEXT
        )
    ''')
    
    # Check if new columns exist in existing table (Migration logic)
    cursor.execute("PRAGMA table_info(incident)")
    columns = [info['name'] for info in cursor.fetchall()]
    
    new_columns = ['street', 'locality', 'neighbourhood', 'suburb', 'landmark', 'postal_code', 'country']
    for col in new_columns:
        if col not in columns:
            cursor.execute(f"ALTER TABLE incident ADD COLUMN {col} TEXT")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
