// html-to-pdfmake ships no type declarations; this covers the subset we use.
declare module 'html-to-pdfmake' {
  import type { Content } from 'pdfmake/interfaces';

  interface HtmlToPdfmakeOptions {
    /** DOM window used to parse the HTML (required outside a browser). */
    window?: Window;
    /** Compute table widths/heights from the HTML instead of leaving them to pdfmake. */
    tableAutoSize?: boolean;
    defaultStyles?: Record<string, unknown>;
    removeExtraBlanks?: boolean;
    imagesByReference?: boolean;
  }

  function htmlToPdfmake(html: string, options?: HtmlToPdfmakeOptions): Content;
  export = htmlToPdfmake;
}
