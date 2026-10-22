// CSS modules in Jest: every class name resolves to its own key.
module.exports = new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : key) });
