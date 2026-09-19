/**
 * /api/fees — fee structures, assignments to students, payments, balances.
 * Parents see only their children's fees; students see nothing sensitive
 * unless the school explicitly shares it (we expose a summary to students
 * of their own balance — configurable via FEES_STUDENT_VISIBLE env, default on).
 */
const express = require('express');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole, requireStaffAdmin } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notify } = require('../services/notify');
const { classIdsForParentUserId, studentIdsForClass } = require('../services/permissions');

// ---------------------------------------------------------------------------
// Fee structures (admin)
// ---------------------------------------------------------------------------

/** GET /api/fees/structures */
router.get('/structures', authenticate, requireStaffAdmin, (req, res) => {
  const academicYear = cleanString(req.query.academicYear, 20);
  const rows = all(
    `SELECT f.*, (SELECT COUNT(*) FROM student_fees sf WHERE sf.fee_structure_id = f.id) AS assigned_count
     FROM fee_structures f ORDER BY f.id DESC`
  );
  const structures = academicYear ? rows.filter((r) => r.academic_year === academicYear) : rows;
  res.json({ structures });
});

/** POST /api/fees/structures — create + optionally auto-assign to a class. */
router.post('/structures', authenticate, requireStaffAdmin, (req, res) => {
  const name = cleanString(req.body.name, 200);
  const amount = parseFloat(req.body.amount);
  const academicYear = cleanString(req.body.academicYear, 20) || '2026';
  const term = cleanString(req.body.term, 60);
  const classId = asInt(req.body.classId); // null = all classes
  const assign = !!req.body.assign; // auto-assign to current students

  if (!name || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Valid name and amount are required.' });
  if (classId && !get('SELECT id FROM classes WHERE id = ?', [classId])) return res.status(404).json({ error: 'Class not found.' });

  const info = run(
    'INSERT INTO fee_structures (name, amount, academic_year, term, class_id) VALUES (?, ?, ?, ?, ?)',
    [name, amount, academicYear, term || null, classId || null]
  );
  let assigned = 0;
  if (assign) {
    tx(() => {
      const targetClassIds = classId ? [classId] : all('SELECT id FROM classes WHERE academic_year = ?', [academicYear]).map((r) => r.id);
      for (const cid of targetClassIds) {
        for (const sid of studentIdsForClass(cid)) {
          run('INSERT OR IGNORE INTO student_fees (student_id, fee_structure_id, amount) VALUES (?, ?, ?)', [sid, info.lastInsertRowid, amount]);
          assigned++;
        }
      }
    });
  }
  log(req.user, 'FEE_STRUCTURE_CREATED', `Created fee structure "${name}" (${amount}) ${assigned ? 'assigned to ' + assigned + ' students' : ''}`, req.ip);
  res.status(201).json({ message: 'Fee structure created.', structure: get('SELECT * FROM fee_structures WHERE id = ?', [info.lastInsertRowid]), assigned });
});

/** PUT /api/fees/structures/:id */
router.put('/structures/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const f = get('SELECT * FROM fee_structures WHERE id = ?', [id]);
  if (!f) return res.status(404).json({ error: 'Fee structure not found.' });
  const name = cleanString(req.body.name, 200) || f.name;
  const amount = req.body.amount !== undefined && req.body.amount !== '' && req.body.amount !== null ? parseFloat(req.body.amount) : f.amount;
  const term = req.body.term !== undefined ? cleanString(req.body.term, 60) : f.term;
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Valid amount is required.' });
  run('UPDATE fee_structures SET name = ?, amount = ?, term = ? WHERE id = ?', [name, amount, term, id]);
  log(req.user, 'FEE_STRUCTURE_UPDATED', `Updated fee structure "${name}"`, req.ip);
  res.json({ message: 'Fee structure updated.' });
});

/** DELETE /api/fees/structures/:id */
router.delete('/structures/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const f = get('SELECT * FROM fee_structures WHERE id = ?', [id]);
  if (!f) return res.status(404).json({ error: 'Fee structure not found.' });
  tx(() => {
    run('DELETE FROM student_fees WHERE fee_structure_id = ?', [id]);
    run('DELETE FROM fee_structures WHERE id = ?', [id]);
  });
  log(req.user, 'FEE_STRUCTURE_DELETED', `Deleted fee structure "${f.name}"`, req.ip);
  res.json({ message: 'Fee structure deleted.' });
});

