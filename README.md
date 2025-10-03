# My Express API

Basic Express API layout. 

## Environment & secrets

Do NOT commit real secrets (API keys, database passwords, JWT secrets) to the
repository. This project uses a `.env` file loaded by `dotenv` during local
development. Sensitive values should instead be set in environment variables
on CI or the host.

Create a local `.env` file (gitignored) with the variables shown in
`.env.example` before running the app locally.