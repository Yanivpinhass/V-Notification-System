# Plan: Final Consolidated Prompt for Magav Shift Schedule Auto-Generation

## Context

The Magav volunteer shift-schedule system has been manually planned in Excel each month (`תוכנית מתמיד M.YY.xlsx`). The user wants to copy-paste a single prompt into Gemini / ChatGPT / Claude.ai (with the current month's xlsx attached) and get back next month's xlsx — visually identical to the source, with crews kept intact, volunteer constraints (הערות) honored, Israeli-calendar holidays annotated, and no cross-team mixing.

The prompt has evolved through ~9 iterations and a post-execution code review against the source file `input\תוכנית מתמיד 5.26.xlsx`. The latest revision (this document) folds in the reviewer's corrections — the most impactful being: holidays live on the **separator row** (block-row-3), not the weekday row; col R is a **COUNTIF formula** over the grid, not an input budget; spillover-dominated weekly blocks still need their in-month days assigned; assignment must be **two-pass** (global Level-1 before any Level-2/3/4) to prevent budget starvation; and the hand-coded hex/font list is partly wrong, so the cell-by-cell style copy is the only source of truth.

**Empirical findings that ground the final prompt** (from parallel Excel inspection + a reviewer that ran the prior prompt end-to-end):

- **Sheet props**: name like "5.26"; `sheet_view.rightToLeft = True`; freeze pane at A148; merged range C1:D1.
- **Rolling multi-week template**: the source already contains pre-seeded skeleton blocks for upcoming weeks (team-name + car-number rows filled, volunteer rows blank). This is why month detection MUST go by counting real-date cells, not by sheet name or block count.
- **Formula-driven cells**: dates are A2 literal + `=A2+1, =B2+1, …`; the weekday row is `=WEEKDAY(A2,1)` rendered via `ddd`; team-name and car-number cells propagate via formula chains anchored at the first block (B5=`=A5`, A34=`=G5`, etc.). Parsing must use cached values (`load_workbook(..., data_only=True)`).
- **Holiday location**: holiday/eve names sit in **block-row-3** (the separator row), columns A..G under the matching date — e.g. ערב לג בעומר in B33, לג בעומר in C33. Block-row-2 carries the weekday formulas + the H/I/J labels (מבצע/כוננות/הערות) ONLY.
- **Col R (משמרות) is a COUNTIF formula** like `=COUNTIF(A$2:G$198, O#)` — it counts how many times the volunteer appears in the current grid. R is an OUTPUT, not an input. The observed appearance count IS the target.
- **Two distinct "team" concepts**: LEFT region has 4 shift teams per week (מרחבים 221, 222, 211, 212 — each with a car number). RIGHT region has 43 admin roster team numbers (1..44, with 17 missing) in cols M/N. They are NOT the same; volunteer→shift-team binding must come from observed appearances in current-month LEFT region.
- **Crew sizes**: avg 2.5 per (team, date) cell; distribution 16% solo, 34% pair, 34% trio, 14% quad. Solo cells are common in the source but the user has clarified next month must have **min crew size 2**.
- **27 distinct note patterns** in col Q across roster; 8 semantic categories (inactive, day-exclusion, day-only, time-slot, frequency, pairing, work-dependent, soft preference). Hebrew weekday tokens carry conjunctive/prepositional prefixes (`וחמישי`, `בשבת`, `לראשון`) that boundary-only regex misses.
- **Holidays in source May 2026**: ערב לג בעומר + לג בעומר (rows 33, B/C); ע.יום ירושלים + יום ירושלים (row 62, E/F); ערב חג שבועות + חג שבועות (row 91, E/F).
- **Hidden rows**: source hides blank gap rows (29, 30, 87, 88) between blocks.
- **Default font**: a fresh openpyxl workbook defaults to Calibri; the source's default font is Arial. Without overriding `wb._fonts[0]`, untouched cells will silently become Calibri.
- **Sheet metadata to carry**: `sheet_view.zoomScale` (85), `sheet_properties.tabColor`, `sheet_format.defaultColWidth` (≈12.6), `defaultRowHeight`.

---

## The Final Prompt

Paste the block below into a fresh Gemini / ChatGPT (with Advanced Data Analysis) / Claude.ai session, and attach the current-month xlsx in the SAME message.

````
The current month's shift schedule file is ATTACHED to this message as an .xlsx workbook. You MUST read it directly from the attachment.

HOW TO READ THE ATTACHMENT (do this BEFORE anything else):
1. Use your code execution / Python tool to open the attachment. Gemini → "Run code"; ChatGPT → Python sandbox; Claude.ai → analysis tool. The xlsx is a binary ZIP-based format; parse it with openpyxl or pandas (`pip install openpyxl` if needed). Never read it as text.
2. Load TWICE: once with `data_only=True` (cached values — for PARSING, because dates/weekdays/team-names are formulas) and once normally (for STYLE COPY, because openpyxl loses style info on data_only loads). Keep both workbook objects.
3. Print the workbook's sheet names and the first 10 rows of each sheet so the user can confirm the file loaded.
4. If the environment cannot execute code or no xlsx parser is available, say so in Hebrew + English and ask the user to re-send as CSV. Do NOT silently emit an error JSON.
5. Only after a successful load may you proceed to TASK 1 and TASK 2.

If the message genuinely has zero attachments, reply with exactly:
{"error":"No file attached — please attach the .xlsx and resend."}
Otherwise NEVER use that error shape. Always show what you tried and what blocked you.

================================================================
ROLE
================================================================
You are a parser AND scheduler for a Hebrew/RTL volunteer shift schedule (Magav patrol shifts). You will perform two tasks: (1) parse the attached file; (2) build the NEXT month's schedule as a new .xlsx visually indistinguishable from the source.

================================================================
DATA-REALITY CHEAT SHEET (ground yourself in these BEFORE parsing)
================================================================
- The file is a ROLLING MULTI-WEEK TEMPLATE that already contains pre-seeded skeleton blocks for future weeks (team-name + car-number filled, volunteer rows blank). Detect the current month by counting real-date cells; do NOT trust sheet name or block count.
- Regions: LEFT = cols A..J (schedule). GAP = col K. RIGHT = cols L..R (roster).
- Row 1 = title (C1:D1 merged) + year (E1) + roster headers (L1..R1: בסיס/צוות/צוות/המתנדב/ישוב/הערות/משמרות).
- Each WEEKLY BLOCK is 4 leading rows + N×6 team rows:
    block-row-1 (e.g. row 2): real dates A..G; number format `[$-1010000]d/m/yy`.
    block-row-2 (e.g. row 3): weekday FORMULAS `=WEEKDAY(A2,1)` etc., A..G; number format `ddd`; cols H/I/J carry the static labels "מבצע" / "כוננות" / "הערות".
    block-row-3 (e.g. row 4): SEPARATOR ROW; HOLIDAY / EVE Hebrew text appears HERE in A..G (NOT in block-row-2). May also have an isolated `,` in col H — treat as empty.
    block-row-4 (e.g. row 5) and onward: team blocks, each EXACTLY 6 rows.
- TEAM BLOCK (6 rows):
    Team row 1: shift-team name, propagated A..G via formulas anchored at the first block (B5=`=A5`, A34=`=G5`, etc.).
    Team row 2: car number, same A..G propagation.
    Team rows 3-6: up to 4 volunteer names per day (A..G).
- The four shift teams in order: מרחבים 221, מרחבים 222, מרחבים 211, מרחבים 212.
- Col R is a `=COUNTIF(A$2:G$198, O#)` formula — counts the volunteer's appearances in the grid. It is OUTPUT, not input. Use it as a sanity check; the OBSERVED appearance count IS the target.
- Roster body runs to ~row 216; the COUNTIF formula range extends to ~row 258. On a fresh `data_only=False` load the cached R values may be stale until Excel re-opens — when validating col R, compare formulas, not values.
- Hidden rows you may encounter: 29, 30, 87, 88 (blank gap rows). Preserve their hidden flag.

================================================================
TASK 1 — PARSE THE INPUT FILE
================================================================

A. DETECT CURRENT (MONTH, YEAR) FROM DATA, NOT SHEET NAME
- Scan LEFT region (A..G) for every cell holding a REAL calendar date (datetime). Ignore the 1900-01-01..1900-01-07 weekday-formula cells.
- Group by (year, month), count, pick the LARGEST bucket. Tiebreaker: bucket midpoint closest to today.
- Emit `detectedMonth: { year, month, sheetNameHint, datesByMonth: { "YYYY-MM": <count>, ... } }`.

B. WEEKLY BLOCKS — POSITIONS AND CONTENT
- Find every weekly block by locating consecutive rows where A..G of one row are real dates. For each such row R:
    block-row-1 = R (dates)
    block-row-2 = R+1 (weekday `ddd` cells + H/I/J labels)
    block-row-3 = R+2 (separator row — also HOLIDAY HOST in A..G)
    team blocks = R+3, R+9, R+15, ... (each is 6 rows: team name / car number / 4 volunteer rows)
- A weekly block ends at the row before the next real-date row (or end of LEFT region).

C. WEEK-INDEX-IN-MONTH
- Number weekly blocks 1..N in source order.
- A block is "in-month" if ≥4 of its 7 dates fall in `detectedMonth`. Give it `weekIndexInMonth = 1, 2, 3, ...` in order.
- A block dominated by the PREVIOUS month gets `weekIndexInMonth = 0` (pre-spillover).
- A block dominated by the NEXT month gets `weekIndexInMonth = N+1` (post-spillover, where N is the count of in-month blocks).
- IMPORTANT: spillover-dominated blocks STILL contain in-month days that need shifts. They are not skipped — see TASK 2 §A.

D. CREW EXTRACTION
A **crew** is the FULL set of volunteer names occupying one (team-block instance, date) cell-column — the names in column A across rows 3..6 of a team's instance on a week form one crew (the Sunday crew); column B forms Monday; etc.

For every non-empty volunteer cell emit one record into `shifts`:
{
  "date": "YYYY-MM-DD",
  "dayOfWeek": "Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday",
  "weekIndexInMonth": <int — 0, 1..N, or N+1>,
  "isCurrentMonth": <bool — true only if date.year/month == detectedMonth>,
  "shiftName": "<team name from team row 1, e.g. מרחבים 221>",
  "carNumber": "<car number>",
  "volunteerName": "<Hebrew name>",
  "slotIndex": <1..4>,
  "operation":    "<col H, if any>",
  "standby":      "<col I, if any>",
  "notes":        "<col J, if any>",
  "calendarNote": "<holiday/eve text from block-row-3 cols A..G of this week, if any>",
  "crewId":       "<see below>"
}

`crewId` = first 8 chars of sha1(sorted(members joined by "|") + "@" + shiftName). Identical member sets on the same shift team get the same crewId across dates.

Also emit a `crews` array:
{
  "crewId": "...",
  "shiftName": "...", "carNumber": "...",
  "members": ["name1","name2",...],
  "appearances": [{"date":"YYYY-MM-DD","dayOfWeek":"Tuesday","weekIndexInMonth":3}, ...],
  "weekdaysObserved": ["Sunday","Tuesday",...],
  "weeksObserved":   [1,2,3,4]
}

E. RIGHT REGION ROSTER (L..R)
- Starts row 2, runs continuously DOWN the sheet to ~row 216 (volunteer entries); col R's COUNTIF formula range extends to ~row 258.
- For each row where col O is non-empty emit:
  {
    "base":          "<col L>",
    "primaryTeam":   "<col M>",
    "secondaryTeam": "<col N>",
    "volunteerName": "<col O>",
    "settlement":    "<col P>",
    "notes":         "<col Q, if any>",
    "shiftsPerMonthDerived": <int from col R; the CACHED COUNTIF value; 0 means no appearances in current grid>
  }
- The M/N "team" numbers are ADMINISTRATIVE sub-teams (1..44, 17 missing), NOT shift teams. Do not confuse them with shift-team names like "מרחבים 221".

F. PARSING RULES
1. Use the `data_only=True` workbook for value extraction (formula cells must read as their cached values).
2. Trim whitespace. Preserve Hebrew exactly.
3. Convert all dates to ISO "YYYY-MM-DD".
4. Skip trailing empty rows and rows where only R holds 0.
5. A lone `,` in col H of block-row-3 is a formatting artifact — treat as empty.

G. SHIFT COUNTS (next-month targets)
Compute from parsed `shifts` (isCurrentMonth==true only) and the roster:

- **volunteerCurrentMonthShifts**: { "<volunteerName>": <int> }
    Count of current-month shift cells the volunteer appears in. This is the GROUND-TRUTH TARGET for next month.

- **teamNumberCurrentMonthShifts**: { "<M>": <int> }
    For each admin team number M (col M, fallback to N when M is blank), sum volunteerCurrentMonthShifts across volunteers whose primaryTeam == M. Aggregate sanity check.

- **targetShifts**: { "<volunteerName>": <int> }
    targetShifts[name] = volunteerCurrentMonthShifts[name].
    Note: col R is a COUNTIF over the same grid, so targetShifts SHOULD equal `shiftsPerMonthDerived` for every volunteer. If they ever disagree, that means the COUNTIF cache is stale — trust the live count from `shifts`, not R.

H. HEBREW WEEKDAY PARSER (use for ALL note parsing in Task 2)
Tokens for the seven days are: ראשון, שני, שלישי, רביעי, חמישי, שישי, שבת (and מוצ"ש = Sat-night). They appear inside notes with optional one-letter prefixes ו (and), ה (the), ב (on/in), ל (to/for). A regex MUST accept these prefixes:

  weekday_regex = r"(?:[והבל]?)(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|מוצ\"ש|מוצ״ש)"

Examples that MUST parse correctly:
  "לא יכולה שני, רביעי וחמישי"  → {Monday, Wednesday, Thursday}
  "לא בשבת"                      → {Saturday}
  "רק לראשון"                    → {Sunday}
  "עדיפות ליום שני"              → {Monday} (HARD day-only — see Constraint 2)

Hebrew weekday map: ראשון=Sun, שני=Mon, שלישי=Tue, רביעי=Wed, חמישי=Thu, שישי=Fri, שבת=Sat, מוצ"ש=Sat-night.

I. VAGUE-NOTE POLICY
Some notes describe a restriction without naming a specific weekday (e.g. "עבודה חדשה לא יכול אמצע שבוע", "התחיל לשמור שבת"). When the parser cannot extract a definite weekday set:
- Do NOT silently exclude any day.
- Do NOT silently ignore the note.
- Place the volunteer tentatively under normal crew rules AND add an entry to `manualReviewFlags` with `reason: "<verbatim note text> — could not auto-parse; please verify"`.

================================================================
TASK 2 — GENERATE NEXT MONTH'S SCHEDULE
================================================================

Build the calendar month IMMEDIATELY AFTER `detectedMonth` (year rolls at Dec→Jan). Output JSON AND a new .xlsx.

A. WEEK COVERAGE AND SPILLOVER HANDLING
- Generate enough weekly blocks (Sun..Sat in A..G) to cover every day of the next month, with the same edge-spillover pattern as the source.
- Re-number weekIndexInMonth = 1..M for the next month using the majority-of-dates rule.
- **In-month days of a spillover-dominated block STILL get assignments.** If next-month's last block is dominated by the month after (e.g. June block Jun28–Jul4 contains Jun 28/29/30), those three June days MUST be assigned. Treat such a spillover block as the cadence "extend" case: repeat the last numbered week's pattern for those in-month days. These extension days are exempt from the per-volunteer hard cap (allow +1 over target as part of normal cap behavior).
- Days outside detectedMonth+1 stay blank.

B. SHIFT-TEAM STRUCTURE PRESERVATION
- Replicate every distinct LEFT-region shift team (shiftName + carNumber) from the current month, in the same order they appeared within each weekly block.
- For each shift team T, compute `weekdaysObserved` and `weeksObserved` from current-month-only shifts (isCurrentMonth==true).

**CONSTRAINT 1 — Team weekday restriction**
If team T never appeared on Thursday, Friday, OR Saturday in any current-month shift, T is "weekday-only" and MUST NOT appear on Thu/Fri/Sat in next month (Sun-Wed only). If T appeared on any of Thu/Fri/Sat, it may continue.

**CONSTRAINT — Week-position cadence (with spillover extend)**
T's `weeksObserved` set in next month should mirror its current-month set when possible. If T was active in weeks {1,2,3,4} of current month, it's active in weeks {1,2,3,4} of next month. If next month has MORE weeks (5 vs 4), extend by repeating T's last-week pattern. If FEWER, drop the trailing week. Spillover-block in-month days follow the extend rule.

C. **CONSTRAINT 4 — Volunteer↔Team binding**
A volunteer V may ONLY be placed in shift team T in next month if V appeared in T's block at least once in the current month (LEFT region). Do NOT use the M/N roster numbers as a binding source — they are admin labels. NEVER mix volunteers across shift teams.

D. **CONSTRAINT 5 — Crew preservation (most important rule)**
DO NOT shuffle individuals between cells. Move crews as units. For each (team, target-date) cell apply the 4-LEVEL FALLBACK HIERARCHY:

  LEVEL 1 — exact crew, exact week position:
    Find a source crew C of this team where C.dayOfWeek == target.dayOfWeek AND C.weekIndexInMonth == target.weekIndexInMonth AND every member is active (per Constraint 2), has remaining target budget, and the target weekday is notes-compatible. Place all members intact.

  LEVEL 2 — exact crew, weekday only (any week):
    Same eligibility as Level 1 but relax weekIndexInMonth. Prefer the source crew whose weekIndexInMonth is CLOSEST to target (week-3 target → prefer source week-3, then 2/4, then 1/5). Rotate among ties so each gets a roughly equal share of weeks.

  LEVEL 3 — partial crew (drop inactive members):
    Take the best-matching Level-1/2 crew ignoring activity; remove members inactive in next month; place the remaining intact subset. Do NOT replace dropped members from outside the crew.

  LEVEL 4 — team-pool synthesis (last resort):
    From the team's full member pool (everyone who ever appeared in any crew of this team in current month, filtered to active + target-budget + notes-compatible), form a crew sized to the team's MEDIAN crew size. Prefer members with high crew-co-occurrence. Append to `manualReviewFlags` with reason "synthesized crew — please verify".

  If Level 4 also fails (no active member of this team can be placed on this weekday), leave the cell empty and add to `unfilledSlots` with a precise reason.

E. **CONSTRAINT 2 — Volunteer notes (הערות)**
Build per-volunteer constraints from col Q (roster) AND col J (per-shift). Apply via the Hebrew weekday parser (Task 1 §H) — every weekday token may carry a ו/ה/ב/ל prefix.

  Inactive — DO NOT schedule:
    "מילואים", "מילואים - כרגע בחו\"ל", "לאחר ניתוח בעין - כרגע במילואים",
    "הקפאה", "הקפאה - רפואי", "פעם בחודש - הקפאה",
    "בתהליך גיוס", "נגרע", "נגרע - ממתין החלטת קב\"ט",
    "נפצע קשה במילואים", "ללא רישיון", "כרגע ללא רישיון",
    "עוד לא סיים קורס", "עוד לא עבר התקן לבסיס ההפעלה",
    "לאחר לידה ב\"ה", "אישתו נפטרה", "עבר לגור בבית קמה",
    "ממתין החלטת קב\"ט", "חזרה לפני תום שנה", "לפני גריעה", "מנהלה בקרים",
    OR targetShifts == 0.

  Day exclusion: "לא יכול ימי X" / "לא לשבץ ימי X" / "לא יכולה X" / "לא יכול X בכלל" / "לא בX"
    → exclude that weekday (parser must catch prefixed forms like וחמישי, בשבת).

  Multi-day exclusion: "לא יכולה שני, רביעי וחמישי" / "לא יכול ימי ראשון, שני"
    → exclude each listed weekday.

  Day-only restriction (HARD — must be ONLY this weekday):
    "רק ימי X" / "X בלבד" / "ימי X בלבד" / "חמישי בלבד" /
    "עדיפות ליום X" / "עדיפות לימי X" / "עדיפות X" / "עדיפות ל X" / "עדיפות ל-X"
    → schedule ONLY on that weekday. Treat "עדיפות" as HARD, not soft.
    (Note: "מעדיף" / "ביקש לשים ימי X" stay soft below.)

  Time-slot: "מוצ\"ש" → Sat night only; "שבת בוקר" → Sat morning;
    "שישי לילה" / "ימי שישי בלילה" → Fri night only.

  Frequency cap: "פעם בחודש" / "*פעם בחודש*" → at most 1 shift in next month.

  Pairing: "שותף של <name>" / "עם <name> קבוע" / "עם <name1> ו<name2>"
    → keep paired on the same shift; crew preservation usually enforces this.

  Work-dependent: "ע\"פ משמרות בעבודה" / "ע\"פ משמרות בעבודה - לשאול"
    → place tentatively + manualReviewFlags entry.

  Soft preference (NOT hard): "מעדיף X" / "ביקש לשים ימי X"
    → prefer that weekday when possible.

  Swap rule: "ימאי - *ימי חמישי במקום מוצ\"ש"
    → Thursday in place of Sat-night.

  Vague / unparseable note (per Task 1 §I): place tentatively + manualReviewFlags.

F. **CONSTRAINT 3 — Holiday / eve annotation**
For every date in next month, check Jewish / Israeli civil holiday or eve (Pesach 1+7, Yom HaShoah, Yom HaZikaron, Yom HaAtzmaut, Lag BaOmer, Yom Yerushalayim, Shavuot, Tisha B'Av, Rosh Hashanah, Yom Kippur, Sukkot 1, Shmini Atzeret, Simchat Torah, Chanukah 1+8, Tu BiShvat, Purim + the "ערב" eve of each major holiday). Use the Hebrew calendar.

Write the Hebrew holiday name into **block-row-3** (the separator row, NOT block-row-2), cols A..G under the matching date, mimicking the source's style — e.g.:
  - "ערב לג בעומר", "לג בעומר"
  - "ע.יום ירושלים", "יום ירושלים"
  - "ערב חג שבועות", "חג שבועות"
  - "ערב ראש השנה", "ראש השנה"

Mirror in JSON as a `calendar` map and as `calendarNote` on each shift on that date. Holidays do NOT cancel shifts — keep crew assignments — but the holiday name MUST appear on block-row-3.

G. **CONSTRAINT 6 — Visual / formatting fidelity (cell-by-cell COPY is authoritative)**
The output .xlsx must be visually indistinguishable from the source apart from changed text. DO NOT hand-write styles. COPY them from the source workbook cell-by-cell.

The reference colors and fonts the source uses are approximately #548135 (date band), #7F7F7F (holiday band), #D6DCE4 / #C00000 in cols H/I, Arial 11pt and David 11/14/16pt — but DO NOT match this list by hand; some values in earlier docs were inaccurate. The cell-by-cell copy below is the source of truth; use the approximate list only for spot-verification AFTER copying.

Implementation in Python (openpyxl):
1. Load TWICE:
     wb_src_styled  = openpyxl.load_workbook(path)                  # for styles
     wb_src_values  = openpyxl.load_workbook(path, data_only=True)  # for cached formula values
2. wb_out = openpyxl.Workbook(); ws_out = wb_out.active; ws_out.title = next_sheet_name.
3. **Fix default font** before any copy: replace `wb_out._fonts[0]` with the source's default font (read from `wb_src_styled._fonts[0]`). Otherwise untouched cells default to Calibri.
4. For every cell in the source within the rectangle you intend to render, copy VALUE + style:
     from copy import copy
     ws_src = wb_src_styled.active
     for row in ws_src.iter_rows():
         for src in row:
             dst = ws_out.cell(row=src.row, column=src.column)
             dst.value = src.value
             if src.has_style:
                 dst.font          = copy(src.font)
                 dst.fill          = copy(src.fill)
                 dst.border        = copy(src.border)
                 dst.alignment     = copy(src.alignment)
                 dst.number_format = src.number_format
                 dst.protection    = copy(src.protection)
5. Preserve `ws_src.column_dimensions[col].width` for every column.
6. Preserve `ws_src.row_dimensions[row].height` AND `ws_src.row_dimensions[row].hidden` for every row that has a custom height or is hidden. The source hides certain blank gap rows (29, 30, 87, 88 in the May file).
7. Re-apply merged ranges: `for r in ws_src.merged_cells.ranges: ws_out.merge_cells(str(r))`.
8. Sheet metadata:
     ws_out.sheet_view.rightToLeft  = True
     ws_out.sheet_view.zoomScale    = ws_src.sheet_view.zoomScale
     ws_out.sheet_properties.tabColor = ws_src.sheet_properties.tabColor
     ws_out.sheet_format.defaultColWidth  = ws_src.sheet_format.defaultColWidth
     ws_out.sheet_format.defaultRowHeight = ws_src.sheet_format.defaultRowHeight
     ws_out.freeze_panes = ws_src.freeze_panes
9. THEN overwrite only cells whose VALUE should change for next month — leave styling alone:
     - block-row-1 A..G: new ISO dates (number format `[$-1010000]d/m/yy` already preserved).
     - block-row-2 A..G: keep the WEEKDAY formulas anchored at the new block-row-1 (B2=`=A2+1`...) or rewrite to refer to the new dates; the `ddd` format renders the Hebrew day name.
     - block-row-3 A..G: write any holiday text for that week; leave non-holiday days blank with the separator-row style intact.
     - team-name and car-number rows: identical to source (let the source formula chains propagate).
     - volunteer rows: write the placed crew members per Constraint 5.
     - RIGHT region L..R: roster carried over verbatim; col R is a COUNTIF that will recompute when Excel reopens — do not write a literal there.

If openpyxl is missing: `pip install openpyxl`. Do not produce a styleless workbook.

**CONSTRAINT 7 — No solo crews (min crew size = 2)**
A volunteer must NEVER be alone in a (team, date) cell in next month. Minimum size 2.
- If a Level-1/2 source crew has exactly 1 member, augment with one teammate from the same shift team's member pool: active, has remaining target budget, notes-compatible with the target weekday. Prefer the partner with the highest co-occurrence with the solo volunteer across the source.
- If Level 3 leaves exactly 1, do the same augmentation.
- If Level 4 synthesis would produce a 1-person crew, expand to 2.
- If no eligible second volunteer exists, leave the cell EMPTY and add to `unfilledSlots` with reason "would be solo crew — no eligible partner".
Record every augmentation in `synthesizedPairings`: { team, date, originalCrewId, originalMembers, augmentedWith, reason }.

**CONSTRAINT 8 — Per-volunteer target matching**
Drive every volunteer toward `targetShifts[name]` (Task 1 §G) — not just under a cap.
- Initialize `remaining[name] = targetShifts[name]` for every volunteer.
- HARD CAP: a volunteer may NEVER be placed more than `targetShifts[name] + 1` times.
- Preference: when multiple eligible crews exist at the same Level, pick the one whose members collectively have the HIGHEST remaining sum.
- targetShifts == 0 → MUST NOT be placed.
- After each placement decrement remaining[name] for each placed member.

H. ASSIGNMENT ALGORITHM — TWO-PASS (deterministic, prevents L1 starvation)
Naive single-pass greedy (resolve each cell L1→L4 in order) can let an early Level-2 borrow consume someone's budget before that person's own exact-week (Level 1) cell is reached. Run THREE GLOBAL PASSES:

PASS 1 — All Level-1 placements GLOBALLY first.
  For every (team, target-week, target-day) cell in next month:
    Try Level 1 only. Among eligible crews, prefer the one with the highest sum of remaining[member]. Apply Constraint 7 (augment if solo). Apply Constraint 8 hard cap. On success, place + decrement budgets. On failure, leave for Pass 2.

PASS 2 — Level-2 then Level-3 (real source crews only).
  For every cell still empty after Pass 1:
    Try Level 2; if no candidate, try Level 3.
    Apply Constraint 7 + Constraint 8 hard cap. On failure, leave for Pass 3.

PASS 3 — Level-4 synthesis.
  For every cell still empty:
    Try Level 4 synthesis. Apply Constraint 7. Add a manualReviewFlags entry. If still nothing, add to unfilledSlots with precise reason.

After all three passes:
- Preserve slotIndex order so members appear in rows 3..6 in the same internal order as the source.
- Compute:
    volunteerNextMonthShifts[name] = count placed.
    teamNumberNextMonthShifts[M]   = aggregate.
- For every volunteer where |volunteerNextMonthShifts - targetShifts| > 1 → append to targetMismatches.
- For every M where |teamNumberNextMonthShifts - teamNumberCurrentMonthShifts| > 1 → append to teamLoadDrift.

I. OUTPUT
Produce BOTH:

1) A JSON object:
{
  "detectedMonth": {"year":Y,"month":M,"sheetNameHint":"...","datesByMonth":{...}},
  "currentMonth": {
    "shifts":     [...],
    "volunteers": [...],
    "crews":      [...],
    "volunteerCurrentMonthShifts": {"<name>": <int>, ...},
    "teamNumberCurrentMonthShifts":{"<M>":    <int>, ...},
    "targetShifts":               {"<name>": <int>, ...}
  },
  "nextMonth": {
    "year": Y, "month": M, "sheetName": "M.YY",
    "calendar": {"YYYY-MM-DD": "<holiday name>", ...},
    "shifts": [...],
    "volunteers": [...],
    "crewAssignments": [
      {"crewId":"...","shiftName":"...","members":[...],
       "datesPlaced":["YYYY-MM-DD",...],"level":1|2|3|4,"pass":1|2|3}
    ],
    "synthesizedPairings": [
      {"team":"...","date":"YYYY-MM-DD","originalCrewId":"...",
       "originalMembers":["..."],"augmentedWith":"...","reason":"..."}
    ],
    "volunteerNextMonthShifts": {"<name>": <int>, ...},
    "teamNumberNextMonthShifts":{"<M>":    <int>, ...},
    "targetMismatches": [{"name":"...","target":N,"placed":N,"delta":N}],
    "teamLoadDrift":    [{"teamNumber":"M","currentMonth":N,"nextMonth":N,"delta":N}],
    "unfilledSlots":    [{"date":"...","shiftName":"...","slotIndex":N,"reason":"..."}],
    "brokenCrews":      [{"crewId":"...","reason":"..."}],
    "manualReviewFlags":[{"volunteerName":"...","reason":"..."}]
  }
}

2) An .xlsx file named "תוכנית מתמיד <M>.<YY>.xlsx", one sheet named "M.YY" (next month), built per Constraint 6 (full cell-by-cell style copy, default font fix, hidden rows, sheet metadata).

OUTPUT TARGET:
- If running in a chat tool (Gemini/ChatGPT/Claude.ai) — print the JSON inline (no markdown fences) and offer the .xlsx as a download.
- If running in a file-producing / scripted environment — write `parse_and_plan_<M>.<YY>.json` and `תוכנית מתמיד <M>.<YY>.xlsx` to disk and print a short summary (counts of: shifts placed, level distribution, unfilled, broken crews, manualReviewFlags, targetMismatches, teamLoadDrift).

================================================================
VALIDATION CHECKLIST — ALL must pass before emitting output
================================================================
[ ] detectedMonth is the (year, month) with the largest count of real dates from block-row-1.
[ ] Every shift team in current month also appears in next month with the same shiftName + carNumber.
[ ] Coverage metric: ≥90% of ATTEMPTABLE (team, weekday-position, week-in-month) cells are filled — where "attemptable" means a cell the team actually works on (per its weekdaysObserved × weeksObserved) and that respects Constraint 1. A (team, weekday) the team never works has NO cell — it is correctly blank and does NOT count as unfilled.
[ ] In-month days of spillover-dominated blocks are assigned per the cadence-extend rule.
[ ] Crew preservation: every Level-1/2/3 placement contains EXACTLY the source crew's members (Level 3 may drop inactive members, never adds). Level-4 placements appear in manualReviewFlags. Constraint-7 augmentations appear in synthesizedPairings.
[ ] **No solo crew (size 1) anywhere in nextMonth.shifts.**
[ ] No volunteer placed in a shift team they were not associated with in current month's LEFT region.
[ ] No inactive volunteer (per Constraint 2 OR targetShifts == 0) appears anywhere.
[ ] No weekday-only team appears on Thu/Fri/Sat.
[ ] No volunteer scheduled on a weekday excluded by their notes (parser correctly handles ו/ה/ב/ל prefixes).
[ ] **Every HARD day-only note (incl. "עדיפות ליום X" / "עדיפות לימי X") is honored — zero violations.**
[ ] **Per-volunteer target within ±1**: |volunteerNextMonthShifts[name] - targetShifts[name]| ≤ 1 for every volunteer; larger gaps in targetMismatches.
[ ] **Per-admin-team aggregate within ±1**: |teamNumberNextMonthShifts[M] - teamNumberCurrentMonthShifts[M]| ≤ 1 per M; larger gaps in teamLoadDrift.
[ ] Two-pass assignment: every Pass-2 (Level 2/3) placement has been preceded by a global Pass 1 (Level 1) sweep across all (team, date) cells. The `pass` field on crewAssignments confirms this.
[ ] Every Israeli holiday/eve in next month appears on **block-row-3** (separator row) A..G under its date, with calendarNote on every shift on that date.
[ ] Output xlsx preserves: every cell's fill, font, border, alignment, number format; default-font override; column widths; row heights AND hidden flags; merged ranges; sheet_view.rightToLeft; sheet_view.zoomScale; tab color; default col width; default row height; freeze pane.
[ ] crewAssignments lists every placement with `level` AND `pass` fields so the result is auditable.

If you cannot recover any data from the attachment, explain in 2-3 sentences what you tried and what blocked you — do NOT emit `{"error":"..."}` other than the strict "no attachment at all" case at the top.
````

---

## How to use

1. Open Gemini (with **Run code** / Canvas on), ChatGPT (with **Advanced Data Analysis**), or Claude.ai.
2. Attach `input\תוכנית מתמיד M.YY.xlsx`.
3. Paste the prompt block above into the same message.
4. The model will preview the workbook, emit the parse JSON, emit the assignment plan JSON, and offer the next-month xlsx as a download.

## Verification (manual spot checks)

1. **Dates**: every block-row-1 cell in next-month xlsx is a real date of the targeted month (with spillover days at the edges as in source).
2. **Holidays on the correct row**: open the xlsx; holiday names sit on **block-row-3** (the separator) cols A..G, not on the weekday row. Spot-check the source — Lag BaOmer is in B33/C33 in the May file.
3. **Col R**: open the produced xlsx in Excel; col R recomputes via COUNTIF and matches each volunteer's count of names in the grid.
4. **Crews intact**: pick three current-month crews; confirm those exact member sets appear in next-month xlsx (Pass-1 Level-1 majority).
5. **Week alignment**: a team that was on 19/5 (week 3 Tuesday) appears around week-3 of June.
6. **No solo cells**: every populated (team, date) cell has ≥2 names.
7. **No team mixing**: every name in a team's cells appeared in that team's source cells.
8. **No inactive volunteers** with "מילואים"/"הקפאה"/"ללא רישיון" etc. appear.
9. **Notes honored**: spot-check 5 volunteers with day-only / day-exclusion / עדיפות ליום notes.
10. **Spillover days**: confirm Jun 28/29/30 (or analogous month-end days) are populated when they fall in a July-dominated last block.
11. **Visual fidelity**: open source and produced files side by side; date row green band, holiday row gray band, cols H/I red/dark-red, title row light gray + David 16pt, Tahoma roster headers, freeze pane at A148, RTL, zoom = 85, all visually identical. Untouched cells should be Arial, not Calibri (default-font override worked).
12. **JSON audit**: confirm `targetMismatches`, `teamLoadDrift`, `unfilledSlots`, `brokenCrews`, `manualReviewFlags`, `synthesizedPairings` are present; `crewAssignments` has `level` and `pass` on every entry.
