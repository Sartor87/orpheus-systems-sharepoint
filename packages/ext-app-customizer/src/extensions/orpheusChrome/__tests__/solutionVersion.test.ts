// Jest loads the JSON at run time (require is typed by the SPFx webpack environment).
/** The manifest version is "*", so SPFx fills it from package.json; the footer and About pane show it. */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- JSON outside src, read by Jest only
const pkg = require('../../../../package.json') as { version: string };
// eslint-disable-next-line @typescript-eslint/no-require-imports -- JSON outside src, read by Jest only
const solution = require('../../../../config/package-solution.json') as {
  solution: { version: string; features?: Array<{ version: string }> };
};

describe('solution version', () => {
  it('package.json version is the solution version without the revision', () => {
    expect(`${pkg.version}.0`).toBe(solution.solution.version);
  });

  it('every feature carries the solution version', () => {
    (solution.solution.features || []).forEach(f => expect(f.version).toBe(solution.solution.version));
  });
});
