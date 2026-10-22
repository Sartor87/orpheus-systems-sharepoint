# Timesheet templates

By default the Contract Calendar web part downloads the timesheet PDF in a built-in layout.
If your organisation needs its own layout (a logo, extra fields, different signature boxes),
you can write the page as an HTML file and store it on your SharePoint site. The web part
fills it with the contract data and turns it into the PDF in the browser. Nothing is sent to
an outside service.

This guide is for the person who writes and publishes the template. You need to know basic
HTML and how to upload a file to a SharePoint library. You do not need to know the code.

## Quick start

1. Copy the starter template
   [`packages/shared-ui/templates/timesheet-template.sample.html`](../packages/shared-ui/templates/timesheet-template.sample.html).
   The PDF it produces is in
   [`docs/screenshots/timesheet-template-example.pdf`](screenshots/timesheet-template-example.pdf).
2. Edit the copy: change the texts, replace the logo, keep the `{{...}}` placeholders you want.
3. Upload it to a document library on the site (see "Where to store the template").
4. Edit the page, open the Contract Calendar web part properties and, in the **Timesheet**
   group, fill **Timesheet template (optional)** with the path to the file, for example
   `Shared Documents/Templates/timesheet.html`.
5. Open a contract and download a timesheet. The template is read from SharePoint on every
   download, so a change to the file applies at once.

To go back to the built-in layout, clear the property.

## Where to store the template

Put the file in a library or folder where **only site owners can edit** and **every person who
uses the web part can read**. A user who cannot read the file gets an "access denied" error
when downloading a timesheet. A user who can edit the file can change what appears on signed
documents, so keep edit rights narrow.

The path in the property pane can be:

- site-relative: `Shared Documents/Templates/timesheet.html` (resolved against the site that
  hosts the page), or
- server-relative: `/sites/<site>/Shared Documents/Templates/timesheet.html`.

It must end in `.html` or `.htm`. A URL on another host is rejected, and the property pane
shows the reason as you type. Empty means the built-in layout.

## Optional contract columns

The template can show a few fields that a standard installation does not have. They come from
five optional columns on the Contracts list. Add them once per site with
`infra/provisioning/Add-TimesheetTemplateColumns.ps1`. The command, the preview mode and the
column table are in the section "Optional columns for timesheet templates" of
[`infra/provisioning/README.md`](../infra/provisioning/README.md).

| Column | Used by | Notes |
|---|---|---|
| `ConsultantPosition` | `{{contract.position}}` | |
| `Vendor` (display name "Vendor (service provider)") | `{{contract.vendor}}`, `{{contract.serviceProvider}}` | Shared with other features of the product |
| `Lot` | `{{contract.lot}}` | |
| `ApproverName` | `{{contract.approverName}}` | |
| `TemplateFields` | `{{custom.<key>}}` | Free-form extra values, see below |

If a site does not have the columns, everything still works. The values are simply empty in
the PDF. Fill the columns on each contract item like any other field.

### Template fields

`TemplateFields` is a multi-line text column. Write one `key: value` per line:

```
footnote1: Hours are confirmed by the contract manager.
footnote2: Questions? Contact the project office.
costCentre: CC-4711
```

In the template, `{{custom.footnote1}}` then shows the first value. Rules:

- A key may contain letters, digits, `_` and `-`. Keys are case-sensitive, so `Footnote1`
  and `footnote1` are different.
- The line is split at the **first** colon, so values may contain colons.
- If a key appears twice, the last one wins.
- Lines without a colon, or with a key that has other characters, are ignored.
- A `{{custom.<key>}}` with no matching line shows nothing (it is not an error).

## Placeholders

Write a placeholder as `{{name}}`. Spaces inside the braces are allowed. Values are inserted
as plain text, so a value containing `<` or `&` cannot break the layout. Placeholders also work
inside attribute values (for example `style`).

### Values

