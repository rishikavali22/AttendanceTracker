from datetime import date
import calendar
import json
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174",
    "http://127.0.0.1:5174"])

DB_PATH = Path(__file__).resolve().parent / "attendance.db"

def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with connect_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                attendance_date TEXT NOT NULL,
                status REAL NOT NULL CHECK(status >= 0 AND status <= 24),
                periods TEXT,
                UNIQUE(student_id, attendance_date),
                FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
            )
        """)
        cols = [r[1] for r in conn.execute("PRAGMA table_info(attendance)").fetchall()]
        if "periods" not in cols:
            conn.execute("ALTER TABLE attendance ADD COLUMN periods TEXT")

init_db()

@app.get("/")
def home():
    return jsonify({"message": "Attendance backend is running"})

@app.get("/api/students")
def get_students():
    with connect_db() as conn:
        rows = conn.execute("SELECT id, name FROM students ORDER BY name").fetchall()
    return jsonify([dict(row) for row in rows])

@app.post("/api/students")
def add_student():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify({"error": "Student name is required"}), 400
    if len(name) > 100:
        return jsonify({"error": "Student name must be 100 characters or fewer"}), 400
    try:
        with connect_db() as conn:
            cursor = conn.execute("INSERT INTO students(name) VALUES (?)", (name,))
            student = conn.execute(
                "SELECT id, name FROM students WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return jsonify(dict(student)), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "That student already exists"}), 409

@app.delete("/api/students/<int:student_id>")
def delete_student(student_id):
    with connect_db() as conn:
        cursor = conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
        if cursor.rowcount == 0:
            return jsonify({"error": "Student not found"}), 404
    return "", 204

@app.get("/api/attendance")
def get_attendance():
    try:
        month = int(request.args.get("month", date.today().month))
        year = int(request.args.get("year", date.today().year))
        default_hours = float(request.args.get("default_hours", 1))
        if not 1 <= month <= 12 or not 2000 <= year <= 2100 or default_hours < 0:
            raise ValueError
        if default_hours.is_integer():
            default_hours = int(default_hours)
    except ValueError:
        return jsonify({"error": "Enter a valid month, year, and default_hours"}), 400

    days_in_month = calendar.monthrange(year, month)[1]
    month_prefix = f"{year:04d}-{month:02d}-"

    with connect_db() as conn:
        students = conn.execute("SELECT id, name FROM students ORDER BY name").fetchall()
        records = conn.execute(
            """SELECT student_id, attendance_date, status, periods FROM attendance
               WHERE attendance_date LIKE ?""",
            (month_prefix + "%",)
        ).fetchall()

    records_by_student = {}
    periods_by_student = {}
    for row in records:
        day = int(row["attendance_date"][-2:])
        records_by_student.setdefault(row["student_id"], {})[day] = row["status"]
        if row["periods"]:
            try:
                parsed_p = json.loads(row["periods"]) if isinstance(row["periods"], str) else row["periods"]
            except Exception:
                parsed_p = row["periods"]
            periods_by_student.setdefault(row["student_id"], {})[day] = parsed_p

    result = []
    for student in students:
        daily = records_by_student.get(student["id"], {})
        daily_periods = periods_by_student.get(student["id"], {})
        attendance_map = {str(day): daily.get(day, default_hours) for day in range(1, days_in_month + 1)}
        present_count = sum(status > 0 for status in attendance_map.values())
        total_hours = sum(status for status in attendance_map.values())
        marked_count = len(daily)
        total_possible = days_in_month * default_hours
        result.append({
            "id": student["id"],
            "name": student["name"],
            "attendance": attendance_map,
            "periods": {str(day): daily_periods.get(day) for day in range(1, days_in_month + 1) if day in daily_periods},
            "present_days": present_count,
            "total_hours": total_hours,
            "marked_days": marked_count,
            "total_days": days_in_month,
            "percentage": round(total_hours / total_possible * 100, 1) if total_possible > 0 else 0.0
        })

    return jsonify({
        "month": month,
        "year": year,
        "total_days": days_in_month,
        "default_hours": default_hours,
        "students": result
    })

@app.put("/api/attendance")
def update_attendance():
    data = request.get_json(silent=True) or {}
    try:
        student_id = int(data["student_id"])
        attendance_date = date.fromisoformat(str(data["attendance_date"]))
        status = float(data["status"])
        periods_val = data.get("periods")
        if periods_val is not None and not isinstance(periods_val, str):
            periods_val = json.dumps(periods_val)
        if status < 0 or status > 24:
            raise ValueError
        if status.is_integer():
            status = int(status)
    except (KeyError, ValueError, TypeError):
        return jsonify({
            "error": "Send student_id, attendance_date (YYYY-MM-DD), and status (0 to 24 hours)"
        }), 400

    with connect_db() as conn:
        student = conn.execute("SELECT id FROM students WHERE id = ?", (student_id,)).fetchone()
        if student is None:
            return jsonify({"error": "Student not found"}), 404
        conn.execute("""
            INSERT INTO attendance(student_id, attendance_date, status, periods)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(student_id, attendance_date)
            DO UPDATE SET status = excluded.status, periods = excluded.periods
        """, (student_id, attendance_date.isoformat(), status, periods_val))

    return jsonify({
        "student_id": student_id,
        "attendance_date": attendance_date.isoformat(),
        "status": status,
        "periods": data.get("periods")
    })

@app.post("/api/attendance/bulk")
def bulk_update_attendance():
    items = request.get_json(silent=True) or []
    if not isinstance(items, list):
        return jsonify({"error": "Expected a list of attendance records"}), 400

    with connect_db() as conn:
        for item in items:
            try:
                sid = int(item["student_id"])
                adate = date.fromisoformat(str(item["attendance_date"])).isoformat()
                status = float(item["status"])
                if status.is_integer():
                    status = int(status)
                periods_val = item.get("periods")
                if periods_val is not None and not isinstance(periods_val, str):
                    periods_val = json.dumps(periods_val)
                conn.execute("""
                    INSERT INTO attendance(student_id, attendance_date, status, periods)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(student_id, attendance_date)
                    DO UPDATE SET status = excluded.status, periods = excluded.periods
                """, (sid, adate, status, periods_val))
            except Exception:
                continue

    return jsonify({"message": f"Updated {len(items)} records"})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
