# Import Center — Test Pack (S1 A/B – S4 A/B)

Ready-to-upload documents for **every step of the Import Center** (admin dashboard →
Imports), built around a school with eight classes — **S1 A, S1 B, S2 A, S2 B,
S3 A, S3 B, S4 A, S4 B** — plus a set of deliberate-problem files that show how
the import engine behaves when the data is wrong. Every file in this pack has
been run through the real import engine on a freshly seeded database — the
expected results below are what the platform actually does, not guesses
(56 automated checks, all passing).

Regenerate the pack at any time with:

```bash
node tests/_import-test-files.js      # from school-communication-platform/
```

> **Engine fix this pack depends on** (already applied, see the commit history):
> `findClass()` in `backend/services/importHub.js` used to fall back to a
> *name-only* match, so an imported "S1" + stream "B" silently folded into the
> existing "S1 A" — a school with parallel streams could never import its
> second stream. The fallback is now stream-aware (a named stream only matches
> a class with no stream of its own), and `resolveClass()` inserts an empty
> string instead of a NULL stream (the column is NOT NULL, so one-word class
> names used to crash the import with a constraint error). The repo's own test
> suites (imports, api, attendance, frontend smoke) all pass with the fix.

---

## Before you start

1. Start the platform on a **freshly seeded** database (the demo data is part of
   the test: the files reference its teachers, students and classes).

   ```bash
   rm -rf backend/data && npm start        # reseeds automatically on boot
   ```

2. Open the admin dashboard and sign in:

   | Login | Password |
   |---|---|
   | `admin` | `Admin@123` |

3. Open **Imports** (the Import Center). Set **Term: Term 3** and **Year: 2026**.

4. Work down the steps in order. Each upload first shows a **preview** of exactly
   what will happen; press **Import** to apply it.

> The demo database already contains: 7 classes (Primary 7 A, Senior 1–6 A),
> 3 teachers (Ms. Mary Nakato TCH-1001, Mr. John Okello TCH-1002, Ms. Grace Atim
> TCH-1003), 6 students (STU-2024-001…006) and 1 guardian (PAR-2024-001
> Mr. John Okello). The pack builds the eight S1–S4 A/B classes on top of it.

---

## The numbered files (import in this order)

| # | File | Step | What you should see |
|---|---|---|---|
| 1 | `1-timetable.csv` | Timetable | 41 rows: **24 ready, 17 check**. Creates **all eight classes** (S1 A…S4 B) + subjects **Physics** and **Chemistry**, links Mary/John/Grace to their lessons. Mr. Robert Ssentongo and Ms. Rebecca Auma are not teachers yet — their 16 lessons warn *"No teacher matches"* and load unassigned. S1/S2 lessons sit at 08:00–08:40, S3/S4 at 08:50–09:30, each class in its own room. The last row (Friday 14:00, S4 B) has no subject → a *"class activity"*. |
| 2 | `2-teachers.csv` | Teachers | 3 rows: **2 ready, 1 check**. Creates **Robert Ssentongo (TCH-2026-01)** and **Rebecca Auma (auto ID TCH-2026-0002, class teacher of S1 B)** with logins. Ms. Mary Nakato already exists → her row warns and only adds links. **Download the logins CSV at the end of the dialog** — passwords are shown once. |
| 3 | `3-students.csv` | Students | 16 rows: **8 ready, 8 check** — two students per class. First of each pair carries an explicit ID (STU-2026-401, 403, … 415) **and their guardian** (created and linked from the same row). Second of each pair has no ID → warns and gets an auto ID (402, 404, … 416). |
| 4 | `4-guardians.csv` | Parents & guardians | 3 rows: **2 ready, 1 check**. Betty Wasswa is linked to **Joshua by name** (his ID was auto-generated). Samuel Okiror is linked to **two children by admission number** (Patricia + Aisha — both already have mothers, so they end up with two guardians). Joy Nabukenya warns *"Child Brenda Kaboyo not found"* — she is created without that link. |
| 5 | `5-attendance.csv` | Attendance | 11 rows: **all ready**. One register row per class on Mon 14 Sep 2026 (P / Present alternating), plus a late mark, an absence by NAME with a note ("Sick"), and a permission (E). Term is derived from the dates → Term 3. |
| 6 | `6-fees.csv` | Fees | 10 rows: **all ready**. Tuition **per class** — S1/S2 at 300,000 and S3/S4 at 350,000 (8 rows) — a Development Fee of 50,000 for **the whole school** (22 students), and a Boarding Fee of 200,000 for **one student only** (Sharon, STU-2026-411). |
| 7 | `7-payments.csv` | Payments | 6 rows: **all ready**. Emmanuel and Nicholas pay **in full** (350,000 / 400,000), Sarah Okello clears her 50,000 development fee, and Kenneth / Pius / Sharon **part-pay**. One row has no receipt number → the platform generates one. |
| 8 | `8-report-cards.csv` | Report cards (marks) | 12 rows: **all ready**. Marks for Emmanuel (4 subjects), Nicholas (3), Kenneth (matched by name, 2) and Sharon (2), plus Sarah Okello (seeded child). One row is scored **out of 50** (45/50 → 90%) to prove conversion. Totals, averages and class positions are computed automatically, and the marks also appear under Exams & Results. |
| 9 | `9-optional-classes.csv` | Classes (optional) | 2 rows: sets **Ms. Mary Nakato as class teacher of S1 A** and **Mr. Robert Ssentongo as class teacher of S4 B**. |
| 10 | `10-optional-subjects.csv` | Subjects (optional) | 3 rows: attaches code **MAT** to Mathematics, creates **Literature in English (LIT)** and **Entrepreneurship (ENT)**, links Mary Nakato to Mathematics. |

