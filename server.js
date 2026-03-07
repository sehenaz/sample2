const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Database Setup
const fs = require('fs');
const persistenceDir = process.env.PERSISTENCE_DIR || __dirname;
if (persistenceDir !== __dirname && !fs.existsSync(persistenceDir)) {
  fs.mkdirSync(persistenceDir, { recursive: true });
}
const dbPath = path.join(persistenceDir, 'attendance.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_id TEXT,
        emp_name TEXT,
        dept TEXT,
        city TEXT,
        date TEXT,
        clock_in TEXT,
        clock_out TEXT,
        work_hours TEXT,
        attendance_type TEXT,
        location TEXT,
        lat REAL,
        lng REAL,
        photo TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    // Migration: Add lat/lng columns if they don't exist
    db.serialize(() => {
      db.all("PRAGMA table_info(attendance)", [], (err, rows) => {
        if (err) return;
        const cols = rows.map(r => r.name);
        if (!cols.includes('lat')) {
          db.run("ALTER TABLE attendance ADD COLUMN lat REAL");
        }
        if (!cols.includes('lng')) {
          db.run("ALTER TABLE attendance ADD COLUMN lng REAL");
        }
      });
    });
  }
});

// API Endpoints

// Save or Update Attendance
app.post('/api/attendance', (req, res) => {
  const { emp_id, emp_name, dept, city, date, clock_in, clock_out, work_hours, attendance_type, location, lat, lng, photo } = req.body;

  if (!emp_id || !date) {
    return res.status(400).json({ error: 'emp_id and date are required' });
  }

  // Check if record exists for this employee and date
  db.get(`SELECT id FROM attendance WHERE emp_id = ? AND date = ?`, [emp_id, date], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (row) {
      // Update existing record
      const updateQuery = `UPDATE attendance SET 
        emp_name = ?, dept = ?, city = ?, clock_in = ?, clock_out = ?, 
        work_hours = ?, attendance_type = ?, location = ?, lat = ?, lng = ?, photo = ?
        WHERE id = ?`;
      db.run(updateQuery, [emp_name, dept, city, clock_in, clock_out, work_hours, attendance_type, location, lat || null, lng || null, photo, row.id], function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Attendance updated successfully', id: row.id });
      });
    } else {
      // Insert new record
      db.run(
        `INSERT INTO attendance (emp_id, emp_name, dept, city, date, clock_in, clock_out, work_hours, attendance_type, location, lat, lng, photo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [emp_id, emp_name, dept, city, date, clock_in, clock_out, work_hours, attendance_type, location, lat, lng, photo],
        function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ message: 'Attendance saved successfully', id: this.lastID });
        });
    }
  });
});

// Get All Attendance (for Admin Dashboard)
app.get('/api/attendance', (req, res) => {
  db.all(`SELECT * FROM attendance ORDER BY date DESC, id DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get Attendance for specific Employee
app.get('/api/attendance/:emp_id', (req, res) => {
  let emp_id = req.params.emp_id;
  // If emp_id looks like a prefix due to a slash in the ID, try to get the full id from the query or a wildcard
  db.all(`SELECT * FROM attendance WHERE emp_id = ? ORDER BY date DESC`, [emp_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Targeted lookup by employee ID (supporting slashes via query param)
app.get('/api/employee-attendance', (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID is required' });
  db.all(`SELECT * FROM attendance WHERE emp_id = ? ORDER BY date DESC`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Serve frontend if needed (optional)
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
