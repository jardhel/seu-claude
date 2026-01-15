# Contributing to seu-claude

Thank you for your interest in contributing to seu-claude! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn
- Git

### Setting Up the Development Environment

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/seu-claude.git
   cd seu-claude
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the project:
   ```bash
   npm run build
   ```

### Running Locally

To test your changes:

```bash
# Build and watch for changes
npm run dev

# In another terminal, test the MCP server
PROJECT_ROOT=/path/to/test/project node dist/index.js
```

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates. When creating a bug report, include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Your environment (OS, Node.js version, etc.)
- Any relevant logs or error messages

### Suggesting Features

Feature suggestions are welcome! Please include:

- A clear description of the feature
- The problem it solves
- Any alternative solutions you've considered
- Potential implementation approach (optional)

### Pull Requests

1. Create a new branch for your feature/fix:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes, following our coding standards (below)

3. Write or update tests as needed

4. Ensure all tests pass:

   ```bash
   npm test
   ```

5. Ensure your code is properly formatted:

   ```bash
   npm run lint
   npm run format
   ```

6. Commit your changes with a descriptive message:

   ```bash
   git commit -m "feat: add support for Kotlin language parsing"
   ```

7. Push to your fork and create a Pull Request

### Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:

```
feat: add support for Go language parsing
fix: handle empty files during indexing
docs: update README with new configuration options
refactor: simplify embedding batch processing
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let` when possible
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Avoid `any` type - use proper typing

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multi-line arrays/objects
- Keep lines under 100 characters
- Use async/await over raw Promises

### File Organization

- One class/module per file
- Group related files in directories
- Use descriptive file names (kebab-case)

## Adding Language Support

To add support for a new programming language:

1. Find the Tree-sitter grammar for the language
2. Add the WASM file to `languages/`
3. Update `src/indexer/parser.ts`:
   - Add to `LANGUAGE_WASM_MAP`
   - Add to `EXTRACTABLE_TYPES`
4. Update `src/utils/config.ts`:
   - Add to `LANGUAGE_EXTENSIONS`
5. Add tests for the new language
6. Update documentation

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- --testPathPattern=parser
```

### Writing Tests

- Place tests in `__tests__` directories or with `.test.ts` suffix
- Use descriptive test names
- Test edge cases and error conditions
- Mock external dependencies when appropriate

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Include code examples where helpful
- Keep documentation concise and clear

## Code Review Process

1. All PRs require at least one review before merging
2. Address all review comments
3. Keep PRs focused and reasonably sized
4. Squash commits before merging if needed

## Questions?

If you have questions, feel free to:

- Open a GitHub issue
- Start a discussion in the repository

Thank you for contributing to seu-claude!
