/** Starter template; keep in sync with templates/timesheet-template.sample.html (a test enforces it). */
export const sampleTimesheetTemplate: string = `<meta name="orpheus:page" content="A4 landscape">
<table data-pdfmake='{"widths":["*",90],"layout":"noBorders"}'>
  <tr>
    <td>
      <div style="font-size:20px;font-weight:bold;">{{contractor.name}}</div>
      <div style="font-size:9px;color:#555555;">Example Client Agency</div>
      <div style="font-size:9px;color:#555555;">{{contract.lot}} · {{contract.vendor}} · {{contract.position}}</div>
    </td>
    <td style="text-align:right;">
      <svg width="80" height="32" viewBox="0 0 80 32">
        <rect x="0.5" y="0.5" width="79" height="31" fill="#eeeeee" stroke="#999999"/>
        <text x="40" y="21" font-size="12" text-anchor="middle" fill="#666666">LOGO</text>
      </svg>
    </td>
  </tr>
</table>
<table data-pdfmake='{"widths":["*","*","*","*","*"]}'>
  <tr>
    <td><div style="font-size:6px;color:#666666;">Framework contract</div><div style="font-weight:bold;">{{contract.frameworkContract}}</div></td>
    <td><div style="font-size:6px;color:#666666;">Modality</div><div style="font-weight:bold;">{{contract.modality}}</div></td>
    <td colspan="3"><div style="font-size:6px;color:#666666;">Specific contract</div><div style="font-weight:bold;">{{contract.title}}</div></td>
  </tr>
  <tr>
    <td><div style="font-size:6px;color:#666666;">Starting date</div><div style="font-weight:bold;">{{contract.startDate}}</div></td>
    <td><div style="font-size:6px;color:#666666;">Latest execution date</div><div style="font-weight:bold;">{{contract.latestExecutionDate}}</div></td>
    <td><div style="font-size:6px;color:#666666;">Consultant days on-site</div><div style="font-weight:bold;">{{contract.targetOnSite}}</div></td>
    <td><div style="font-size:6px;color:#666666;">Consultant days off-site</div><div style="font-weight:bold;">{{contract.targetOffSite}}</div></td>
    <td><div style="font-size:6px;color:#666666;">Consultant days total</div><div style="font-weight:bold;">{{contract.targetTotal}}</div></td>
  </tr>
  <tr>
    <td colspan="2"><div style="font-size:6px;color:#666666;">Period</div><div style="font-weight:bold;">{{period.label}}</div></td>
    <td><div style="font-size:6px;color:#666666;">Remaining days on-site</div><div style="font-weight:bold;">{{contract.remainingOnSite}}</div></td>
    <td><div style="font-size:6px;color:#666666;">Remaining days off-site</div><div style="font-weight:bold;">{{contract.remainingOffSite}}</div></td>
    <td><div style="font-size:6px;color:#666666;">Remaining days total</div><div style="font-weight:bold;">{{contract.remainingTotal}}</div></td>
  </tr>
</table>
<div style="margin-top:6px;">{{grid.days}}</div>
<div style="margin-top:6px;">{{totals}}</div>
<table data-pdfmake='{"widths":["*","*","*"]}' style="margin-top:8px;">
  <tr>
    <td>
      <div style="font-weight:bold;">Signature of consultant</div>
      <div>Name: {{contractor.name}}</div>
      <div>Date:</div>
      <div>Signature:</div>
    </td>
    <td>
      <div style="font-weight:bold;">Signature of {{labels.serviceProvider}}</div>
      <div>Name:</div>
      <div>Date:</div>
      <div>Signature:</div>
    </td>
    <td>
      <div style="font-weight:bold;">{{labels.approvingOrg}}</div>
      <div>Name: {{contract.approverName}}</div>
      <div>Date:</div>
      <div>Signature:</div>
    </td>
  </tr>
</table>
<div style="font-size:6px;color:#666666;margin-top:6px;">{{custom.footnote1}}</div>
<div style="font-size:6px;color:#666666;">{{custom.footnote2}}</div>`;