| Placeholder | Shows |
|---|---|
| `{{contract.title}}` | Specific contract title |
| `{{contract.code}}` | Contract code |
| `{{contract.frameworkContract}}` | Framework contract |
| `{{contract.modality}}` | Modality |
| `{{contract.startDate}}` | Starting date |
| `{{contract.latestExecutionDate}}` | Latest execution date |
| `{{contract.targetOnSite}}`, `{{contract.targetOffSite}}`, `{{contract.targetTotal}}` | Contracted consultant days (two decimals) |
| `{{contract.remainingOnSite}}`, `{{contract.remainingOffSite}}`, `{{contract.remainingTotal}}` | Remaining days (two decimals) |
| `{{contract.position}}` | Column `ConsultantPosition` |
| `{{contract.vendor}}` (alias `{{contract.serviceProvider}}`) | Column `Vendor` |
| `{{contract.lot}}` | Column `Lot` |
| `{{contract.approverName}}` | Column `ApproverName` |
| `{{contractor.name}}`, `{{contractor.email}}` | The contractor |
| `{{contractManager.name}}`, `{{contractManager.email}}` | The contract manager |
| `{{period.from}}`, `{{period.to}}` | First and last day of the period, as a long date |
| `{{period.label}}` | For example `March 2026` or `March 2026 – May 2026` |
| `{{totals.onSite}}`, `{{totals.offSite}}`, `{{totals.total}}` | Grand totals of the period (two decimals) |
| `{{labels.serviceProvider}}`, `{{labels.approvingOrg}}` | The signature-label settings of the web part |
| `{{generatedOn}}` | Date of the download, as a long date |
| `{{custom.<key>}}` | A line of the `TemplateFields` column |

Careful: `{{labels.serviceProvider}}` and `{{labels.approvingOrg}}` are the **web part
settings** for the signature box titles. They are not the `Vendor` column. Use
`{{contract.vendor}}` for the vendor's name.

### Blocks

A block is a part of the PDF that the code draws for you. Use it for the colour-coded day grid
and the totals, which you cannot write as plain HTML.

| Block | Draws |
|---|---|
| `{{grid}}` | Month by day grid with per-month totals columns |
| `{{grid.days}}` | The same grid without the totals columns |
| `{{totals}}` | Table of on-site, off-site and total days per month and in grand total |
| `{{header}}` | The built-in two-row contract header |
| `{{signatures}}` | The built-in three signature boxes |

The template must contain `{{grid}}` or `{{grid.days}}`.

Rules for blocks:

- A block must be the **only content of its element**: `<div>{{grid.days}}</div>`, not
  `<div>Grid: {{grid.days}}</div>`.
- A block must be inside the body. `<title>{{grid}}</title>` or any other block in `<head>`
  is reported as an error.
- Put each block in a plain full-width `<div>`. A block placed inside a table cell gets an
  automatic width that is often narrow.
- The grid repeats its day-header row when it runs onto a new page. The rest of your template
  (title, logo, header fields, signature boxes) does not repeat. It is printed once, in the
  order you wrote it.

## Supported HTML

The conversion supports a document subset: `table`, `tr`, `td`, `th`, `div`, `p`, `span`,
`b`/`strong`, `i`/`em`, `br`, `h1` to `h6`, `ul`/`ol`/`li`, `img`, `a` and `hr`.

- Style with the inline `style` attribute only (`font-size`, `font-weight`, `color`,
  `text-align`, `margin-top` and similar). `<style>` blocks and CSS classes are not supported.
  `<script>` and `<style>` elements are removed.
- Font: Roboto only. Other `font-family` values are not available.
- Page setup: add `<meta name="orpheus:page" content="A4 landscape">`. Sizes are `A4`, `A3`
  and `Letter`; orientations are `portrait` and `landscape`. Without the tag the page is
  A4 landscape. Page margins are fixed at 20 points and the default font size is 7 points.
- Table options go in a `data-pdfmake` attribute that holds JSON:
  - `data-pdfmake='{"widths":["*",90]}'` sets column widths (`"*"` shares the remaining width).
  - `data-pdfmake='{"dontBreakRows":true}'` keeps rows from splitting over two pages. The
    starter template uses it on the signature table.
  - `data-pdfmake='{"layout":"noBorders"}'` removes the table borders. The starter template
    uses it on its title table.
  - Options combine: `data-pdfmake='{"widths":["*","*","*"],"dontBreakRows":true}'`.
  - The key `orpheusBlock` is reserved: the web part uses it to mark blocks. Do not write it
    in your own `data-pdfmake`; an unknown value is reported as `Unknown block "..."`.
- `colspan` on a table cell works (the starter template uses it in the header table).

The easiest way to learn what works is to change the starter template step by step and
download a timesheet after each change.

## Images

- `<img>` accepts **PNG** and **JPEG** only.
- The image must be on **the same SharePoint site** as the web part, or embedded as a `data:`
  URL. Images from other hosts are rejected.
