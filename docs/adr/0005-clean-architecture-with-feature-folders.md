# 0005: Clean Architecture with feature folders for the .NET backend

- Status: accepted
- Date: 2026-09-22
- Deciders: David Gavriilidis

## Context and problem

The backend has two hosts, the API and the notifier. They share use cases (matching records
against saved searches) and persistence. The search queries depend on PostgreSQL full-text
features that an ORM expresses poorly. The code should be easy to navigate for contributors
and recognisable to Greek .NET employers.

## Options considered

1. One project per host, no layers.
2. Vertical slices: one project, a folder per feature holding everything for that feature.
3. Clean Architecture (Domain, Application, Infrastructure, Api/Notifier), organised by
   technical folders (`Services/`, `Repositories/`).
4. Clean Architecture organised by feature folders inside each layer.

## Decision

Option 4, with three further rules:

- **Feature folders** (`Search`, `Items`, `Organisations`, `SavedSearches`, `Alerts`) in every
  layer, so a feature's code is found in the same place everywhere.
- **No MediatR or AutoMapper.** Both moved to commercial licences in 2025. Handlers are plain
  classes registered in DI, and mapping is explicit methods, which keeps the dependency tree
  open-source and the call path readable.
- **A pragmatic read side:** search and statistics queries are hand-written SQL (Dapper)
  behind Application interfaces. EF Core handles writes and owns migrations.

Architecture tests enforce the dependency rule: Domain depends on no other layer, Application
only on Domain, and Infrastructure on Application and Domain.

## Consequences

- Good: the API and the notifier share Application and Infrastructure without duplication;
  PostgreSQL-specific search stays in Infrastructure.
- Good: the dependency rule is checked by tests (`IxnosData.ArchitectureTests`), not by
  convention.
- Bad: more projects and indirection than a single-host app would need.
- Revisit if: the notifier is dropped or merged into the API, which would remove the main
  reason for separate layers.
