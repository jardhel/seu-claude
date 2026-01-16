#!/bin/bash
set -e

# seu-claude Release Script
# Usage: ./scripts/release.sh [patch|minor|major]
# Default: patch

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════╗"
echo "║         seu-claude Release Script              ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get version bump type (default: patch)
VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: Invalid version type '$VERSION_TYPE'${NC}"
    echo "Usage: ./scripts/release.sh [patch|minor|major]"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version:${NC} v${CURRENT_VERSION}"
echo -e "${YELLOW}Version bump:${NC} ${VERSION_TYPE}"
echo ""

# Step 1: Pre-flight checks
echo -e "${BOLD}[1/8] Pre-flight checks...${NC}"

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}Error: You have uncommitted changes. Please commit or stash them first.${NC}"
    git status --short
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Working directory clean"

# Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${RED}Error: You must be on the 'main' branch to release. Currently on '${CURRENT_BRANCH}'.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} On main branch"

# Check npm login
if ! npm whoami &>/dev/null; then
    echo -e "${YELLOW}Not logged in to npm. Please login:${NC}"
    npm login
fi
NPM_USER=$(npm whoami)
echo -e "  ${GREEN}✓${NC} Logged in to npm as ${NPM_USER}"

# Step 2: Pull latest
echo -e "\n${BOLD}[2/8] Pulling latest changes...${NC}"
git pull origin main
echo -e "  ${GREEN}✓${NC} Up to date with origin/main"

# Step 3: Install dependencies
echo -e "\n${BOLD}[3/8] Installing dependencies...${NC}"
npm ci
echo -e "  ${GREEN}✓${NC} Dependencies installed"

# Step 4: Download grammars
echo -e "\n${BOLD}[4/8] Downloading Tree-sitter grammars...${NC}"
npm run download-grammars
echo -e "  ${GREEN}✓${NC} Grammars downloaded"

# Step 5: Build
echo -e "\n${BOLD}[5/8] Building...${NC}"
npm run build
echo -e "  ${GREEN}✓${NC} Build successful"

# Step 6: Run tests
echo -e "\n${BOLD}[6/8] Running tests...${NC}"
npm test
echo -e "  ${GREEN}✓${NC} All tests passed"

# Step 7: Bump version and create tag
echo -e "\n${BOLD}[7/8] Bumping version...${NC}"
NEW_VERSION=$(npm version $VERSION_TYPE -m "chore: release v%s")
echo -e "  ${GREEN}✓${NC} Version bumped to ${NEW_VERSION}"

# Step 8: Publish to npm (interactive OTP)
echo -e "\n${BOLD}[8/8] Publishing to npm...${NC}"
echo -e "${YELLOW}You will be prompted for your 2FA code.${NC}"
npm publish --access public

# Push to GitHub
echo -e "\n${BOLD}Pushing to GitHub...${NC}"
git push origin main --tags
echo -e "  ${GREEN}✓${NC} Pushed to GitHub"

# Create GitHub release
echo -e "\n${BOLD}Creating GitHub release...${NC}"
gh release create "${NEW_VERSION}" \
    --title "seu-claude ${NEW_VERSION}" \
    --generate-notes
echo -e "  ${GREEN}✓${NC} GitHub release created"

# Success!
echo -e "\n${GREEN}${BOLD}"
echo "╔════════════════════════════════════════════════╗"
echo "║              Release Successful! 🚀            ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  📦 npm: https://www.npmjs.com/package/seu-claude/v/${NEW_VERSION#v}"
echo -e "  🏷️  GitHub: https://github.com/jardhel/seu-claude/releases/tag/${NEW_VERSION}"
echo ""
echo -e "  ${CYAN}Install with:${NC} npm install -g seu-claude@${NEW_VERSION#v}"
echo ""
