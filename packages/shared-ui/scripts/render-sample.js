/* eslint-disable */
// Renders docs/screenshots/timesheet-example.pdf from the shared-core demo fixtures (fictional data only).
// Usage (after `npm run build`): node packages/shared-ui/scripts/render-sample.js
const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');
const { LocalDataService } = require('@orpheussystems/shared-core');
const { buildTimesheetModel } = require('../lib/pdf/timesheetModel');
const { buildTimesheetDocDefinition } = require('../lib/pdf/timesheetDocument');

function loadVfs() {
  const mod = require('pdfmake/build/vfs_fonts');
  return mod.vfs || (mod.pdfMake && mod.pdfMake.vfs) || (mod.default && mod.default.pdfMake && mod.default.pdfMake.vfs) || mod;
}

async function main() {
  const svc = new LocalDataService({ demoUserId: 1 });
  const contract = (await svc.getMyContracts()).find(c => c.id === 1);
  const from = contract.startDate;
  const to = contract.latestExecutionDate;
  const [entries, holidays] = await Promise.all([
    svc.getEntries(contract.id, from, to),
    svc.getHolidays(contract.country, from, to)
  ]);
  const model = buildTimesheetModel(contract, entries, holidays, { from, to },
    { approvingOrg: 'Client approval', serviceProvider: 'Service provider' });

  const vfs = loadVfs();
  const font = name => Buffer.from(vfs[name], 'base64');
  const printer = new PdfPrinter({
    Roboto: {
      normal: font('Roboto-Regular.ttf'),
      bold: font('Roboto-Medium.ttf'),
      italics: font('Roboto-Italic.ttf'),
      bolditalics: font('Roboto-MediumItalic.ttf')
    }
  });
  const doc = printer.createPdfKitDocument(buildTimesheetDocDefinition(model));
  const out = path.resolve(__dirname, '../../../docs/screenshots/timesheet-example.pdf');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  await new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); doc.end(); });
  const buf = Buffer.concat(chunks);
  fs.writeFileSync(out, buf);
  const pages = (buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  console.log(`Wrote ${out} (${buf.length} bytes, ${pages} pages, ${model.pages.length} model pages)`);
}

main().catch(e => { console.error(e); process.exit(1); });