// ---------------------------------------------------------------------------
// Assign fees to students
// ---------------------------------------------------------------------------

/** POST /api/fees/assign — assign a structure to students. body: {structureId, studentIds[]} */
router.post('/assign', authenticate, requireStaffAdmin, (req, res) => {
  const structureId = asInt(req.body.structureId);
  const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.map(asInt).filter(Boolean) : [];
  const f = get('SELECT * FROM fee_structures WHERE id = ?', [structureId]);
  if (!f) return res.status(404).json({ error: 'Fee structure not found.' });
  if (!studentIds.length) return res.status(400).json({ error: 'Select at least one student.' });
  let assigned = 0;
  tx(() => {
    for (const sid of studentIds) {
      if (!get('SELECT id FROM students WHERE id = ?', [sid])) continue;
      run('INSERT OR IGNORE INTO student_fees (student_id, fee_structure_id, amount) VALUES (?, ?, ?)', [sid, structureId, f.amount]);
      assigned++;
    }
  });
  log(req.user, 'FEE_ASSIGNED', `Assigned "${f.name}" to ${assigned} students`, req.ip);
  res.json({ message: `Fee assigned to ${assigned} student${assigned === 1 ? '' : 's'}.`, assigned });
});

// ---------------------------------------------------------------------------
// Student fee view + payments
// ---------------------------------------------------------------------------

