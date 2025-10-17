// Minimal stub for pino-pretty to satisfy bundlers in the browser/SSR build.
// Exports a prettyFactory that returns a simple formatter.

function simplePretty() {
  return function pretty(obj) {
    try {
      return (typeof obj === 'string' ? obj : JSON.stringify(obj)) + '\n';
    } catch {
      return String(obj) + '\n';
    }
  };
}

module.exports.prettyFactory = simplePretty;

