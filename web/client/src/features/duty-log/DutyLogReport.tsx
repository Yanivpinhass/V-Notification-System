import React from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { DutyLogData } from './types';
import { deriveEndDate } from './deriveEndDate';

// One presentational, self-contained A4-LANDSCAPE (width 1123px) RTL component
// that visually replicates docs/duty log exmaple.docx. Static text, weights
// 400/700 only, color #000 / background #fff, direction rtl. Every numeric/LTR
// run (times, phones, vehicle, date+time lines) is wrapped in <span dir="ltr">
// so it never rasterizes reversed. Source of truth: the Layout appendix in the spec.

// ── Static text (NOT inputs) ──
const UNIT_LINE = 'יחידה: בסיס הפעלה מרחבים, מתנדבי סיור (מתמ"ד)';
const SHIFT_LETTER_LINE = "משמרת: ג'";
const TASK1_TYPE = 'הנחיה מבצעית';
const TASK1_DESC = 'תדרוך ותרגולת לפני יציאה למשימה';
const TASK2_TYPE = 'פעילות למניעת עברות פע"ר';
const TASK2_DESC =
  'פעילות יזומה ברחבי הגזרה- דגש על ישובים מוכי פשיעה ופאתי הגזרה. נוכחות ובולטות לצד פעילות חכמה, חסימות לבידוק אנשים/רכבים חשודים, רישום בדוקאים למניעת עבירות פע"ר וחיזוק תחושת בטחון התושבים';

const BORDER = '1px solid #9a9a9a';

const reportRoot: React.CSSProperties = {
  width: 1123,
  boxSizing: 'border-box',
  padding: '28px 32px 32px',
  background: '#ffffff',
  color: '#000000',
  direction: 'rtl',
  fontFamily: '"Noto Sans Hebrew", Arial, sans-serif',
  fontWeight: 400,
  fontSize: 12,
  lineHeight: 1.4,
};

const titleBar: React.CSSProperties = {
  background: '#4472C4',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: 22,
  textAlign: 'center',
  padding: '10px 12px',
  margin: '14px 0 6px',
};

const sectionLabel: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: '#1A1A1A',
  marginTop: 16,
  marginBottom: 5,
  paddingBottom: 3,
  borderBottom: '2px solid #4472C4',
};

const detailLine: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.8,
  color: '#222222',
};

const detailLabel: React.CSSProperties = { fontWeight: 700 };

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
};

const thStyle: React.CSSProperties = {
  border: BORDER,
  background: '#E8E8E8',
  color: '#1A1A1A',
  fontWeight: 700,
  fontSize: 11,
  padding: '5px 6px',
  textAlign: 'center',
  verticalAlign: 'middle',
};

const tdStyle: React.CSSProperties = {
  border: BORDER,
  color: '#222222',
  fontSize: 11,
  padding: '5px 6px',
  textAlign: 'center',
  verticalAlign: 'middle',
  wordBreak: 'break-word',
};

// LTR-isolated run — required for any neutral/numeric content inside RTL cells.
const Ltr: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{children}</span>
);

// Blank cell (non-breaking space keeps an even row height).
const Blank: React.FC = () => <td style={tdStyle}>{' '}</td>;

interface ColDef {
  header: string;
  width: string;
}

// Columns in RTL visual order (right→left): the first entry renders rightmost.
const MANPOWER_COLS: ColDef[] = [
  { header: 'שם', width: '13%' },
  { header: 'מ.א.', width: '12%' },
  { header: 'ת.ז.', width: '9%' },
  { header: 'טלפון', width: '16%' },
  { header: 'סוג כ"א', width: '11%' },
  { header: 'קשר', width: '9%' },
  { header: 'שעות מתוכננות', width: '17%' },
  { header: 'הערות', width: '13%' },
];

const VEHICLE_COLS: ColDef[] = [
  { header: "מס' רכב", width: '60%' },
  { header: 'שעות מתוכננות', width: '40%' },
];

const TASK_COLS: ColDef[] = [
  { header: 'צוות', width: '16%' },
  { header: "מס' משימה", width: '9%' },
  { header: 'סוג', width: '13%' },
  { header: 'מקום', width: '8%' },
  { header: 'מועד מתוכנן', width: '9%' },
  { header: 'תאור', width: '29%' },
  { header: 'שעות ביצוע', width: '8%' },
  { header: 'הערות', width: '8%' },
];

