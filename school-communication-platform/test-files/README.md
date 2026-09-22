# Import Center — Test Pack

Ready-to-upload documents for **every step of the Import Center** (admin dashboard →
Imports), plus a set of deliberate-problem files that show how the import engine
behaves when the data is wrong. Every file in this pack has been run through the
real import engine on a freshly seeded database — the expected results below are
what the platform actually does, not guesses.

Regenerate the pack at any time with:

```bash
node tests/_import-test-files.js      # from school-communication-platform/
```

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

3. Open **Imports** (the Import Center). Set **Term: Term 3** and **Year: 2026**
   (the defaults for September 2026 — the pack is built around Term 3 2026).

4. Work down the steps in order. Each upload first shows a **preview** of exactly
   what will happen; press **Import** to apply it. Every result below was verified
   against the live engine.

> The demo database already contains: 7 classes (Primary 7 A, Senior 1–6 A),
> 3 teachers (Ms. Mary Nakato TCH-1001, Mr. John Okello TCH-1002, Ms. Grace Atim
> TCH-1003), 6 students (STU-2024-001…006) and 1 guardian (PAR-2024-001
> Mr. John Okello). The pack builds a new **Primary 6 A** class on top of it.

---

## The numbered files (import in this order)

| # | File | Step | What you should see |
|---|---|---|---|
| 1 | `1-timetable.csv` | Timetable | 20 rows: **13 ready, 7 check**. Creates class **Primary 6 A** + subjects **Physics** and **Chemistry**, links Mary/John/Grace to their lessons. Robert Ssentongo and Rebecca Auma are not teachers yet — those 6 lessons warn *"No teacher matches"* and load unassigned. The Friday 10:40 slot has no subject → *"class activity"*. |
| 2 | `2-teachers.csv` | Teachers | 3 rows: **2 ready, 1 check**. Creates **Robert Ssentongo (TCH-2026-01)** and **Rebecca Auma (auto ID TCH-2026-0002, class teacher of Primary 6 A)** with logins. Ms. Mary Nakato already exists → her row warns and only adds links. **Download the logins CSV at the end of the dialog** — passwords are shown once. |
| 3 | `3-students.csv` | Students | 4 rows: **2 ready, 2 check**. Creates **Emmanuel Kato (STU-2026-301)** and **Patricia Akello (STU-2026-302)** — each with their guardian created and linked from the same row. Joshua Wasswa has no student ID → warns and gets auto ID **STU-2026-0303**. Sarah Okello (STU-2024-001) is the seeded child → warns *"already registered — will be updated, not duplicated"*. |
| 4 | `4-guardians.csv` | Parents & guardians | 3 rows: **2 ready, 1 check**. Betty Wasswa is linked to **Joshua by name** (his ID was auto-generated). Samuel Okiror is linked to **two children by admission number** (Aisha STU-2024-006 + Patricia). Joy Nabukenya warns *"Child Brenda Wanjala not found"* — she is created without that link. |
| 5 | `5-attendance.csv` | Attendance | 7 rows: **all ready**. Tests P/A/L/E single letters *and* full words, students matched by ID and by name, a note ("Sick", "Family function"), and seeded children. The term is derived from the dates (14–15 Sep 2026 → Term 3). |
| 6 | `6-fees.csv` | Fees | 4 rows: **all ready**. Tuition bills just Primary 6 A (3 students), a different tuition bills Senior 2 A (3 seeded students), the Development Fee bills **the whole school** (9 students), and Boarding bills **one student only** (Emmanuel). |
| 7 | `7-payments.csv` | Payments | 5 rows: **all ready**. Emmanuel pays in full with two receipts (400,000 + 250,000 = his 650,000 total), Patricia and Joshua part-pay, and Sarah Okello pays exactly her 370,000 → **cleared**. One row has no receipt number → the platform generates one. |
| 8 | `8-report-cards.csv` | Report cards (marks) | 10 rows: **all ready**. Marks for Emmanuel, Patricia, Joshua (matched by name) and Sarah. One row is scored **out of 50** (45/50 → 90%) to prove conversion. Totals, averages and class positions are computed automatically, and the marks also appear under Exams & Results. |
| 9 | `9-optional-classes.csv` | Classes (optional) | 2 rows: sets **Rebecca Auma as class teacher of Primary 6 A** and creates a new stream **Primary 5 C**. |
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

