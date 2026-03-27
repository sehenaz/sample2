const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Database Setup
const persistenceDir = process.env.PERSISTENCE_DIR || __dirname;
if (persistenceDir !== __dirname && !fs.existsSync(persistenceDir)) {
  fs.mkdirSync(persistenceDir, { recursive: true });
}

// Uploads Directory Setup
const uploadsDir = path.join(persistenceDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', (req, res) => {
  res.status(404).send(`
    <html>
    <head><title>Document Not Found</title></head>
    <body style="font-family: 'Segoe UI', sans-serif; text-align: center; padding: 50px; background: #f5f7fa;">
      <div style="background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
        <h2 style="color: #c62828; margin-top: 0;">📄 Document Missing</h2>
        <p style="color: #333;">The requested PDF file could not be found on the server.</p>
        <p style="color: #888; font-size: 13px;">Reason: This employee was likely registered when the server was offline, or the physical file has since been deleted from the hard drive.</p>
        <button onclick="window.close()" style="background: #3f51b5; color: white; padding: 10px 20px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-top: 20px;">Go Back / Close Page</button>
      </div>
    </body>
    </html>
  `);
});

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

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

    // Create employees table for registration data
    db.run(`CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_id TEXT UNIQUE,
        employee_name TEXT,
        employee_email TEXT,
        phone_number TEXT,
        alternative_phone TEXT,
        dob TEXT,
        age TEXT,
        marital_status TEXT,
        blood_group TEXT,
        address TEXT,
        nominee_name TEXT,
        nominee_phone TEXT,
        bank_name TEXT,
        branch_name TEXT,
        account_number TEXT,
        ifsc_code TEXT,
        branch_code TEXT,
        upi_id TEXT,
        employee_type TEXT,
        salary TEXT,
        designation TEXT,
        joining_date TEXT,
        work_location TEXT,
        cv_resume TEXT,
        id_proof TEXT,
        bank_passbook TEXT,
        marksheet TEXT,
        appointment_letter TEXT,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

    // Migration: Add columns if they don't exist
    db.serialize(() => {
      // Attendance migrations
      db.all("PRAGMA table_info(attendance)", [], (err, rows) => {
        if (err) return;
        const cols = rows.map(r => r.name);
        if (!cols.includes('lat')) db.run("ALTER TABLE attendance ADD COLUMN lat REAL");
        if (!cols.includes('lng')) db.run("ALTER TABLE attendance ADD COLUMN lng REAL");
      });

      // Employees migrations
      db.all("PRAGMA table_info(employees)", [], (err, rows) => {
        if (err) return;
        const cols = rows.map(r => r.name);
        const docCols = ['cv_resume', 'id_proof', 'bank_passbook', 'marksheet', 'appointment_letter'];
        docCols.forEach(col => {
          if (!cols.includes(col)) {
            db.run(`ALTER TABLE employees ADD COLUMN ${col} TEXT`);
          }
        });
      });
    });
  }
});

// API Endpoints

// ========================
// EMPLOYEE REGISTRATION
// ========================

// Register a new Employee (Multipart for weights)
app.post('/api/register', upload.fields([
  { name: 'cvResume', maxCount: 1 },
  { name: 'idProof', maxCount: 1 },
  { name: 'bankPassbook', maxCount: 1 },
  { name: 'marksheet', maxCount: 1 },
  { name: 'appointmentLetter', maxCount: 1 }
]), (req, res) => {
  const {
    employeeId, employeeName, employeeEmail, phoneNumber, alternativePhone,
    dob, age, maritalStatus, bloodGroup, address,
    nomineeName, nomineePhone, bankName, branchName,
    accountNumber, ifscCode, branchCode, upiId,
    employeeType, salary, designation, joiningDate, workLocation
  } = req.body;

  console.log(`[Registration] Attempting to register ${employeeName} (${employeeEmail})`);

  if (!employeeName || !employeeEmail) {
    return res.status(400).json({ error: 'Employee name and email are required' });
  }

  const emp_id = employeeId || `MEV/${Math.floor(Math.random() * 999) + 100}/2025`;

  // Get file paths
  const cv_resume = req.files['cvResume'] ? `/uploads/${req.files['cvResume'][0].filename}` : null;
  const id_proof = req.files['idProof'] ? `/uploads/${req.files['idProof'][0].filename}` : null;
  const bank_passbook = req.files['bankPassbook'] ? `/uploads/${req.files['bankPassbook'][0].filename}` : null;
  const marksheet = req.files['marksheet'] ? `/uploads/${req.files['marksheet'][0].filename}` : null;
  const appointment_letter = req.files['appointmentLetter'] ? `/uploads/${req.files['appointmentLetter'][0].filename}` : null;

  db.run(
    `INSERT OR REPLACE INTO employees (
      emp_id, employee_name, employee_email, phone_number, alternative_phone,
      dob, age, marital_status, blood_group, address,
      nominee_name, nominee_phone, bank_name, branch_name,
      account_number, ifsc_code, branch_code, upi_id,
      employee_type, salary, designation, joining_date, work_location,
      cv_resume, id_proof, bank_passbook, marksheet, appointment_letter
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      emp_id, employeeName, employeeEmail, phoneNumber, alternativePhone,
      dob, age, maritalStatus, bloodGroup, address,
      nomineeName, nomineePhone, bankName, branchName,
      accountNumber, ifscCode, branchCode, upiId,
      employeeType, salary, designation, joiningDate, workLocation,
      cv_resume, id_proof, bank_passbook, marksheet, appointment_letter
    ],
    function (err) {
      if (err) {
        console.error(`[Registration] Error: ${err.message}`);
        return res.status(500).json({ error: err.message });
      }
      console.log(`[Registration] Success: ${emp_id} (rowId: ${this.lastID})`);
      
      // Return the full record so frontend can sync localStorage correctly
      db.get(`SELECT * FROM employees WHERE emp_id = ?`, [emp_id], (err, row) => {
        if (err) return res.json({ message: 'Employee registered successfully', id: emp_id });
        res.json({ message: 'Employee registered successfully', id: emp_id, employee: row });
      });
    }
  );
});

// Get All Registered Employees (for Admin History Page)
app.get('/api/employees', (req, res) => {
  db.all(`SELECT * FROM employees ORDER BY registered_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Delete an Employee
app.delete('/api/employees/:emp_id', (req, res) => {
  const emp_id = req.params.emp_id;
  db.run(`DELETE FROM employees WHERE emp_id = ?`, [emp_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Employee deleted', changes: this.changes });
  });
});

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

// Serve frontend if needed
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

