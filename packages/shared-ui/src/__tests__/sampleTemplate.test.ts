/** @jest-environment jsdom */
import * as fs from 'fs';
import * as path from 'path';
import { demoTemplateData } from '@orpheussystems/shared-core';
import { sampleTimesheetTemplate } from '../pdf/sampleTemplate';
import { fillTemplate } from '../pdf/fillTemplate';
import { templateValues } from '../pdf/templateValues';
import { buildTemplateDocDefinition } from '../pdf/templateDocument';
import { buildTimesheetModel } from '../pdf/timesheetModel';
import { contract, e, labels } from './fixtures';

const FILE = path.resolve(__dirname, '../../templates/timesheet-template.sample.html');

function setup() {
  const c = contract({ startDate: '2026-01-01', latestExecutionDate: '2027-03-31' });
  const model = buildTimesheetModel(c, [e('OnSiteFull', '2026-02-03')], [], { from: '2026-02-01', to: '2026-02-28' }, labels);
  const values = templateValues(model, c, demoTemplateData(1), '2026-02-28');
  return { model, values };
}

describe('sampleTimesheetTemplate', () => {
  it('equals the sample file', () => {
    expect(sampleTimesheetTemplate).toBe(fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, ''));
  });

  it('fills without errors', () => {
    const { values } = setup();
    expect(fillTemplate(sampleTimesheetTemplate, values, window).errors).toEqual([]);
  });

  it('builds a document without external images', async () => {
    const { model, values } = setup();
    const resolver = () => Promise.reject(new Error('no images expected'));
    const dd = await buildTemplateDocDefinition(model, fillTemplate(sampleTimesheetTemplate, values, window), resolver, window);
    expect(dd.pageOrientation).toBe('landscape');
  });

  it('uses fictional names and no foreign URLs', () => {
    expect(sampleTimesheetTemplate).toContain('Example');
    const urls = sampleTimesheetTemplate.match(/https?:\/\/[^\s"'<>)]+/g) || [];
    // only orpheussystems.com may appear as a URL
    urls.forEach(u => expect(u).toMatch(/orpheussystems\.com/));
  });
});
