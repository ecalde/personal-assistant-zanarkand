# Security

## Secrets

- Never store secrets in code
- Use environment variables
- Never expose server secrets to client

## Input Validation

- All inputs are untrusted
- Validate on server side
- Use schema validation where possible

## Authentication & Authorization

- Use trusted libraries/framework features
- Do not rely on client-side checks

## Data Handling

- Minimize stored sensitive data
- Avoid logging sensitive info

## Logging

Never log:
- API keys
- tokens
- passwords
- full request bodies

## Dependencies

- Avoid unnecessary packages
- Prefer well-maintained libraries

## Deployment

- Use HTTPS
- Use secure cookies for sessions

## Rate Limiting (future)

- Protect API endpoints from abuse

## File Uploads (if added later)

- Validate type and size
- Never trust file content blindly