const HeaderRow: React.FC<{ cols: ColDef[] }> = ({ cols }) => (
  <thead>
    <tr>
      {cols.map((c) => (
        <th key={c.header} style={{ ...thStyle, width: c.width }}>{c.header}</th>
      ))}
    </tr>
  </thead>
);

export const DutyLogReport: React.FC<{ data: DutyLogData }> = ({ data }) => {
  const { shiftName, date, startTime, endTime, vehicleNumber, people } = data;
  const endDate = deriveEndDate(date, startTime, endTime);
  const dateStr = format(date, 'dd/MM/yyyy', { locale: he });
  const endDateStr = format(endDate, 'dd/MM/yyyy', { locale: he });
  const hours = `${startTime}-${endTime}`;

  return (
    <div style={reportRoot}>
      {/* 1. Emblem / wordmark (משטרת ישראל baked in) — STATIC.
          margin:0 auto centers it: Tailwind preflight forces img{display:block}, so in
          an RTL container it would otherwise sit at the start (right) edge, and
          text-align:center has no effect on a block element. */}
      <div style={{ textAlign: 'center' }}>
        <img
          src="/police-emblem.png"
          alt="משטרת ישראל"
          width={430}
          height={128}
          style={{ display: 'block', margin: '0 auto' }}
        />
      </div>

      {/* 2. Title — DYNAMIC */}
      <div style={titleBar}>יומן הפעלה לצוות {shiftName}</div>

      {/* 3. פרטי יומן */}
      <div style={sectionLabel}>פרטי יומן</div>
      <div style={detailLine}>
        <span style={detailLabel}>מתאריך: </span>
        <Ltr>{`${dateStr}  ${startTime}`}</Ltr>
      </div>
      <div style={detailLine}>
        <span style={detailLabel}>עד תאריך: </span>
        <Ltr>{`${endDateStr}  ${endTime}`}</Ltr>
      </div>
      <div style={detailLine}>{UNIT_LINE}</div>
      <div style={detailLine}>{SHIFT_LETTER_LINE}</div>
      <div style={detailLine}>
        <span style={detailLabel}>צוותים: </span>
        {shiftName}
      </div>

      {/* 4. כח אדם */}
      <div style={sectionLabel}>כח אדם</div>
      <table style={tableStyle}>
        <HeaderRow cols={MANPOWER_COLS} />
        <tbody>
          {people.map((p, i) => (
            <tr key={i}>
              <td style={tdStyle}>{p.name}</td>
              <Blank />
              <Blank />
              <td style={tdStyle}>{p.phone ? <Ltr>{p.phone}</Ltr> : ' '}</td>
              <td style={tdStyle}>מתנדב</td>
              <Blank />
              <td style={tdStyle}><Ltr>{hours}</Ltr></td>
              <Blank />
            </tr>
          ))}
        </tbody>
      </table>

      {/* 5. רכבים */}
      <div style={sectionLabel}>רכבים</div>
      <table style={tableStyle}>
        <HeaderRow cols={VEHICLE_COLS} />
        <tbody>
          <tr>
            <td style={tdStyle}>{vehicleNumber ? <Ltr>{vehicleNumber}</Ltr> : ' '}</td>
            <td style={tdStyle}><Ltr>{hours}</Ltr></td>
          </tr>
        </tbody>
      </table>

      {/* 6. משימות לביצוע */}
      <div style={sectionLabel}>משימות לביצוע</div>
      <table style={tableStyle}>
        <HeaderRow cols={TASK_COLS} />
        <tbody>
          <tr>
            <td style={tdStyle}>{shiftName}</td>
            <Blank />
            <td style={tdStyle}>{TASK1_TYPE}</td>
            <Blank />
            <Blank />
            <td style={{ ...tdStyle, textAlign: 'right' }}>{TASK1_DESC}</td>
            <td style={tdStyle}><Ltr>{hours}</Ltr></td>
            <Blank />
          </tr>
          <tr>
            <td style={tdStyle}>{shiftName}</td>
            <Blank />
            <td style={tdStyle}>{TASK2_TYPE}</td>
            <Blank />
            <Blank />
            <td style={{ ...tdStyle, textAlign: 'right' }}>{TASK2_DESC}</td>
            <td style={tdStyle}><Ltr>{hours}</Ltr></td>
            <Blank />
          </tr>
        </tbody>
      </table>
    </div>
  );
};
