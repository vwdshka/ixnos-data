# 0008: Accounts sign in by emailed link, with hashed tokens

- Status: accepted
- Date: 2026-09-23
- Deciders: David Gavriilidis

## Context and problem

Phase 2 needs accounts so people can save searches and receive digests. The only personal data
ixnos-data wants to hold is an email address (GDPR). Most users are small
businesses who sign in rarely. A leaked database must not let anyone sign in.

## Options considered

1. Email and password.
2. Sign in with Google (or another OAuth provider).
3. A one-time link emailed to the address ("magic link"), then a long-lived session.

## Decision

Option 3. The email address is needed for digests anyway, so the link proves the address and
needs no password to store, reset or leak.

- **Login links:** valid for 30 minutes, single use, at most 5 an hour per address. Requests
  always look accepted, so nobody can tell whether an account exists.
- **Sessions:** last 90 days. The web app keeps the session token in an HTTP-only cookie and
  sends it to the API as a bearer token.
- **Storage:** only SHA-256 hashes of link and session tokens are stored.
- **Deletion:** deleting an account cascades to sessions, saved searches, deliveries and API
  keys.

## Consequences

- Good: no passwords, no reset flow, no third-party identity provider seeing who uses ixnos-data.
- Good: a database dump contains no usable credential.
- Bad: signing in depends on email delivery. A slow or spam-filtered email blocks sign-in.
- Revisit if: users ask for Google sign-in (still an open question), or email
  delivery proves unreliable.