The zip deliberately targets **different children** than the marks CSV, so after
both imports the Reports screen shows computed cards (Emmanuel, Patricia, Joshua)
*and* uploaded file cards (David, Amelia, Michael, Sarah) side by side.

---

## Edge cases (`edge-cases/`) — what the engine does with bad data

Upload these **after** their step's numbered file, so the clashes have something
to clash with. Preview only — nothing needs importing (importing
`timetable-clashes.csv` would really move one lesson to Room 12; that is what its
last row demonstrates).

| File | Step | Expected preview |
|---|---|---|
| `timetable-clashes.csv` | Timetable | **5 errors**: a class double-booked, a teacher double-booked, a room double-booked, an end time before its start time, and a day that is not a day. **2 warnings**: the same lesson imported twice (nothing to change) and a corrected room (a real update). |
| `students-problems.csv` | Students | **1 error** (blank name — the only thing the students step rejects) and **2 warnings**: a student with no class (created unassigned) and Sarah again (updated, never duplicated). |
| `guardians-problems.csv` | Parents & guardians | **1 error** (invalid email) and **2 warnings**: a guardian with no phone or email, and one with no children listed. |
| `attendance-problems.csv` | Attendance | **4 errors**: a date that is not a date, a status that is not understood ("Maybe"), an unknown student, and the same child marked twice in one file. Only the 4th row imports. |
| `payments-problems.csv` | Payments | **3 errors**: a zero amount, an unknown student, and a receipt duplicated inside the file. **1 warning**: receipt RCP-2026-3001 is already recorded → skipped, never doubled. |
| `reports-problems.csv` | Report cards | **4 errors**: missing subject, missing score, unknown student, and a score that is not a number ("eighty"). |
| `not-a-spreadsheet.txt` | any CSV step | Rejected with the friendly *"Use an Excel (.xlsx) or CSV (.csv) file for this step…"* message. |

---

## Extra checks worth trying

- **Excel format**: `3-students.xlsx` is the same data as `3-students.csv` in a
  real workbook — upload it instead of the CSV to test the .xlsx path (it will
  report all four children as already registered).
- **Re-import safety**: upload any numbered file a second time. The timetable
  says *"already imported — nothing to change"* for every row, receipts are
  skipped, attendance corrects the same day instead of duplicating it.
- **Timetable correction flow**: after step 2 (teachers), re-import
  `1-timetable.csv`. Robert and Rebecca now exist, so the six lessons that
  loaded unassigned are updated with their teachers — the preview lists each
  one as an update, and only the Friday activity stays unassigned.
- **The fee gate**: on the Reports screen, Emmanuel Kato and Sarah Okello show
  as **cleared** (paid = billed), while Patricia and Joshua still **owe** —
  their cards cannot go out to parents until the balance is cleared.
- **Auto-generated IDs** are zero-padded to four digits: Joshua becomes
  `STU-2026-0303`, Rebecca `TCH-2026-0002`.

## What the database should look like after the full run

| | |
|---|---|
| Classes | **9** (7 seeded + Primary 6 A + Primary 5 C) |
| Subjects | **7** (5 from the timetable + Literature + Entrepreneurship) |
| Teachers | **5** (3 seeded + Robert + Rebecca) |
| Students | **9** (6 seeded + 3 imported) |
| Guardians | **6** (1 seeded + 5 imported) |
| Attendance / fees / payments | **7 / 4 / 5** |
| Report cards | **7 matched** (3 computed + 4 files) + **1 parked** unmatched |

Fee ledger: Emmanuel 650,000/650,000 **cleared** · Sarah 370,000/370,000
**cleared** · Patricia 400,000 paid 150,000 **owing** · Joshua 400,000 paid
50,000 **owing**.
