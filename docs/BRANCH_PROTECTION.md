# Branch Protection Rules Setup

Configure these rules at: https://github.com/jardhel/seu-claude/settings/branches

## Main Branch Protection

### Settings to Enable

#### Protect matching branches
- [x] **Require a pull request before merging**
  - [x] Require approvals: 1
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require approval of the most recent reviewable push

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Required checks:
    - `lint` (Lint & Format Check)
    - `typecheck` (Type Check)
    - `build (20.x)` (Build & Test)
    - `security` (Security Audit)

- [x] **Require conversation resolution before merging**

- [x] **Require signed commits** (optional but recommended)

- [x] **Require linear history**
  - Prevents merge commits, ensures clean history

- [x] **Do not allow bypassing the above settings**

- [ ] **Allow force pushes** (keep disabled)
- [ ] **Allow deletions** (keep disabled)

## Tag Protection

### Settings
- Protect tags matching: `v*`
- Restrict who can create matching tags: Maintainers only

## Rulesets (Alternative to Branch Protection)

For more granular control, use Repository Rulesets:

```yaml
ruleset:
  name: main-branch-protection
  target: branch
  enforcement: active
  bypass_actors:
    - organization_admin
  conditions:
    ref_name:
      include:
        - refs/heads/main
  rules:
    - type: pull_request
      parameters:
        required_approving_review_count: 1
        dismiss_stale_reviews_on_push: true
        require_last_push_approval: true
    - type: required_status_checks
      parameters:
        strict_required_status_checks_policy: true
        required_status_checks:
          - context: lint
          - context: typecheck
          - context: build (20.x)
          - context: security
    - type: non_fast_forward
    - type: deletion
```

## CODEOWNERS File

Create `.github/CODEOWNERS`:

```
# Default owners for everything
* @jardhel

# Security-sensitive files
SECURITY.md @jardhel
.github/workflows/** @jardhel
package.json @jardhel
package-lock.json @jardhel

# Documentation
*.md @jardhel
docs/** @jardhel
```