- Write the path relative to the template's folder (`logo.png`, `img/logo.png`) or
  server-relative (`/sites/<site>/Shared Documents/Templates/logo.png`).
- Literal and percent-encoded file names both work: `img/My Logo.png` and `img/My%20Logo.png`
  point to the same file, in relative, server-relative and absolute paths alike. The same holds
  for the template path in the property pane.
- **SVG** logos are not accepted through `<img>`. Paste the `<svg>` element into the template
  instead; the starter template does this for its logo placeholder.
- The same-site check applies to `<img>` only. Do not reference external images inside an
  inline `<svg>` (for example `<image href="https://...">`); keep the SVG self-contained.
- Everyone who downloads timesheets needs read access to the image, as for the template.

## What the code always generates

- The content of the blocks `{{grid}}`, `{{grid.days}}`, `{{totals}}`, `{{header}}` and
  `{{signatures}}`: colours, rounding and layout are fixed. You decide where they go, not how
  they look.
- The attribution line "Generated with Orpheus Systems Contract Calendar · orpheussystems.com"
  at the end of every PDF, and the PDF metadata. A template cannot remove or change it.

## Troubleshooting

If the template is not usable, nothing is downloaded. The dialog shows "The timesheet template
has errors:" with up to five items (further ones are summarised as "…and N more"), then the
hint "Ask your site owner to fix the template or clear the template setting to use the standard
layout." The web part does **not** switch to the built-in layout by itself. All problems found
in the template are listed together, so you can fix them in one go.

| Message | Cause and fix |
|---|---|
| `Unknown placeholder {{name}}` | The name is misspelled or does not exist. Compare with the tables above. Names are case-sensitive. |
| `{{name}} must be the only content of its element` | A block shares its element with other text or elements. Put it alone in its own `<div>`. |
| `{{name}} must be inside the body` | A block is in `<head>`, for example in `<title>`. Move it into the body. |
| `Unknown block "..."` | A `data-pdfmake` attribute uses the reserved key `orpheusBlock`. Remove that key. |
| `The template must contain {{grid}} or {{grid.days}}` | Add one of the two grid blocks. |
| `Malformed placeholder: "{{" without a matching "}}" in the same text` | A placeholder is not closed, or is split over two elements. Keep `{{name}}` in one piece of text. |
| `Invalid orpheus:page value "..."` | Use size A4, A3 or Letter and orientation portrait or landscape, for example `A4 portrait`. |
| `The template is empty` | The file has no content. |
| `Image "<src>": Images must be stored on this SharePoint site` | The image is on another host. Upload it to this site or embed it as a `data:` URL. |
| `Image "<src>": Could not load the image "<path>": file not found (404)` | The path is wrong. Check the folder and spelling; relative paths start at the template's folder. |
| `Image "<src>": Could not load the image "<path>": access denied (403)` | The person downloading cannot read the image. Check the library permissions. |
| `Image "<src>": The image "<path>" must be PNG or JPEG (got ...)` | Convert the file. For SVG, paste the `<svg>` into the template. |
| `Image "<src>": only PNG and JPEG images are supported` | A `data:` image has another type, for example SVG. |
| `Image "<src>": Only data: images are available in local demo mode` | Workbench demo only. Use a `data:` URL there. |

Problems with the template file itself are shown on their own, as
`Could not generate the timesheet: Could not load the timesheet template "<path>": <reason>`:

| Reason | Cause and fix |
|---|---|
| `file not found (404)` | The path in the property pane does not match a file. Check library name and file name. |
| `access denied (403)` | The user cannot read the file. Grant read access on the library or folder. |
| `the template is empty` | The file is empty or has only spaces. |
| `The template must be stored on this SharePoint site. ...` | The property holds a URL on another host. Use a site-relative or server-relative path. |
| `The template must be an .html or .htm file.` | Rename the file or fix the path. |

## Try it in the workbench

In the local workbench demo (no SharePoint), set **Timesheet template (optional)** to any
non-empty value, such as `Shared Documents/timesheet.html`. The demo then uses the bundled
starter template and fictional demo data, whatever the value is. Only `data:` images work in
the demo. On a real site the value must point to a real file, for example
`/sites/<site>/Shared Documents/timesheet.html` on `https://<tenant>.sharepoint.com`.
