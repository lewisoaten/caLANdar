//Polyfill for fetch
import "whatwg-fetch";

// Extend Jest "expect" functionality with Testing Library assertions.
import "@testing-library/jest-dom";

// @ts-expect-error: Legacy code, will update soon.
beforeAll((done) => {
  global.provider.setup().then(() => done());
});

// @ts-expect-error: Legacy code, will update soon.
afterAll((done) => {
  global.provider.finalize().then(() => done());
});
