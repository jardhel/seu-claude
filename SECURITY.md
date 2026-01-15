# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Email security concerns to: [security@your-domain.com] (or create a private security advisory)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

### What to Expect

- **Response Time**: We aim to acknowledge reports within 48 hours
- **Updates**: We'll provide updates on the status within 7 days
- **Disclosure**: We'll coordinate with you on public disclosure timing

### Security Best Practices for Users

1. **Keep Updated**: Always use the latest version of seu-claude
2. **NPM Audit**: Regularly run `npm audit` in your projects
3. **Token Security**: 
   - Use granular npm tokens with minimal permissions
   - Set token expiration dates
   - Rotate tokens every 90 days
4. **Environment Variables**: Never commit sensitive data

## Security Measures in seu-claude

### Code Security
- No `eval()` or dynamic code execution
- Input validation on all tool parameters
- No external network calls except:
  - HuggingFace model download (first run only)
  - npm registry (installation only)

### Data Security
- **100% Local Processing**: All indexing and search happens locally
- **No Data Exfiltration**: Code never leaves your machine
- **Sandboxed Storage**: Vector database stored in `~/.seu-claude/`

### Dependency Security
- Regular dependency audits via GitHub Actions
- CodeQL analysis on every PR
- Automated secret scanning
- License compliance checking

### CI/CD Security
- npm provenance for supply chain security
- Signed releases
- Protected branches
- Required reviews for PRs

## Security Checklist for Contributors

Before submitting a PR:

- [ ] No hardcoded secrets or credentials
- [ ] No `eval()`, `new Function()`, or similar
- [ ] Input validation for all user inputs
- [ ] Error messages don't leak sensitive info
- [ ] Dependencies are from trusted sources
- [ ] `npm audit` passes with no high/critical issues
