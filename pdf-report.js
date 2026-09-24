import { buildDailyReportData } from './report.js';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const textEncoder = new TextEncoder();

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Rapor logosu okunamadı.'));
    image.src = url;
  });
}

function formatNumber(value, sourceFormat = 'General') {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (sourceFormat.includes('%')) {
    const decimals = sourceFormat.includes('0.0%') ? 1 : 0;
    return new Intl.NumberFormat('tr-TR', {
      style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }).format(number);
  }
  const decimals = sourceFormat.includes('0.00') ? 2 : sourceFormat.includes('0.0') ? 1 : 0;
  return new Intl.NumberFormat('tr-TR', {
    useGrouping: sourceFormat.includes(','), minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }).format(number);
}

function wrapLine(context, text, maxWidth) {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  lines.push(line);
  return lines;
}

function textLines(context, text, maxWidth, wrap) {
  const explicit = String(text).split('\n');
  return wrap ? explicit.flatMap(line => wrapLine(context, line, maxWidth)) : explicit;
}

function colorLuminance(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || ''));
  if (!match) return null;
  const values = [0, 2, 4].map(index => Number.parseInt(match[1].slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function readableTextColor(foreground, background) {
  const foregroundLight = colorLuminance(foreground);
  const backgroundLight = colorLuminance(background || '#FFFFFF');
  if (foregroundLight === null || backgroundLight === null) return foreground || '#000000';
  if (Math.abs(foregroundLight - backgroundLight) >= 0.38) return foreground;
  return backgroundLight > 0.5 ? '#111827' : '#FFFFFF';
}

function drawCellText(context, cell, value) {
  const text = typeof value === 'number' ? formatNumber(value, cell.format) : String(value);
  const bold = cell.bold ? 'bold ' : '';
  const italic = cell.italic ? 'italic ' : '';
  let fontSize = Number(cell.fontSize) || 12;
  const maxWidth = Math.max(1, cell.width - 8);
  const maxHeight = Math.max(1, cell.height - 4);
  const setFont = () => { context.font = `${italic}${bold}${fontSize}px serif`; };
  setFont();
  if (!cell.wrap) {
    const widest = Math.max(...String(text).split('\n').map(line => context.measureText(line).width), 0);
    if (widest > maxWidth) {
      fontSize *= maxWidth / widest;
      setFont();
    }
  }
  let lines = textLines(context, text, maxWidth, cell.wrap);
  let lineHeight = fontSize * 1.14;
  const currentHeight = () => lines.length * lineHeight;
  if (currentHeight() > maxHeight) {
    fontSize *= maxHeight / currentHeight();
    setFont();
    lines = textLines(context, text, maxWidth, cell.wrap);
    lineHeight = fontSize * 1.14;
  }
  const blockHeight = lines.length * lineHeight;
  const vertical = cell.vertical === 'top' ? 2
    : cell.vertical === 'center' ? (cell.height - blockHeight) / 2
      : cell.height - blockHeight - 2;
  context.save();
  context.beginPath();
  context.rect(cell.x, cell.y, cell.width, cell.height);
  context.clip();
  context.fillStyle = readableTextColor(cell.color || '#000000', cell.fill || '#FFFFFF');
  context.textBaseline = 'top';
  context.textAlign = cell.alignment === 'center' ? 'center' : cell.alignment === 'right' ? 'right' : 'left';
  const x = cell.alignment === 'center' ? cell.x + cell.width / 2
    : cell.alignment === 'right' ? cell.x + cell.width - 4 : cell.x + 4;
  lines.forEach((line, index) => context.fillText(line, x, cell.y + Math.max(0, vertical) + index * lineHeight));
  context.restore();
}

function drawBorders(context, cell) {
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const border = cell.borders?.[edge];
    if (!border) continue;
    context.beginPath();
    context.strokeStyle = border.color || '#000000';
    context.lineWidth = Number(border.width) || 1;
    if (edge === 'left') { context.moveTo(cell.x, cell.y); context.lineTo(cell.x, cell.y + cell.height); }
    if (edge === 'right') { context.moveTo(cell.x + cell.width, cell.y); context.lineTo(cell.x + cell.width, cell.y + cell.height); }
    if (edge === 'top') { context.moveTo(cell.x, cell.y); context.lineTo(cell.x + cell.width, cell.y); }
    if (edge === 'bottom') { context.moveTo(cell.x, cell.y + cell.height); context.lineTo(cell.x + cell.width, cell.y + cell.height); }
    context.stroke();
  }
}

async function renderReportCanvas(template, cells) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(template.width);
  canvas.height = Math.ceil(template.height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('PDF çizim alanı oluşturulamadı.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  template.cells.forEach(cell => {
    if (cell.fill) {
      context.fillStyle = cell.fill;
      context.fillRect(cell.x, cell.y, cell.width, cell.height);
    }
  });
  template.cells.forEach(cell => {
    drawBorders(context, cell);
    const value = Object.hasOwn(cells, cell.address) ? cells[cell.address] : cell.value;
    if (value !== null && value !== undefined) drawCellText(context, cell, value);
  });

  const images = await Promise.all(template.images.map(entry => loadImage(`./assets/daily_report/${entry.file}`)));
  images.forEach((image, index) => {
    const entry = template.images[index];
    context.drawImage(image, entry.x, entry.y, entry.width, entry.height);
  });
  return canvas;
}

function canvasJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('PDF görüntüsü hazırlanamadı.'));
    }, 'image/jpeg', 0.96);
  });
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach(part => { result.set(part, offset); offset += part.length; });
  return result;
}

function ascii(value) {
  return textEncoder.encode(value);
}

export function makePdfWithJpeg(jpeg, imageWidth, imageHeight, placement) {
  const objects = [];
  const content = `q\n${placement.width.toFixed(3)} 0 0 ${placement.height.toFixed(3)} ${placement.left.toFixed(3)} ${(PAGE_HEIGHT - placement.top - placement.height).toFixed(3)} cm\n/Im0 Do\nQ\n`;
  objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects[3] = ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>');
  objects[4] = ascii(`<< /Length ${ascii(content).length} >>\nstream\n${content}endstream`);
  objects[5] = concatBytes([
    ascii(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    ascii('\nendstream')
  ]);

  const parts = [concatBytes([ascii('%PDF-1.4\n%'), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), ascii('\n')])];
  const offsets = [0];
  let offset = parts[0].length;
  for (let number = 1; number <= 5; number += 1) {
    offsets[number] = offset;
    const object = concatBytes([ascii(`${number} 0 obj\n`), objects[number], ascii('\nendobj\n')]);
    parts.push(object);
    offset += object.length;
  }
  const xrefOffset = offset;
  const xrefRows = offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(ascii(`xref\n0 6\n0000000000 65535 f \n${xrefRows}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return concatBytes(parts);
}

function reportFileName(periodLabel) {
  const safePeriod = periodLabel.replaceAll(' ', '').replaceAll('.', '-').replaceAll('/', '-');
  return `Gunluk_Icraat_${safePeriod}.pdf`;
}

export async function createDailyReportPdf(evks, accidents) {
  const [templateResponse, referenceResponse] = await Promise.all([
    fetch('./assets/daily_report/template.json'),
    fetch('./assets/reference_data.json', { cache: 'no-cache' })
  ]);
  if (!templateResponse.ok) throw new Error('PDF şablonu okunamadı.');
  if (!referenceResponse.ok) throw new Error('Aylık hedef dosyası okunamadı.');
  const [template, reference] = await Promise.all([templateResponse.json(), referenceResponse.json()]);
  const placement = {
    left: Number(template.left),
    top: Number(template.top),
    width: Number(template.width) * Number(template.scale),
    height: Number(template.height) * Number(template.scale)
  };
  if (![placement.left, placement.top, placement.width, placement.height].every(Number.isFinite)
      || placement.left < 0 || placement.top < 0
      || placement.left + placement.width > PAGE_WIDTH
      || placement.top + placement.height > PAGE_HEIGHT) {
    throw new Error('Rapor şablonu A4 sınırlarını aşıyor.');
  }
  const report = buildDailyReportData(evks, accidents, reference);
  const canvas = await renderReportCanvas(template, report.cells);
  const jpegBlob = await canvasJpeg(canvas);
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = makePdfWithJpeg(jpeg, canvas.width, canvas.height, placement);
  const file = new File([pdf], reportFileName(report.periodLabel), { type: 'application/pdf' });
  return { file, report };
}
