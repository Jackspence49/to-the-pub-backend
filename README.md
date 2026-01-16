# To The Pub - Backend API

A comprehensive Express.js API for managing bar data, including locations, hours, tags, and events.

## Features

- **Bar Management**: Create, read, update, and delete bar information
- **Flexible Data Inclusion**: Optional inclusion of related data (hours, tags, events)
- **Advanced Filtering**: Filter bars by location, tags, operating hours, and events
- **Search Functionality**: Search bars by name with fuzzy matching
- **Authentication**: JWT-based authentication for protected operations
- **App User Accounts**: Separate `/app-users` endpoints for customer registration and login
- **Soft Deletes**: Data preservation with soft deletion capabilities

## API Documentation

- **[Complete API Documentation](docs/bars-api.md)** - Comprehensive guide with examples
- **[Quick Reference](docs/bars-api-quick-reference.md)** - Fast lookup for developers
- **[OpenAPI Specification](docs/bars-api-openapi.yaml)** - Machine-readable API spec
- **[Usage Examples](examples/api-usage-examples.js)** - Frontend integration examples

## Environment & Secrets

Do NOT commit real secrets (API keys, database passwords, JWT secrets) to the
repository. This project uses a `.env` file loaded by `dotenv` during local
development. Sensitive values should instead be set in environment variables
on CI or the host.

Create a local `.env` file (gitignored) with the variables shown in
`.env.example` before running the app locally.

## App User Authentication Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/app-users/register` | Create a customer-facing account and receive a JWT |
| POST | `/app-users/login` | Exchange credentials for a JWT |
| GET | `/app-users/me` | Retrieve the authenticated app user's profile (requires token) |
| PUT | `/app-users/me` | Update profile fields or rotate the password (requires token) |
| POST | `/app-users/forgot-password` | Start the password reset flow |
| POST | `/app-users/reset-password` | Complete password reset with a token |