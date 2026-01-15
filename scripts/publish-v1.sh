#!/bin/bash
# publish-v1.sh - Script to publish seu-claude v1.0.0 to npm

set -e

echo "🚀 seu-claude v1.0.0 Release Script"
echo "===================================="

# Check if logged in to npm
echo ""
echo "📋 Checking npm login status..."
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to npm. Please run: npm login"
    exit 1
fi
echo "✅ Logged in as: $(npm whoami)"

# Verify we're on main branch
echo ""
echo "📋 Checking git status..."
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
    echo "⚠️  Warning: Not on main branch (currently on: $BRANCH)"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes:"
    git status --short
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run tests one more time
echo ""
echo "🧪 Running tests..."
npm test

# Build
echo ""
echo "🔨 Building..."
npm run build

# Dry run first
echo ""
echo "📦 Package contents (dry run):"
npm pack --dry-run

echo ""
read -p "Ready to publish to npm? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Publish!
echo ""
echo "📤 Publishing to npm..."
npm publish

# Create git tag
echo ""
echo "🏷️  Creating git tag..."
git tag -a v1.0.0 -m "Release v1.0.0 - Initial stable release"
git push origin v1.0.0

echo ""
echo "✅ Successfully published seu-claude v1.0.0!"
echo ""
echo "📋 Next steps:"
echo "   1. Create GitHub release: https://github.com/jardhel/seu-claude/releases/new"
echo "   2. Announce on social media (see MARKETING_KIT.md)"
echo "   3. Submit to MCP directory"
echo ""
echo "🎉 Congratulations on your first release!"
