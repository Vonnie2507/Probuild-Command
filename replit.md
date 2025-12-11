# PROBUILD Command Center

## Overview

PROBUILD Command Center is a ServiceM8 CRM integration application for PROBUILD PVC, a fencing/construction company. It provides a command center dashboard for managing jobs through sales pipelines, production workflows, and installation scheduling. The application syncs job data from ServiceM8's API and provides drag-and-drop Kanban boards for workflow management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React Context for app settings
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Drag & Drop**: @hello-pangea/dnd for Kanban board interactions
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript compiled with tsx for development, esbuild for production
- **API Pattern**: RESTful JSON API under `/api/*` routes
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **External Integration**: ServiceM8 API client using Basic Authentication

### Data Storage
- **Database**: PostgreSQL (provisioned via Replit)
- **Schema Location**: `shared/schema.ts` using Drizzle table definitions
- **Migrations**: Drizzle Kit with `db:push` for schema sync
- **Key Tables**:
  - `jobs`: Main job records synced from ServiceM8 with local scheduling fields
  - `staff`: Team member configuration with roles, skills, and capacity
  - `syncLog`: Tracks ServiceM8 synchronization history

### Application Structure
- `client/`: React frontend application
  - `src/components/`: UI components including Kanban boards, dashboards, settings
  - `src/pages/`: Route-level page components
  - `src/lib/`: Utilities, context providers, query client configuration
- `server/`: Express backend
  - `routes.ts`: API endpoint definitions
  - `storage.ts`: Database access layer using Drizzle
  - `servicem8.ts`: ServiceM8 API client for job synchronization
- `shared/`: Code shared between frontend and backend
  - `schema.ts`: Drizzle database schema and Zod validation schemas

### Key Features
- **Multi-view Dashboard**: Sales pipeline, production tracking, and installation scheduling views
- **Kanban Boards**: Drag-and-drop job cards across customizable pipeline columns
- **Staff Management**: Configure team members with roles (sales/production/install), skills, and daily capacity
- **Scheduling System**: Two-week lockout for confirmed schedules with tentative planning support
- **ServiceM8 Sync**: Pull jobs from ServiceM8 API with status mapping

## External Dependencies

### Third-Party Services
- **ServiceM8 API**: CRM data source using Basic Authentication (`https://api.servicem8.com/api_1.0`)
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)

### Key NPM Packages
- **UI**: Radix UI primitives, shadcn/ui components, Lucide icons
- **Data**: Drizzle ORM, TanStack React Query, Zod validation
- **Utilities**: date-fns for date manipulation, clsx/tailwind-merge for class handling

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- ServiceM8 credentials (email/password) for API authentication