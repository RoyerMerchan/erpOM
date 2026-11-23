import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

const require = createRequire(import.meta.url);
const fonts = {
  regular: require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff'),
  bold: require.resolve('@fontsource/inter/files/inter-latin-700-normal.woff'),
};
const navy = '#172440';
const muted = '#53637c';
const line = '#dfe6ee';
const pageInset = 42;
const bodyInset = 9;
type Doc = PDFKit.PDFDocument;
type PdfColumn = { label: string; weight?: number; right?: boolean };

export const printText = (value: string) =>
  value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/[‐‑‒–—]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim();

function text(
  doc: Doc,
  value: string,
  x: number,
  y: number,
  width: number,
  options: PDFKit.Mixins.TextOptions = {},
) {
  doc.text(printText(value), x, y, { width, ...options });
}

export async function makePdf(
  header: { title: string; shop: string; details: string; landscape?: boolean },
  draw: (layout: PdfLayout) => void,
) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    margin: 0,
    size: 'A4',
    layout: header.landscape ? 'landscape' : 'portrait',
    info: { Title: header.title, Author: header.shop },
  });
  doc.registerFont('Regular', fonts.regular).registerFont('Bold', fonts.bold);
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const layout = new PdfLayout(doc, header);
  try {
    draw(layout);
    layout.finish();
    doc.end();
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error('Error al generar el PDF.'));
  }
  return result;
}

class PdfLayout {
  private y = pageInset;
  constructor(
    private readonly doc: Doc,
    private readonly header: { title: string; shop: string; details: string },
  ) {
    this.newPage();
  }
  get width() {
    return this.doc.page.width - 2 * pageInset;
  }
  private get bottom() {
    return this.doc.page.height - 54;
  }

  private newPage() {
    const doc = this.doc;
    doc.addPage();
    doc.rect(pageInset, pageInset, 32, 4).fill('#284f88');
    doc.font('Bold').fontSize(24).fillColor(navy);
    text(doc, this.header.title, pageInset, pageInset + 15, this.width);
    doc.font('Bold').fontSize(11).fillColor(navy);
    text(doc, this.header.shop, pageInset, doc.y + 5, this.width);
    doc.font('Regular').fontSize(9).fillColor(muted);
    text(doc, this.header.details, pageInset, doc.y + 5, this.width);
    this.y = doc.y + 18;
  }

  paragraph(value: string) {
    const doc = this.doc;
    doc.font('Regular').fontSize(10).fillColor(muted);
    text(doc, value, pageInset, this.y, this.width);
    this.y = doc.y + 12;
  }

  catalogCard(input: {
    title: string;
    caption: string;
    description?: string | null;
    sizes: string;
    usd: string;
    local?: string | null;
  }) {
    const doc = this.doc;
    const left = this.width - 155;
    doc.font('Bold').fontSize(12);
    const title = doc.heightOfString(printText(input.title), { width: left });
    doc.font('Regular').fontSize(9);
    const caption = input.caption
      ? doc.heightOfString(printText(input.caption), { width: left }) + 3
      : 0;
    const sizes = doc.heightOfString(printText(input.sizes), { width: this.width - 24 });
    const description = input.description
      ? doc.heightOfString(printText(input.description), { width: this.width - 24 }) + 6
      : 0;
    const headerHeight = Math.max(title + caption, input.local ? 33 : 18);
    const height = 24 + headerHeight + sizes + description + 9;
    if (this.y + height > this.bottom) this.newPage();
    const y = this.y;
    doc.roundedRect(pageInset, y, this.width, height, 7).fillAndStroke('#f8fafc', line);
    doc.font('Bold').fontSize(12).fillColor(navy);
    text(doc, input.title, pageInset + 12, y + 12, left);
    if (input.caption) {
      doc.font('Regular').fontSize(9).fillColor(muted);
      text(doc, input.caption, pageInset + 12, y + 14 + title, left);
    }
    doc.font('Bold').fontSize(12).fillColor(navy);
    text(doc, input.usd, pageInset + this.width - 135, y + 12, 123, { align: 'right' });
    if (input.local) {
      doc.font('Regular').fontSize(9).fillColor(muted);
      text(doc, input.local, pageInset + this.width - 135, y + 29, 123, { align: 'right' });
    }
    doc.font('Regular').fontSize(9).fillColor(navy);
    text(doc, input.sizes, pageInset + 12, y + 16 + headerHeight, this.width - 24);
    if (input.description) {
      doc.fillColor(muted);
      text(doc, input.description, pageInset + 12, y + 19 + headerHeight + sizes, this.width - 24);
    }
    this.y += height + 9;
  }

  table(title: string, columns: PdfColumn[], rows: string[][]) {
    const doc = this.doc;
    const weights = columns.reduce((sum, item) => sum + (item.weight ?? 1), 0);
    const widths = columns.map((item) => (this.width * (item.weight ?? 1)) / weights);
    const rowHeight = (values: string[]) =>
      Math.max(
        11,
        ...values.map((value, i) =>
          doc.heightOfString(printText(value), {
            width: (widths[i] ?? this.width) - 2 * bodyInset,
          }),
        ),
      ) + 12;
    const drawRow = (values: string[], height: number, background: string, color: string) => {
      doc.rect(pageInset, this.y, this.width, height).fill(background);
      let x = pageInset;
      values.forEach((value, index) => {
        const width = widths[index] ?? this.width;
        doc.fillColor(color);
        text(doc, value, x + bodyInset, this.y + 5, width - 2 * bodyInset, {
          align: columns[index]?.right ? 'right' : 'left',
        });
        x += width;
      });
      this.y += height;
      doc
        .moveTo(pageInset, this.y)
        .lineTo(pageInset + this.width, this.y)
        .lineWidth(0.5)
        .strokeColor(line)
        .stroke();
    };
    const labels = columns.map(({ label }) => label);
    const heading = () => {
      doc.font('Bold').fontSize(13).fillColor(navy);
      text(doc, title, pageInset, this.y, this.width);
      this.y = doc.y + 7;
      doc.font('Bold').fontSize(8);
      drawRow(labels, rowHeight(labels), '#eaf0f8', navy);
      doc.font('Regular').fontSize(8.5);
    };
    if (this.y + 113 > this.bottom) this.newPage();
    heading();
    if (!rows.length) this.paragraph('Sin registros para los filtros aplicados.');
    rows.forEach((values, index) => {
      doc.font('Regular').fontSize(8.5);
      const height = rowHeight(values);
      if (this.y + height > this.bottom) {
        this.newPage();
        heading();
      }
      drawRow(values, height, index % 2 ? '#f8fafc' : '#ffffff', navy);
    });
    this.y += 17;
  }

  finish() {
    const doc = this.doc;
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      doc.switchToPage(index);
      const y = doc.page.height - 39;
      doc
        .moveTo(pageInset, y)
        .lineTo(pageInset + this.width, y)
        .lineWidth(0.65)
        .strokeColor(line)
        .stroke();
      doc.font('Regular').fontSize(8).fillColor(muted);
      text(doc, 'Página ' + (index + 1) + ' de ' + pages.count, pageInset, y + 8, this.width, {
        align: 'right',
      });
    }
  }
}
