export interface MasterPalletListPdfRow {
  partNumber: string;
  quantity: number;
}

export interface MasterPalletListPdfOptions {
  rack: string;
  locationCode: string;
  rows: MasterPalletListPdfRow[];
}

const formatQuantity = (quantity: number) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
}).format(quantity);

export async function downloadMasterPalletListPdf({ rack, locationCode, rows }: MasterPalletListPdfOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 16;
  const locationRows: [string, string][] = rows.map(row => [row.partNumber, formatQuantity(row.quantity)]);

  // Deja renglones para completar a mano cuando la ubicación tenga pocos artículos.
  while (locationRows.length < 5) locationRows.push(['', '']);

  autoTable(document, {
    startY: 42,
    margin: { top: 42, right: margin, bottom: 35, left: margin },
    head: [['ITEM NUMBER', 'QUANTITY']],
    body: locationRows,
    theme: 'plain',
    styles: {
      font: 'times',
      fontSize: 15,
      textColor: [31, 41, 55],
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      minCellHeight: 19,
      lineWidth: 0,
      overflow: 'linebreak',
    },
    headStyles: {
      font: 'times',
      fontStyle: 'bold',
      fontSize: 11,
      textColor: [75, 85, 70],
      minCellHeight: 10,
    },
    columnStyles: {
      0: { cellWidth: pageWidth - (margin * 2) - 62, halign: 'left' },
      1: { cellWidth: 62, halign: 'center' },
    },
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      document.setFont('times', 'bold');
      document.setFontSize(22);
      document.setTextColor(31, 31, 31);
      document.text('MASTER PALLET LIST', pageWidth / 2, 20, { align: 'center' });
      document.setDrawColor(88, 88, 70);
      document.setLineWidth(0.7);
      document.line(margin, 26, pageWidth - margin, 26);
      document.setFont('times', 'bold');
      document.setFontSize(14);
      document.setTextColor(75, 85, 99);
      document.text(`RACK ${rack || '—'}`, margin, 35);
      document.text(`LOCATION ${locationCode}`, pageWidth - margin, 35, { align: 'right' });
    },
    didDrawCell: hookData => {
      if (hookData.column.index !== 0) return;
      if (hookData.section !== 'head' && hookData.section !== 'body') return;
      document.setDrawColor(100, 100, 82);
      document.setLineWidth(hookData.section === 'head' ? 0.65 : 0.45);
      document.line(margin, hookData.cell.y + hookData.cell.height, pageWidth - margin, hookData.cell.y + hookData.cell.height);
    },
  });

  const footerY = pageHeight - 22;
  const signatureX = margin;
  const locationStartX = pageWidth / 2;
  const locationEndX = pageWidth - margin;
  const locationCenterX = (locationStartX + locationEndX) / 2;
  document.setFont('times', 'normal');
  document.setFontSize(11);
  document.setTextColor(55, 65, 81);
  document.text('SIGNATURE:', signatureX, footerY);
  document.setDrawColor(88, 88, 70);
  document.setLineWidth(0.55);
  document.line(signatureX + 29, footerY + 1, pageWidth / 2 - 7, footerY + 1);
  document.setFont('times', 'bold');
  document.setFontSize(13);
  document.text(`LOCATION: ${locationCode}`, locationCenterX, footerY, { align: 'center' });
  document.line(locationStartX + 6, footerY + 3, locationEndX - 6, footerY + 3);

  const safeLocation = `${rack}-${locationCode}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  document.save(`master-pallet-list-${safeLocation || 'locacion'}.pdf`);
}
