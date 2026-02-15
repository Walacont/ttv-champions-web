# TTV Champions Development Justfile

# Default recipe - show available commands
default:
    @just --list

# ============================================
# Setup & Dependencies
# ============================================

# Complete setup: install deps, start Supabase, reset DB
setup:
    npm install
    @echo "Starting Supabase..."
    supabase start
    @echo "Resetting database..."
    supabase db reset
    @echo "Setup complete!"

# ============================================
# Supabase
# ============================================

# Start local Supabase (PostgreSQL, Auth, Studio, Edge Functions)
up:
    supabase start

# Stop local Supabase
down:
    supabase stop

# Reset database (applies migrations + seed from config.toml)
db-reset:
    supabase db reset

# Open Supabase Studio in browser
studio:
    open http://localhost:54323

# Show Supabase status and keys
status:
    supabase status

# ============================================
# Development
# ============================================

# Run Vite dev server (requires Supabase running)
dev: _check-supabase
    npm run dev

# Build for production (Tailwind CSS + vendor bundles)
build:
    npm run build

# Run Vitest tests
test:
    npm test

# Run tests in watch mode
test-watch:
    npm test -- --watch

# Format code with Prettier
format:
    npm run format

# Check formatting
format-check:
    npm run format:check

# ============================================
# Internal Helpers
# ============================================

# Check if Supabase is running
_check-supabase:
    @supabase status > /dev/null 2>&1 || (echo "Error: Supabase not running. Run 'just up' first." && exit 1)
