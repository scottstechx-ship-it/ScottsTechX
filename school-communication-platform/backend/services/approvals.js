/**
 * Registration approvals.
 *
 * Self-registration (parent, student, teacher applications) never creates a
 * usable account on its own: the school has to approve it. This service keeps
 * that logic in one place so the Users screen and the Parents screen behave
 * identically.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { get, run, tx } = require('../database/db');
const { log } = require('./audit');
const { notify } = require('./notify');
const { sendEmail } = require('./mailer');
const sessions = require('./sessions');

/** Human-friendly temporary password (must be changed at first sign-in). */
function generatePassword() {
  const words = ['Lion', 'Eagle', 'Cedar', 'River', 'Acacia', 'Sunrise', 'Kites', 'Baobab'];
  return words[crypto.randomInt(words.length)] + '@' + crypto.randomInt(1000, 9999);
}

/**
 * Approve a pending registration.
 * @returns {{ user: object, generatedPassword: string|null }}
 */
function approveUser(userId, actor, req) {
  const u = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!u) {
    const err = new Error('Account not found.');
    err.status = 404;
    throw err;
  }
  if (u.registration_status === 'approved') {
    const err = new Error('This registration has already been approved.');
    err.status = 400;
    throw err;
  }

  let generatedPassword = null;
  tx(() => {
    if (u.role === 'parent') {
      // Parents are given a real password now — whoever registered only ever
      // held a random placeholder. They must change it at first sign-in.
      generatedPassword = generatePassword();
      run(
        // Approving the application is the school's own identity check, so the
        // email address counts as verified from here on.
        `UPDATE users SET registration_status = 'approved', status = 'active', email_verified = 1,
           password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?`,
        [bcrypt.hashSync(generatedPassword, 10), new Date().toISOString(), u.id]
      );
    } else {
      run(
        `UPDATE users SET registration_status = 'approved', status = 'active', email_verified = 1, updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), u.id]
      );
    }
    // Students/teachers were held in "pending" while the application was reviewed.
    if (u.role === 'student') run("UPDATE students SET status = 'active' WHERE user_id = ?", [u.id]);
    if (u.role === 'teacher') run("UPDATE teachers SET status = 'active' WHERE user_id = ?", [u.id]);
  });

  notify(u.id, 'account', 'Your account was approved',
    'Welcome. You can now sign in to the school platform.', '/');
  log(actor, 'REGISTRATION_APPROVED', `Approved ${u.role} registration for ${u.full_name}`, req ? req.ip : null);

  if (u.email) {
    const subject = 'Your school account has been approved';
    const body = generatedPassword
      ? `<p>Hello ${u.full_name},</p>
         <p>Your account has been approved. Temporary password: <b>${generatedPassword}</b></p>
         <p>You will be asked to change it the first time you sign in.</p>`
      : `<p>Hello ${u.full_name},</p><p>Your account has been approved. You can now sign in as usual.</p>`;
    sendEmail({ to: u.email, subject, html: body }).catch(() => {});
  }

  return { user: u, generatedPassword };
}

/** Reject (and lock) a pending registration. */
function rejectUser(userId, actor, req, reason) {
  const u = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!u) {
    const err = new Error('Account not found.');
    err.status = 404;
    throw err;
  }
  run(
    `UPDATE users SET registration_status = 'rejected', status = 'inactive', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), u.id]
  );
  // Any session the applicant may already hold is worthless now.
  sessions.revokeAllForUser(u.id);
  if (u.role === 'student') run("UPDATE students SET status = 'inactive', user_id = NULL WHERE user_id = ?", [u.id]);
  if (u.role === 'teacher') run("UPDATE teachers SET status = 'inactive' WHERE user_id = ?", [u.id]);

  log(actor, 'REGISTRATION_REJECTED', `Rejected ${u.role} registration for ${u.full_name}${reason ? ` — ${reason}` : ''}`, req ? req.ip : null);
  if (u.email) {
    sendEmail({
      to: u.email,
      subject: 'Your school account application',
      html: `<p>Hello ${u.full_name},</p><p>Unfortunately your account application was not approved${
        reason ? ` (${reason})` : ''}. Please contact the school administration if you think this is a mistake.</p>`,
    }).catch(() => {});
  }
  return { user: u };
}

module.exports = { approveUser, rejectUser, generatePassword };
