# Offload - Proactive Cognitive Inbox

> A Zero-Friction offload application that transforms passive note-taking into an active, context-aware second brain.

## 🎯 Vision

"Offload" automatically categorizes, cross-references, and surfaces information based on user context (GPS, Time, and Past Behavior). It's not just a note-taking app—it's a **Proactive Second Brain**.

## ✨ Core Features

### 🎤 High-Fidelity Voice Intake
- **Whisper-v3** integration for near-instant voice-to-text
- Handles "Multimodal Rants" - single recordings containing business tasks, gym updates, and family reminders
- Parsing engine splits transcripts into "Atomic Objects" based on context

### 🧠 Semantic Memory & Knowledge Graph
- **Vector Database** (Weaviate) for Long-Term Memory
- **RAG** (Retrieval-Augmented Generation) for AI "sparring"
- Constraint checking (e.g., validates gym routines against injury history)

### 📍 Proactive Trigger Engine
- **Geofencing** - Notes pinned to GPS coordinates
- Context-aware push notifications when entering geofences
- Background location monitoring with minimal battery impact

### 🔗 Cross-Domain Synthesis
- Weekly agentic workflow for pattern finding
- Finds "Semantic Bridges" across domains
- Suggests applying efficiencies from one domain to another

### 📱 Zero-UI Interaction
- Lock screen accessibility
- Back-tap triggers (iOS/Android)
- Background listening modes

## 🏗️ Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation.

### Tech Stack

- **Backend**: Node.js (TypeScript) + Python (FastAPI) for ML services
- **Voice Processing**: OpenAI Whisper-v3 (hybrid local/cloud)
- **Vector Database**: Weaviate
- **Relational DB**: PostgreSQL 15+
- **Mobile**: React Native with Expo
- **Web**: Next.js 14
- **Caching**: Redis 7+

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd brain_dump

# Install dependencies
cd backend/api && npm install
cd ../ml-service && pip install -r requirements.txt
cd ../../frontend/mobile && npm install
cd ../web && npm install

# Start infrastructure (PostgreSQL, Redis, Weaviate)
docker-compose -f infrastructure/docker/docker-compose.dev.yml up -d

# Run migrations
cd backend/api && npm run migrate

# Start services
npm run dev  # In each service directory
```

## 📁 Project Structure

```
brain_dump/
├── backend/
│   ├── api/              # Node.js API service
│   └── ml-service/       # Python ML service (Whisper, embeddings)
├── frontend/
│   ├── mobile/           # React Native app
│   └── web/              # Next.js dashboard
├── shared/
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Shared utilities
├── infrastructure/
│   ├── docker/           # Docker configurations
│   └── k8s/              # Kubernetes manifests
├── docs/
│   ├── api/              # API documentation
│   └── architecture/     # Architecture diagrams
└── plans/                # Project planning documents
```

## 🔒 Privacy & Security

- **End-to-End Encryption** for sensitive data
- **Zero-Knowledge Architecture** - server cannot read user data
- **Client-Side Key Management** - keys never leave device
- **GDPR & HIPAA Ready**

See [ARCHITECTURE.md](./ARCHITECTURE.md#privacy-architecture) for details.

## 📚 Documentation

- [Architecture Document](./ARCHITECTURE.md) - Complete technical architecture
- [API Documentation](./docs/api/) - API endpoints and schemas
- [Development Guide](./docs/DEVELOPMENT.md) - Setup and contribution guide

## 🗺️ Roadmap

See [plans/master-plan.md](./plans/master-plan.md) for detailed roadmap.

**Current Phase**: Foundation & Core Architecture

## 🤝 Contributing

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md)
2. Check [plans/current-phase.md](./plans/current-phase.md) for current tasks
3. Follow the development guide (coming soon)

## 📄 License

[To be determined]

## 🙏 Acknowledgments

Built with:
- OpenAI Whisper
- Weaviate
- React Native
- Next.js
- And many other open-source projects
