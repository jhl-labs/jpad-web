# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in jpad, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@jhl-labs.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix release**: Within 30 days for critical issues

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Security Features

jpad includes the following security measures:

- **Authentication**: NextAuth.js with bcrypt password hashing (cost factor 12)
- **Authorization**: Role-based access control (owner/admin/maintainer/editor/viewer)
- **Encryption**: AES-256-GCM for stored secrets
- **CSP**: Content Security Policy with HSTS, X-Frame-Options
- **Rate Limiting**: Redis-based with in-memory fallback
- **File Upload Security**: Magic byte validation, ClamAV integration, DLP scanning
- **WebSocket Security**: HMAC token verification, viewer write blocking
- **SCIM**: Bearer token authentication with SHA-256 hashing
- **Audit Logging**: Comprehensive action logging with webhook delivery
