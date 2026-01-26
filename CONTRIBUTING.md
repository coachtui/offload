# Contributing to The Hub

Thank you for your interest in contributing to The Hub! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Getting Started

1. **Read the documentation**
   - [README.md](./README.md) - Project overview
   - [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
   - [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) - Development setup

2. **Set up your development environment**
   ```bash
   # Clone the repository
   git clone <repository-url>
   cd brain_dump
   
   # Follow setup instructions in docs/DEVELOPMENT.md
   ```

3. **Check current phase**
   - Review [plans/current-phase.md](./plans/current-phase.md) for current tasks
   - Look for issues labeled "good first issue" or "help wanted"

## Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- `docs/*` - Documentation updates

### Making Changes

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes**
   - Write clean, readable code
   - Follow the coding standards (see below)
   - Add tests for new features
   - Update documentation as needed

3. **Test your changes**
   ```bash
   # Backend API
   cd backend/api && npm test
   
   # ML Service
   cd backend/ml-service && pytest
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add voice transcription endpoint"
   ```

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(api): add voice transcription endpoint
fix(ml-service): handle audio format errors
docs: update API documentation
```

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow ESLint rules (run `npm run lint`)
- Format code with Prettier (run `npm run format`)
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

**Example:**
```typescript
/**
 * Transcribes audio using Whisper API
 * @param audioData - Audio file buffer
 * @param options - Transcription options
 * @returns Promise resolving to transcript
 */
async function transcribeAudio(
  audioData: Buffer,
  options?: TranscriptionOptions
): Promise<string> {
  // Implementation
}
```

### Python

- Follow PEP 8 style guide
- Use type hints for function signatures
- Format with Black
- Lint with Ruff
- Add docstrings for all functions and classes

**Example:**
```python
def transcribe_audio(
    audio_data: bytes,
    model: str = "whisper-1"
) -> str:
    """
    Transcribe audio using Whisper API.
    
    Args:
        audio_data: Audio file bytes
        model: Whisper model to use
        
    Returns:
        Transcribed text
    """
    # Implementation
```

## Testing

### Writing Tests

- Write tests for all new features
- Aim for >80% code coverage
- Include both unit and integration tests
- Test edge cases and error conditions

### Running Tests

```bash
# Backend API
cd backend/api
npm test
npm run test:watch  # Watch mode
npm run test:coverage  # Coverage report

# ML Service
cd backend/ml-service
pytest
pytest --cov=app  # With coverage
```

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Ensure all tests pass**
4. **Update CHANGELOG.md** (if applicable)
5. **Create PR** with clear description:
   - What changes were made
   - Why they were made
   - How to test
   - Screenshots (if UI changes)

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests added/updated and passing
- [ ] Documentation updated
- [ ] No console.log or debug code
- [ ] Commit messages follow convention
- [ ] Branch is up to date with main/develop

### Review Process

- At least one approval required
- Address all review comments
- Keep PRs focused and reasonably sized
- Respond to feedback promptly

## Project Structure

```
brain_dump/
├── backend/
│   ├── api/          # Node.js API service
│   └── ml-service/   # Python ML service
├── frontend/
│   ├── mobile/       # React Native app
│   └── web/          # Next.js dashboard
├── shared/           # Shared types and utilities
├── infrastructure/   # Docker, K8s configs
└── docs/            # Documentation
```

## Areas for Contribution

### High Priority
- Voice intake and transcription
- Atomic object parsing and classification
- Vector database integration
- Geofencing and location services
- RAG system implementation

### Medium Priority
- Mobile app UI/UX
- Web dashboard
- Testing and test coverage
- Performance optimization
- Documentation improvements

### Always Welcome
- Bug fixes
- Documentation improvements
- Code refactoring
- Test coverage
- Performance improvements

## Getting Help

- **Questions?** Open a discussion or issue
- **Found a bug?** Open an issue with details
- **Have a feature idea?** Open an issue to discuss
- **Need help?** Ask in discussions or reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to The Hub! 🚀
