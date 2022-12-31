//Polyfill for fetch
import "whatwg-fetch";

// Extend Jest "expect" functionality with Testing Library assertions.
import "@testing-library/jest-dom";

// @ts-ignore
beforeAll((done) => {
  global.provider.setup().then(() => done());
});

// @ts-ignore
afterAll((done) => {
  global.provider.finalize().then(() => done());
});
