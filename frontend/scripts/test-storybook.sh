#!/bin/bash

# Script to run Storybook tests in CI
set -e

echo "🏗️  Building Storybook..."
npm run build-storybook

echo "✅ Storybook build completed successfully!"

echo "🧪 Running component tests..."
npm test -- run

echo "✅ All tests completed successfully!"

echo "📊 Running Storybook test runner (if available)..."
if command -v test-storybook &> /dev/null; then
    test-storybook --url http://localhost:6006
else
    echo "ℹ️  Storybook test runner not available, skipping interaction tests"
fi

echo "🎉 All Storybook checks passed!"