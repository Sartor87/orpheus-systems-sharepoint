// Fallback typing for CSS modules, so ts-jest type-checks before the first build. Heft's generated typings in
// temp/sass-ts (tsconfig rootDirs) resolve first during the build.
declare module '*.module.scss' {
  const styles: { readonly [className: string]: string };
  export default styles;
}
