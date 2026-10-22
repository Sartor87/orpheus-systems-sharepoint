export const orpheusBrand = {
  name: 'Orpheus Systems',
  nameStrong: 'Orpheus',
  nameRest: 'Systems',
  url: 'https://orpheussystems.com/',
  kicker: 'SOFTWARE ARCHITECTURE CONSULTANCY · SOFIA, BULGARIA · EU',
  contactEmail: 'kiril.iliev@orpheussystems.com'
} as const;

/** Mark geometry on a 24x24 viewBox; one source for the SVG string and the React component. */
export const orpheusMarkViewBox = '0 0 24 24';
export const orpheusMarkFrame = { x: 2, y: 2, width: 20, height: 20, rx: 6 } as const;
export const orpheusMarkPoints = '6,17 10,9 13,14 16,7 19,17';
export const orpheusMarkStrokeWidth = 2;

export function orpheusMarkSvg(size: number, color: string): string {
  const f = orpheusMarkFrame;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${orpheusMarkViewBox}" ` +
    `fill="none" stroke="${color}" stroke-width="${orpheusMarkStrokeWidth}" stroke-linecap="round" stroke-linejoin="round" role="img" aria-hidden="true">` +
    `<rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="${f.rx}"/>` +
    `<polyline points="${orpheusMarkPoints}"/></svg>`
  );
}
