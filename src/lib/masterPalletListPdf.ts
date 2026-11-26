export interface MasterPalletListPdfRow {
  partNumber: string;
  quantity: number;
}

export interface MasterPalletListPdfOptions {
  rack: string;
  locationCode: string;
  rows: MasterPalletListPdfRow[];
}

const MASTER_PALLET_FONT_SIZE = 48;
const MASTER_PALLET_LABEL_FONT_SIZE = 26;

const formatQuantity = (quantity: number) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
}).format(quantity);

export async function createMasterPalletListPdf({ rack, locationCode, rows }: MasterPalletListPdfOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 16;
  const usableWidth = pageWidth - (margin * 2);
  const locationRows: [string, string][] = rows.map(row => [row.partNumber, formatQuantity(row.quantity)]);

  // Conserva tres renglones cuando hay pocas asignaciones para dejar espacio de escritura.
  while (locationRows.length < 3) locationRows.push(['', '']);

  document.setFont('times', 'normal');
  document.setFontSize(MASTER_PALLET_FONT_SIZE);
  const widestPartNumber = Math.max(0, ...rows.map(row => document.getTextWidth(row.partNumber)));
  const widestQuantity = Math.max(0, ...rows.map(row => document.getTextWidth(formatQuantity(row.quantity))));
  const quantityColumnWidth = Math.min(usableWidth * 0.35, Math.max(40, widestQuantity + 8));
  const requestedPartColumnWidth = Math.max(140, widestPartNumber + 8);
  const tableWidth = Math.min(usableWidth, requestedPartColumnWidth + quantityColumnWidth);
  const partColumnWidth = tableWidth - quantityColumnWidth;
  const tableLeft = (pageWidth - tableWidth) / 2;
  const tableRight = tableLeft + tableWidth;
  const tableHeaderY = 68;
  const bodyStartY = 77;

  document.setFont('times', 'bold');
  document.setFontSize(MASTER_PALLET_LABEL_FONT_SIZE);
  const quantityHeaderWidth = document.getTextWidth('QUANTITY');
  const rawQuantityHeaderCenter = tableLeft + partColumnWidth + (quantityColumnWidth / 2);
  const quantityHeaderCenter = Math.max(
    quantityHeaderWidth / 2 + 2,
    Math.min(rawQuantityHeaderCenter, pageWidth - (quantityHeaderWidth / 2) - 2),
  );

  autoTable(document, {
    startY: bodyStartY,
    margin: {
      top: bodyStartY,
      right: pageWidth - tableRight,
      bottom: 61,
      left: tableLeft,
    },
    body: locationRows,
    theme: 'plain',
    styles: {
      font: 'times',
      fontSize: MASTER_PALLET_FONT_SIZE,
      textColor: [31, 41, 55],
      cellPadding: { top: 0, right: 3, bottom: 0, left: 3 },
      minCellHeight: 19,
      lineWidth: 0,
      overflow: 'linebreak',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: partColumnWidth, halign: 'left' },
      1: { cellWidth: quantityColumnWidth, halign: 'center' },
    },
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      document.setFont('times', 'bold');
      document.setFontSize(MASTER_PALLET_FONT_SIZE);
      document.setTextColor(31, 31, 31);
      document.text('MASTER PALLET LIST', pageWidth / 2, 20, { align: 'center' });
      document.setDrawColor(88, 88, 70);
      document.setLineWidth(0.7);
      document.line(margin, 29, pageWidth - margin, 29);
      document.setTextColor(75, 85, 99);
      document.setFontSize(MASTER_PALLET_LABEL_FONT_SIZE);
      document.text(`RACK ${rack || '—'}`, margin, 48);
      document.text(`LOCATION ${locationCode}`, pageWidth - margin, 48, { align: 'right' });
      document.text('ITEM NUMBER', tableLeft + 3, tableHeaderY);
      document.text('QUANTITY', quantityHeaderCenter, tableHeaderY, { align: 'center' });
      document.setDrawColor(88, 88, 70);
      document.setLineWidth(0.65);
      document.line(margin, 74, pageWidth - margin, 74);
    },
    didDrawCell: hookData => {
      if (hookData.column.index !== 0 || hookData.section !== 'body') return;
      document.setDrawColor(100, 100, 82);
      document.setLineWidth(0.45);
      document.line(margin, hookData.cell.y + hookData.cell.height, pageWidth - margin, hookData.cell.y + hookData.cell.height);
    },
  });

  const footerSignatureY = pageHeight - 40;
  document.setFont('times', 'normal');
  document.setFontSize(MASTER_PALLET_FONT_SIZE);
  document.setTextColor(55, 65, 81);
  document.text('SIGNATURE:', margin, footerSignatureY);
  const signatureWidth = document.getTextWidth('SIGNATURE:');
  document.setDrawColor(88, 88, 70);
  document.setLineWidth(0.55);
  document.line(margin + signatureWidth + 5, footerSignatureY + 3, pageWidth - margin, footerSignatureY + 3);

  const footerLocationY = pageHeight - 12;
  document.setFont('times', 'bold');
  document.setFontSize(MASTER_PALLET_FONT_SIZE);
  document.text(`LOCATION: ${locationCode}`, pageWidth / 2, footerLocationY, { align: 'center' });
  document.line(pageWidth / 2 - 85, footerLocationY + 4, pageWidth / 2 + 85, footerLocationY + 4);

  const safeLocation = `${rack}-${locationCode}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return {
    document,
    filename: `master-pallet-list-${safeLocation || 'locacion'}.pdf`,
  };
}

export async function downloadMasterPalletListPdf(options: MasterPalletListPdfOptions) {
  const { document, filename } = await createMasterPalletListPdf(options);
  document.save(filename);
}
