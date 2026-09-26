import { buildDailyReportData, validateReferenceData } from './report.js';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const textEncoder = new TextEncoder();
const REPORT_BORDER_COLOR = '#000000';
const REPORT_BORDER_WIDTH = 1;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Rapor logosu okunamadı.'));
    image.src = url;
  });
}

export function formatNumber(value, sourceFormat = 'General') {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (sourceFormat.includes('%')) {
    const decimals = sourceFormat.includes('0.0%') ? 1 : 0;
    const percentage = new Intl.NumberFormat('tr-TR', {
      useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }).format(number * 100);
    return `${percentage}%`;
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

function cellRow(address) {
  const match = /^(?:[A-Z]+)(\d+)$/.exec(address);
  return match ? Number(match[1]) : null;
}

function resolvedCellValue(address, cells, templateCells) {
  if (Object.hasOwn(cells, address)) return cells[address];
  return templateCells.get(address)?.value;
}

function numericCellValue(address, cells, templateCells) {
  const value = resolvedCellValue(address, cells, templateCells);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function controlStatus(address, cells, templateCells) {
  const match = /^([EIMQ])(4[5-9]|50|51)$/.exec(address);
  if (!match) return null;
  const targetColumn = { E: 'C', I: 'G', M: 'K', Q: 'O' }[match[1]];
  const target = numericCellValue(`${targetColumn}${match[2]}`, cells, templateCells);
  const actual = numericCellValue(address, cells, templateCells);
  if (target === null || actual === null) return null;
  if (target === 0) return actual > 0 ? 'met' : 'neutral';
  return actual >= target ? 'met' : 'missed';
}

function semanticFill(cell, cells, templateCells) {
  const status = controlStatus(cell.address, cells, templateCells);
  if (status === 'met') return '#86C99A';
  if (status === 'missed') return '#E58A78';
  if (status === 'neutral') return '#DDE3E9';
  if (/^[CGKO]53$/.test(cell.address) || /^[DFHJLNPR](84|86|88|90|92)$/.test(cell.address)) {
    return '#FFFFFF';
  }
  const row = cellRow(cell.address);
  const column = /^([A-Z]+)/.exec(cell.address)?.[1];
  const totalBodyRows = [23, 26, 29, 32, 45, 46, 47, 48, 49, 50, 51,
    64, 65, 66, 67, 68, 69, 70, 71, 72, 82, 83, 84, 86, 88, 90, 92, 103, 104, 105, 106];
  if (['O', 'P', 'Q', 'R'].includes(column) && totalBodyRows.includes(row)) {
    return [26, 32, 45, 47, 49, 51, 65, 66, 68, 69, 70, 72, 84, 88, 92, 104, 106].includes(row)
      ? '#C9D5E2' : '#E8EDF3';
  }
  if ([26, 32, 45, 47, 49, 51, 65, 66, 68, 69, 70, 72, 84, 88, 92, 104, 106].includes(row)) {
    return '#D9E0E8';
  }
  if ([23, 29, 46, 48, 50, 67, 71, 86, 90, 105].includes(row)) return '#FFFFFF';
  if (/^#CCFF(?:00|33)$/i.test(String(cell.fill || ''))) return '#D7E8BE';
  return cell.fill || '#FFFFFF';
}

function drawCellText(context, cell, value, background) {
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
  context.fillStyle = readableTextColor(cell.color || '#000000', background || '#FFFFFF');
  context.textBaseline = 'top';
  context.textAlign = cell.alignment === 'center' ? 'center' : cell.alignment === 'right' ? 'right' : 'left';
  const x = cell.alignment === 'center' ? cell.x + cell.width / 2
    : cell.alignment === 'right' ? cell.x + cell.width - 4 : cell.x + 4;
  lines.forEach((line, index) => context.fillText(line, x, cell.y + Math.max(0, vertical) + index * lineHeight));
  context.restore();
}

function drawControlIcon(context, cell, status) {
  if (!status || status === 'neutral') return;
  const centerX = cell.x + Math.min(18, cell.width * 0.13);
  const centerY = cell.y + cell.height / 2;
  const radius = Math.min(12, cell.height * 0.27);
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = status === 'met' ? '#2C7242' : '#913629';
  context.fill();
  context.strokeStyle = '#FFFFFF';
  context.lineWidth = Math.max(2, radius * 0.2);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (status === 'met') {
    context.moveTo(centerX - radius * 0.48, centerY);
    context.lineTo(centerX - radius * 0.1, centerY + radius * 0.38);
    context.lineTo(centerX + radius * 0.55, centerY - radius * 0.42);
  } else {
    context.moveTo(centerX - radius * 0.42, centerY - radius * 0.42);
    context.lineTo(centerX + radius * 0.42, centerY + radius * 0.42);
    context.moveTo(centerX + radius * 0.42, centerY - radius * 0.42);
    context.lineTo(centerX - radius * 0.42, centerY + radius * 0.42);
  }
  context.stroke();
  context.restore();
}

function drawAchievementBar(context, cell, ratio) {
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
  const inset = 6;
  const x = cell.x + inset;
  const y = cell.y + Math.max(6, cell.height * 0.18);
  const width = Math.max(1, cell.width - inset * 2);
  const height = Math.max(8, cell.height - Math.max(12, cell.height * 0.36));
  const color = safeRatio >= 1 ? '#79B889' : safeRatio >= 0.8 ? '#E4BE42' : '#D97A68';
  context.save();
  context.fillStyle = '#F4F5F7';
  context.fillRect(x, y, width, height);
  context.fillStyle = color;
  context.fillRect(x, y, width * Math.min(1, safeRatio), height);
  context.strokeStyle = REPORT_BORDER_COLOR;
  context.lineWidth = REPORT_BORDER_WIDTH;
  context.strokeRect(x, y, width, height);
  context.restore();
}

function drawShareBar(context, cell, ratio) {
  if (!Number.isFinite(ratio) || ratio < 0) return;
  const width = Math.max(0, cell.width * Math.min(1, ratio));
  context.save();
  context.fillStyle = '#B8D7C0';
  context.fillRect(cell.x, cell.y, width, cell.height);
  if (width > 2) {
    context.strokeStyle = '#77B78A';
    context.lineWidth = 1;
    for (let x = cell.x + 5; x < cell.x + width; x += 9) {
      context.beginPath();
      context.moveTo(x, cell.y + cell.height);
      context.lineTo(Math.min(x + cell.height, cell.x + width), cell.y);
      context.stroke();
    }
  }
  context.restore();
}

function drawTrendArrow(context, cell, direction) {
  const centerX = cell.x + Math.min(19, cell.width * 0.13);
  const centerY = cell.y + cell.height / 2;
  const size = Math.min(15, cell.height * 0.3);
  context.save();
  context.fillStyle = direction === 'up' ? '#3C7D4E' : direction === 'down' ? '#A9473A' : '#606A75';
  context.strokeStyle = context.fillStyle;
  context.lineWidth = Math.max(4, size * 0.33);
  context.lineCap = 'square';
  context.beginPath();
  if (direction === 'up') {
    context.moveTo(centerX, centerY + size * 0.62);
    context.lineTo(centerX, centerY - size * 0.42);
    context.stroke();
    context.beginPath();
    context.moveTo(centerX, centerY - size);
    context.lineTo(centerX - size * 0.62, centerY - size * 0.22);
    context.lineTo(centerX + size * 0.62, centerY - size * 0.22);
  } else if (direction === 'down') {
    context.moveTo(centerX, centerY - size * 0.62);
    context.lineTo(centerX, centerY + size * 0.42);
    context.stroke();
    context.beginPath();
    context.moveTo(centerX, centerY + size);
    context.lineTo(centerX - size * 0.62, centerY + size * 0.22);
    context.lineTo(centerX + size * 0.62, centerY + size * 0.22);
  } else {
    context.moveTo(centerX - size * 0.7, centerY);
    context.lineTo(centerX + size * 0.34, centerY);
    context.stroke();
    context.beginPath();
    context.moveTo(centerX + size, centerY);
    context.lineTo(centerX + size * 0.25, centerY - size * 0.62);
    context.lineTo(centerX + size * 0.25, centerY + size * 0.62);
  }
  context.closePath();
  context.fill();
  context.restore();
}

function drawBorders(context, cell) {
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const border = cell.borders?.[edge];
    if (!border) continue;
    context.beginPath();
    context.strokeStyle = REPORT_BORDER_COLOR;
    context.lineWidth = REPORT_BORDER_WIDTH;
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

  const templateCells = new Map(template.cells.map(cell => [cell.address, cell]));
  const backgrounds = new Map();
  template.cells.forEach(cell => {
    const background = semanticFill(cell, cells, templateCells);
    backgrounds.set(cell.address, background);
    context.fillStyle = background;
    context.fillRect(cell.x, cell.y, cell.width, cell.height);
  });
  template.cells.forEach(cell => {
    const value = resolvedCellValue(cell.address, cells, templateCells);
    if (/^[CGKO]53$/.test(cell.address)) drawAchievementBar(context, cell, Number(value));
    if (/^[DFHJLNPR](84|86|88|90|92)$/.test(cell.address)) drawShareBar(context, cell, Number(value));
  });
  template.cells.forEach(cell => {
    drawBorders(context, cell);
    const value = resolvedCellValue(cell.address, cells, templateCells);
    if (value !== null && value !== undefined) drawCellText(context, cell, value, backgrounds.get(cell.address));
    drawControlIcon(context, cell, controlStatus(cell.address, cells, templateCells));
    const trend = /^([EIMQ])(104|105|106)$/.exec(cell.address);
    if (trend) {
      const baselineColumn = { E: 'C', I: 'G', M: 'K', Q: 'O' }[trend[1]];
      const baseline = numericCellValue(`${baselineColumn}${trend[2]}`, cells, templateCells);
      const actual = numericCellValue(cell.address, cells, templateCells);
      if (baseline !== null && actual !== null) {
        drawTrendArrow(context, cell, actual > baseline ? 'up' : actual < baseline ? 'down' : 'flat');
      }
    }
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

export async function loadDailyReportReference() {
  const response = await fetch('./assets/reference_data.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Kontrol hedef dosyası okunamadı.');
  const reference = await response.json();
  validateReferenceData(reference);
  return reference;
}

export async function createDailyReportPdf(evks, accidents, suppliedReference = null) {
  const [templateResponse, reference] = await Promise.all([
    fetch('./assets/daily_report/template.json'),
    suppliedReference ? Promise.resolve(suppliedReference) : loadDailyReportReference()
  ]);
  if (!templateResponse.ok) throw new Error('PDF şablonu okunamadı.');
  validateReferenceData(reference);
  const template = await templateResponse.json();
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
