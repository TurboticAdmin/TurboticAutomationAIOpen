# ⚡ Turbotic Automation AI ⚡
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
## A comprehensive automation platform for creating, managing, and executing AI-powered automations with real-time monitoring and API integration.

## 🚀 Features

- **AI-Powered Automation Creation** - Generate automations using natural language prompts
- **Real-Time Execution Monitoring** - Live logs and status updates
- **API Integration** - Trigger automations remotely with secure API keys
- **Multi-User Support** - Workspace-based user management
- **Development Mode** - Enhanced local development experience
- **RabbitMQ Job Processing** - Scalable message queue system
- **MongoDB Database** - Persistent storage for automations and executions
- **Prompt-to-Workflow:** Describe your logic; Turbotic builds the execution graph.
- **Self-Healing:** Real-time error detection and autonomous code correction.
- **Live Testing:** Integrated sandbox that validates code as it's generated.

## 🛠️ Install

### Local Development
Refer to [QUICKSTART.md](docs/QUICKSTART.md) for full guide on installing and running in local environment.

### Kubernetes Deployment (Production)
Deploy to Kubernetes using our Helm chart:

```bash
# Quick start
helm install turbotic-playground ./helm/turbotic-playground \
  --namespace turbotic \
  --create-namespace \
  -f helm/turbotic-playground/values-example.yaml
```

📚 **Full deployment guide**: [helm/turbotic-playground/DEPLOYMENT.md](helm/turbotic-playground/DEPLOYMENT.md)  
⚡ **Quick start**: [helm/turbotic-playground/QUICKSTART.md](helm/turbotic-playground/QUICKSTART.md)

The Helm chart deploys all four components:
- **App** - Main Next.js application
- **Realtime Server** - WebSocket server for real-time updates
- **Script Runner** - Automation execution service
- **Worker Node** - Background job processor

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Server    │    │  Script-Runner  │
│   (Next.js)     │◄──►│   (Next.js)     │◄──►│   (Node.js)     │
│   Port: 3000    │    │   Port: 3000    │    │   Background    │
│   + WebSocket   │    │   + WebSocket   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MongoDB       │    │   RabbitMQ      │    │   File System   │
│   Database      │    │   Message Queue │    │   (Code Exec)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```
## 📁 Project Structure

```
TurboticPlayground/
├── packages/
│   ├── app/                    # Main Next.js application
│   │   ├── src/
│   │   │   ├── app/           # Next.js app router
│   │   │   ├── components/    # React components
│   │   │   └── lib/           # Utilities and database
│   │   └── README.md
│   ├── script-runner/         # Automation execution service
│   ├── realtime-server/       # WebSocket server
│   └── worker-node/           # Background job processor
├── helm/
│   └── turbotic-playground/   # Helm chart for Kubernetes deployment
│       ├── Chart.yaml
│       ├── values.yaml
│       └── values-example.yaml
├── kubernetes-scripts/        # Kubernetes scripts
├── docs/
│   ├── CONTRIBUTING.md        # Contributions instructions
│   ├── SECURITY.md            # Security instructions
│   ├── INSTALL.md             # Installation instructions
│   └── QUICKSTART.md          # Quick start guide
├── LICENSE                    # License
└── README:md                  # README.md

```

## 🖥️ Software Stack 
* **Core Engine:** [Node.js](nextjs.org) & [Express](expressjs.com)
* **LLM Orchestration:**  [LangChain](langchain.com)
* **State Management:** [MongoDB](mongodb.com) & [RabbitMQ](rabbitmq.com)
* **Infrastructure:** [Docker](docker.com)

## 📦 Editions ( links needs to be updated! LICENSE NEEDS DECISION)
| Edition | License | Best For | Link |
| :--- | :--- | :--- | :--- |
| **Community (CE)** | Turbotic BSL 1.1 | Individual Devs & Hobbyists | [GitHub Repo](https://github.com/TurboticAdmin/TurboticAutomationAIOpen) |
| **Enterprise (EE)** | Commercial | Power Users & SMBs | [Turbotic.com](https://turbotic.com) |


## 🤝 Contributing
We cherish our community! Please review our [CONTRIBUTING.md](/CONTRIBUTING.md) to learn about our coding standards and pull request process.

## 📄 License 

This project is licensed under the Turbotic BSL 1.1 Refer to [LICENSE](/LICENSE.md)


**Last Updated**: Feb 2026
**Version**: 1.0.0
**Status**: Production Ready ✅ 
