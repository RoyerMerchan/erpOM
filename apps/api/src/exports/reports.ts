import { analyticsSectionLabels } from '@max-sport/shared';
import type { AnalyticsResponse, AnalyticsTable } from '@max-sport/shared';
import ExcelJS from 'exceljs';
import { makePdf } from './pdf.js';

type Format = AnalyticsTable['columns'][number]['format'];
type Output = { body: Buffer | string; contentType: string; extension: string };
const exportType = {
  CSV: { contentType: 'text/csv; charset=utf-8', extension: 'csv' },
  XLSX: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  PDF: { contentType: 'application/pdf', extension: 'pdf' },
};

function reportTables(report: AnalyticsResponse): AnalyticsTable[] {
  const section = report.sections[0];
  if (!section) return [];
  const comparison = section.metrics.some((item) => item.previous !== undefined);
  const summary: AnalyticsTable = {
    id: 'summary',
    title: 'Indicadores',
    columns: [
      { label: 'Indicador', format: 'TEXT' },
      { label: 'Unidad', format: 'TEXT' },
      { label: 'Actual', format: 'COUNT' },
      ...(comparison ? [{ label: 'Anterior', format: 'COUNT' } as const] : []),
    ],
    rows: section.metrics.map((metric) => {
      const unit = metric.format === 'USD' ? 'USD' : metric.format === 'PERCENT' ? '%' : '';
      return {
        cells: [
          metric.label,
          unit,
          metric.value ?? '',
          ...(comparison ? [metric.previous ?? ''] : []),
        ],
      };
    }),
  };
  const trend = section.trend
    ? [
        {
          id: 'trend',
          title: section.trend.label + ' por intervalo',
          columns: [
            { label: 'Período', format: 'TEXT' },
            { label: 'Fecha', format: 'DATE' },
            { label: 'USD', format: 'USD' },
          ] as const,
          rows: [
            ...section.trend.current.map(({ date, value }) => ({ cells: ['Actual', date, value] })),
            ...section.trend.previous.map(({ date, value }) => ({
              cells: ['Anterior', date, value],
            })),
          ],
        },
      ]
    : [];
  return [
    summary,
    ...trend.map((table) => ({ ...table, columns: Array.from(table.columns) })),
    ...section.tables,
  ];
}

const numeric = (value: string, format: Format) =>
  ['COUNT', 'USD', 'PERCENT'].includes(format) && /^-?\d+(?:\.\d+)?$/.test(value);

function atTime(value: string, format: Format, zone: string) {
  return value && format === 'TIME'
    ? new Intl.DateTimeFormat('es', {
        timeZone: zone,
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : value;
}

export function csvField(value: string, format: Format = 'TEXT') {
  const safe = !numeric(value, format) && /^[\s\p{Cc}]*[=+@-]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

async function xlsx(report: AnalyticsResponse, tables: AnalyticsTable[], heading: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = report.shopName;
  const metadata = workbook.addWorksheet('Período');
  metadata.addRows([
    [heading],
    ['Tienda', report.shopName],
    ['Zona horaria', report.window.timezone],
    ['Desde', report.window.startDate],
    ['Hasta', report.window.endDate],
    ['Anterior desde', report.comparison.startDate],
    ['Anterior hasta', report.comparison.endDate],
  ]);
  metadata.getColumn(1).width = 24;
  metadata.getColumn(2).width = 42;
  metadata.getRow(1).font = { bold: true };
  for (const [index, table] of tables.entries()) {
    const tab = workbook.addWorksheet(
      index + 1 + ' ' + table.title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 27),
      { views: [{ state: 'frozen', ySplit: 1 }] },
    );
    tab.columns = table.columns.map(({ label, format }) => ({
      header: label,
      width: format === 'TEXT' ? 27 : 20,
    }));
    for (const { cells } of table.rows) {
      tab.addRow(
        cells.map((raw, i) => {
          const format = table.columns[i]?.format ?? 'TEXT';
          const value = atTime(raw, format, report.window.timezone);
          return numeric(value, format) && value.replace(/[.-]/g, '').length <= 15
            ? Number(value)
            : value;
        }),
      );
    }
    const hdr = tab.getRow(1);
    hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172440' } };
    hdr.height = 22;
    tab.columns.forEach((column, i) => {
      if (table.columns[i]?.format === 'USD') column.numFmt = '#,##0.00';
      if (table.columns[i]?.format === 'PERCENT') column.numFmt = '0.00" %"';
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportReport(
  report: AnalyticsResponse,
  format: keyof typeof exportType,
): Promise<Output> {
  const heading = report.sections[0]
    ? analyticsSectionLabels[report.sections[0].section]
    : 'Informe';
  const tables = reportTables(report);
  const subtitle =
    report.window.startDate +
    ' a ' +
    report.window.endDate +
    ' · ' +
    report.window.timezone +
    ' | Anterior ' +
    report.comparison.startDate +
    ' a ' +
    report.comparison.endDate;
  if (format === 'CSV') {
    const body =
      '\uFEFF' +
      [
        [heading, report.shopName].map((field) => csvField(field)).join(','),
        csvField(subtitle),
        ...tables.flatMap((table) => [
          '',
          csvField(table.title),
          table.columns.map(({ label }) => csvField(label)).join(','),
          ...table.rows.map(({ cells }) =>
            cells
              .map((raw, i) => {
                const style = table.columns[i]?.format ?? 'TEXT';
                return csvField(atTime(raw, style, report.window.timezone), style);
              })
              .join(','),
          ),
        ]),
      ].join('\r\n');
    return { ...exportType.CSV, body };
  }
  if (format === 'XLSX') return { ...exportType.XLSX, body: await xlsx(report, tables, heading) };
  const body = await makePdf(
    { title: heading, shop: report.shopName, details: subtitle, landscape: true },
    (layout) => {
      for (const table of tables)
        layout.table(
          table.title,
          table.columns.map(({ label, format }) => ({
            label,
            weight: format === 'TEXT' ? 1.5 : 1,
            right: ['COUNT', 'USD', 'PERCENT'].includes(format),
          })),
          table.rows.map(({ cells }) =>
            cells.map((value, i) => {
              const style = table.columns[i]?.format ?? 'TEXT';
              const shown = atTime(value, style, report.window.timezone);
              if (shown && style === 'USD') return shown + ' USD';
              if (shown && style === 'PERCENT') return shown + ' %';
              return shown;
            }),
          ),
        );
    },
  );
  return { ...exportType.PDF, body };
}