### The report card documents (step 8, the files path)

| File | Upload as | What it tests |
|---|---|---|
| `8b-report-card-files/STU-2024-002.pdf` | single file | Matched **by admission number** (David Okello) |
| `8b-report-card-files/Amelia Namutebi.pdf` | single file | Matched **by full name** |
| `8b-report-card-files/scan-michael-okello.png` | single file | A PNG “scan” matched by **partial name** |
| `8b-report-card-files/Sarah Okello.pdf` | single file | Matched by name; **replaces** the computed card from `8-report-cards.csv` for the same child + term (a file card always wins for that term) |
| `8b-report-card-files/UNKNOWN-STUDENT.pdf` | single file | Matches nobody → **parked** for hand-matching on the Reports screen |
| `8c-report-cards.zip` | one upload | **All five documents in one zip**: preview shows *4 matched, 1 needs a child chosen* |

The zip deliberately targets **seeded children**, so after both imports the
Reports screen shows computed cards (Emmanuel, Nicholas, Kenneth, Sharon) *and*
uploaded file cards (David, Amelia, Michael, Sarah) side by side.

---

## Edge cases (`edge-cases/`) — what the engine does with bad data

Upload these **after** their step's numbered file, so the clashes have something
to clash with. Preview only — nothing needs importing (importing
`timetable-clashes.csv` would really move one lesson to Room 12; that is what its
last row demonstrates).

| File | Step | Expected preview |
|---|---|---|
| `timetable-clashes.csv` | Timetable | **5 errors**: a class double-booked (S1 A already has Mathematics), a teacher double-booked (Mary is teaching S1 A at that time), a room double-booked (Room 1), an end time before its start time, and a day that is not a day. **2 warnings**: the same lesson imported twice (nothing to change) and a corrected room (a real update). |
| `students-problems.csv` | Students | **1 error** (blank name — the only thing the students step rejects) and **2 warnings**: a student with no class (created unassigned) and Sarah Okello again (updated, never duplicated). |
| `guardians-problems.csv` | Parents & guardians | **1 error** (invalid email) and **2 warnings**: a guardian with no phone or email, and one with no children listed. |
| `attendance-problems.csv` | Attendance | **4 errors**: a date that is not a date, a status that is not understood ("Maybe"), an unknown student, and the same child marked twice in one file. Only the 4th row imports. |
| `payments-problems.csv` | Payments | **3 errors**: a zero amount, an unknown student, and a receipt duplicated inside the file. **1 warning**: receipt RCP-2026-6001 is already recorded → skipped, never doubled. |
| `reports-problems.csv` | Report cards | **4 errors**: missing subject, missing score, unknown student, and a score that is not a number ("eighty"). |
| `not-a-spreadsheet.txt` | any CSV step | Rejected with the friendly *"Use an Excel (.xlsx) or CSV (.csv) file for this step…"* message. |

---

## Extra checks worth trying

- **Excel format**: `3-students.xlsx` is the same data as `3-students.csv` in a
  real workbook — upload it instead of the CSV to test the .xlsx path (it will
  report all sixteen children as already registered).
- **Re-import safety**: upload any numbered file a second time. The timetable
  says *"already imported — nothing to change"* for every row, receipts are
  skipped, attendance corrects the same day instead of duplicating it.
- **Timetable correction flow**: after step 2 (teachers), re-import
  `1-timetable.csv`. Robert and Rebecca now exist, so the sixteen lessons that
  loaded unassigned are updated with their teachers — the preview lists each
  one as an update, and only the Friday activity stays unassigned.
- **The fee gate**: on the Reports screen, Emmanuel, Nicholas and Sarah show
  as **cleared** (paid = billed), while Kenneth, Sharon and Pius still **owe** —
  their cards cannot go out to parents until the balance is cleared.
- **Auto-generated IDs** are zero-padded to four digits: Joshua becomes
  `STU-2026-0402`, Rebecca `TCH-2026-0002`.

## What the database should look like after the full run

| | |
|---|---|
| Classes | **15** (7 seeded + S1 A/B, S2 A/B, S3 A/B, S4 A/B) |
| Subjects | **7** (5 from the timetable + Literature + Entrepreneurship) |
| Teachers | **5** (3 seeded + Robert + Rebecca) |
| Students | **22** (6 seeded + 16 imported) |
| Guardians | **12** (1 seeded + 8 inline + 3 from the guardians step) |
| Attendance / fees / payments | **11 / 10 / 6** |
| Timetable lessons | **41** |
| Report cards | **8 matched** (4 computed + 4 files) + **1 parked** unmatched |

Fee ledger: Emmanuel 350,000/350,000 **cleared** · Nicholas 400,000/400,000
**cleared** · Sarah 50,000/50,000 **cleared** · Kenneth 350,000 paid 100,000
**owing** · Sharon 600,000 paid 250,000 **owing** (includes boarding) ·
Pius 400,000 paid 150,000 **owing**.
