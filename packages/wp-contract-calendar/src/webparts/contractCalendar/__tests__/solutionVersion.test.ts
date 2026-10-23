import * as fs from 'fs';
import * as path from 'path';

/** The manifest version is "*", so SPFx fills it from package.json; the footer and About pane show it. */
function packageRoot(): string {
  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, 'config', 'package-solution.json'))) { dir = path.dirname(dir); }
  return dir;
}

const root = packageRoot();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
const solution = JSON.parse(fs.readFileSync(path.join(root, 'config', 'package-solution.json'), 'utf8')) as {
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
