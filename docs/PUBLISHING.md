# Publishing Guide for seu-claude

## 🔐 One-Time Setup: NPM Token

Before the CI/CD can publish to npm, you need to add your NPM token as a GitHub secret.

### Step 1: Generate NPM Access Token

1. Go to [npmjs.com](https://www.npmjs.com/) and login
2. Click your profile icon → **Access Tokens**
3. Click **Generate New Token** → **Classic Token**
4. Select **Automation** (for CI/CD)
5. Copy the generated token (starts with `npm_`)

### Step 2: Add Token to GitHub Secrets

1. Go to your repo: https://github.com/jardhel/seu-claude/settings/secrets/actions
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Value: Paste your npm token
5. Click **Add secret**

---

## 🚀 Publishing Methods

### Method 1: Automatic (Recommended)

Push a git tag to trigger the release:

```bash
# Make sure everything is committed
git status

# Create and push tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin main
git push origin v1.0.0
```

The CI/CD will automatically:

- ✅ Run tests
- ✅ Build the package
- ✅ Publish to npm
- ✅ Create GitHub Release

### Method 2: Manual Trigger (via GitHub UI)

1. Go to: https://github.com/jardhel/seu-claude/actions/workflows/release.yml
2. Click **Run workflow**
3. Enter version (e.g., `1.0.0`)
4. Optionally check "Dry run" to test without publishing
5. Click **Run workflow**

### Method 3: Local Publish (Fallback)

If CI/CD isn't working:

```bash
# Login to npm
npm login

# Publish
npm publish --access public

# Create GitHub release manually
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

---

## 📋 Release Checklist

Before releasing:

- [ ] All tests passing: `npm test`
- [ ] Build works: `npm run build`
- [ ] Version updated in `package.json`
- [ ] `CHANGELOG.md` updated
- [ ] All changes committed
- [ ] NPM_TOKEN secret configured

---

## 🔄 Version Bumping

For future releases:

```bash
# Patch release (1.0.0 → 1.0.1)
npm version patch -m "Release v%s"
git push origin main --tags

# Minor release (1.0.0 → 1.1.0)
npm version minor -m "Release v%s"
git push origin main --tags

# Major release (1.0.0 → 2.0.0)
npm version major -m "Release v%s"
git push origin main --tags
```

---

## 🐛 Troubleshooting

### "NPM_TOKEN not found"

→ Add the secret in GitHub repo settings

### "Package name already taken"

→ The package `seu-claude` is unique, shouldn't happen

### "Version already exists"

→ Bump version in package.json before publishing

### "Tests failing in CI"

→ Run `npm test` locally to debug