function studentFeeSummary(studentId) {
  const fees = all(
    `SELECT sf.id, sf.amount AS due_amount, f.name, f.academic_year, f.term
     FROM student_fees sf JOIN fee_structures f ON f.id = sf.fee_structure_id
     WHERE sf.student_id = ? ORDER BY f.id DESC`, [studentId]
  );
  const payments = all(
    'SELECT * FROM fee_payments WHERE student_id = ? ORDER BY paid_at DESC', [studentId]
  );
  const totalDue = fees.reduce((s, x) => s + x.due_amount, 0);
  const totalPaid = payments.reduce((s, x) => s + x.amount, 0);
  return {
    fees,
    payments,
    totalDue: Math.round(totalDue * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    balance: Math.round((totalDue - totalPaid) * 100) / 100,
  };
}

/** GET /api/fees/student/:studentId — fees + payments + balance. */
router.get('/student/:studentId', authenticate, (req, res) => {
  const studentId = asInt(req.params.studentId);
  const s = get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!s) return res.status(404).json({ error: 'Student not found.' });

  let allowed = ['super_admin', 'admin'].includes(req.user.role);
  if (!allowed && req.user.role === 'parent') {
    allowed = !!get(
      'SELECT 1 FROM parent_students ps WHERE ps.student_id = ? AND ps.parent_id = (SELECT id FROM parents WHERE user_id = ?)',
      [studentId, req.user.id]
    );
  }
  if (!allowed && req.user.role === 'student') {
    const me = get('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
    allowed = me && me.id === studentId;
  }
  if (!allowed) return res.status(403).json({ error: 'You do not have access to this student\'s fee information.' });

  const summary = studentFeeSummary(studentId);
  const { studentId: _omit, ...rest } = summary;
  res.json({ studentId, ...rest });
});

/** POST /api/fees/student/:studentId/pay — record a payment (admin). */
router.post('/student/:studentId/pay', authenticate, requireStaffAdmin, (req, res) => {
  const studentId = asInt(req.params.studentId);
  if (!get('SELECT id FROM students WHERE id = ?', [studentId])) return res.status(404).json({ error: 'Student not found.' });
  const amount = parseFloat(req.body.amount);
  const method = cleanString(req.body.method, 40);
  const reference = cleanString(req.body.reference, 120);
  const note = cleanString(req.body.note, 300);
  const paidAt = cleanString(req.body.paidAt, 20);
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid payment amount.' });

  const receiptNo = 'RCP-' + Date.now().toString(36).toUpperCase();
  const info = run(
    `INSERT INTO fee_payments (student_id, amount, method, reference, receipt_no, recorded_by, paid_at, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [studentId, amount, method || 'cash', reference || null, receiptNo, req.user.id, paidAt || new Date().toISOString().slice(0, 10), note || null]
  );
  log(req.user, 'FEE_PAYMENT', `Recorded ${amount} payment for student ${studentId} (${receiptNo})`, req.ip);
  // notify parent
  const parent = get(
    'SELECT p.user_id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id WHERE ps.student_id = ? AND p.status = \'active\' LIMIT 1',
    [studentId]
  );
  if (parent && parent.user_id) {
    notify(parent.user_id, 'fee', 'Payment recorded', `A payment of ${amount.toFixed(2)} was recorded for your child.`, '/fees');
  }
  res.status(201).json({ message: 'Payment recorded.', receiptNo, payment: get('SELECT * FROM fee_payments WHERE id = ?', [info.lastInsertRowid]) });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** GET /api/fees/report — summary for admins. */
router.get('/report', authenticate, requireStaffAdmin, (req, res) => {
  const academicYear = cleanString(req.query.academicYear, 20) || '2026';
  const rows = all(
    `SELECT s.id AS student_id, s.full_name, s.student_code, c.name AS class_name, c.stream AS class_stream,
            COALESCE(SUM(sf.amount), 0) AS due,
            COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.student_id = s.id), 0) AS paid
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN student_fees sf ON sf.student_id = s.id
     LEFT JOIN fee_structures f ON f.id = sf.fee_structure_id
     WHERE s.status = 'active' AND (f.academic_year = ? OR f.academic_year IS NULL)
     GROUP BY s.id ORDER BY s.full_name`, [academicYear]
  ).map((r) => ({ ...r, balance: Math.round((r.due - r.paid) * 100) / 100 }));
  const totalDue = rows.reduce((s, x) => s + x.due, 0);
  const totalPaid = rows.reduce((s, x) => s + x.paid, 0);
  const outstanding = rows.filter((r) => r.balance > 0).length;
  res.json({
    academicYear,
    rows: rows.length ? rows : [],
    totalDue: Math.round(totalDue * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalBalance: Math.round((totalDue - totalPaid) * 100) / 100,
    outstandingStudents: outstanding,
  });
});

/** GET /api/fees/student/:studentId/receipt/:paymentId — payment receipt (parent/admin). */
router.get('/student/:studentId/receipt/:paymentId', authenticate, (req, res) => {
  const studentId = asInt(req.params.studentId);
  const paymentId = asInt(req.params.paymentId);
  const p = get('SELECT * FROM fee_payments WHERE id = ? AND student_id = ?', [paymentId, studentId]);
  if (!p) return res.status(404).json({ error: 'Payment not found.' });
  const s = get('SELECT * FROM students WHERE id = ?', [studentId]);
  let allowed = ['super_admin', 'admin'].includes(req.user.role);
  if (!allowed && req.user.role === 'parent') {
    allowed = !!get('SELECT 1 FROM parent_students WHERE student_id = ? AND parent_id = (SELECT id FROM parents WHERE user_id = ?)', [studentId, req.user.id]);
  }
  if (!allowed) return res.status(403).json({ error: 'You do not have access to this receipt.' });
  res.json({ payment: p, student: s });
});

module.exports = router;

/** DELETE /api/fees/student/:studentId/pay/:paymentId — undo a payment (admin). */
router.delete('/student/:studentId/pay/:paymentId', authenticate, requireStaffAdmin, (req, res) => {
  const studentId = asInt(req.params.studentId);
  const paymentId = asInt(req.params.paymentId);
  const p = get('SELECT * FROM fee_payments WHERE id = ? AND student_id = ?', [paymentId, studentId]);
  if (!p) return res.status(404).json({ error: 'Payment not found.' });
  run('DELETE FROM fee_payments WHERE id = ?', [paymentId]);
  log(req.user, 'FEE_PAYMENT_UNDONE', `Removed payment ${p.receipt_no || paymentId} (${p.amount}) for student ${studentId}`, req.ip);
  res.json({ message: 'Payment removed. The student balance has been recalculated.' });
});
