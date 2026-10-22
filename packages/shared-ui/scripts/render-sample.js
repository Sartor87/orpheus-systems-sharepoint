/* eslint-disable */
// Renders docs/screenshots/timesheet-example.pdf and timesheet-template-example.pdf from the shared-core
// demo fixtures (fictional data only).
// Usage (after `npm run build`): node packages/shared-ui/scripts/render-sample.js
const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');
const { JSDOM } = require('jsdom');
const { LocalDataService, demoTemplateData } = require('@orpheussystems/shared-core');
const { buildTimesheetModel } = require('../lib/pdf/timesheetModel');
const { buildTimesheetDocDefinition } = require('../lib/pdf/timesheetDocument');
const { fillTemplate } = require('../lib/pdf/fillTemplate');
const { templateValues } = require('../lib/pdf/templateValues');
const { buildTemplateDocDefinition } = require('../lib/pdf/templateDocument');
const { sampleTimesheetTemplate } = require('../lib/pdf/sampleTemplate');

function loadVfs() {
  const mod = require('pdfmake/build/vfs_fonts');
  return mod.vfs || (mod.pdfMake && mod.pdfMake.vfs) || (mod.default && mod.default.pdfMake && mod.default.pdfMake.vfs) || mod;
}

async function writePdf(docDefinition, out) {
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
  const doc = printer.createPdfKitDocument(docDefinition);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  await new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); doc.end(); });
  const buf = Buffer.concat(chunks);
  fs.writeFileSync(out, buf);
  const pages = (buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  console.log(`Wrote ${out} (${buf.length} bytes, ${pages} pages)`);
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
  const shots = path.resolve(__dirname, '../../../docs/screenshots');

  await writePdf(buildTimesheetDocDefinition(model), path.join(shots, 'timesheet-example.pdf'));

  const win = new JSDOM('').window;
  const filled = fillTemplate(sampleTimesheetTemplate,
    templateValues(model, contract, demoTemplateData(contract.id), '2026-10-22'), win);
  const noImages = () => Promise.reject(new Error('the sample template has no images'));
  const templateDoc = await buildTemplateDocDefinition(model, filled, noImages, win);
  await writePdf(templateDoc, path.join(shots, 'timesheet-template-example.pdf'));
}

main().catch(e => { console.error(e); process.exit(1); });
