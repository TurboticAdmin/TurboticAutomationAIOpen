# Contributing to Turbotic AI 🤖

First, thank you for taking the time to contribute! By participating in this project, you help build the future of self-healing AI workflows.

---

## ⚖️ Legal & Licensing

### Contributor License Agreement (CLA)
By contributing to Turbotic AI, you agree that:
1. Your contributions are licensed under the **Turbotic BSL License**.
2. You grant the maintainers of Turbotic AI (the "Company") a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, and distribute your contributions in both our **Community** and **Commercial (Enterprise/Professional)** editions.

---

## 🚫 Code of Conduct & Safety

We are committed to providing a professional, safe, and welcoming environment for all. To maintain the integrity of the project, we enforce a **Zero-Tolerance Policy** regarding:

* **Hate Speech & Racism:** Any form of discrimination based on race, ethnicity, religion, gender identity, sexual orientation, or disability.
* **Harassment:** Offensive comments, intimidation, or personal attacks.
* **Malicious Code:** Intentionally introducing vulnerabilities or "backdoors" into the AI engine.

**Consequences:** Any contributor who violates these rules will be immediately and permanently blocked from the repository. All associated Pull Requests will be closed.

---

## 🛠 How to Contribute

### 1. Reporting Bugs
* Check if the bug has already been reported in the **Issues** tab.
* If not, use our [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md).
* Include your environment details (Node.js version, Docker version, etc.).

### 2. Development Workflow
1.  **Fork** the repository and create your branch from `main`:
    ```bash
    git switch -c feat/your-feature-name
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Code & Test**: Ensure your changes do not break the core AI orchestration logic.
4.  **Linting**: Run `npm run lint` to ensure code style consistency.



### 3. Submitting a Pull Request (PR)
* Describe your changes in detail.
* Link the PR to the issue it resolves (e.g., `Closes #123`).
* By submitting a PR, you confirm that the code is your own and you have the right to license it under the terms mentioned above.

---

## 🎨 Style Guide

* **TypeScript:** Use strict typing. Avoid `any`.
* **Documentation:** If you add a feature, you must add its documentation.
* **AI Ethics:** Ensure any added LLM prompts follow safety best practices to prevent prompt injection or infinite loops.

---

## 📬 Security
If you find a security vulnerability, **do not open a public issue.** Please email **security@turbotic.com** directly.
