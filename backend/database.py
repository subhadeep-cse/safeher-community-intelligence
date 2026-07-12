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
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vault_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            incident_type TEXT NOT NULL,
            priority TEXT NOT NULL,
            description TEXT,
            notes TEXT,
            latitude REAL,
            longitude REAL,
            address TEXT,
            status TEXT DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            linked_report_id INTEGER
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vault_evidence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(case_id) REFERENCES vault_cases(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vault_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            event_description TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(case_id) REFERENCES vault_cases(id) ON DELETE CASCADE
        )
    ''')
    
    # Check if new columns exist in existing table (Migration logic)
    cursor.execute("PRAGMA table_info(incident)")
    columns = [info['name'] for info in cursor.fetchall()]
    
    new_columns = ['street', 'locality', 'neighbourhood', 'suburb', 'landmark', 'postal_code', 'country']
    for col in new_columns:
        if col not in columns:
            cursor.execute(f"ALTER TABLE incident ADD COLUMN {col} TEXT")

    # Migration for vault_cases
    cursor.execute("PRAGMA table_info(vault_cases)")
    vault_columns = [info['name'] for info in cursor.fetchall()]
    if 'linked_report_id' not in vault_columns:
        cursor.execute("ALTER TABLE vault_cases ADD COLUMN linked_report_id INTEGER")

    # Migration for vault_evidence
    cursor.execute("PRAGMA table_info(vault_evidence)")
    evidence_columns = [info['name'] for info in cursor.fetchall()]
    if 'file_size' not in evidence_columns:
        cursor.execute("ALTER TABLE vault_evidence ADD COLUMN file_size INTEGER")
    if 'latitude' not in evidence_columns:
        cursor.execute("ALTER TABLE vault_evidence ADD COLUMN latitude REAL")
    if 'longitude' not in evidence_columns:
        cursor.execute("ALTER TABLE vault_evidence ADD COLUMN longitude REAL")
    if 'address' not in evidence_columns:
        cursor.execute("ALTER TABLE vault_evidence ADD COLUMN address TEXT")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
