import type { Ledger } from './ledger';
import { money } from './format';

/** 한글을 쓰려면 PDF 에 글꼴을 넣어야 한다. 용량이 커서 내려받을 때만 불러온다. */
async function loadFont(): Promise<string> {
  const { default: url } = await import('pretendard/dist/public/static/alternative/Pretendard-Regular.ttf?url');
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** 경비 화면에 보이는 표를 그대로 A4 가로 PDF 로 저장한다 */
export async function downloadLedgerPdf(ledger: Ledger, opts: { title: string; conditions: string; fileName: string }) {
  const [{ jsPDF }, { autoTable }, font] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadFont()]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Pretendard.ttf', font);
  doc.addFont('Pretendard.ttf', 'Pretendard', 'normal');
  doc.addFont('Pretendard.ttf', 'Pretendard', 'bold');
  doc.setFont('Pretendard', 'normal');

  const wine: [number, number, number] = [120, 1, 21];
  doc.setTextColor(...wine);
  doc.setFontSize(16);
  doc.text(opts.title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 120);
  doc.text(opts.conditions, 14, 22);

  const body = ledger.rows.map((r) => {
    if (r.type === 'lease') {
      const [y, m] = r.l.yearMonth.split('-');
      return [
        y,
        `${Number(m)}월분`,
        '',
        `임차관리비 (임대료 ${money(r.l.rent + r.l.maintenanceFee)} / 전기료 ${money(r.l.electricity)})`,
        '',
        '',
        money(r.l.total),
        '',
        '',
      ];
    }
    const e = r.e;
    const [y, m, d] = e.expenseDate.split('-');
    return [
      y,
      `${Number(m)}.${Number(d)}`,
      e.vendor,
      e.itemName + (e.source === 'SUBSCRIPTION' ? ' (구독)' : ''),
      money(e.supplyAmount),
      money(e.taxAmount),
      money(e.totalAmount),
      e.debitAccountName,
      e.attachmentCount ? `${e.attachmentCount}개` : '',
    ];
  });

  autoTable(doc, {
    startY: 27,
    head: [['연도', '일자', '거래처', '품명', '공급가액', '세액', '합계', '차변계정', '첨부']],
    body,
    foot: [
      ['', '', '', `경비 ${ledger.expenseCount}건`, money(ledger.supply), money(ledger.tax), money(ledger.expenseTotal), '', ''],
      ...(ledger.leaseTotal ? [['', '', '', '임차관리비', '', '', money(ledger.leaseTotal), '', '']] : []),
      ['', '', '', '총 합계', '', '', money(ledger.grandTotal), '', ''],
    ],
    styles: { font: 'Pretendard', fontSize: 8.5, cellPadding: 1.8, lineColor: [236, 231, 229], lineWidth: 0.1 },
    headStyles: { fillColor: [246, 234, 236], textColor: wine, fontStyle: 'bold' },
    footStyles: { fillColor: [246, 234, 236], textColor: [36, 28, 30], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 13 },
      1: { cellWidth: 15 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 26 },
      7: { cellWidth: 26 },
      8: { cellWidth: 12, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.column.index >= 4 && data.column.index <= 6) data.cell.styles.halign = 'right';
      if (data.section === 'head') return;
      const text = String(data.cell.raw ?? '');
      if (text.startsWith('-')) data.cell.styles.textColor = [198, 40, 40];
    },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140, 150, 170);
      doc.text(`${page}쪽`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    },
  });

  doc.save(opts.fileName);
}
