# Security Specification — FRC #451 Cat Attack Parts & BOM Tracker

## 1. Data Invariants
1. **Authentication & Verification**: Every read and write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Path Hardening**: Every document ID (`uid`, `settingId`, `projectId`, `subassemblyId`, `partId`) must match `^[a-zA-Z0-9_-]+$` and be `<= 128` characters.
3. **Referential Integrity**: A Subassembly cannot be created without an existing parent Project (`exists(...)`). A Part cannot be created without an existing parent Subassembly (`exists(...)`).
4. **Immutable Ownership & Timestamps**: `createdBy` must equal `request.auth.uid` on create and cannot change on update. `createdAt` must equal `request.time` on create and cannot change on update. `updatedAt` must equal `request.time` on create and update.
5. **Strict Schema & Bounds**: All strings, numbers, booleans, enums, maps, and arrays have strict `.size()` and value limits; unknown/shadow fields are rejected via `keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`.
6. **Privilege Escalation Prevention**: Users cannot write to `/admins/{uid}` unless already an admin.

## 2. Adversarial "Dirty Dozen" Test Payloads
1. **Unauthenticated Read/Write**: Read `/projects` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Create `/projects/p1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection (Project)**: Create `/projects/p1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
4. **Identity Spoofing**: Create `/projects/p1` with `createdBy: "someone-else"` -> `PERMISSION_DENIED`.
5. **Timestamp Forgery**: Create `/projects/p1` with backdated `createdAt` -> `PERMISSION_DENIED`.
6. **ID Poisoning**: Create `/projects/bad$id/..` -> `PERMISSION_DENIED`.
7. **Orphan Subassembly**: Create `/projects/nonexistent/subassemblies/s1` -> `PERMISSION_DENIED`.
8. **Orphan Part**: Create `/projects/p1/subassemblies/nonexistent/parts/part1` -> `PERMISSION_DENIED`.
9. **Invalid Part Enum**: Create Part with `status: "HackedStatus"` -> `PERMISSION_DENIED`.
10. **Denial of Wallet String Overflow**: Create Part with 50,000-char `notes` -> `PERMISSION_DENIED`.
11. **Immutable Field Tampering**: Update Part trying to change `createdBy` or `projectId` -> `PERMISSION_DENIED`.
12. **Self-Assigned Admin Escalation**: Non-admin user tries to create `/admins/{myUid}` -> `PERMISSION_DENIED`.
