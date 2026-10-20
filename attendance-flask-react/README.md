# Attendance Dashboard — React + Python Flask

## Requirements
- Python 3.10 or newer
- Node.js and npm

## Start Python backend (Terminal 1, Windows PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```
The backend runs at http://127.0.0.1:5000. The SQLite database is created automatically as `backend/attendance.db`.

If PowerShell blocks activation, use:
```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

## Start React frontend (Terminal 2)
Open a second terminal in the `frontend` folder:
```powershell
npm install
npm run dev
```
Open the local URL Vite prints, typically http://localhost:5173.

## API endpoints
- `GET /api/students` — list students
- `POST /api/students` — add a student with `{"name":"Alice"}`
- `DELETE /api/students/<id>` — delete a student and attendance
- `GET /api/attendance?month=1&year=2026` — get the month grid
- `PUT /api/attendance` — save status using `{"student_id":1,"attendance_date":"2026-01-01","status":1}`

## Behavior
- The UI preserves the original numbered attendance grid: 1 = present, 0 = absent.
- New days are initialized as present to match the user's original React behavior. Change this default if you prefer unmarked days.
- Monthly attendance percentage uses all calendar days in the month, matching the original frontend calculation.
- Student names are entered separated by commas so names containing spaces are supported.
- This starter project has no login/authentication. Add access controls before using it with sensitive real student data on a public server.
