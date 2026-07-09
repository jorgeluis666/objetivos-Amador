const SPREADSHEET_ID = '1Lj5rEepYZhHlf-VyGJwRYVMqnpWLu9lg3oL6wes3o-s';
const DEFAULT_SHEET_NAME = 'Julio';

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    if (payload.action !== 'updateReservationGoal') {
      throw new Error('Accion no soportada.');
    }
    const result = updateReservationGoal_(payload);
    return json_({ ok: true, result });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function updateReservationGoal_(payload) {
  const spreadsheet = SpreadsheetApp.openById(payload.spreadsheetId || SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(payload.sheetName || DEFAULT_SHEET_NAME);
  if (!sheet) throw new Error('No se encontro la hoja solicitada.');

  const values = sheet.getDataRange().getDisplayValues();
  const headerRow = values.findIndex(row => row.some(cell => normalize_(cell) === 'tipo') && row.some(cell => normalize_(cell) === 'estado'));
  if (headerRow < 0) throw new Error('No se encontro la fila de cabeceras.');

  const headers = values[headerRow].map(normalize_);
  const campaignCol = headers.indexOf('campana');
  const goalCol = headers.indexOf('objetivo reservas');
  const typeCol = headers.indexOf('tipo');
  if (campaignCol < 0 || goalCol < 0 || typeCol < 0) throw new Error('Cabeceras requeridas incompletas.');

  const campaign = String(payload.campaign || '').trim();
  const rowIndex = values.findIndex((row, index) => index > headerRow && String(row[campaignCol] || '').trim() === campaign);
  if (rowIndex < 0) throw new Error('No se encontro la campana en el sheet.');

  const cleanValue = payload.value === '' || payload.value == null ? '' : Number(payload.value);
  sheet.getRange(rowIndex + 1, goalCol + 1).setValue(cleanValue);

  const totalRow = values.findIndex((row, index) => index > headerRow && normalize_(row[typeCol]).startsWith('total'));
  if (totalRow >= 0) {
    const freshValues = sheet.getDataRange().getDisplayValues();
    const total = freshValues.reduce((sum, row, index) => {
      if (index <= headerRow || index === totalRow) return sum;
      if (!String(row[campaignCol] || '').trim()) return sum;
      const number = Number(String(row[goalCol] || '').replace(/,/g, '').trim());
      return Number.isFinite(number) ? sum + number : sum;
    }, 0);
    sheet.getRange(totalRow + 1, goalCol + 1).setValue(total);
  }

  SpreadsheetApp.flush();
  return { campaign, value: cleanValue };
}

function normalize_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
