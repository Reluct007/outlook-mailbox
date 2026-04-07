# Security Policy

## Scope

This project handles:

- Outlook OAuth credentials
- Microsoft Graph webhook ingress
- OTP-oriented mailbox data
- operator-only read and recovery surfaces

Treat any bug involving authentication, authorization, secret handling, credential storage, webhook validation, mailbox isolation, or sensitive data exposure as a security issue.

## Reporting A Vulnerability

Please do not open public GitHub issues for suspected vulnerabilities.

Preferred path:

1. Use GitHub Private Vulnerability Reporting or a private security advisory if it is enabled for the repository.
2. If that is not available, contact the maintainer through a private channel before any public disclosure.

When reporting, include:

- affected commit, branch, or release if known
- reproduction steps
- impact assessment
- whether real credentials, mailbox content, or operator access are required

## Disclosure Expectations

- give the maintainer reasonable time to investigate and patch
- avoid publishing exploit details before a fix or mitigation is available
- keep reports focused on the actual trust boundary and impact

## Safe Testing Guidelines

- do not test against third-party mailboxes without authorization
- do not exfiltrate real mailbox content
- do not commit or share secrets in issues, pull requests, screenshots, or logs
- prefer local or isolated test environments

## Supported Security Fixes

Security fixes are expected to target the latest maintained code on the default branch. Older forks or private deployments may need to forward-port fixes manually.
