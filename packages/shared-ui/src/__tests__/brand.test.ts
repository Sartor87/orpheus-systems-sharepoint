import { orpheusBrand, orpheusMarkSvg } from '../brand/brand';

describe('orpheus brand', () => {
  it('exposes the website url', () => {
    expect(orpheusBrand.url).toBe('https://orpheussystems.com/');
    expect(orpheusBrand.name).toBe('Orpheus Systems');
  });

  it('renders an inline SVG mark with the given colour and a 24x24 viewBox', () => {
    const svg = orpheusMarkSvg(20, '#E0A83A');
    expect(svg).toContain('#E0A83A');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('width="20"');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
