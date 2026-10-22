// The package deploys code only. Registering the custom action (and its properties) is provisioning's job
// (spec 6.9), as for the field customizer; a feature or ClientSideInstance.xml here would register it a second
// time, or tenant-wide when the app is added to all sites.

// Node under Jest; the SPFx tsconfig has no Node types.
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as { readFileSync(p: string, enc: string): string; existsSync(p: string): boolean };
const root = `${__dirname}/../../../..`;

describe('package-solution', () => {
  const solution = JSON.parse(fs.readFileSync(`${root}/config/package-solution.json`, 'utf8')).solution;

  it('has no feature that registers the custom action', () => {
    expect(solution.features).toBeUndefined();
    expect(solution.skipFeatureDeployment).toBe(true);
  });

  it('ships no element manifests', () => {
    expect(fs.existsSync(`${root}/sharepoint/assets/elements.xml`)).toBe(false);
    expect(fs.existsSync(`${root}/sharepoint/assets/ClientSideInstance.xml`)).toBe(false);
  });
});
