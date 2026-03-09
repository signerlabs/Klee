# Contributing to Klee

Thank you for your interest in contributing to Klee! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/signerlabs/klee.git
   cd klee
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/original-owner/klee.git
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Set up environment**:
   - Copy `.env.example` files and configure
   - See [README.md](README.md#environment-configuration) for details

## Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

Branch naming convention:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or modifications

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style and patterns
- Add tests for new features
- Update documentation as needed
- Test your changes thoroughly

### 3. Run Tests

Before submitting, ensure all tests pass:

```bash
npm run test           # Run all tests
npm run build          # Verify build works
npm run lint           # Check code style
```

### 4. Commit Your Changes

See [Commit Guidelines](#commit-guidelines) below.

### 5. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 6. Create a Pull Request

- Go to the original repository on GitHub
- Click "New Pull Request"
- Select your fork and branch
- Fill in the PR template
- Submit!

## Code Style

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` type - use proper typing
- Use descriptive variable and function names

### React

- Use functional components with hooks
- Follow TanStack Query patterns (see [CLAUDE.md](CLAUDE.md))
- Keep components small and focused
- Use TypeScript interfaces for props

### File Organization

```
client/src/renderer/src/
├── components/        # React components
│   └── feature/       # Grouped by feature
├── hooks/             # Custom hooks
│   └── feature/       # Grouped by feature
│       ├── queries/   # TanStack Query hooks
│       └── mutations/ # TanStack Mutation hooks
├── routes/            # TanStack Router routes
└── lib/               # Utilities
```

### Naming Conventions

- **Files**: `kebab-case.tsx`, `kebab-case.ts`
- **Components**: `PascalCase`
- **Hooks**: `useCamelCase`
- **Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(chat): add streaming response support

Implements real-time streaming for AI responses using AI SDK.
Includes progress indicators and cancellation support.

Closes #123
```

```
fix(auth): resolve OAuth callback handling

Fixes issue where OAuth tokens were not properly extracted
from deep link URL parameters.

Fixes #456
```

## Pull Request Process

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated (if needed)
- [ ] Commits follow commit guidelines
- [ ] No merge conflicts with main branch

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How to test these changes

## Screenshots (if applicable)

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] No new warnings
```

### Review Process

1. At least one maintainer review required
2. All CI checks must pass
3. No unresolved conversations
4. Approved by maintainer
5. Merged by maintainer

## Reporting Bugs

### Before Reporting

1. Check existing issues
2. Try latest version
3. Verify it's reproducible

### Bug Report Template

```markdown
**Description**
Clear description of the bug

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What should happen

**Screenshots**
If applicable

**Environment**
- OS: [e.g., macOS 14.0]
- App Version: [e.g., 0.1.0]
- Mode: [Cloud/Private]

**Additional Context**
Any other relevant information
```

## Suggesting Features

### Feature Request Template

```markdown
**Problem**
What problem does this solve?

**Proposed Solution**
How should it work?

**Alternatives Considered**
Other approaches you've thought of

**Additional Context**
Mockups, examples, etc.
```

## Architecture Guidelines

### TanStack Query Patterns

See [CLAUDE.md](CLAUDE.md#tanstack-query-usage) for detailed patterns.

**Key Points**:
- Query hooks for read operations (`hooks/*/queries/`)
- Mutation hooks for write operations (`hooks/*/mutations/`)
- Proper cache invalidation
- Optimistic updates where appropriate

### Hono RPC

- All API routes in `server/src/routes/`
- Use Zod validators for inputs
- Type inference flows automatically to client
- No manual type definitions needed

### Electron IPC

- IPC handlers in `client/src/main/ipc/`
- Type-safe with proper interfaces
- Document all channels
- Handle errors gracefully

## Questions?

- Open a [GitHub Discussion](https://github.com/signerlabs/klee/discussions)
- Check existing documentation
- Ask in pull request comments

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Klee! 🎉
